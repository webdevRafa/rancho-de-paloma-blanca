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
import { Resend } from "resend";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { renderOrderPlacedEmail, renderOrderPaidEmail, renderRefundEmail } from "./email/templates.js";

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
  vpcConnector: "projects/rancho-de-paloma-blanca/locations/us-central1/connectors/srvless-usc1",
vpcConnectorEgressSettings: "ALL_TRAFFIC",
});

// ---- Secrets ----
const DELUXE_CLIENT_ID = defineSecret("DELUXE_CLIENT_ID");
const DELUXE_CLIENT_SECRET = defineSecret("DELUXE_CLIENT_SECRET");
const DELUXE_ACCESS_TOKEN = defineSecret("DELUXE_ACCESS_TOKEN"); // PartnerToken
const DELUXE_MID = defineSecret("DELUXE_MID"); // informational
const DELUXE_EMBEDDED_SECRET = defineSecret("DELUXE_EMBEDDED_SECRET"); // HS256 for embedded JWT

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const RESEND_FROM_EMAIL = defineSecret("RESEND_FROM_EMAIL");
const NOTIFY_ADMIN_EMAIL = defineSecret("NOTIFY_ADMIN_EMAIL");

async function sendEmail(args: {
  to: string | string[];
  subject: string;
  html: string;
  cc?: string | string[];
  bcc?: string | string[];
}) {
  const client = new Resend(RESEND_API_KEY.value());
  const payload: any = {
    from: RESEND_FROM_EMAIL.value(),
    to: Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
    html: args.html,
  };
  if (args.cc) payload.cc = args.cc;
  if (args.bcc) payload.bcc = args.bcc;
  const r = await client.emails.send(payload);
  if ((r as any)?.error) throw (r as any).error;
}


