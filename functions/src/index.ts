/**
 * Rancho de Paloma Blanca — Cloud Functions (Node 22, Functions v2)
 * Embedded Payments + Hosted Links + Refunds + Webhook
 *
 * Endpoints (mounted under /api):
 *   GET  /api/health
 *   GET  /api/getEmbeddedMerchantStatus
 *   POST /api/createEmbeddedJwt
 *   POST /api/createDeluxePayment
 *   POST /api/refundDeluxePayment
 *   POST /api/deluxe/webhook
 *
 * Secrets (set with `firebase functions:secrets:set`):
 *   DELUXE_CLIENT_ID
 *   DELUXE_CLIENT_SECRET
 *   DELUXE_MID
 *   DELUXE_ACCESS_TOKEN
 *   DELUXE_EMBEDDED_SECRET
 *
 * Optional env:
 *   DELUXE_USE_SANDBOX = "true" | "false"   (default "true")
 *
 * Notes:

 *   - Gateway:   https://sandbox.api.deluxe.com | https://api.deluxe.com
 *   - Embedded:  https://payments2.deluxe.com    | https://payments.deluxe.com
 */

// Firebase Admin SDK modular imports.  When using the newer firebase-admin v12+
// under an ES module environment (NodeNext), the top-level `initializeApp` is
// no longer exported on the default namespace.  Instead, import from
// `firebase-admin/app` and `firebase-admin/firestore`.
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
// We're not using Express or CORS middleware in this implementation.  Instead we
// implement each endpoint directly inside a single HTTPS handler.  This
// eliminates dependencies on `express` and `cors`, which were causing
// resolution issues in TypeScript.  All necessary CORS headers are set
// manually in the handler below.
import crypto from "crypto";

