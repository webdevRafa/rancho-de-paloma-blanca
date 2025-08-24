
// functions/src/embedded.patch.ts
// Drop-in examples showing how to add CORS to your Embedded Payments functions.
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import jwt from "jsonwebtoken";
import { corsify } from "../src/functions.cors.js";

const DELUXE_ACCESS_TOKEN = defineSecret("DELUXE_ACCESS_TOKEN");       // Partner/MID GUID
const DELUXE_EMBEDDED_SECRET = defineSecret("DELUXE_EMBEDDED_SECRET"); // HS256 secret key

export const createEmbeddedJwt = onRequest(
  { secrets: [DELUXE_ACCESS_TOKEN, DELUXE_EMBEDDED_SECRET] },
  async (req, res) => {
    if (corsify(req, res)) return;
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "method-not-allowed" });
        return;
      }
      const { amount, currency = "USD", customer, products, orderId } = (req.body || {}) as any;
      if (!amount || amount <= 0) {
        res.status(400).json({ error: "invalid-amount" });
        return;
      }
      const payload: any = {
        accessToken: DELUXE_ACCESS_TOKEN.value(),
        amount,
        currencyCode: currency,
        customer,
        products,
        orderId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 15 * 60,
      };
      const token = jwt.sign(payload, DELUXE_EMBEDDED_SECRET.value(), { algorithm: "HS256" });
      res.status(200).json({
        jwt: token,
        embeddedBase: "https://payments2.deluxe.com", // sandbox host
      });
    } catch (e: any) {
      res.status(500).json({ error: "jwt-failed", message: e?.message });
    }
  }
);

export const getEmbeddedMerchantStatus = onRequest(
  { secrets: [DELUXE_ACCESS_TOKEN, DELUXE_EMBEDDED_SECRET] },
  async (req, res) => {
    if (corsify(req, res)) return;
    try {
      const payload = {
        accessToken: DELUXE_ACCESS_TOKEN.value(),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      };
      const token = jwt.sign(payload, DELUXE_EMBEDDED_SECRET.value(), { algorithm: "HS256" });
      const r = await fetch("https://payments2.deluxe.com/embedded/merchantStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jwt: token }),
      });
      const json = await r.json().catch(() => null);
      res.status(r.status).json(json || { ok: r.ok });
    } catch (e: any) {
      res.status(500).json({ error: "merchant-status-failed", message: e?.message });
    }
  }
);
