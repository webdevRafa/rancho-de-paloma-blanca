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
 *   - Uses global fetch (Node 22). Do NOT import node-fetch.
 *   - Gateway:   https://sandbox.api.deluxe.com | https://api.deluxe.com
 *   - Embedded:  https://payments2.deluxe.com    | https://payments.deluxe.com
 */

import * as admin from "firebase-admin";
import express, { type Request, type Response } from "express";
import cors from "cors";
import crypto from "crypto";

import { setGlobalOptions, logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// ---- Firebase init ----
try {
  admin.app();
} catch {
  admin.initializeApp();c
}
const db = admin.firestore();

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
  createdAt?: admin.firestore.Timestamp;
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
    lastAttempt?: admin.firestore.FieldValue | number | Date | null;
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
        huntersBooked: admin.firestore.FieldValue.increment(n),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

// ---- Express App ----
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Health
app.get("/api/health", (_req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok" });
});

// Embedded merchant status (wallets etc.) — HS256 JWT to payments{2}.deluxe.com
app.get("/api/getEmbeddedMerchantStatus", async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 5 * 60;

    const token = signEmbeddedJwt({
      accessToken: DELUXE_ACCESS_TOKEN.value(),
      iat: now,
      exp,
    });

    const url = `${embeddedBase()}/embedded/merchantStatus`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jwt: token }),
    });

    const txt = await r.text();
    let json: any = {};
    try {
      json = txt ? JSON.parse(txt) : {};
    } catch {
      // leave as {}
    }

    if (!r.ok) {
      logger.error("merchantStatus failed", { status: r.status, body: txt });
      return void res.json({ applePayEnabled: false, googlePayEnabled: false });
    }

    // Example response shape: { applePayEnabled: boolean, googlePayEnabled: boolean, ... }
    return void res.json(json);
  } catch (err: any) {
    logger.error("getEmbeddedMerchantStatus error", err);
    return void res.json({ applePayEnabled: false, googlePayEnabled: false });
  }
});

// Embedded: create short-lived JWT for the Deluxe SDK
app.post("/api/createEmbeddedJwt", async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, currency = "USD", orderId, customer, products, summary } =
      (req.body || {}) as {
        amount: number;
        currency?: "USD" | "CAD";
        orderId?: string;
        customer?: any;
        products?: any[];
        summary?: { hide?: boolean; hideTotals?: boolean };
      };

    if (typeof amount !== "number" || amount <= 0) {
      return void res.status(400).json({ error: "invalid-amount" });
    }

    // If an orderId is supplied, verify it exists and prefer its total for the JWT amount.
    let finalAmount = amount;
    let verifiedOrder: OrderDoc | null = null;
    if (orderId) {
      try {
        const ref = db.collection("orders").doc(String(orderId));
        const snap = await ref.get();
        if (snap.exists) {
          verifiedOrder = { id: snap.id, ...(snap.data() as OrderDoc) };
          if (typeof verifiedOrder.total === "number" && verifiedOrder.total > 0) {
            finalAmount = verifiedOrder.total;
          }
        } else {
          logger.warn("createEmbeddedJwt: orderId provided but not found", { orderId });
        }
      } catch (e) {
        logger.warn("createEmbeddedJwt: order lookup failed", { orderId, err: String(e) });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 10 * 60; // 10 minutes

    const payload: Record<string, any> = {
      iss: "RDPB-Functions",
      iat: now,
      exp,
      accessToken: DELUXE_ACCESS_TOKEN.value(),
      amount: finalAmount,
      currencyCode: currency, // Deluxe accepts currency or currencyCode; we use currencyCode
      ...(customer ? { customer } : {}),
      ...(products ? { products } : {}),
      ...(summary ? { summary } : {}),
      orderId: orderId ?? verifiedOrder?.id ?? null,
    };

    const jwt = signEmbeddedJwt(payload);

    return void res.json({
      jwt,
      exp,
      embeddedBase: embeddedBase(),
      env: useSandbox() ? "sandbox" : "production",
    });
  } catch (err: any) {
    logger.error("createEmbeddedJwt error", err);
    return void res.status(500).json({ error: "jwt-failed", message: err?.message || String(err) });
  }
});

