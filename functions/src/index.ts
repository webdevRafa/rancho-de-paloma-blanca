// functions/src/index.ts
/**
 * Rancho de Paloma Blanca — Cloud Functions v2 (Node 22)
 * INDEX.TS V3.1 — Deluxe Payment Links (Sandbox) — NO node-fetch
 *
 * This version uses the global `fetch` available in Node 18+ / 22 runtimes.
 * No import of "node-fetch" is required.
 *
 * Endpoints:
 *   OAuth (sandbox):  https://sandbox.api.deluxe.com/secservices/oauth2/v2/token
 *   Gateway base:     https://sandbox.api.deluxe.com/dpp/v1/gateway
 *   Payment Links:    https://sandbox.api.deluxe.com/dpp/v1/gateway/paymentlinks
 *
 * Functions provided (unchanged list):
 *  - createDeluxePayment
 *  - deluxeWebhook
 *  - getDeluxePaymentStatus
 *  - cancelDeluxePayment
 *  - apiHealth
 */

// NOTE: Do NOT import "node-fetch" — we rely on global fetch in Node 22.
// import fetch from "node-fetch";

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

// ------------------------- Firebase Admin -------------------------
admin.initializeApp();
const db = admin.firestore();

// ------------------------- Global Options -------------------------
setGlobalOptions({
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 60,
  maxInstances: 10,
});

// ------------------------- Secrets -------------------------
export const DELUXE_ACCESS_TOKEN = defineSecret("DELUXE_ACCESS_TOKEN"); // PartnerToken (merchant UUID)
export const DELUXE_MID = defineSecret("DELUXE_MID");                   // optional
export const DELUXE_SANDBOX_CLIENT_ID = defineSecret("DELUXE_SANDBOX_CLIENT_ID");
export const DELUXE_SANDBOX_CLIENT_SECRET = defineSecret("DELUXE_SANDBOX_CLIENT_SECRET");

// ------------------------- Deluxe Constants -------------------------
const OAUTH_HOST = "https://sandbox.api.deluxe.com";
const OAUTH_PATH = "/secservices/oauth2/v2/token";
const OAUTH_URL = `${OAUTH_HOST}${OAUTH_PATH}`;

// Sandbox gateway base confirmed for Rafael
const GATEWAY_BASE = "https://sandbox.api.deluxe.com/dpp/v1/gateway";

// A very lightweight wrapper to ensure TS doesn't complain if DOM lib isn't present
const fetchFn = (...args: any[]) => (globalThis as any).fetch(...(args as any));

// ------------------------- Types (minimal) -------------------------
type OrderStatus = "pending" | "paid" | "cancelled";
type DppCurrency = "USD" | "CAD";
type DppDeliveryMethod = "ReturnOnly" | "Email" | "Sms" | string;

interface BillingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface OrderCustomer {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  billingAddress?: BillingAddress;
}

interface Level3Item {
  skuCode?: string;
  quantity: number;
  price: number; // per unit, whole currency units, NOT cents
  description?: string;
  unitOfMeasure?: string;
  itemDiscountAmount?: number;
  itemDiscountRate?: number;
}

interface Order {
  id?: string;
  userId: string;
  status: OrderStatus;
  total: number;
  currency?: DppCurrency;
  createdAt?: FirebaseFirestore.Timestamp;
  booking?: any;
  merchItems?: Record<string, any>;
  customer?: OrderCustomer;
  level3?: Level3Item[];
  paymentLink?: {
    provider: "Deluxe";
    paymentLinkId?: string;
    paymentUrl?: string;
    createdAt?: any;
    expiry?: string;
  };
  deluxe?: {
    linkId?: string | null;
    paymentId?: string | null;
    paymentUrl?: string | null;
    createdAt?: any;
    updatedAt?: any;
    lastEvent?: any;
  };
}

interface DppAmount {
  amount: number;     // whole currency units (e.g., 200 = $200.00)
  currency: DppCurrency;
}

interface DppOrderData {
  orderId: string;
}

interface DppLevel3Item {
  skuCode: string;
  quantity: number;
  price: number;
  description?: string;
  unitOfMeasure?: string;
  itemDiscountAmount?: number;
  itemDiscountRate?: number;
}

interface DppCustomDataItem {
  name: string;
  value: string;
}

