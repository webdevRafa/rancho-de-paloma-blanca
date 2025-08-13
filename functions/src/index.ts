// functions/src/index.ts
/**
 * Rancho de Paloma Blanca — Cloud Functions v2 (Node 22)
 * - createDeluxePayment: builds a Deluxe-hosted payment link and returns paymentUrl
 * - deluxeWebhook: handles Deluxe notifications; marks order paid; increments capacity
 * - getDeluxePaymentStatus, cancelDeluxePayment (optional helpers)
 */

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

// --- Firebase Admin ---
admin.initializeApp();
const db = admin.firestore();

// --- Global options (v2 uses `memory`, not `memoryMiB`) ---
setGlobalOptions({
  region: "us-central1",
  timeoutSeconds: 60,
  memory: "512MiB",
});

// --- Deluxe secrets ---
const DELUXE_ACCESS_TOKEN = defineSecret("DELUXE_ACCESS_TOKEN");
const DELUXE_MID = defineSecret("DELUXE_MID");
const DELUXE_SANDBOX_CLIENT_ID = defineSecret("DELUXE_SANDBOX_CLIENT_ID");
const DELUXE_SANDBOX_CLIENT_SECRET = defineSecret("DELUXE_SANDBOX_CLIENT_SECRET");

// --- Constants ---
const DELUXE_BASE_URL = "https://sandbox.api.deluxe.com";

const FRONTEND_URLS = [
  "https://ranchodepalomablanca.com", // prod
  "http://localhost:5173",            // dev
];

const WEBHOOK_FUNCTION_NAME = "deluxeWebhook"; // used to build callback URL dynamically

// --- Types (align with frontend: keep 'cancelled' spelling) ---
type OrderStatus = "pending" | "paid" | "cancelled";
type Currency = "USD";

interface OrderDoc {
  id?: string;
  status: OrderStatus;
  total?: number;
  grandTotal?: number;
  amountCents?: number;
  currency?: Currency;
  createdAt?: admin.firestore.Timestamp | Date;
  booking?: {
    dates?: string[];
    partySize?: number;
    partyDeck?: boolean;
  };
  customer?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  merch?: Array<{ sku: string; name: string; qty: number; price?: number }>;
  payment?: {
    provider?: "deluxe";
    paymentId?: string;
    linkId?: string;
    raw?: any;
  };
}

// --- Lightweight CORS helper ---
function applyCors(req: any, res: any) {
  const headerOrigin = (req.headers?.origin as string) || "";
  const origin = FRONTEND_URLS.includes(headerOrigin) ? headerOrigin : FRONTEND_URLS[0];
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

// --- Utils ---
function currencyFromOrder(order: OrderDoc): Currency {
  return (order.currency as Currency) || "USD";
}

function amountFromOrder(order: OrderDoc): number {
  if (typeof order.amountCents === "number") return order.amountCents / 100;
  const dollars =
    typeof order.total === "number"
      ? order.total
      : typeof order.grandTotal === "number"
      ? order.grandTotal
      : 0;
  return Number(dollars.toFixed(2));
}

function extractPaymentUrl(obj: any): string | undefined {
  return (
    obj?.paymentUrl ||
    obj?.url ||
    obj?.link ||
    obj?.redirectUrl ||
    obj?.checkoutUrl ||
    obj?.data?.paymentUrl ||
    obj?.data?.url ||
    obj?.data?.link
  );
}

function buildSuccessUrl(originBase: string, orderId: string) {
  return `${originBase}/checkout/success?orderId=${encodeURIComponent(orderId)}`;
}
function buildCancelUrl(originBase: string, orderId: string) {
  return `${originBase}/checkout/cancel?orderId=${encodeURIComponent(orderId)}`;
}

// v2 Cloud Functions public URL (preferred over raw Cloud Run URL)
function guessWebhookUrl(projectId: string, region = "us-central1") {
  if (!projectId) return "";
  return `https://${region}-${projectId}.cloudfunctions.net/${WEBHOOK_FUNCTION_NAME}`;
}

// --- Deluxe API client ---
async function deluxeFetch(
  path: string,
  method: "GET" | "POST",
  body: any,
  secrets: { token: string; mid?: string }
) {
  const url = `${DELUXE_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${secrets.token}`,
  };
  if (secrets.mid) headers["MID"] = secrets.mid;

  const resp = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!resp.ok) {
    const msg = `Deluxe ${method} ${path} failed: ${resp.status} ${resp.statusText}`;
    logger.error(msg, { url, status: resp.status, json });
    throw new Error(msg);
  }

  return json;
}

