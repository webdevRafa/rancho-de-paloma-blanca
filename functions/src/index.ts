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

// ✅ Use separate host + gateway base
const DELUXE_HOST = "https://sandbox.api.deluxe.com"; // swap to https://api.deluxe.com for prod
const DELUXE_GATEWAY_BASE = `${DELUXE_HOST}/dpp/v1/gateway`;

// ✅ OAuth is on the host, NOT the gateway base
const OAUTH_URL = `${DELUXE_HOST}/secservices/oauth2/v2/token`;

// ✅ Payment Links lives under the gateway base
const PAYMENTLINKS_URL = `${DELUXE_GATEWAY_BASE}/paymentlinks`;


const FRONTEND_URLS = [
  "https://ranchodepalomablanca.com", // prod
  "https://www.ranchodepalomablanca.com",
  "http://localhost:5173",            // dev
];



// --- Types (align with frontend: keep 'cancelled' spelling) ---
type OrderStatus = "pending" | "paid" | "cancelled";

interface BillingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: "US" | "CA" | string;
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
  price: number; // per-unit price in whole currency units
  description?: string;
  unitOfMeasure?: string;
  itemDiscountAmount?: number;
  itemDiscountRate?: number; // 0.1 = 10%
}

interface Order {
  id?: string;
  userId: string;
  status: OrderStatus;
  total: number;                 // whole currency units (e.g., 200 = $200.00)
  currency?: "USD" | "CAD";
  booking?: { name?: string };   // used to derive first/last if no customer block
  merchItems?: Record<string, unknown>;
  customer?: OrderCustomer;
  level3?: Level3Item[];
  deluxe?: {
    linkId?: string | null;
    paymentId?: string | null;
    paymentUrl?: string | null;
    createdAt?: any;
    updatedAt?: any;
    lastEvent?: any;
  };
}

// --- Deluxe Payment Links: Request/Response ---
type DppCurrency = "USD" | "CAD";

interface DppAmount { amount: number; currency: DppCurrency; }
interface DppOrderData { orderId: string; }

interface DppLevel3Item {
  skuCode: string;
  quantity: number;
  price: number;
  description?: string;
  unitOfMeasure?: string;
  itemDiscountAmount?: number;
  itemDiscountRate?: number;
}

type DppDeliveryMethod = "ReturnOnly" | "Email" | "Sms" | string;

interface DppCustomDataItem { name: string; value: string; }

interface DppPaymentLinkRequest {
  amount: DppAmount;
  firstName: string;
  lastName: string;
  orderData: DppOrderData;
  paymentLinkExpiry: string;                  // e.g., "9 DAYS"
  acceptPaymentMethod: Array<"Card" | string>;
  deliveryMethod: DppDeliveryMethod;
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
  [key: string]: unknown;
}

// --- Cloud Function I/O contracts ---
interface CreateDeluxePaymentRequest {
  orderId: string;
  successUrl?: string;
  cancelUrl?: string;
}
interface CreateDeluxePaymentResponse {
  provider: "Deluxe";
  paymentUrl: string;
  paymentLinkId?: string;
}

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
type TokenCache = { token: string; exp: number };

let tokenCache: TokenCache | null = null;

export async function getBearerToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (tokenCache && now < tokenCache.exp) return tokenCache.token;

  // ---- Attempt 1: RFC6749 client auth via Basic header ----
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const form = new URLSearchParams({ grant_type: "client_credentials" });

  let resp = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form,
  });

  let raw = await resp.text();

  if (!resp.ok) {
    logger.warn("OAuth (Basic) failed", { status: resp.status, snippet: raw?.slice(0, 200) });

    // ---- Attempt 2: creds in x-www-form-urlencoded BODY (some tenants require this) ----
    resp = await fetch(OAUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    raw = await resp.text();

    if (!resp.ok) {
      logger.error("OAuth (Body creds) failed", { status: resp.status, snippet: raw?.slice(0, 200) });
      const code =
        resp.status >= 500 ? `oauth_failed_${resp.status}` :
        resp.status === 400 || resp.status === 401 ? "oauth_bad_creds" :
        `oauth_failed_${resp.status}`;
      throw new Error(code);
    }
  }

  // ---- Parse the token ----
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    logger.error("OAuth returned non-JSON", { snippet: raw?.slice(0, 200) });
    throw new Error("oauth_invalid_json");
  }

  const token = json?.access_token as string | undefined;
  const expiresIn = Number(json?.expires_in ?? 3600);
  if (!token) {
    logger.error("OAuth missing access_token", { jsonKeys: Object.keys(json || {}) });
    throw new Error("oauth_no_access_token");
  }

  // cache with 60s early refresh
  tokenCache = { token, exp: now + Math.max(0, expiresIn - 60) * 1000 };
  return token;
}