// Hosted Links: create a payment link as fallback
app.post("/api/createDeluxePayment", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, successUrl, cancelUrl } = req.body || {};
    if (!orderId) {
      return void res.status(400).json({ error: "Missing orderId" });
    }

    const orderRef = db.collection("orders").doc(String(orderId));
    const snap = await orderRef.get();
    if (!snap.exists) {
      return void res.status(404).json({ error: "Order not found" });
    }
    const order = { id: snap.id, ...(snap.data() as OrderDoc) };

    const bearer = await getGatewayBearer();
    const body = buildPaymentLinkBody(order, { orderId: snap.id, successUrl, cancelUrl });

    const url = `${gatewayBase()}/dpp/v1/gateway/paymentlinks`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        PartnerToken: DELUXE_ACCESS_TOKEN.value(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error body */
    }

    if (!resp.ok) {
      logger.error("paymentlinks failed", { status: resp.status, body: text });
      return void res
        .status(resp.status)
        .json({ error: "paymentlinks-failed", status: resp.status, body: json || text });
    }

    const paymentUrl: string | undefined = json?.paymentUrl;
    const paymentLinkId: string | undefined = json?.paymentLinkId;
    if (!paymentUrl) {
      return void res.status(502).json({ error: "No paymentUrl in response", response: json });
    }

    await orderRef.set(
      {
        paymentLink: {
          paymentLinkId,
          paymentUrl,
          lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
        },
        deluxe: {
          lastPaymentLinkRequest: body,
          lastPaymentLinkResponse: json,
        },
      },
      { merge: true }
    );

    return void res.json({ paymentUrl, paymentLinkId });
  } catch (err: any) {
    logger.error("createDeluxePayment error", err);
    return void res
      .status(500)
      .json({ error: "createDeluxePayment-failed", message: err?.message || String(err) });
  }
});

// Refunds (compliance): POST /refunds
app.post("/api/refundDeluxePayment", async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, currency = "USD", paymentId, transactionId, reason } =
      (req.body || {}) as {
        amount?: number;
        currency?: "USD" | "CAD";
        paymentId?: string;
        transactionId?: string; // aka originalTransactionId
        reason?: string;
      };

    if (!amount || amount <= 0) {
      return void res.status(400).json({ error: "invalid-amount" });
    }
    if (!paymentId && !transactionId) {
      return void res.status(400).json({ error: "paymentId-or-transactionId-required" });
    }

    const bearer = await getGatewayBearer();
    const url = `${gatewayBase()}/dpp/v1/gateway/refunds`;
    const body: any = {
      amount: { amount, currency },
    };
    if (paymentId) body.paymentId = paymentId;
    if (transactionId) body.originalTransactionId = transactionId;
    if (reason) body.reason = reason;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        PartnerToken: DELUXE_ACCESS_TOKEN.value(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {}

    if (!resp.ok) {
      logger.error("refunds failed", { status: resp.status, body: text });
      return void res
        .status(resp.status)
        .json({ error: "refunds-failed", status: resp.status, body: json || text });
    }

    return void res.json(json);
  } catch (err: any) {
    logger.error("refundDeluxePayment error", err);
    return void res.status(500).json({ error: "refund-failed", message: err?.message || String(err) });
  }
});

// Webhook: mark orders paid & increment capacity
app.post("/api/deluxe/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const evt = req.body || {};
    // Try to resolve orderId from standard fields
    const orderId: string | undefined =
      evt?.orderData?.orderId ||
      evt?.customData?.find?.((x: any) => x?.name === "orderId")?.value;

    const status: string | undefined =
      evt?.status || evt?.transactionStatus || evt?.paymentStatus;
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        await incrementCapacityFromOrder(order);
      }
    } else {
      logger.warn("Webhook received without resolvable orderId or unpaid status", { orderId, status });
    }

    return void res.json({ ok: true });
  } catch (err: any) {
    logger.error("webhook error", err);
    // Always 200 to avoid retry storms; inspect logs for details.
    return void res.status(200).json({ ok: false });
  }
});

// ---- Export single onRequest that proxies to Express app ----
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
  (req, res) => app(req, res)
);
