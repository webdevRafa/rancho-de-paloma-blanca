// functions/index.ts — Deluxe payments integration (Firebase v2 + Express)

import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { onRequest } from "firebase-functions/v2/https";

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
// NOTE: DO NOT add app.use(express.json()) globally.
// We need RAW body on the webhook route for signature verification.

// -----------------------------------------------------------------------------
// POST /api/createDeluxePayment
// Reads orders/{orderId}, recomputes total server-side, creates a Deluxe
// Hosted Payment session, returns paymentUrl (stubbed until keys arrive).
// Attach JSON parser ONLY here to avoid breaking the webhook raw body.
// -----------------------------------------------------------------------------
app.post("/api/createDeluxePayment", express.json(), async (req, res) => {
  try {
    const { orderId } = req.body as { orderId?: string };
    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Order not found" });

    const order = snap.data() as any;

    // IMPORTANT: never trust client totals — recompute here.
    const serverTotal = recomputeTotal(order);
    if (!Number.isFinite(serverTotal) || serverTotal <= 0) {
      return res.status(400).json({ error: "Invalid total" });
    }

    // TODO: Replace this stub with the real Deluxe API call once you have keys.
    // Example:
    // const token = await getDeluxeToken();
    // const resp = await fetch(process.env.DELUXE_HPF_CREATE_URL!, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${token}`,
    //   },
    //   body: JSON.stringify({
    //     merchantId: process.env.DELUXE_CLIENT_ID,
    //     amount: serverTotal,
    //     currency: "USD",
    //     reference: orderId, // CRITICAL for webhook correlation
    //     successUrl: "https://YOUR_DOMAIN/dashboard?paid=1",
    //     cancelUrl: "https://YOUR_DOMAIN/dashboard?cancelled=1",
    //     // optional: lineItems
    //   }),
    // });
    // const data = await resp.json();
    // if (!resp.ok || !data?.paymentUrl) throw new Error("Deluxe error");
    // const paymentUrl = data.paymentUrl;

    const paymentUrl = `https://sandbox.deluxe.example/checkout?ref=${encodeURIComponent(
      orderId
    )}&amt=${serverTotal}`;

    // Persist last computed server total (and normalize total) for audits
    await orderRef.set({ serverTotal, total: serverTotal }, { merge: true });

    return res.status(200).json({ paymentUrl });
  } catch (e: any) {
    console.error("createDeluxePayment error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// -----------------------------------------------------------------------------
// POST /api/deluxeWebhook
// Deluxe will POST here. We verify signature (stub), ensure idempotency,
// set orders/{orderId} -> paid, and apply availability/party-deck updates
// inside a Firestore transaction. Also writes bookings/{orderId} snapshot.
// IMPORTANT: Webhook must use RAW body for signature verification.
// -----------------------------------------------------------------------------
app.post(
  "/api/deluxeWebhook",
  bodyParser.raw({ type: "*/*" }),
  async (req, res) => {
    try {
      // 1) Verify signature against RAW bytes (implement when keys arrive)
      const signature = req.get("X-Deluxe-Signature"); // confirm exact header name with Deluxe
      const raw = req.body as Buffer;

      if (
        !verifyDeluxeSignature(
          signature,
          raw,
          process.env.DELUXE_WEBHOOK_SECRET || ""
        )
      ) {
        return res.status(400).send("Invalid signature");
      }

      // 2) Parse event
      const event = JSON.parse(raw.toString("utf8"));
      const eventId: string | undefined = event?.id;
      const type: string | undefined = event?.type;

      // You must pass orderId as "reference" when creating the HPF session
      const orderId: string | undefined = event?.data?.reference;
      const paymentId: string | undefined = event?.data?.paymentId;

      if (!eventId || !orderId) return res.status(200).send("No-op");

      const orderRef = db.collection("orders").doc(orderId);
      const evtRef = orderRef.collection("paymentEvents").doc(eventId);

      // 3) Idempotency: if we've processed this event, bail
      if ((await evtRef.get()).exists) return res.status(200).send("OK");

      await evtRef.set({
        type,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        payload: event,
      });

      // 4) Handle success (adjust 'type' to Deluxe's actual event name)
      if (type === "payment.succeeded") {
        await db.runTransaction(async (tx) => {
          const { maxHuntersPerDay: cap } = await getActiveSeasonConfig();

          
          const oSnap = await tx.get(orderRef);
          if (!oSnap.exists) return;

          const o = oSnap.data() as any;

          // Skip if already paid (defensive)
          if (o.status === "paid") return;

          // 4a) Mark order paid
          tx.update(orderRef, {
            status: "paid",
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentId: paymentId ?? null,
          });

          // 4b) Apply booking effects (capacity + party deck) atomically
          if (o?.booking?.dates?.length) {
            const numHunters = safeInt(o?.booking?.numberOfHunters, 1);

            // Hunters capacity per day
            for (const iso of o.booking.dates as string[]) {
              const dayRef = db.collection("availability").doc(iso);
              const daySnap = await tx.get(dayRef);
              const curr = daySnap.exists
                ? (daySnap.data() as any)
                : { id: iso, huntersBooked: 0, partyDeckBooked: false };

              const next = safeInt(curr.huntersBooked, 0) + numHunters;
              if (next > cap) {
                throw new Error(`Capacity exceeded for ${iso} (${next}/${cap})`);
              }

              tx.set(
                dayRef,
                {
                  ...curr,
                  id: iso,
                  huntersBooked: next,
                  timestamp: isoToMidnightUTC(iso), // ensure future queries by timestamp work
                },
                { merge: true }
              );
            }

            // Party deck (unique per day)
            for (const iso of (o.booking.partyDeckDates ?? []) as string[]) {
              const dayRef = db.collection("availability").doc(iso);
              const daySnap = await tx.get(dayRef);
              const curr = daySnap.exists
                ? (daySnap.data() as any)
                : { id: iso, huntersBooked: 0, partyDeckBooked: false };

              if (curr.partyDeckBooked) {
                throw new Error(`Party deck already booked for ${iso}`);
              }

              tx.set(
                dayRef,
                {
                  ...curr,
                  id: iso,
                  partyDeckBooked: true,
                  timestamp: isoToMidnightUTC(iso), // keep it in sync
                },
                { merge: true }
              );
            }

            // 4c) Optional: write canonical bookings snapshot for ops/reporting
            tx.set(
              db.collection("bookings").doc(orderId),
              {
                ...o.booking,
                orderId,
                status: "paid",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        });
      }

      return res.status(200).send("OK");
    } catch (e: any) {
      console.error("deluxeWebhook error:", e);
      // If it's a transient error, you can return 500 to request retries.
      // If it's a logic error (e.g., capacity exceeded), 200 prevents floods.
      return res.status(200).send("OK");
    }
  }
);

// Export a single HTTPS endpoint for the Express app
export const api = onRequest({ region: "us-central1" }, app);

// -----------------------------------------------------------------------------
// Helpers (fill in when you have Deluxe keys / finalize pricing logic)
// -----------------------------------------------------------------------------

/**
 * Recompute the true server-side total from the Order snapshot.
 * Mirror your CheckoutPage pricing EXACTLY: booking bundles, off-season vs
 * seasonal, party deck surcharge, plus merch subtotal (qty * price snapshot).
 */
function recomputeTotal(order: any): number {
  let total = 0;

  if (order?.booking?.price) {
    total += safeMoney(order.booking.price);
  }

  // merchItems: { [productId]: { product: { name, price }, quantity } }
  if (order?.merchItems && typeof order.merchItems === "object") {
    for (const pid of Object.keys(order.merchItems)) {
      const item = order.merchItems[pid];
      const price = safeMoney(item?.product?.price);
      const qty = safeInt(item?.quantity, 0);
      total += price * qty;
    }
  }

  // Fallback to stored total if needed (keeps flow unblocked)
  if ((!Number.isFinite(total) || total <= 0) && Number(order?.total) > 0) {
    total = safeMoney(order.total);
  }

  return Math.round(total); // keep consistent (dollars vs cents) with Deluxe
}

/** Verify Deluxe webhook signature (HMAC or RSA — implement per docs). */
function verifyDeluxeSignature(
  signature: string | undefined,
  raw: Buffer,
  secret: string
): boolean {
  // TODO: Implement when Deluxe provides the exact scheme:
  // - If HMAC (shared secret): compute HMAC(raw) and compare with signature.
  // - If RSA/ECDSA: verify with their public key.
  // Return true now so you can test plumbing end-to-end.
  return true;
}

// If Deluxe uses OAuth2 client credentials, implement this.
// async function getDeluxeToken(): Promise<string> {
//   // TODO: call Deluxe auth endpoint with DELUXE_CLIENT_ID/SECRET
//   return "stub";
// }

// Convert YYYY-MM-DD to a midnight UTC Firestore Timestamp
function isoToMidnightUTC(iso: string): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(new Date(`${iso}T00:00:00Z`));
}

// Safe number helpers
function safeMoney(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeInt(v: any, fallback = 0): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}


async function getActiveSeasonConfig(): Promise<{ maxHuntersPerDay: number }> {
  const snap = await db.collection("seasonConfig").doc("active").get();
  const data = snap.exists ? (snap.data() as any) : null;
  const maxHuntersPerDay =
    Number(data?.maxHuntersPerDay) && data.maxHuntersPerDay > 0
      ? Number(data.maxHuntersPerDay)
      : 75;
  return { maxHuntersPerDay };
}