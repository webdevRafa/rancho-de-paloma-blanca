import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import cors from "cors";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// Initialize Firebase Admin SDK
try {
  admin.app();
} catch {
  admin.initializeApp();
}
const db = admin.firestore();

// Set global function options (region, memory, timeout)
setGlobalOptions({
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 60,
});

// Define secrets (to be set in Firebase environment)
const DELUXE_ACCESS_TOKEN = defineSecret("DELUXE_ACCESS_TOKEN");             // PartnerToken (UUID)
const DELUXE_EMBEDDED_SECRET = defineSecret("DELUXE_EMBEDDED_SECRET");       // Secret Key for HS256 JWT
const DELUXE_SANDBOX_CLIENT_ID = defineSecret("DELUXE_SANDBOX_CLIENT_ID");   // OAuth Client ID (sandbox)
const DELUXE_SANDBOX_CLIENT_SECRET = defineSecret("DELUXE_SANDBOX_CLIENT_SECRET"); // OAuth Client Secret (sandbox)

// Determine environment (sandbox vs production) for Deluxe endpoints
function useSandbox(): boolean {
  const flag = (process.env.DELUXE_USE_SANDBOX ?? "true").toLowerCase();
  return flag !== "false";
}
function gatewayBase(): string {
  // Base URL for Deluxe API (gateway)
  return useSandbox()
    ? "https://sandbox.api.deluxe.com"
    : "https://api.deluxe.com";
}
function embeddedBase(): string {
  // Base URL for Deluxe Embedded SDK/merchant endpoints
  return useSandbox()
    ? "https://payments2.deluxe.com"
    : "https://payments.deluxe.com";
}

// Helper: get OAuth bearer token for Deluxe API requests
async function getGatewayBearer(): Promise<string> {
  const tokenUrl = `${gatewayBase()}/secservices/oauth2/v2/token`;
  const creds = `${DELUXE_SANDBOX_CLIENT_ID.value()}:${DELUXE_SANDBOX_CLIENT_SECRET.value()}`;
  const authHeader = "Basic " + Buffer.from(creds).toString("base64");
  const params = new URLSearchParams({ grant_type: "client_credentials" });
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`OAuth token request failed (${resp.status}): ${errText || resp.statusText}`);
  }
  const data = (await resp.json().catch(() => ({}))) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("OAuth response missing access_token");
  }
  return data.access_token;
}

// Initialize Express app and middleware (CORS, JSON parsing)
const app = express();
app.use(cors({ origin: true }));
app.options("*", cors({ origin: true })); // allow preflight from any origin