import { setGlobalOptions, logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// ---- Firebase init ----
// Initialize the Firebase Admin SDK only once.  The `getApps()` helper lets
// us check if an app already exists (avoids re-initialization in tests or
// reloads).  We call `initializeApp()` from the modular `firebase-admin/app`
// import.  Then obtain Firestore via `getFirestore()`.
if (getApps().length === 0) {
  initializeApp();
}
const db = getFirestore();

setGlobalOptions({
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 60,
});

// ---- Secrets ----
const DELUXE_CLIENT_ID = defineSecret("DELUXE_CLIENT_ID");
const DELUXE_CLIENT_SECRET = defineSecret("DELUXE_CLIENT_SECRET");
const DELUXE_ACCESS_TOKEN = defineSecret("DELUXE_ACCESS_TOKEN"); // PartnerToken
const DELUXE_MID = defineSecret("DELUXE_MID"); // informational
const DELUXE_EMBEDDED_SECRET = defineSecret("DELUXE_EMBEDDED_SECRET"); // HS256 for embedded JWT

// ---- Hosts ----
function useSandbox(): boolean {
  const flag = (process.env.DELUXE_USE_SANDBOX ?? "true").toLowerCase();
  return flag !== "false"; // default true
}
function gatewayBase(): string {
  return useSandbox() ? "https://sandbox.api.deluxe.com" : "https://api.deluxe.com";
}
function embeddedBase(): string {
  // IMPORTANT: sandbox uses payments2, production uses payments
  return useSandbox() ? "https://payments2.deluxe.com" : "https://payments.deluxe.com";
}

// ---- Helpers ----
// Money sanitizer: coerce numbers/strings to a 2-decimal number; return null if invalid
function asMoney(n: unknown): number | null {
  const v = typeof n === "string" ? Number(n) : (n as number);
  return Number.isFinite(v) && v >= 0 ? Number((v as number).toFixed(2)) : null;
}
const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");

// Sign a payload with HS256 for Embedded endpoints (and for the embedded SDK token)
function signEmbeddedJwt(payload: Record<string, any>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = crypto
    .createHmac("sha256", DELUXE_EMBEDDED_SECRET.value())
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

// OAuth bearer for gateway endpoints (paymentlinks/refunds/etc.)
async function getGatewayBearer(): Promise<string> {
  const tokenUrl = `${gatewayBase()}/secservices/oauth2/v2/token`;
  const params = new URLSearchParams({ grant_type: "client_credentials" });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization:
        "Basic " +
        Buffer.from(`${DELUXE_CLIENT_ID.value()}:${DELUXE_CLIENT_SECRET.value()}`).toString("base64"),
    },
    body: params.toString(),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OAuth failed (${resp.status}): ${t || resp.statusText}`);
  }
  const json = (await resp.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("OAuth: missing access_token");
  return json.access_token as string;
}

// ---- Types ----
type Level3Item = {
  skuCode: string;
  quantity: number;
  price: number;
  description?: string;
  unitOfMeasure?: string;
  itemDiscountAmount?: number;
  itemDiscountRate?: number;
};

type OrderDoc = {
  id?: string;
  userId?: string;
  status?: "pending" | "paid" | "cancelled";
  total: number;
  currency?: "USD" | "CAD";
  createdAt?: Timestamp;
  level3?: Level3Item[];
  customer?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string;
    billingAddress?: {
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      countryCode?: string;
    };
  };
  booking?: {
    dates: string[]; // YYYY-MM-DD
    numberOfHunters: number;
    partyDeckDates?: string[];
  };
  merchItems?: Record<string, { skuCode?: string; name?: string; price?: number; quantity?: number }>;
  paymentLink?: {
    paymentLinkId?: string;
    paymentUrl?: string;
    lastAttempt?: any | number | Date | null;
  };
  deluxe?: Record<string, unknown>;
};

function splitName(name?: string): { firstName: string; lastName: string } {
  if (!name?.trim()) return { firstName: "Guest", lastName: "User" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

function buildPaymentLinkBody(
  order: OrderDoc,
  opts: { orderId: string; successUrl?: string; cancelUrl?: string }
) {
  const currency = order.currency ?? "USD";
  const amount = order.total;
  const { firstName, lastName } =
    order.customer?.firstName || order.customer?.lastName
      ? { firstName: order.customer?.firstName ?? "Guest", lastName: order.customer?.lastName ?? "User" }
      : splitName(order.customer?.name);

  const body: any = {
    amount: { amount, currency },
    firstName,
    lastName,
    orderData: { orderId: opts.orderId },
    paymentLinkExpiry: "9 DAYS",
    acceptPaymentMethod: ["Card"],
    deliveryMethod: "ReturnOnly",
  };

  if (order.level3?.length) body.level3 = order.level3;

  const customData: { name: string; value: string }[] = [];
  if (opts.successUrl) customData.push({ name: "successUrl", value: String(opts.successUrl) });
  if (opts.cancelUrl) customData.push({ name: "cancelUrl", value: String(opts.cancelUrl) });
  if (order.customer?.email) customData.push({ name: "email", value: String(order.customer.email) });
  if (customData.length) body.customData = customData;

  return body;
}

async function incrementCapacityFromOrder(order: OrderDoc) {
  const booking = order.booking;
  if (!booking?.dates?.length || !booking.numberOfHunters) return;
  const n = booking.numberOfHunters;
  const batch = db.batch();
  for (const date of booking.dates) {
    const ref = db.collection("availability").doc(date);
    batch.set(
      ref,
      {
        huntersBooked: FieldValue.increment(n),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

// ---- Unified HTTP handler ----
// Rather than relying on Express, we register a single onRequest handler and
// manually route based on the incoming URL and HTTP method.  This keeps the
// surface area small and avoids the need for additional middleware.  We also
// perform basic CORS handling for all endpoints.

export const api = onRequest(
  {
    secrets: [
      DELUXE_CLIENT_ID,
      DELUXE_CLIENT_SECRET,
      DELUXE_ACCESS_TOKEN,
      DELUXE_MID,
      DELUXE_EMBEDDED_SECRET,
    ],
  },
  async (req: any, res: any) => {
    // CORS: allow any origin by default.  You may restrict this in production.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,OPTIONS,PUT,PATCH,DELETE"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin,X-Requested-With,Content-Type,Accept,Authorization"
    );

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    // Normalize the URL: remove any query string or hash fragment.
    // `req.url` may be undefined in some environments, so default to '/' when empty.
    const rawUrl = req.url || "/";
    const url = rawUrl.split("?")[0];

    try {
      // Health endpoint
      if (req.method === "GET" && url === "/api/health") {
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ status: "ok" });
        return;
      }

      // Embedded merchant status
      if (req.method === "GET" && url === "/api/getEmbeddedMerchantStatus") {
        try {
          const now = Math.floor(Date.now() / 1000);
          const exp = now + 5 * 60;
          const token = signEmbeddedJwt({
            accessToken: DELUXE_ACCESS_TOKEN.value(),
            iat: now,
            exp,
          });
          const endpoint = `${embeddedBase()}/embedded/merchantStatus`;
          const r = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ jwt: token }),
          });
          const txt = await r.text();
          let json: any = {};
          try {
            json = txt ? JSON.parse(txt) : {};
          } catch {
            // ignore JSON parse errors; leave empty
          }
          if (!r.ok) {
            logger.error("merchantStatus failed", { status: r.status, body: txt });
            res.status(200).json({ applePayEnabled: false, googlePayEnabled: false });
            return;
          }
          res.status(200).json(json);
          return;
        } catch (err: any) {
          logger.error("getEmbeddedMerchantStatus error", err);
          res.status(200).json({ applePayEnabled: false, googlePayEnabled: false });
          return;
        }
      }

      // Create Embedded JWT
      if (req.method === "POST" && url === "/api/createEmbeddedJwt") {
        try {
          const body = (req.body || {}) as any;
          const rawAmount = asMoney(body.amount);
          const currency = (body.currency || "USD") as "USD" | "CAD";
          const orderId = body.orderId ? String(body.orderId) : undefined;
          const customerRaw = body.customer;
          const productsRaw = body.products as any[] | undefined;
          const summary = body.summary as { hide?: boolean; hideTotals?: boolean } | undefined;

          if (rawAmount === null || rawAmount <= 0) {
            res.status(400).json({ error: "invalid-amount" });
            return;
          }

          // Optionally override amount from order total
          let finalAmount = rawAmount;
          if (orderId) {
            try {
              const snap = await db.collection("orders").doc(orderId).get();
              if (snap.exists) {
                const orderData = snap.data() as OrderDoc;
                const t = asMoney(orderData.total);
                if (t !== null && t > 0) {
                  finalAmount = t;
                }
              } else {
                logger.warn("createEmbeddedJwt: orderId provided but not found", { orderId });
              }
            } catch (e) {
              logger.warn("createEmbeddedJwt: order lookup failed", { orderId, err: String(e) });
            }
          }

          // Sanitize customer: only include firstName, lastName, billingAddress fields per docs
          let customer: any = undefined;
          if (customerRaw && typeof customerRaw === "object") {
            const firstName = customerRaw.firstName ?? undefined;
            const lastName = customerRaw.lastName ?? undefined;
            const billing: any = customerRaw.billingAddress;
            const billingAddress = billing && typeof billing === "object" ? {
              address: billing.address,
              city: billing.city,
              state: billing.state,
              zipCode: billing.zipCode,
              countryCode: billing.countryCode,
            } : undefined;
            if (firstName || lastName || billingAddress) {
              customer = {
                ...(firstName ? { firstName } : {}),
                ...(lastName ? { lastName } : {}),
                ...(billingAddress ? { billingAddress } : {}),
              };
            }
          }

          // Sanitize products for Embedded: expects { name, amount } (and optional fields)
          let products: any[] | undefined = undefined;
          if (Array.isArray(productsRaw)) {
            products = productsRaw
              .map((p) => {
                const out: any = {};
                if (typeof p.name === "string") out.name = p.name;

                // Accept either p.amount or p.price; normalize to `amount`
                const money = asMoney(typeof p.amount !== "undefined" ? p.amount : p.price);
                if (money !== null) out.amount = money;

                if (typeof p.skuCode === "string") out.skuCode = p.skuCode;
                if (typeof p.quantity === "number") out.quantity = p.quantity;
                if (typeof p.description === "string") out.description = p.description;
                if (typeof p.unitOfMeasure === "string") out.unitOfMeasure = p.unitOfMeasure;
                if (typeof p.itemDiscountAmount === "number") {
                  const disc = asMoney(p.itemDiscountAmount);
                  if (disc !== null) out.itemDiscountAmount = disc;
                }
                if (typeof p.itemDiscountRate === "number") out.itemDiscountRate = p.itemDiscountRate;
                return out;
              })
              // Only keep products that have both a name and a valid numeric amount
              .filter((item) => typeof item.name === "string" && typeof item.amount === "number");

            if (products.length === 0) products = undefined;
          }

          const now = Math.floor(Date.now() / 1000);
          const exp = now + 10 * 60;

          const payload: Record<string, any> = {
            iat: now,
            exp,
            accessToken: DELUXE_ACCESS_TOKEN.value(),
            amount: finalAmount,
            currencyCode: currency,
            ...(customer ? { customer } : {}),
            ...(products ? { products } : {}),
            ...(summary?.hide ? { hideproductspanel: true } : {}),
            ...(summary?.hideTotals ? { hidetotals: true } : {}),
          };

          const jwtToken = signEmbeddedJwt(payload);
          res.status(200).json({
            jwt: jwtToken,
            exp,
            embeddedBase: embeddedBase(),
            env: useSandbox() ? "sandbox" : "production",
          });
          return;
        } catch (err: any) {
          logger.error("createEmbeddedJwt error", err);
          res.status(500).json({ error: "jwt-failed", message: err?.message || String(err) });
          return;
        }
      }

      // Create Deluxe Payment (Hosted Link fallback)
      if (req.method === "POST" && url === "/api/createDeluxePayment") {
        try {
          const body = req.body || {};
          const orderId = body.orderId;
          const successUrl = body.successUrl;
          const cancelUrl = body.cancelUrl;
          if (!orderId) {
            res.status(400).json({ error: "Missing orderId" });
            return;
          }
          const orderRef = db.collection("orders").doc(String(orderId));
          const snap = await orderRef.get();
          if (!snap.exists) {
            res.status(404).json({ error: "Order not found" });
            return;
          }
          const order = { id: snap.id, ...(snap.data() as OrderDoc) };
          const bearer = await getGatewayBearer();
          const requestBody = buildPaymentLinkBody(order, {
            orderId: snap.id,
            successUrl,
            cancelUrl,
          });
          const endpoint = `${gatewayBase()}/dpp/v1/gateway/paymentlinks`;
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${bearer}`,
              PartnerToken: DELUXE_ACCESS_TOKEN.value(),
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(requestBody),
          });
          const text = await resp.text();
          let json: any = {};
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            // ignore parse errors
          }
          if (!resp.ok) {
            logger.error("paymentlinks failed", { status: resp.status, body: text });
            res.status(resp.status).json({ error: "paymentlinks-failed", status: resp.status, body: json || text });
            return;
          }
          const paymentUrl: string | undefined = json?.paymentUrl;
          const paymentLinkId: string | undefined = json?.paymentLinkId;
          if (!paymentUrl) {
            res.status(502).json({ error: "No paymentUrl in response", response: json });
            return;
          }
          await orderRef.set(
            {
              paymentLink: {
                paymentLinkId,
                paymentUrl,
                lastAttempt: FieldValue.serverTimestamp(),
              },
              deluxe: {
                lastPaymentLinkRequest: requestBody,
                lastPaymentLinkResponse: json,
              },
            },
            { merge: true }
          );
          res.status(200).json({ paymentUrl, paymentLinkId });
          return;
        } catch (err: any) {
          logger.error("createDeluxePayment error", err);
          res.status(500).json({ error: "createDeluxePayment-failed", message: err?.message || String(err) });
          return;
        }
      }