// Safe JSON/text parser to handle Deluxe sometimes returning non-JSON bodies
async function safeParse(resp: any): Promise<{ json: any | null; text: string | null }> {
  const ct = resp.headers?.get?.("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      return { json: await resp.json(), text: null };
    }
    const txt = await resp.text();
    try {
      return { json: JSON.parse(txt), text: txt };
    } catch {
      return { json: null, text: txt };
    }
  } catch {
    try {
      const txt = await resp.text();
      return { json: null, text: txt };
    } catch {
      return { json: null, text: null };
    }
  }
}

async function getOrder(orderId: string): Promise<Order & { id: string }> {
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) throw new Error(`Order ${orderId} not found`);
  return { id: snap.id, ...(snap.data() as Order) };
}

function amountFromOrder(order: Order): DppAmount {
  return {
    amount: Number(order.total || 0),
    currency: currencyFromOrder(order),
  };
}

function nameFromOrder(order: Order): { firstName: string; lastName: string } {
  const cust = order.customer;
  if (cust?.firstName && cust?.lastName) return { firstName: cust.firstName, lastName: cust.lastName };
  const full = order.booking?.name || "";
  const parts = full.trim().split(/\s+/);
  const firstName = parts[0] || "Guest";
  const lastName = parts.slice(1).join(" ") || "Customer";
  return { firstName, lastName };
}

function level3FromOrder(order: Order): DppLevel3Item[] | undefined {
  if (order.level3 && order.level3.length) {
    return order.level3.map((l): DppLevel3Item => ({
      skuCode: l.skuCode || l.description || "ITEM",
      quantity: Number(l.quantity || 1),
      price: Number(l.price || 0),
      description: l.description,
      unitOfMeasure: l.unitOfMeasure,
      itemDiscountAmount: l.itemDiscountAmount,
      itemDiscountRate: l.itemDiscountRate,
    }));
  }
  return undefined; // optional
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
function currencyFromOrder(order: Order): Currency {
  return (order.currency as Currency) || "USD";
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



// --- Deluxe API client ---
// --- Deluxe API client ---
async function deluxeFetch(
  path: string,
  method: "GET" | "POST",
  body: any,
  auth: { bearer: string; partnerToken: string } // <-- rename to auth
) {
  const url = `${DELUXE_GATEWAY_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${auth.bearer}`,
    PartnerToken: auth.partnerToken,
  };

  const resp = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });

  const { json, text } = await safeParse(resp);
  if (!resp.ok) {
    const msg = json?.message || json?.error || text || `Deluxe ${method} ${path} failed: ${resp.status}`;
    logger.error("Deluxe gateway error", { url, status: resp.status, json, text });
    throw new Error(msg);
  }
  return json ?? {};
}


