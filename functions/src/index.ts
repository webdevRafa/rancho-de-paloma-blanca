/**
 * Rancho de Paloma Blanca — Cloud Functions (Node 20+, Functions v2)
 * Express app with minimal, safe changes:
 *  - firebase-admin v12 modular init
 *  - typed express/cors imports
 *  - lean Embedded JWT (no orderId, no nested summary)
 *  - country code coercion to "USA"/"CAN"
 */

import express, { type Request, type Response } from "express";
import cors from "cors";
import crypto from "crypto";

// ---- Firebase Functions v2 ----
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// ---- Firebase Admin v12 (modular) ----
import { getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

// ---------- Init ----------
if (getApps().length === 0) initializeApp();
const db = getFirestore();

setGlobalOptions({
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 60,
});

// ---------- Secrets ----------
const DELUXE_CLIENT_ID = defineSecret("DELUXE_CLIENT_ID");
const DELUXE_CLIENT_SECRET = defineSecret("DELUXE_CLIENT_SECRET");
const DELUXE_ACCESS_TOKEN = defineSecret("DELUXE_ACCESS_TOKEN"); // Partner/MID GUID
const DELUXE_MID = defineSecret("DELUXE_MID");                   // informational
const DELUXE_EMBEDDED_SECRET = defineSecret("DELUXE_EMBEDDED_SECRET"); // HS256 for embedded JWT

// ---------- Hosts ----------
function useSandbox(): boolean {
  const flag = (process.env.DELUXE_USE_SANDBOX ?? "true").toLowerCase();
  return flag !== "false"; // default true
}
function gatewayBase(): string {
  return useSandbox() ? "https://sandbox.api.deluxe.com" : "https://api.deluxe.com";
}
function embeddedBase(): string {
  // sandbox uses payments2; prod uses payments
  return useSandbox() ? "https://payments2.deluxe.com" : "https://payments.deluxe.com";
}

// ---------- Small helpers ----------
const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");

// HS256 signer for embedded JWTs + merchantStatus
function signEmbeddedJwt(payload: Record<string, any>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = crypto
    .createHmac("sha256", DELUXE_EMBEDDED_SECRET.value())
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

// Map input country to ISO alpha-3 expected by the Embedded SDK
function toAlpha3(input?: string): "USA" | "CAN" | string {
  const s = (input || "").trim().toUpperCase();
  if (!s) return "USA";
  if (["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA", "U.S."].includes(s)) return "USA";
  if (["CA", "CAN", "CANADA"].includes(s)) return "CAN";
  // if already 3 chars, leave it; otherwise default to USA
  return s.length === 3 ? s : "USA";
}

// ---------- Types ----------
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
  createdAt?: Timestamp | null;
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
      countryCode?: string; // we will coerce to alpha-3 when building payloads
    };
  };
  booking?: {
    dates: string[]; // YYYY-MM-DD
    numberOfHunters: number;
    partyDeckDates?: string[];
  };
  merchItems?: Record<
    string,
    { skuCode?: string; name?: string; price?: number; quantity?: number }
  >;
  paymentLink?: {
    paymentLinkId?: string;
    paymentUrl?: string;
    lastAttempt?: FirebaseFirestore.FieldValue | number | Date | null;
  };
  deluxe?: Record<string, unknown>;
};

function splitName(name?: string): { firstName: string; lastName: string } {
  if (!name?.trim()) return { firstName: "Guest", lastName: "User" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

// Body for Hosted Payment Links
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

// OAuth bearer for (hosted) gateway endpoints
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

// ---------- Express App ----------
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Health
app.get("/api/health", (_req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok" });
});

// Embedded merchant status (wallet flags etc.) — calls payments{2}.deluxe.com/embedded/merchantStatus
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
      /* non-JSON */
    }

    if (!r.ok) {
      logger.error("merchantStatus failed", { status: r.status, body: txt });
      return void res.json({ applePayEnabled: false, googlePayEnabled: false });
    }
    return void res.json(json);
  } catch (err: any) {
    logger.error("getEmbeddedMerchantStatus error", err);
    return void res.json({ applePayEnabled: false, googlePayEnabled: false });
  }
});

// Embedded: create short-lived JWT for the Deluxe SDK (no orderId / no nested summary)
app.post("/api/createEmbeddedJwt", async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, currency = "USD", orderId, customer, products } =
      (req.body || {}) as {
        amount: number;
        currency?: "USD" | "CAD";
        orderId?: string;          // used server-side only to verify amount; NOT added to JWT
        customer?: any;
        products?: any[];
      };

    if (typeof amount !== "number" || amount <= 0) {
      return void res.status(400).json({ error: "invalid-amount" });
    }

    // If orderId is supplied, verify it and prefer its total for the JWT amount.
    let finalAmount = amount;
    if (orderId) {
      try {
        const snap = await db.collection("orders").doc(String(orderId)).get();
        if (snap.exists) {
          const orderData = snap.data() as OrderDoc;
          if (typeof orderData.total === "number" && orderData.total > 0) {
            finalAmount = orderData.total;
          }
        } else {
          logger.warn("createEmbeddedJwt: orderId provided but not found", { orderId });
        }
      } catch (e) {
        logger.warn("createEmbeddedJwt: order lookup failed", { orderId, err: String(e) });
      }
    }

    // Normalize customer.billingAddress.countryCode to "USA"/"CAN"
    const normalizedCustomer =
      customer && customer.billingAddress
        ? {
            ...customer,
            billingAddress: {
              ...customer.billingAddress,
              countryCode: toAlpha3(customer.billingAddress?.countryCode),
            },
          }
        : customer;

    // Build a LEAN JWT payload: only recognized fields
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 15 * 60; // 15 mins

    const payload: Record<string, any> = {
      iat: now,
      exp,
      accessToken: DELUXE_ACCESS_TOKEN.value(), // Partner/MID GUID
      amount: Number(finalAmount),
      currencyCode: currency, // "USD" | "CAD"
    };
    if (normalizedCustomer) payload.customer = normalizedCustomer;
    if (Array.isArray(products) && products.length > 0) payload.products = products;

    // IMPORTANT: do NOT include orderId or a nested 'summary' object in the token

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

// Hosted Links: create a payment link (fallback)
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

    // persist reference if you like
    await orderRef.set(
      {
        paymentLink: {
          paymentUrl,
          paymentLinkId,
          lastAttempt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    return void res.json({ paymentUrl, paymentLinkId });
  } catch (err: any) {
    logger.error("createDeluxePayment error", err);
    return void res.status(500).json({ error: "link-failed", message: err?.message || String(err) });
  }
});

// ---------- Export Express app as a single HTTPS function ----------
export const api = onRequest(
  {
    cors: true,
    secrets: [DELUXE_CLIENT_ID, DELUXE_CLIENT_SECRET, DELUXE_ACCESS_TOKEN, DELUXE_MID, DELUXE_EMBEDDED_SECRET],
  },
  app
);