// ---- Refund Deluxe Payment (production-ready) ----
if (
  req.method === "POST" &&
  (url === "/api/refundDeluxePayment" || url === "/refundDeluxePayment")
) {
  try {
    const body = (req.body || {}) as any;

    // ----- Inputs -----
    const refundAmount = asMoney(body.amount ?? body.refundAmount);
    const currency = (body.currency ?? "USD").toString().toUpperCase() as "USD" | "CAD";
    if (refundAmount === null || refundAmount <= 0) {
      res.status(400).json({ error: "invalid-amount" });
      return;
    }

    // Prefer explicit paymentId; also accept orderId or transactionId to resolve
    let paymentId =
      typeof body.paymentId === "string" && body.paymentId.trim() ? body.paymentId.trim() : undefined;

    const orderId =
      typeof body.orderId === "string" && body.orderId.trim() ? body.orderId.trim() : undefined;

    const transactionId =
      typeof body.originalTransactionId === "string" && body.originalTransactionId.trim()
        ? body.originalTransactionId.trim()
        : typeof body.transactionId === "string" && body.transactionId.trim()
        ? body.transactionId.trim()
        : undefined;

    if (!paymentId && !orderId && !transactionId) {
      res.status(400).json({ error: "paymentId-or-orderId-or-transactionId-required" });
      return;
    }

    // ----- Auth -----
    const bearer = await getGatewayBearer();

    // ----- URLs (normalize regardless of what gatewayBase() returns) -----
    const base = gatewayBase().replace(/\/+$/, "");
    const GW = /\/dpp\/v1\/gateway$/i.test(base) ? base : `${base}/dpp/v1/gateway`;
    const refundsUrl = `${GW}/refunds`;
    const searchUrl  = `${GW}/payments/search`;

    // ----- If we have an orderId, try to pull paymentId from the order first -----
    if (!paymentId && orderId) {
      try {
        const snap = await db.collection("orders").doc(orderId).get();
        if (snap.exists) {
          const fromOrder =
            (snap.get("deluxe.paymentId") ??
             snap.get("deluxe.paymentID") ?? // tolerate casing variants
             snap.get("deluxe")?.paymentId) as string | undefined;
          if (fromOrder && String(fromOrder).trim()) {
            paymentId = String(fromOrder).trim();
          }
        }
      } catch (e) {
        logger.warn("failed-to-read-order-for-paymentId", { orderId, err: String(e) });
      }
    }

    // ----- If still missing, resolve via payments/search (by transactionId or orderId) -----
    if (!paymentId && (transactionId || orderId)) {
      const searchBody: any = {};
      if (transactionId) searchBody.transactionId = transactionId;
      if (orderId) searchBody.orderId = orderId;

      const r = await fetch(searchUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          PartnerToken: DELUXE_ACCESS_TOKEN.value(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(searchBody),
      });

      const searchText = await r.text();
      let searchJson: any;
      try { searchJson = searchText ? JSON.parse(searchText) : {}; }
      catch { searchJson = { raw: searchText }; }

      if (!r.ok) {
        logger.error("payments/search failed", { status: r.status, request: searchBody, response: searchJson });
        res.status(404).json({ error: "payment-not-found", searchBody, details: searchJson });
        return;
      }

      const first = searchJson?.payments?.[0] || searchJson?.results?.[0] || searchJson?.data?.[0];
      paymentId = first?.paymentId || first?.id || undefined;

      if (!paymentId) {
        res.status(404).json({ error: "payment-not-found", searchBody, details: searchJson });
        return;
      }
    }

    // ----- Build refund request body (no "reason") -----
    const requestBody: any = {
      paymentId,
      amount: { amount: refundAmount, currency },
    };
    if (typeof body.isACH === "boolean") requestBody.isACH = body.isACH;

    // 👇 NEW: single-line raw JSON for easy copy/paste
const requestBodyJson = JSON.stringify(requestBody);

// Keep your structured log (nice for filtering)
logger.info("refunds request", { refundsUrl, requestBody });

// 👇 NEW: explicit raw JSON log line (easy to copy from Cloud Logs)
logger.info("refunds request raw json", { body: requestBodyJson });

// 👇 NEW: optional debug echo — returns the raw JSON without calling Deluxe
if (String(req.query.debug) === "1") {
  res.set("Content-Type", "application/json");
  res.status(200).send(requestBodyJson);
  return;
}

    // ----- Call Deluxe /refunds -----
    const resp = await fetch(refundsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        PartnerToken: DELUXE_ACCESS_TOKEN.value(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: requestBodyJson,
    });

    const text = await resp.text();
    const deluxeRequestId =
  resp.headers.get("x-request-id") || resp.headers.get("request-id") || undefined;

// 👇 NEW: log the raw response exactly as received
logger.info("refunds response raw", { status: resp.status, deluxeRequestId, text });
    let json: any;
    try { json = text ? JSON.parse(text) : {}; }
    catch { json = { raw: text }; }

   

    if (!resp.ok) {
      logger.error("refunds failed", {
        url: refundsUrl,
        status: resp.status,
        response: json,
        requestBody,
        resolvedPaymentId: paymentId,
        deluxeRequestId,
      });
      res.status(resp.status).json({
        error: "refunds-failed",
        status: resp.status,
        body: json,
        resolvedPaymentId: paymentId,
        deluxeRequestId,
      });
      return;
    }

    // ----- Success -----
    res.status(200).json({ ...json, resolvedPaymentId: paymentId, deluxeRequestId });
    return;
  } catch (err: any) {
    logger.error("refundDeluxePayment error", { message: err?.message ?? String(err) });
    res.status(500).json({ error: "refund-failed", message: err?.message ?? String(err) });
    return;
  }
}

      

      // Deluxe Webhook
      if (req.method === "POST" && url === "/api/deluxe/webhook") {
        try {
          const evt = req.body || {};
          const orderId: string | undefined =
            evt?.orderData?.orderId ||
            evt?.customData?.find?.((x: any) => x?.name === "orderId")?.value;
          const status: string | undefined = evt?.status || evt?.transactionStatus || evt?.paymentStatus;
          const approved = typeof status === "string" && /approved|captured|paid/i.test(status);
          if (orderId && approved) {
            const ref = db.collection("orders").doc(orderId);
            const snap = await ref.get();
            if (snap.exists) {
              const order = { id: snap.id, ...(snap.data() as OrderDoc) };
              await ref.set(
                {
                  status: "paid",
                  deluxe: { lastWebhook: evt },
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
              await incrementCapacityFromOrder(order);
            }
          } else {
            logger.warn("Webhook received without resolvable orderId or unpaid status", { orderId, status });
          }
          res.status(200).json({ ok: true });
          return;
        } catch (err: any) {
          logger.error("webhook error", err);
          // Always return 200 on webhook errors to prevent retries
          res.status(200).json({ ok: false });
          return;
        }
      }

      // If no route matched, return 404
      res.status(404).json({ error: "not-found" });
    } catch (outerErr: any) {
      // A catch-all to avoid unhandled promise rejections
      logger.error("unhandled error", outerErr);
      res.status(500).json({ error: "internal", message: outerErr?.message || String(outerErr) });
    }
  }
);