// --- Firestore helpers ---

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
  async (req, res): Promise<void> => {
    try {
      if (applyCors(req, res)) return;
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const { orderId, successUrl, cancelUrl } = (req.body || {}) as CreateDeluxePaymentRequest;
      if (!orderId) {
        res.status(400).json({ error: "Missing orderId" });
        return;
      }

      // 1) Fetch order + derive fields
      const order = await getOrder(orderId);
      const amount = amountFromOrder(order);
      const { firstName, lastName } = nameFromOrder(order);
      const level3 = level3FromOrder(order);

      // Guard against zero/undefined amounts
      if (!amount?.amount || amount.amount <= 0) {
        logger.error("Invalid amount for order", { orderId: order.id, amount, orderTotal: order.total });
        res.status(400).json({ error: "invalid_amount" });
        return;
      }

      // 2) Auth (unchanged)
      const partnerToken = DELUXE_ACCESS_TOKEN.value(); // PartnerToken header (merchant UUID)
      const bearer = await getBearerToken(
        DELUXE_SANDBOX_CLIENT_ID.value(),
        DELUXE_SANDBOX_CLIENT_SECRET.value()
      );

      // Config logs (no secrets)
      logger.info("Deluxe config", {
        host: DELUXE_HOST,
        gatewayBase: DELUXE_GATEWAY_BASE,
        oauthUrl: OAUTH_URL,
        paymentLinksUrl: PAYMENTLINKS_URL,
        path: "/paymentlinks",
      });
      logger.info("Deluxe auth headers (masked)", {
        partnerTokenSuffix: (partnerToken || "").slice(-6),
      });

      // 3) Build success/cancel URLs (always include)
      const headerOrigin = (req.headers?.origin as string) || "";
      const originBase = FRONTEND_URLS.includes(headerOrigin) ? headerOrigin : FRONTEND_URLS[0];
      const success = successUrl ?? buildSuccessUrl(originBase, order.id!);
      const cancel = cancelUrl ?? buildCancelUrl(originBase, order.id!);

      // 4) Build /paymentlinks body
      const body: DppPaymentLinkRequest = {
        amount,
        firstName,
        lastName,
        orderData: { orderId: order.id! },
        paymentLinkExpiry: "9 DAYS",
        acceptPaymentMethod: ["Card"],
        deliveryMethod: "ReturnOnly",
        ...(level3?.length ? { level3 } : {}),
        customData: [
          { name: "site", value: "Rancho de Paloma Blanca" },
          { name: "successUrl", value: success },
          { name: "cancelUrl", value: cancel },
        ],
        // acceptBillingAddress: true,
        // requiredBillingAddress: false,
        // acceptPhone: true,
        // requiredPhone: false,
      };

      // Log the exact URL we’ll call
      logger.info("Calling Deluxe /paymentlinks", {
        url: PAYMENTLINKS_URL,
        host: new URL(PAYMENTLINKS_URL).host,
        path: new URL(PAYMENTLINKS_URL).pathname,
        preview: { orderId: order.id, amount: amount.amount, currency: amount.currency },
      });

      // 5) POST to Deluxe
      const resp: any = await fetch(PAYMENTLINKS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${bearer}`,
          PartnerToken: partnerToken,
        },
        body: JSON.stringify(body),
      });

      const { json, text } = await safeParse(resp);

      if (!resp.ok) {
        logger.error("Deluxe /paymentlinks error", { status: resp.status, json, text });
        const message =
          (json && (json.message || json.error || json.code)) ||
          text ||
          `Deluxe /paymentlinks failed with ${resp.status}`;
        // Normalize error key
        res.status(502).json({ error: "deluxe_payment_failed", message, status: resp.status });
        return;
      }

      const data = json as DppPaymentLinkResponse;
      const paymentUrl = data?.paymentUrl ?? extractPaymentUrl(json);

      if (!data?.paymentLinkId || !paymentUrl) {
        logger.error("Deluxe /paymentlinks missing fields", { json, text });
        res.status(502).json({ error: "invalid_deluxe_response", payload: json ?? text ?? null });
        return;
      }

      // Success log
      logger.info("Deluxe /paymentlinks ok", {
        status: resp.status,
        paymentLinkId: data.paymentLinkId,
        paymentUrlPreview: (paymentUrl || "").slice(0, 120),
      });

      // 6) Persist to Firestore
      await db.collection("orders").doc(orderId).set(
        {
          paymentLink: {
            provider: "Deluxe",
            paymentLinkId: data.paymentLinkId,
            paymentUrl,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiry: "9 DAYS",
          },
          deluxe: {
            linkId: data.paymentLinkId,
            paymentUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastEvent: "link_created",
          },
        },
        { merge: true }
      );

      // 7) Return to client
      const out: CreateDeluxePaymentResponse = {
        provider: "Deluxe",
        paymentUrl,
        paymentLinkId: data.paymentLinkId,
      };
      res.status(200).json(out);
      return;
    } catch (err: any) {
      logger.error("createDeluxePayment failed", { error: err?.message, stack: err?.stack });
      res.status(500).json({ error: "internal", message: err?.message || "Unknown error" });
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
// --- OPTIONAL: Query payment status (debug tool) ---
export const getDeluxePaymentStatus = onRequest(
  { secrets: [DELUXE_ACCESS_TOKEN, DELUXE_MID, DELUXE_SANDBOX_CLIENT_ID, DELUXE_SANDBOX_CLIENT_SECRET] },
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

      // ✅ get Bearer via OAuth
      const bearer = await getBearerToken(
        DELUXE_SANDBOX_CLIENT_ID.value(),
        DELUXE_SANDBOX_CLIENT_SECRET.value()
      );

      // ✅ pass { bearer, partnerToken } to deluxeFetch
      const json = await deluxeFetch("/payments/search", "POST", payload, {
        bearer,
        partnerToken: DELUXE_ACCESS_TOKEN.value(),
      });

      res.status(200).json({ provider: "deluxe", result: json });
    } catch (err: any) {
      logger.error("getDeluxePaymentStatus failed", { error: err?.message });
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  }
);

// --- OPTIONAL: Cancel a payment (if your flow needs it) ---
export const cancelDeluxePayment = onRequest(
  { secrets: [DELUXE_ACCESS_TOKEN, DELUXE_MID, DELUXE_SANDBOX_CLIENT_ID, DELUXE_SANDBOX_CLIENT_SECRET] },
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

      const bearer = await getBearerToken(
        DELUXE_SANDBOX_CLIENT_ID.value(),
        DELUXE_SANDBOX_CLIENT_SECRET.value()
      );

      const json = await deluxeFetch("/payments/cancel", "POST", { paymentId }, {
        bearer,
        partnerToken: DELUXE_ACCESS_TOKEN.value(),
      });

      res.status(200).json({ ok: true, provider: "deluxe", result: json });
    } catch (err: any) {
      logger.error("cancelDeluxePayment failed", { error: err?.message });
      res.status(500).json({ error: "Internal error", detail: err?.message });
    }
  }
);


// --- Simple health check ---
export const apiHealth = onRequest({}, async (_req, res) => {
  res.status(200).send("ok");
});