// ---- Hosts ----
function useSandbox(): boolean {
  const flag = (process.env.DELUXE_USE_SANDBOX ?? "false").toLowerCase();
  return flag === "true";
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
/** Derive the set of party-deck dates from a booking robustly. */
function resolvePartyDeckDates(booking?: {
  dates?: string[];
  partyDeckDates?: string[];
  // tolerate legacy boolean flag
  partyDeck?: boolean;
}): string[] {
  const base = Array.isArray(booking?.dates) ? booking!.dates.filter(Boolean) : [];
  if (!base.length) return [];

  // Prefer explicit partyDeckDates
  const explicit = Array.isArray(booking?.partyDeckDates)
    ? booking!.partyDeckDates.filter(Boolean)
    : [];

  if (explicit.length) {
    // Only keep dates that are actually booked
    return Array.from(new Set(explicit.filter(d => base.includes(d))));
  }

  // Legacy: if partyDeck boolean is true, assume deck for *all* booked dates
  if ((booking as any)?.partyDeck === true) {
    return Array.from(new Set(base));
  }

  return [];
}

async function rollbackCapacityFromOrder(order: OrderDoc) {
  const booking = order?.booking;
  if (!booking?.dates?.length || !booking.numberOfHunters) return;

  const n = Number(booking.numberOfHunters) || 0;
  if (n <= 0) return;

  const batch = db.batch();

  // Decrement hunters for each booked hunt date
  for (const date of booking.dates) {
    const ref = db.collection("availability").doc(date);
    batch.set(
      ref,
      { huntersBooked: FieldValue.increment(-n), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  // Reset Party Deck to false for the exact selected dates only
  const deckDates = resolvePartyDeckDates(booking);

  for (const date of deckDates) {
    const ref = db.collection("availability").doc(date);
    batch.set(
      ref,
      { partyDeckBooked: false, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  await batch.commit();
}

/** In a transaction, assert deck is free for every date, then mark it booked. */
async function markPartyDeckBookedTx(
  tx: FirebaseFirestore.Transaction,
  dates: string[]
) {
  const cleanDates = Array.from(new Set((dates || []).filter(Boolean)));
  if (cleanDates.length === 0) return;

  // 1) Assert none are already booked
  for (const date of cleanDates) {
    const ref = db.collection("availability").doc(date);
    const snap = await tx.get(ref);
    const already = snap.exists && snap.get("partyDeckBooked") === true;
    if (already) {
      // Throw with a per-date tag so callers can parse the conflicts if needed
      throw new Error(`party-deck-already-booked:${date}`);
    }
  }

  // 2) Book them
  for (const date of cleanDates) {
    const ref = db.collection("availability").doc(date);
    tx.set(
      ref,
      { partyDeckBooked: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
}

async function incrementCapacityFromOrder(
  order: OrderDoc
): Promise<{ success: boolean; conflicts?: string[] }> {
  const booking = order?.booking;
  if (!booking?.dates?.length || !booking.numberOfHunters) {
    logger.warn("capacity: missing dates or hunters", { orderId: order?.id, booking });
    return { success: false, conflicts: [] };
  }

  const n = Number(booking.numberOfHunters) || 0;
  if (n <= 0) {
    logger.warn("capacity: non-positive hunters", { orderId: order?.id, n });
    return { success: false, conflicts: [] };
  }

  // ✅ Normalize party-deck dates from the booking
  const deckDates = resolvePartyDeckDates(booking);
  if (!deckDates.length && (booking as any)?.partyDeck) {
    logger.warn("capacity: partyDeck true but no dates derived; check booking payload", {
      orderId: order?.id,
      booking,
    });
  }

  logger.info("capacity: committing (tx)", {
    orderId: order?.id,
    hunters: n,
    huntDates: booking.dates,
    partyDeckDates: deckDates,
  });

  try {
    await db.runTransaction(async (tx) => {
      // 1) Assert & mark Party Deck (throws if any date is already booked)
      if (deckDates.length) {
        await markPartyDeckBookedTx(tx, deckDates);
      }
      // 2) Increment hunters for each booked hunt date
      for (const date of booking.dates) {
        const ref = db.collection("availability").doc(date);
        tx.set(
          ref,
          { huntersBooked: FieldValue.increment(n), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    });

    logger.info("capacity: committed OK", { orderId: order?.id });
    return { success: true };
  } catch (err: any) {
    // If a party deck date was already taken, the error message will include it
    const message = String(err?.message || err);
    const conflicts = Array.from(
      new Set(
        message
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.startsWith("party-deck-already-booked:"))
          .map((s) => s.split(":")[1])
      )
    );

    logger.error("capacity: transaction failed", { orderId: order?.id, message, conflicts });

    // Optional: mark the order with a conflict flag so staff can resolve in UI
    try {
      if (order?.id) {
        await db.collection("orders").doc(order.id).set(
          {
            capacityConflict: {
              type: "partyDeck",
              dates: conflicts,
              at: FieldValue.serverTimestamp(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      logger.warn("capacity: failed to write conflict flag", { orderId: order?.id, e: String(e) });
    }

    // Optional: notify admin by email
    try {
      const to = NOTIFY_ADMIN_EMAIL.value();
      const subject = `⚠️ Party Deck conflict — Order ${order?.id ?? "unknown"}`;
      const html = `
        <p><strong>Party Deck booking conflict.</strong></p>
        <p>Order: ${order?.id ?? "unknown"}</p>
        <p>Conflicting dates: ${conflicts.length ? conflicts.join(", ") : "(could not parse)"}</p>
        <p>Please review in Firestore / orders and availability.</p>
      `;
      await sendEmail({ to, subject, html });
    } catch (e) {
      logger.warn("capacity: failed to send conflict email", { e: String(e) });
    }

    // Do not throw — return a negative result so caller can decide what to do
    return { success: false, conflicts };
  }
}



// ---- Unified HTTP handler ----
// Rather than relying on Express, we register a single onRequest handler and
// manually route based on the incoming URL and HTTP method.  This keeps the
// surface area small and avoids the need for additional middleware.  We also
// perform basic CORS handling for all endpoints.
export const emailOnOrderCreated = onDocumentCreated(
  {
    document: "orders/{orderId}",
    secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL, NOTIFY_ADMIN_EMAIL],
  },
  async (event) => {
    const data = event.data?.data() as any | undefined;
    if (!data) return;

    const orderId = event.params.orderId;
    const to = data.customer?.email || NOTIFY_ADMIN_EMAIL.value();
    const subject = `Order received — ${orderId}`;
    const html = renderOrderPlacedEmail({
      firstName: data.customer?.firstName,
      orderId,
      total: Number(data.total || 0),
      dates: data.booking?.dates,
      hunters: data.booking?.numberOfHunters,
    });

    try {
      await sendEmail({
        to,
        subject,
        html,
        bcc: NOTIFY_ADMIN_EMAIL.value() || undefined,
      });
    } catch (e) {
      logger.error("emailOnOrderCreated failed", String(e));
    }
  }
);


export const api = onRequest(
  {
    secrets: [
      DELUXE_CLIENT_ID,
      DELUXE_CLIENT_SECRET,
      DELUXE_ACCESS_TOKEN,
      DELUXE_MID,
      DELUXE_EMBEDDED_SECRET,
      RESEND_API_KEY,
      RESEND_FROM_EMAIL,
      NOTIFY_ADMIN_EMAIL,
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
// Diagnostic: show region & public egress IP of this function
if (req.method === "GET" && (url === "/api/whoami" || url === "/whoami")) {
  try {
    // Public egress IP (what Deluxe will see)
    const r = await fetch("https://api.ipify.org?format=json");
    const { ip } = (await r.json()) as { ip: string };

    // Regions envs commonly present on gen2 functions
    const region =
      process.env.FUNCTION_REGION ||
      process.env.GCLOUD_REGION ||
      process.env.X_GOOGLE_FUNCTION_REGION ||
      "unknown";

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      region,            // e.g., "us-central1"
      ip,                // e.g., "34.122.x.x"
      nowUtc: new Date().toISOString(),
      userAgent: req.headers["user-agent"] || null,
      xForwardedFor: req.headers["x-forwarded-for"] || null,
    });
  } catch (err) {
    res.status(500).json({ error: "whoami-failed", details: String(err) });
  }
  return;
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

    const approved =
  String(json?.responseCode ?? json?.code ?? "").toLowerCase() === "0" ||
  /approved|success/i.test(String(json?.status ?? json?.responseMessage ?? ""));

  
// NEW: persist refunded status on the order before responding
try {
  if (!approved) {
    logger.warn("refund not approved in body; not marking refunded", { json });
  } else {
    // Resolve the Firestore order doc ...
    let orderDoc: any | undefined;

    if (orderId) {
      const s = await db.collection("orders").doc(orderId).get();
      if (s.exists) orderDoc = { id: s.id, ...s.data() };
    } else if (paymentId) {
      const qs = await db
        .collection("orders")
        .where("deluxe.paymentId", "==", paymentId)
        .limit(1)
        .get();
      if (!qs.empty) {
        const d = qs.docs[0];
        orderDoc = { id: d.id, ...d.data() };
      }
    }

    const targetId = String(orderDoc?.id ?? orderId ?? "");
    if (targetId) {
      const ref = db.collection("orders").doc(targetId);
      await ref.set(
        {
          status: "refunded",
          updatedAt: FieldValue.serverTimestamp(),
          refund: {
            amount: Number(refundAmount),
            currency: String(currency || "USD").toUpperCase(),
            approvedAt: FieldValue.serverTimestamp(),
            paymentId: json?.paymentId ?? paymentId ?? null,
            parentPaymentId: json?.parentPaymentId ?? json?.resolvedPaymentId ?? null,
            requestId: deluxeRequestId ?? json?.requestId ?? null,
            responseCode: json?.responseCode ?? null,
            authResponse: json?.authResponse ?? null,
            deluxe: json,
          },
          deluxe: { ...(orderDoc?.deluxe || {}), lastRefund: json },
        },
        { merge: true }
      );
      try {
        let orderForRollback: OrderDoc | undefined = orderDoc as OrderDoc | undefined;
    
        if (!orderForRollback?.booking) {
          const fresh = await ref.get();
          if (fresh.exists) {
            orderForRollback = { id: fresh.id, ...(fresh.data() as OrderDoc) };
          }
        }
    
        if (approved && orderForRollback?.booking) {
          await rollbackCapacityFromOrder(orderForRollback);
          // Optional: mark so we don't double-rollback on repeated refund webhooks
          await ref.set(
            { capacityRolledBack: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
        }
      } catch (e) {
        logger.warn("capacity rollback failed", String(e));
      }
    }
  }
} catch (e) {
  logger.warn("order-refund-status-write failed", String(e));
}

// 💌 refund issued (customer + admin)
try {
  if (approved) {                              // ← add this line
    let orderDoc: any | undefined;
    if (orderId) {
      const s = await db.collection("orders").doc(orderId).get();
      if (s.exists) orderDoc = { id: s.id, ...s.data() };
    } else if (paymentId) {
      const qs = await db
        .collection("orders")
        .where("deluxe.paymentId", "==", paymentId)
        .limit(1)
        .get();
      if (!qs.empty) {
        const d = qs.docs[0];
        orderDoc = { id: d.id, ...d.data() };
      }
    }

    const to = orderDoc?.customer?.email || NOTIFY_ADMIN_EMAIL.value();
    const subject = `Refund issued — Order ${orderDoc?.id ?? orderId ?? paymentId}`;
    const html = renderRefundEmail({
      firstName: orderDoc?.customer?.firstName,
      orderId: String(orderDoc?.id ?? orderId ?? paymentId ?? "N/A"),
      amount: Number(refundAmount),
    });

    await sendEmail({ to, subject, html, bcc: NOTIFY_ADMIN_EMAIL.value() || undefined });
  } else {
    logger.warn("refund not approved; skipping refund email", { json });
  }                                          // ← and this closing brace
} catch (e) {
  logger.error("email refund-issued failed", String(e));
}

    // ----- Success -----
    res.status(200).json({ ...json, approved, resolvedPaymentId: paymentId, deluxeRequestId });
    return;
  } catch (err: any) {
    logger.error("refundDeluxePayment error", { message: err?.message ?? String(err) });
    res.status(500).json({ error: "refund-failed", message: err?.message ?? String(err) });
    return;
  }
}

async function forceSetPartyDeckBooked(order: OrderDoc): Promise<{ updated: number; dates: string[] }> {
  const booking = order?.booking;
  if (!booking?.dates?.length) return { updated: 0, dates: [] };

  // Prefer explicit dates; fallback to legacy boolean meaning "all dates"
  const targetDates =
    (Array.isArray(booking.partyDeckDates) && booking.partyDeckDates.filter(Boolean).length
      ? booking.partyDeckDates.filter(Boolean)
      : (booking as any)?.partyDeck === true
      ? booking.dates.filter(Boolean)
      : []);

  if (!targetDates.length) {
    logger.info("forceSetPartyDeckBooked: no deck dates to update", { orderId: order?.id, booking });
    return { updated: 0, dates: [] };
  }

  const batch = db.batch();
  for (const date of targetDates) {
    const ref = db.collection("availability").doc(date);
    batch.set(
      ref,
      { partyDeckBooked: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  await batch.commit();

  logger.info("forceSetPartyDeckBooked: updated", { orderId: order?.id, dates: targetDates });
  return { updated: targetDates.length, dates: targetDates };
}

      // Deluxe Webhook
if (req.method === "POST" && url === "/api/deluxe/webhook") {
  try {
    const evt = req.body || {};

    // Try both shapes: orderData.orderId and customData[] pair
    const orderId: string | undefined =
      evt?.orderData?.orderId ||
      evt?.customData?.find?.((x: any) => x?.name === "orderId")?.value;

    // Normalize status checks from various Deluxe payloads
    const status: string | undefined =
      evt?.status || evt?.transactionStatus || evt?.paymentStatus;
    const approved = typeof status === "string" && /approved|captured|paid/i.test(status);

    if (orderId && approved) {
      const ref = db.collection("orders").doc(orderId);
      const snap = await ref.get();

      if (!snap.exists) {
        logger.warn("Webhook order not found", { orderId, status });
        res.status(200).json({ ok: true, missing: true });
        return;
      }

      const order = { id: snap.id, ...(snap.data() as OrderDoc) };

      // ✅ Idempotency guard: only commit capacity & send email once
      const alreadyCommitted = snap.get("capacityCommitted") === true;

      // Always persist last webhook + status
      await ref.set(
        {
          status: "paid",
          deluxe: { lastWebhook: evt },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (!alreadyCommitted) {
        // 1) Normalize and persist deck dates onto the order for audit/consistency
        try {
          const normalized = resolvePartyDeckDates(order.booking);
          if (normalized.length) {
            // Write only the nested field; avoids constructing a partial booking object
            await ref.set(
              {
                "booking.partyDeckDates": normalized,
                updatedAt: FieldValue.serverTimestamp(),
              } as any,
              { merge: true }
            );
      
            // Update in-memory only if booking already exists (keeps type safety)
            if (order.booking) {
              order.booking.partyDeckDates = normalized;
            }
          }
        } catch (e) {
          logger.warn("webhook: failed to persist normalized partyDeckDates", { orderId, e: String(e) });
        }
      
        // 2) Commit availability exactly once (txn-safe; party deck handled inside)
        const cap = await incrementCapacityFromOrder(order);
      
        if (cap.success) {
          // Mark as committed only after successful capacity commit
          await ref.set(
            {
              capacityCommitted: true,
              capacityConflict: FieldValue.delete(), // ← clear old conflicts
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
       // 👇 NEW: belt-and-suspenders — forcibly set partyDeckBooked=true on the target dates
  try {
    const forced = await forceSetPartyDeckBooked(order);
    if (!forced.updated) {
      logger.warn("forceSetPartyDeckBooked: nothing updated (no deck dates derived)", {
        orderId: order.id,
      });
    }
  } catch (e) {
    logger.warn("forceSetPartyDeckBooked failed", { orderId: order.id, error: String(e) });
  }
          // 3) 💌 payment approved email (customer + admin) — send once
          try {
            const to = order.customer?.email || NOTIFY_ADMIN_EMAIL.value();
            const subject = `Payment received — Order ${order.id}`;
            const html = renderOrderPaidEmail({
              firstName: order.customer?.firstName,
              orderId: order.id!,
              total: Number(order.total || 0),
              dates: order.booking?.dates,
              hunters: order.booking?.numberOfHunters,
            });
            await sendEmail({
              to,
              subject,
              html,
              bcc: NOTIFY_ADMIN_EMAIL.value() || undefined,
            });
          } catch (e) {
            logger.error("email payment-approved failed", String(e));
          }
        } else {
          // Optional: surface conflicts on the order so staff can resolve in the UI
          await ref.set(
            {
              capacityCommitted: false,
              capacityConflict: {
                type: "partyDeck",
                dates: cap.conflicts ?? [],
                at: FieldValue.serverTimestamp(),
              },
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          logger.warn("capacity not committed (conflict)", { orderId: order.id, conflicts: cap.conflicts });
        }
      } // <-- THIS closing brace was missing
      
     
      res.status(200).json({ ok: true });
      return;
      
      

    }

    // Not approved or missing orderId — acknowledge so Deluxe doesn’t retry forever
    logger.warn("Webhook ignored (no orderId or not approved)", { orderId, status });
    res.status(200).json({ ok: true, ignored: true });
    return;
  } catch (err: any) {
    logger.error("webhook error", err);
    // Still 200 to avoid retry storms; error is logged for diagnosis
    res.status(200).json({ ok: false, error: "logged" });
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

