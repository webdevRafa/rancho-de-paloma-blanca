// functions/index.ts — Firebase v2 Deluxe API Integration (REVISED)

import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// POST /createDeluxePayment
app.post("/createDeluxePayment", async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) return res.status(400).json({ error: "Missing orderId" });

  try {
    const pendingRef = db.collection("pendingOrders").doc(orderId);
    const pendingSnap = await pendingRef.get();

    if (!pendingSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Simulated payment link (replace this with a real Deluxe API call later)
    const paymentUrl = `https://deluxe-payments.com/checkout?orderId=${orderId}`;

    return res.status(200).json({ paymentUrl });
  } catch (err) {
    console.error("Payment creation failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// POST /webhook — Deluxe webhook hits this after payment
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;
    const { orderId, status } = event.metadata || {};

    if (!orderId || !status) return res.status(400).send("Invalid webhook payload");

    const orderRef = db.collection("pendingOrders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return res.status(404).send("Order not found");

    const order = orderSnap.data();

    if (!order) return res.status(400).send("Invalid order payload");

    if (status === "success") {
      // ✅ Create booking if present
      if (order.booking) {
        const bookingRef = db.collection("bookings").doc();
        await bookingRef.set({
          ...order.booking,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "paid",
        });
      }

      // ✅ Create merch order if present
      if (order.merchItems) {
        const merchRef = db.collection("merchOrders").doc();
        await merchRef.set({
          userId: order.userId,
          items: order.merchItems,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // ✅ Mark order as paid
      await orderRef.update({ status: "paid" });
    } else if (status === "failed") {
      await orderRef.update({ status: "cancelled" });
    }

    return res.status(200).send("Webhook processed");
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("Internal error");
  }
});

exports.api = functions.https.onRequest(app);