// Webhook endpoint (Deluxe callbacks)
app.get("/api/deluxeWebhook", (_req: Request, res: Response) => {
  // Simple health check or verification
  res.status(200).send("OK");
});
app.post(
  "/api/deluxeWebhook",
  express.raw({ type: "application/json" }), // raw body parser for signature verification
  async (req: Request, res: Response): Promise<void> => {
    try {
      const signatureHeader =
        req.header("x-hook-signature") ||
        req.header("x-dpp-signature") ||
        req.header("x-deluxe-signature") ||
        "";
      if (!signatureHeader) {
        logger.warn("Deluxe webhook: missing signature header");
        res.status(401).send("Signature missing");
        return;
      }
      // Compute HMAC SHA256 of the raw body using the embedded secret
      let providedSig = signatureHeader;
      if (providedSig.startsWith("sha256=")) {
        providedSig = providedSig.slice(7);
      }
      const expectedSig = crypto
        .createHmac("sha256", DELUXE_EMBEDDED_SECRET.value())
        .update(req.body || "")
        .digest("hex");
      // Use constant-time comparison
      if (
        providedSig.length !== expectedSig.length ||
        !crypto.timingSafeEqual(Buffer.from(providedSig, "utf8"), Buffer.from(expectedSig, "utf8"))
      ) {
        logger.warn("Deluxe webhook: signature verification failed", { providedSig, expectedSig });
        res.status(401).send("Invalid signature");
        return;
      }
      // Signature valid – parse the JSON payload
      let eventData: any;
      try {
        eventData = JSON.parse(req.body.toString("utf8"));
      } catch (e: any) {
        logger.error("Deluxe webhook: failed to parse JSON", { error: e?.message });
        res.status(400).send("Invalid JSON");
        return;
      }
      // Determine orderId from payload (support different shapes)
      const orderId: string | undefined =
        eventData?.orderData?.orderId || eventData?.orderId || eventData?.orderID;
      if (!orderId) {
        // No orderId associated with this event – nothing to update
        res.status(200).send("No orderId in webhook");
        return;
      }
      // Fetch the corresponding order from Firestore
      const orderRef = db.collection("orders").doc(String(orderId));
      const snap = await orderRef.get();
      if (!snap.exists) {
        logger.warn("Deluxe webhook: Order not found for orderId", { orderId });
        // Order not found, but return 200 to acknowledge receipt (to prevent retries)
        res.status(200).send("Order not found");
        return;
      }
      // Determine new status based on event (success vs failure)
      let newStatus: string | undefined;
      const statusStr = String(eventData?.status || eventData?.paymentStatus || "")
        .toLowerCase();
      const eventTypeStr = String(eventData?.eventType || eventData?.type || "")
        .toLowerCase();
      // Heuristic: mark as paid on success/completion, cancelled on failure/void/refund
      if (
        statusStr.includes("success") ||
        statusStr.includes("approved") ||
        statusStr.includes("complete") ||
        statusStr.includes("paid")
      ) {
        newStatus = "paid";
      } else if (
        statusStr.includes("fail") ||
        statusStr.includes("decline") ||
        statusStr.includes("void") ||
        statusStr.includes("cancel") ||
        statusStr.includes("refund")
      ) {
        newStatus = "cancelled";
      }
      if (!newStatus) {
        if (
          eventTypeStr.includes("payment_succeeded") ||
          eventTypeStr.includes("payment_complete") ||
          eventTypeStr.includes("transaction_approved")
        ) {
          newStatus = "paid";
        } else if (
          eventTypeStr.includes("payment_failed") ||
          eventTypeStr.includes("payment_void") ||
          eventTypeStr.includes("refund") ||
          eventTypeStr.includes("chargeback") ||
          eventTypeStr.includes("cancel")
        ) {
          newStatus = "cancelled";
        }
      }
      // Extract a transaction/payment ID if present (for logging or storing)
      const paymentId =
        eventData?.paymentId || eventData?.paymentID || eventData?.transactionId || eventData?.transactionID;
      // Update Firestore order document
      try {
        const updateFields: any = {};
        if (newStatus) {
          updateFields.status = newStatus;
        }
        if (paymentId) {
          updateFields.gatewayPaymentId = paymentId;
        }
        await orderRef.update(updateFields);
      } catch (e: any) {
        logger.error("Deluxe webhook: Firestore update failed", { orderId, error: e?.message });
        // Respond with error to trigger webhook retry
        res.status(500).send("Order update failed");
        return;
      }
      logger.info("Deluxe webhook: Order updated", { orderId, newStatus, paymentId });
      res.status(200).send("OK");
    } catch (err: any) {
      logger.error("Deluxe webhook: Unhandled error", { message: err?.message });
      res.status(500).send("Webhook handling error");
    }
  }
);

// Use JSON parser for other API endpoints (after webhook raw handler)
app.use(express.json());

