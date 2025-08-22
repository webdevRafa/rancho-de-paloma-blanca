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
  admin.initializeApp();
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
const DELUXE_ACCESS_TOKEN = defineSecret("DELUXE_ACCESS_TOKEN"); // PartnerToken (MID GUID)
const DELUXE_MID = defineSecret("DELUXE_MID");                   // (Informational MID)
const DELUXE_EMBEDDED_SECRET = defineSecret("DELUXE_EMBEDDED_SECRET"); // Secret Key for HS256 JWT

// ---- Hosts ----
function useSandbox(): boolean {
  const flag = (process.env.DELUXE_USE_SANDBOX ?? "true").toLowerCase();
  return flag !== "false";  // default true (sandbox)
}
function gatewayBase(): string {
  return useSandbox() ? "https://sandbox.api.deluxe.com" : "https://api.deluxe.com";
}
function embeddedBase(): string {
  // IMPORTANT: sandbox uses payments2, production uses payments
  return useSandbox() ? "https://payments2.deluxe.com" : "https://payments.deluxe.com";
}

// ---- Helpers ----
const base64url = (obj: object): string =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

// Sign a payload with HS256 (using our Secret Key) for Embedded endpoints
function signEmbeddedJwt(payload: Record<string, any>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = crypto
    .createHmac("sha256", DELUXE_EMBEDDED_SECRET.value())
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

// OAuth Bearer token for gateway (hosted) endpoints – client credentials grant
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
        Buffer.from(
          `${DELUXE_CLIENT_ID.value()}:${DELUXE_CLIENT_SECRET.value()}`
        ).toString("base64"),
    },
    body: params.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`OAuth failed (${resp.status}): ${errText || resp.statusText}`);
  }
  const json = (await resp.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("OAuth: missing access_token");
  }
  return json.access_token;
}

// ---- Firestore Types ----
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
    dates: string[];        // e.g. ["2024-09-15", ...]
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

// Split full name into firstName/lastName (for payment link requests)
function splitName(name?: string): { firstName: string; lastName: string } {
  if (!name?.trim()) return { firstName: "Guest", lastName: "User" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "Customer" };
  }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

// Build Deluxe Payment Link request body from OrderDoc
function buildPaymentLinkBody(
  order: OrderDoc,
  opts: { orderId: string; successUrl?: string; cancelUrl?: string }
) {
  const currency = order.currency ?? "USD";
  const amount = order.total;
  // Determine first/last name from order.customer
  const { firstName, lastName } =
    (order.customer?.firstName || order.customer?.lastName)
      ? {
          firstName: order.customer?.firstName ?? "Guest",
          lastName: order.customer?.lastName ?? "User",
        }
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

  if (order.level3?.length) {
    body.level3 = order.level3;  // include Level III line-item data if present
  }

  // customData can carry redirect URLs or additional info
  const customData: { name: string; value: string }[] = [];
  if (opts.successUrl) customData.push({ name: "successUrl", value: String(opts.successUrl) });
  if (opts.cancelUrl)  customData.push({ name: "cancelUrl",  value: String(opts.cancelUrl) });
  if (order.customer?.email) customData.push({ name: "email", value: String(order.customer.email) });
  if (customData.length) {
    body.customData = customData;
  }

  return body;
}

// Increment availability counts based on a paid order’s booking (if any)
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

// Health check endpoint (no caching)
app.get("/api/health", (_req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok" });
});

// GET Embedded Merchant Status – checks which digital wallets are enabled
app.get("/api/getEmbeddedMerchantStatus", async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 5 * 60;  // 5 minutes expiration for this JWT
    // Minimal JWT with accessToken (MID) to query merchant status
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

    const text = await r.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      // If response isn’t JSON, leave json as {}
    }

    if (!r.ok) {
      logger.error("merchantStatus failed", { status: r.status, body: text });
      // On error, assume wallets are disabled
      return void res.json({ applePayEnabled: false, googlePayEnabled: false });
    }

    // Respond with whatever flags Deluxe returned (e.g. applePayEnabled, googlePayEnabled, etc.)
    return void res.json(json);
  } catch (err: any) {
    logger.error("getEmbeddedMerchantStatus error", err);
    // On exception, also return false for both
    return void res.json({ applePayEnabled: false, googlePayEnabled: false });
  }
});

// POST Create Embedded JWT – returns a one-time JWT for Deluxe EmbeddedPayments.init(...)
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

    // If an orderId is provided, verify the order exists and use its total if available
    let finalAmount = amount;
    let verifiedOrder: OrderDoc | null = null;
    if (orderId) {
      try {
        const orderSnap = await db.collection("orders").doc(String(orderId)).get();
        if (orderSnap.exists) {
          verifiedOrder = { id: orderSnap.id, ...(orderSnap.data() as OrderDoc) };
          if (typeof verifiedOrder.total === "number" && verifiedOrder.total > 0) {
            finalAmount = verifiedOrder.total;  // use the order’s recorded total
          }
        } else {
          logger.warn("createEmbeddedJwt: orderId provided but not found", { orderId });
        }
      } catch (e) {
        logger.warn("createEmbeddedJwt: order lookup failed", { orderId, err: String(e) });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 10 * 60;  // JWT valid for 10 minutes

    // Build JWT payload for Embedded Payments
    const payload: Record<string, any> = {
      iss: "RDPB-Functions",       // issuer tag for debugging (optional)
      iat: now,
      exp,
      accessToken: DELUXE_ACCESS_TOKEN.value(),  // our Partner/MID GUID
      amount: finalAmount,
      currencyCode: currency,
      ...(customer ? { customer } : {}),         // include customer object if provided
      ...(products ? { products } : {}),         // include products array if provided
      ...(summary ? { 
            hideproductspanel: summary.hide === true,
            hidetotals: summary.hideTotals === true
        } : {}),
      orderId: orderId ?? verifiedOrder?.id ?? null,  // include orderId for reference
    };

    const jwt = signEmbeddedJwt(payload);

    return void res.json({
      jwt,
      exp,  // expiry timestamp for client-side reference
      embeddedBase: embeddedBase(),
      env: useSandbox() ? "sandbox" : "production",
    });
  } catch (err: any) {
    logger.error("createEmbeddedJwt error", err);
    return void res.status(500).json({ error: "jwt-failed", message: err?.message || String(err) });
  }
});