// --- Firestore helpers ---
async function getOrder(orderId: string): Promise<admin.firestore.DocumentSnapshot<OrderDoc>> {
  const ref = db.collection("orders").doc(orderId) as admin.firestore.DocumentReference<OrderDoc>;
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Order ${orderId} not found`);
  return snap;
}

async function markOrderPaid(
  orderRef: admin.firestore.DocumentReference<OrderDoc>,
  payment: { provider: "deluxe"; paymentId?: string; linkId?: string; raw?: any }
) {
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(orderRef);
    if (!doc.exists) throw new Error("Order does not exist");
    const data = doc.data() as OrderDoc;
    if (data.status === "paid") return; // idempotent

    tx.update(orderRef, {
      status: "paid",
      "payment.provider": "deluxe",
      "payment.paymentId": payment.paymentId || admin.firestore.FieldValue.delete(),
      "payment.linkId": payment.linkId || admin.firestore.FieldValue.delete(),
      "payment.raw": payment.raw || admin.firestore.FieldValue.delete(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    } as Partial<OrderDoc> & Record<string, any>);

    const booking = data.booking;
    if (booking?.dates?.length && booking.partySize && booking.partySize > 0) {
      for (const dateStr of booking.dates) {
        const availRef = db.collection("availability").doc(dateStr);
        tx.set(
          availRef,
          {
            date: dateStr,
            huntersBooked: admin.firestore.FieldValue.increment(booking.partySize),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  });
}

// --- HTTP: Create Deluxe Hosted Checkout Link ---
export const createDeluxePayment = onRequest(
  {
    secrets: [DELUXE_ACCESS_TOKEN, DELUXE_MID, DELUXE_SANDBOX_CLIENT_ID, DELUXE_SANDBOX_CLIENT_SECRET],
  },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { orderId, successUrl, cancelUrl } = (req.body || {}) as {
        orderId?: string;
        successUrl?: string;
        cancelUrl?: string;
      };
      if (!orderId) {
        res.status(400).json({ error: "Missing orderId" });
        return;
      }

      const snap = await getOrder(orderId);
      const order = { id: snap.id, ...(snap.data() as OrderDoc) };

      const amount = amountFromOrder(order);
      const currency = currencyFromOrder(order);
      if (!amount || amount <= 0) {
        res.status(400).json({ error: "Order amount is missing or invalid" });
        return;
      }

      // origin selection for return URLs
      const headerOrigin = (req.headers?.origin as string) || "";
      const origin = FRONTEND_URLS.includes(headerOrigin) ? headerOrigin : FRONTEND_URLS[0];

      const webhookUrl = guessWebhookUrl(process.env.GCLOUD_PROJECT || "", "us-central1");
      const success = successUrl || buildSuccessUrl(origin, orderId);
      const cancel = cancelUrl || buildCancelUrl(origin, orderId);

      const payload = {
        amount: { amount, currency },
        reference: orderId,
        description: `Rancho de Paloma Blanca Order ${orderId}`,
        customer: {
          email: order.customer?.email,
          name: order.customer?.name,
          phone: order.customer?.phone,
        },
        successUrl: success,
        cancelUrl: cancel,
        callbackUrl: webhookUrl,
        metadata: {
          orderId,
          hasBooking: !!order.booking?.dates?.length,
          partySize: order.booking?.partySize || 0,
        },
        merchant: DELUXE_MID.value() ? { mid: DELUXE_MID.value() } : undefined,
        items:
          order.merch?.map((m) => ({
            name: m.name,
            sku: m.sku,
            quantity: m.qty,
            price: m.price,
          })) || [],
      };

      const json = await deluxeFetch("/paymentlinks", "POST", payload, {
        token: DELUXE_ACCESS_TOKEN.value(),
        mid: DELUXE_MID.value(),
      });

      const paymentUrl = extractPaymentUrl(json);
      if (!paymentUrl) {
        logger.error("No paymentUrl returned from Deluxe", { json });
        res.status(502).json({ error: "Deluxe did not return a payment URL", debug: json });
        return;
      }

      await snap.ref.set(
        {
          payment: {
            provider: "deluxe",
            linkId: json?.id || json?.linkId || null,
            raw: {
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              linkResponse: json,
            },
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        } as Partial<OrderDoc> & Record<string, any>,
        { merge: true }
      );

      res.status(200).json({ provider: "deluxe", paymentUrl });
      return;
    } catch (err: any) {
      logger.error("createDeluxePayment failed", { error: err?.message, stack: err?.stack });
      res.status(500).json({ error: "Internal error", detail: err?.message });
      return;
    }
  }
);

// --- HTTP: Deluxe Webhook Receiver ---
export const deluxeWebhook = onRequest(
  { secrets: [DELUXE_ACCESS_TOKEN, DELUXE_MID] },
  async (req, res) => {
    if (req.method === "GET") {
      res.status(200).send("OK");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const body = req.body || {};
      logger.info("Deluxe webhook received", {
        keys: Object.keys(body || {}),
        headers: { "content-type": req.headers["content-type"], "user-agent": req.headers["user-agent"] },
      });

      const orderId: string | undefined =
        body?.metadata?.orderId ||
        body?.reference ||
        body?.orderId ||
        body?.order?.id ||
        body?.data?.metadata?.orderId ||
        body?.data?.reference;

      const paymentId: string | undefined =
        body?.paymentId || body?.id || body?.data?.id || body?.transactionId;

      const eventType: string | undefined =
        body?.type || body?.event || body?.eventType || body?.notificationType;

      const statusRaw: string | undefined =
        body?.status || body?.data?.status || body?.paymentStatus || body?.result;

      if (!orderId) {
        logger.error("Webhook missing orderId-like identifier", { body });
        res.status(200).json({ received: true, ignored: true, reason: "missing orderId" });
        return;
      }

      const normalized = String(statusRaw || eventType || "").toLowerCase();
      const looksSuccessful =
        normalized.includes("success") ||
        normalized.includes("approved") ||
        normalized.includes("paid") ||
        normalized.includes("completed") ||
        normalized === "sale" ||
        normalized === "captured";

      const orderRef = db.collection("orders").doc(orderId) as admin.firestore.DocumentReference<OrderDoc>;

      if (looksSuccessful) {
        await markOrderPaid(orderRef, { provider: "deluxe", paymentId, raw: body });
        res.status(200).json({ ok: true });
        return;
      }

      const looksFailed =
        normalized.includes("fail") ||
        normalized.includes("declin") ||
        normalized.includes("void") ||
        normalized.includes("refund");

      if (looksFailed) {
        await orderRef.set(
          {
            status: "cancelled", // keep frontend union happy
            payment: { provider: "deluxe", paymentId: paymentId || null, raw: body },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          } as Partial<OrderDoc> & Record<string, any>,
          { merge: true }
        );
        res.status(200).json({ ok: true });
        return;
      }

      await orderRef.set(
        {
          payment: { provider: "deluxe", paymentId: paymentId || null, raw: body },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        } as Partial<OrderDoc> & Record<string, any>,
        { merge: true }
      );

      res.status(200).json({ received: true, noChange: true });
      return;
    } catch (err: any) {
      logger.error("deluxeWebhook error", { error: err?.message, stack: err?.stack });
      res.status(500).json({ error: "Webhook processing failed" });
      return;
    }
  }
);

// --- OPTIONAL: Query payment status (debug tool) ---
export const getDeluxePaymentStatus = onRequest(
  { secrets: [DELUXE_ACCESS_TOKEN, DELUXE_MID] },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { paymentId, reference } = req.body || {};
      if (!paymentId && !reference) {
        res.status(400).json({ error: "Provide paymentId or reference" });
        return;
      }

      const payload = paymentId ? { paymentId } : { reference };
      const json = await deluxeFetch("/payments/search", "POST", payload, {
        token: DELUXE_ACCESS_TOKEN.value(),
        mid: DELUXE_MID.value(),
      });

      res.status(200).json({ provider: "deluxe", result: json });
      return;
    } catch (err: any) {
      logger.error("getDeluxePaymentStatus failed", { error: err?.message });
      res.status(500).json({ error: "Internal error", detail: err?.message });
      return;
    }
  }
);

// --- OPTIONAL: Cancel a payment (if your flow needs it) ---
export const cancelDeluxePayment = onRequest(
  { secrets: [DELUXE_ACCESS_TOKEN, DELUXE_MID] },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { paymentId } = req.body || {};
      if (!paymentId) {
        res.status(400).json({ error: "Missing paymentId" });
        return;
      }

      const json = await deluxeFetch("/payments/cancel", "POST", { paymentId }, {
        token: DELUXE_ACCESS_TOKEN.value(),
        mid: DELUXE_MID.value(),
      });

      res.status(200).json({ ok: true, provider: "deluxe", result: json });
      return;
    } catch (err: any) {
      logger.error("cancelDeluxePayment failed", { error: err?.message });
      res.status(500).json({ error: "Internal error", detail: err?.message });
      return;
    }
  }
);

// --- Simple health check ---
export const apiHealth = onRequest({}, async (_req, res) => {
  res.status(200).send("ok");
});