interface DppPaymentLinkRequest {
  amount: DppAmount;
  firstName: string;
  lastName: string;
  orderData: DppOrderData;
  paymentLinkExpiry: string;
  acceptPaymentMethod: Array<"Card" | "ACH">;
  deliveryMethod: DppDeliveryMethod;

  // Optional:
  level3?: DppLevel3Item[];
  customData?: DppCustomDataItem[];
  acceptBillingAddress?: boolean;
  requiredBillingAddress?: boolean;
  acceptPhone?: boolean;
  requiredPhone?: boolean;
  confirmationMessage?: string;
}

interface DppPaymentLinkResponse {
  paymentLinkId: string;
  paymentUrl: string;
}


// ------------------------- Utilities -------------------------
const CORS_ALLOW_ORIGIN = "*";
function applyCors(req: any, res: any): boolean {
  res.set("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

async function safeParse(resp: any): Promise<{ json: any | null; text: string | null }> {
  const ct = resp?.headers?.get?.("content-type") || "";
  let text: string | null = null;
  try {
    if (ct.includes("application/json")) {
      const json = await resp.json();
      return { json, text: null };
    }
    text = await resp.text();
  } catch {
    // ignore
  }
  let json: any = null;
  try {
    if (text) json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { json, text };
}

type TokenCache = { token: string; exp: number };
let tokenCache: TokenCache | null = null;

async function getBearerToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (tokenCache && now < tokenCache.exp) return tokenCache.token;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });

  const resp = await fetchFn(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const raw = await safeParse(resp);
  if (!resp.ok) {
    logger.error("Deluxe OAuth failed", { status: resp.status, ...raw });
    throw new Error(`OAuth failed (${resp.status})`);
  }

  const token = (raw.json?.access_token || raw.json?.accessToken || "").toString();
  const ttl = Number(raw.json?.expires_in ?? 3600);
  tokenCache = { token, exp: now + (ttl - 60) * 1000 }; // refresh 60s early
  return token;
}

function currencyFromOrder(order: Order): DppCurrency {
  return (order.currency as DppCurrency) || "USD";
}

function amountFromOrder(order: Order): DppAmount {
  return {
    amount: Number(order.total || 0), // whole units (NOT cents)
    currency: currencyFromOrder(order),
  };
}

function nameFromOrder(order: Order): { firstName: string; lastName: string } {
  const cust = order.customer;
  if (cust?.firstName && cust?.lastName) return { firstName: cust.firstName, lastName: cust.lastName };
  const full = (order.booking?.name as string) || "";
  const parts = full.trim().split(/\s+/);
  const firstName = parts[0] || "Guest";
  const lastName = parts.slice(1).join(" ") || "Customer";
  return { firstName, lastName };
}

function level3FromOrder(order: Order): DppLevel3Item[] | undefined {
  if (!order.level3 || order.level3.length === 0) return undefined;
  // Filter to only valid lines for Deluxe schema
  return order.level3
    .filter((l) => typeof l.quantity === "number" && typeof l.price === "number" && l.quantity > 0 && l.price >= 0)
    .map((l) => ({
      skuCode: l.skuCode || "LINE",
      quantity: l.quantity,
      price: l.price,
      description: l.description,
      unitOfMeasure: l.unitOfMeasure,
      itemDiscountAmount: l.itemDiscountAmount,
      itemDiscountRate: l.itemDiscountRate,
    }));
}

async function getOrder(orderId: string): Promise<Order & { id: string }> {
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Order ${orderId} not found`);
  return { id: snap.id, ...(snap.data() as Order) };
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

// ------------------------- createDeluxePayment -------------------------
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

      // 1) Load order
      const order = await getOrder(orderId);
      const amount = amountFromOrder(order);
      const { firstName, lastName } = nameFromOrder(order);
      const level3 = level3FromOrder(order);

      // 2) OAuth bearer + PartnerToken header
      const clientId = DELUXE_SANDBOX_CLIENT_ID.value();
      const clientSecret = DELUXE_SANDBOX_CLIENT_SECRET.value();
      const partnerToken = DELUXE_ACCESS_TOKEN.value() || DELUXE_MID.value();
      if (!clientId || !clientSecret || !partnerToken) {
        res.status(500).json({ error: "Missing Deluxe credentials" });
        return;
      }
      const bearer = await getBearerToken(clientId, clientSecret);

      // 3) Build Payment Link request (ReturnOnly so we get URL back)
      const body: DppPaymentLinkRequest = {
        amount,
        firstName,
        lastName,
        orderData: { orderId: order.id! },
        paymentLinkExpiry: "9 DAYS",
        acceptPaymentMethod: ["Card"],
        deliveryMethod: "ReturnOnly",
        ...(level3 ? { level3 } : {}),
        ...(successUrl || cancelUrl
          ? {
              customData: [
                ...(successUrl ? [{ name: "successUrl", value: successUrl }] : []),
                ...(cancelUrl ? [{ name: "cancelUrl", value: cancelUrl }] : []),
              ],
            }
          : {}),
      };

      const url = `${GATEWAY_BASE}/paymentlinks`;
      const headers = {
        Authorization: `Bearer ${bearer}`,
        PartnerToken: partnerToken as string,
        "Content-Type": "application/json",
        Accept: "application/json",
      } as Record<string, string>;

      logger.info("Calling Deluxe /paymentlinks (SANDBOX, no node-fetch)", {
        url,
        preview: { orderId: order.id, amount: amount.amount, currency: amount.currency },
      });

      const resp = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body) });
      const parsed = await safeParse(resp);

      if (!resp.ok) {
        // Distinguish a routing 404 HTML (often wrong path/host)
        if (resp.status === 404 && typeof parsed.text === "string" && parsed.text.includes("<html")) {
          logger.error("Deluxe /paymentlinks returned HTML 404 — check path/host", {
            status: resp.status,
            textPreview: parsed.text.slice(0, 300),
          });
        } else {
          logger.error("Deluxe /paymentlinks failed", { status: resp.status, ...parsed });
        }
        res.status(502).json({ error: "Deluxe payment link failed", status: resp.status, details: parsed });
        return;
      }

      const data = parsed.json as DppPaymentLinkResponse;
      const paymentUrl = extractPaymentUrl(data);
      if (!paymentUrl) {
        logger.error("Deluxe /paymentlinks OK but no paymentUrl in response", { data });
        res.status(502).json({ error: "Missing paymentUrl in Deluxe response" });
        return;
      }

      // 4) Persist link refs on the order (non-blocking if desired)
      try {
        const ref = db.collection("orders").doc(order.id!);
        await ref.set(
          {
            paymentLink: {
              provider: "Deluxe",
              paymentLinkId: (data as any).paymentLinkId || null,
              paymentUrl,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              expiry: "9 DAYS",
            },
            deluxe: {
              linkId: (data as any).paymentLinkId || null,
              paymentUrl,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
      } catch (err: any) {
        logger.warn("Failed to persist paymentLink info to Firestore (continuing)", { error: err?.message });
      }

      res.status(200).json({
        provider: "Deluxe",
        paymentUrl,
        paymentLinkId: (data as any).paymentLinkId,
      });
    } catch (err: any) {
      logger.error("createDeluxePayment error", { error: err?.message, stack: err?.stack });
      res.status(500).json({ error: "Internal error creating Deluxe payment link" });
    }
  }
);

// ------------------------- deluxeWebhook -------------------------
export const deluxeWebhook = onRequest(
  {
    secrets: [DELUXE_ACCESS_TOKEN, DELUXE_MID],
  },
  async (req, res) => {
    if (req.method === "GET") {
      res.status(200).send("ok");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const event = req.body || {};
      const type = event?.type || event?.eventType || event?.name || "unknown";
      const orderId =
        event?.orderId ||
        event?.data?.orderId ||
        event?.order?.id ||
        event?.metadata?.orderId ||
        event?.customData?.orderId ||
        null;

      const paymentId =
        event?.paymentId ||
        event?.data?.paymentId ||
        event?.id ||
        event?.transactionId ||
        null;

      const status =
        event?.status || event?.data?.status || event?.transactionStatus || event?.paymentStatus || "unknown";

      logger.info("deluxeWebhook received", { type, orderId, paymentId, status });

      if (!orderId) {
        logger.warn("Webhook without resolvable orderId");
        res.status(200).json({ ok: true }); // avoid retries if they don't send orderId
        return;
      }

      const ref = db.collection("orders").doc(String(orderId));
      const snap = await ref.get();
      if (!snap.exists) {
        logger.warn("Webhook refers to unknown order", { orderId });
        res.status(200).json({ ok: true });
        return;
      }

      // Simple success heuristic — refine with exact enums once provided
      const lowered = String(status).toLowerCase();
      const succeeded = lowered.includes("approved") || lowered.includes("success");

      if (succeeded) {
        await ref.set(
          {
            status: "paid",
            deluxe: {
              paymentId: paymentId || null,
              lastEvent: event,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
        // TODO: increment per-day capacity here when you finalize field names.
      } else if (lowered.includes("void") || lowered.includes("refund")) {
        await ref.set(
          {
            status: "cancelled",
            deluxe: {
              paymentId: paymentId || null,
              lastEvent: event,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
        // TODO: roll back capacity if appropriate
      } else {
        // Just store the event for visibility
        await ref.set(
          {
            deluxe: {
              paymentId: paymentId || null,
              lastEvent: event,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
      }

      res.status(200).json({ ok: true });
    } catch (err: any) {
      logger.error("deluxeWebhook error", { error: err?.message });
      res.status(200).json({ ok: true }); // reply 200 to avoid retries until schema is locked down
    }
  }
);

// ------------------------- getDeluxePaymentStatus -------------------------
export const getDeluxePaymentStatus = onRequest(
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
      const { paymentId, orderId } = (req.body || {}) as { paymentId?: string; orderId?: string };
      if (!paymentId && !orderId) {
        res.status(400).json({ error: "Provide paymentId or orderId" });
        return;
      }

      const clientId = DELUXE_SANDBOX_CLIENT_ID.value();
      const clientSecret = DELUXE_SANDBOX_CLIENT_SECRET.value();
      const partnerToken = DELUXE_ACCESS_TOKEN.value() || DELUXE_MID.value();
      const bearer = await getBearerToken(clientId, clientSecret);

      const url = `${GATEWAY_BASE}/payments/search`;
      const headers = {
        Authorization: `Bearer ${bearer}`,
        PartnerToken: partnerToken as string,
        "Content-Type": "application/json",
        Accept: "application/json",
      } as Record<string, string>;

      const body: Record<string, any> = {};
      if (paymentId) body.paymentId = paymentId;
      if (orderId) body.orderId = orderId;

      const resp = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body) });
      const parsed = await safeParse(resp);
      if (!resp.ok) {
        logger.error("Deluxe /payments/search failed", { status: resp.status, ...parsed });
        res.status(resp.status).json(parsed.json || { error: parsed.text || "Unknown error" });
        return;
      }
      res.status(200).json(parsed.json ?? { ok: true });
    } catch (err: any) {
      logger.error("getDeluxePaymentStatus error", { error: err?.message });
      res.status(500).json({ error: "Failed to query payment status" });
    }
  }
);

// ------------------------- cancelDeluxePayment -------------------------
export const cancelDeluxePayment = onRequest(
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
      const { paymentId } = (req.body || {}) as { paymentId?: string };
      if (!paymentId) {
        res.status(400).json({ error: "Missing paymentId" });
        return;
      }

      const clientId = DELUXE_SANDBOX_CLIENT_ID.value();
      const clientSecret = DELUXE_SANDBOX_CLIENT_SECRET.value();
      const partnerToken = DELUXE_ACCESS_TOKEN.value() || DELUXE_MID.value();
      const bearer = await getBearerToken(clientId, clientSecret);

      const url = `${GATEWAY_BASE}/payments/cancel`;
      const headers = {
        Authorization: `Bearer ${bearer}`,
        PartnerToken: partnerToken as string,
        "Content-Type": "application/json",
        Accept: "application/json",
      } as Record<string, string>;

      const body = { paymentId };

      const resp = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body) });
      const parsed = await safeParse(resp);
      if (!resp.ok) {
        logger.error("Deluxe /payments/cancel failed", { status: resp.status, ...parsed });
        res.status(resp.status).json(parsed.json || { error: parsed.text || "Unknown error" });
        return;
      }
      res.status(200).json(parsed.json ?? { ok: true });
    } catch (err: any) {
      logger.error("cancelDeluxePayment error", { error: err?.message });
      res.status(500).json({ error: "Failed to cancel payment" });
    }
  }
);

// ------------------------- apiHealth -------------------------
export const apiHealth = onRequest(async (_req, res) => {
  res.status(200).send("ok");
});