// POST Create Deluxe Payment Link (Hosted) – generates a redirect URL via Deluxe API
app.post("/api/createDeluxePayment", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, successUrl, cancelUrl } = req.body || {};
    if (!orderId) {
      return void res.status(400).json({ error: "Missing orderId" });
    }

    // Fetch the order from Firestore
    const orderRef = db.collection("orders").doc(String(orderId));
    const snap = await orderRef.get();
    if (!snap.exists) {
      return void res.status(404).json({ error: "Order not found" });
    }
    const order = { id: snap.id, ...(snap.data() as OrderDoc) };

    // Get OAuth Bearer token for Deluxe gateway
    const bearerToken = await getGatewayBearer();
    // Build request body for /paymentlinks call
    const body = buildPaymentLinkBody(order, { orderId: snap.id, successUrl, cancelUrl });

    const url = `${gatewayBase()}/dpp/v1/gateway/paymentlinks`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
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
      // Deluxe might return an HTML error or non-JSON body
    }

    if (!resp.ok) {
      logger.error("paymentlinks failed", { status: resp.status, body: text });
      return void res
        .status(resp.status)
        .json({ error: "paymentlinks-failed", status: resp.status, body: json || text });
    }

    const paymentUrl: string | undefined = json.paymentUrl;
    const paymentLinkId: string | undefined = json.paymentLinkId;
    if (!paymentUrl) {
      // Successful response *should* include paymentUrl; if not, treat as error
      return void res.status(502).json({ error: "No paymentUrl in response", response: json });
    }

    // Store the payment link and Deluxe API request/response in the order record (for audit)
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
    return void res.status(500).json({ error: "createDeluxePayment-failed", message: err?.message || String(err) });
  }
});

// POST Refund Deluxe Payment – issues a refund via Deluxe API (if needed)
app.post("/api/refundDeluxePayment", async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, currency = "USD", paymentId, transactionId, reason } =
      (req.body || {}) as {
        amount?: number;
        currency?: "USD" | "CAD";
        paymentId?: string;
        transactionId?: string;  // original transaction ID (if paymentId not provided)
        reason?: string;
      };

    if (!amount || amount <= 0) {
      return void res.status(400).json({ error: "invalid-amount" });
    }
    if (!paymentId && !transactionId) {
      return void res.status(400).json({ error: "paymentId-or-transactionId-required" });
    }

    const bearerToken = await getGatewayBearer();
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
        Authorization: `Bearer ${bearerToken}`,
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
      /* ignore JSON parse error */
    }

    if (!resp.ok) {
      logger.error("refunds failed", { status: resp.status, body: text });
      return void res
        .status(resp.status)
        .json({ error: "refunds-failed", status: resp.status, body: json || text });
    }

    // On success, Deluxe returns the refund details (pass it through)
    return void res.json(json);
  } catch (err: any) {
    logger.error("refundDeluxePayment error", err);
    return void res.status(500).json({ error: "refund-failed", message: err?.message || String(err) });
  }
});

// POST Deluxe Webhook – handles incoming Deluxe payment notifications
app.post("/api/deluxe/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const evt = req.body || {};
    // Resolve orderId from standard or custom fields
    const orderId: string | undefined =
      evt?.orderData?.orderId ||
      evt?.customData?.find?.((x: any) => x?.name === "orderId")?.value;
    // Determine status field (could be `status`, `transactionStatus`, or `paymentStatus`)
    const status: string | undefined =
      evt?.status || evt?.transactionStatus || evt?.paymentStatus;
    const approved = typeof status === "string" && /approved|captured|paid/i.test(status);

    if (orderId && approved) {
      const ref = db.collection("orders").doc(orderId);
      const snap = await ref.get();
      if (snap.exists) {
        const order = { id: snap.id, ...(snap.data() as OrderDoc) };
        // Mark order as paid and save the webhook payload for reference
        await ref.set(
          {
            status: "paid",
            deluxe: { lastWebhook: evt },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        // If the order was a booking, update availability counts
        await incrementCapacityFromOrder(order);
      }
    } else {
      logger.warn("Webhook received without resolvable orderId or non-approved status", { orderId, status });
    }

    // Always respond with 200 OK (Deluxe expects a successful ACK even if we found no order or status)
    return void res.json({ ok: true });
  } catch (err: any) {
    logger.error("webhook error", err);
    // Always return 200 to avoid webhook retries; log the error for investigation.
    return void res.status(200).json({ ok: false });
  }
});

// ---- Export the Express app as a single Cloud Function (HTTPS) ----
export const api = onRequest(
  { secrets: [DELUXE_CLIENT_ID, DELUXE_CLIENT_SECRET, DELUXE_ACCESS_TOKEN, DELUXE_MID, DELUXE_EMBEDDED_SECRET] },
  (req, res) => app(req, res)
);