// Embedded Payments: Create short-lived JWT for Deluxe Embedded SDK
app.post("/api/createEmbeddedJwt", async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const { amount, currency = "USD", orderId, customer, products, summary } = req.body || {};
    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "invalid-amount" });
      return;
    }
    // If an orderId is provided, verify it exists and use its total (to prevent tampering)
    let finalAmount = amount;
    if (orderId) {
      try {
        const snap = await db.collection("orders").doc(String(orderId)).get();
        if (snap.exists) {
          const orderData = snap.data() || {};
          if (typeof orderData.total === "number" && orderData.total > 0) {
            finalAmount = orderData.total;
          }
        } else {
          logger.warn("createEmbeddedJwt: orderId provided but not found", { orderId });
        }
      } catch (e: any) {
        logger.warn("createEmbeddedJwt: error fetching order", { orderId, error: e.message });
      }
    }
    // Build JWT payload with required fields
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + 10 * 60; // 10 minutes expiry
    const payload: Record<string, any> = {
      accessToken: DELUXE_ACCESS_TOKEN.value(),    // Merchant Access Token (PartnerToken GUID)
      amount: finalAmount, 
      currencyCode: currency,
      iat: nowSec,
      exp: expSec,
    };
    // Include optional customer and order details
    if (customer && typeof customer === "object") {
      // Ensure billingAddress country code is ISO alpha-3 (e.g., "USA")
      if (customer.billingAddress && customer.billingAddress.country) {
        const countryVal = String(customer.billingAddress.country).trim();
        if (countryVal.length === 2) {
          // Map common 2-letter codes to 3-letter codes
          if (countryVal.toUpperCase() === "US") {
            customer.billingAddress.country = "USA";
          } else if (countryVal.toUpperCase() === "CA") {
            customer.billingAddress.country = "CAN";
          } // (add other mappings if needed)
        }
        // Rename "country" field to "countryCode" if present
        customer.billingAddress.countryCode = customer.billingAddress.country;
        delete customer.billingAddress.country;
      }
      payload.customer = customer;
    }
    if (products) {
      payload.products = products;
    }
    // Translate summary options to flags (to avoid unsupported summary object in JWT)
    if (summary && typeof summary === "object") {
      if (summary.hide === true) {
        payload.hideproductspanel = true;
      }
      if (summary.hideTotals === true || summary.hideTotals === true) {
        payload.hidetotals = true;
      }
      // (Do not include the summary object itself in the JWT payload)
    }
    if (orderId) {
      payload.orderId = String(orderId);
    }
    // Sign the JWT using HS256 and the Deluxe embedded secret key
    const token = jwt.sign(payload, DELUXE_EMBEDDED_SECRET.value(), { algorithm: "HS256" });
    res.status(200).json({ jwt: token });
  } catch (err: any) {
    logger.error("createEmbeddedJwt error", err);
    res.status(500).json({ error: "jwt-failed", message: err?.message });
  }
});

// Hosted Payments: Create a Deluxe Hosted Payment Link (fallback option)
app.post("/api/createDeluxePayment", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, successUrl, cancelUrl } = req.body || {};
    if (!orderId) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }
    // Fetch order from Firestore
    const snap = await db.collection("orders").doc(String(orderId)).get();
    if (!snap.exists) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const order = snap.data() || {};
    // Construct body for payment link creation
    // Required fields
    const nameInfo = (() => {
      // Derive firstName, lastName from order data (customer or booking info)
      const cust = order.customer;
      if (cust?.firstName && cust?.lastName) {
        return { firstName: cust.firstName, lastName: cust.lastName };
      }
      const fullName: string = order.booking?.name || "";
      const parts = fullName.trim().split(/\s+/);
      return {
        firstName: parts[0] || "Guest",
        lastName: parts.slice(1).join(" ") || "Customer",
      };
    })();
    const amountInfo = {
      amount: Number(order.total || 0),
      currency: order.currency || "USD",
    };
    if (amountInfo.amount <= 0) {
      // If order total is not set or zero, fallback to provided amount (if any)
      amountInfo.amount = req.body.amount ? Number(req.body.amount) : 0;
      amountInfo.currency = req.body.currency || "USD";
    }
    // Build the request payload for Deluxe /paymentlinks
    const paymentLinkRequest: any = {
      amount: amountInfo,
      firstName: nameInfo.firstName,
      lastName: nameInfo.lastName,
      orderData: { orderId: String(orderId) },
      paymentLinkExpiry: "9 DAYS",
      acceptPaymentMethod: ["Card"],      // accepted payment methods (Card, ACH, etc.)
      deliveryMethod: "ReturnOnly",       // get the link in response (no email/SMS sent by Deluxe)
    };
    // If optional success/cancel URLs are provided, include them as customData
    if (successUrl || cancelUrl) {
      paymentLinkRequest.customData = [];
      if (successUrl) {
        paymentLinkRequest.customData.push({ name: "successUrl", value: successUrl });
      }
      if (cancelUrl) {
        paymentLinkRequest.customData.push({ name: "cancelUrl", value: cancelUrl });
      }
    }
    // Get OAuth bearer token for Deluxe API
    const bearerToken = await getGatewayBearer();
    // Call Deluxe API to create a payment link
    const url = `${gatewayBase()}/dpp/v1/gateway/paymentlinks`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        PartnerToken: DELUXE_ACCESS_TOKEN.value(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(paymentLinkRequest),
    });
    const respText = await resp.text();
    let respData: any = {};
    try {
      respData = respText ? JSON.parse(respText) : {};
    } catch {
      /* response might not be JSON (e.g., HTML error) */
    }
    if (!resp.ok) {
      logger.error("createDeluxePayment: Deluxe API error", { status: resp.status, body: respText });
      res.status(502).json({ error: "payment-link-failed", message: respText || resp.statusText });
      return;
    }
    const paymentUrl: string | undefined = respData.paymentUrl || respData.url;
    if (!paymentUrl) {
      logger.error("createDeluxePayment: No paymentUrl in response", { respData });
      res.status(500).json({ error: "no-payment-url", message: "No paymentUrl returned" });
      return;
    }
    // Optionally, store the paymentLinkId or URL in Firestore (omitted here)
    res.status(200).json({ paymentUrl });
  } catch (err: any) {
    logger.error("createDeluxePayment error", err);
    res.status(500).json({ error: "create-payment-failed", message: err?.message });
  }
});

// Embedded Payments: Get merchant wallet/method status (e.g., Apple/Google Pay enabled)
app.get("/api/getEmbeddedMerchantStatus", async (_req: Request, res: Response): Promise<void> => {
  try {
    // Create a short-lived JWT with only the accessToken (no amount needed)
    const nowSec = Math.floor(Date.now() / 1000);
    const statusPayload = {
      accessToken: DELUXE_ACCESS_TOKEN.value(),
      iat: nowSec,
      exp: nowSec + 5 * 60, // 5 minutes expiration
    };
    const statusToken = jwt.sign(statusPayload, DELUXE_EMBEDDED_SECRET.value(), { algorithm: "HS256" });
    // Call Deluxe Embedded merchantStatus endpoint
    const statusUrl = `${embeddedBase()}/embedded/merchantStatus`;
    const r = await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jwt: statusToken }),
    });
    const respText = await r.text();
    let jsonData: any = {};
    try {
      jsonData = respText ? JSON.parse(respText) : {};
    } catch {
      // If response isn't valid JSON, leave jsonData as {}
    }
    if (!r.ok) {
      logger.error("getEmbeddedMerchantStatus: Deluxe API error", { status: r.status, body: respText });
      // On failure, return false for primary wallet flags (suppressing error to client)
      res.json({
        applePayEnabled: false,
        googlePayEnabled: false,
        paypalEnabled: false,
        venmoEnabled: false,
        paypalPayLaterEnabled: false,
        pazeEnabled: false,
      });
      return;
    }
    // Return the merchant status flags (and any other info provided)
    res.status(200).json(jsonData);
  } catch (err: any) {
    logger.error("getEmbeddedMerchantStatus error", err);
    // On error, respond with all wallets disabled
    res.json({
      applePayEnabled: false,
      googlePayEnabled: false,
      paypalEnabled: false,
      venmoEnabled: false,
      paypalPayLaterEnabled: false,
      pazeEnabled: false,
    });
  }
});

// Export the Express app wrapped in a Firebase Cloud Function
export const api = onRequest(
  {
    secrets: [
      DELUXE_ACCESS_TOKEN,
      DELUXE_EMBEDDED_SECRET,
      DELUXE_SANDBOX_CLIENT_ID,
      DELUXE_SANDBOX_CLIENT_SECRET,
    ],
  },
  app
);
