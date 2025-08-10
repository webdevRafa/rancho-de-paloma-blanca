import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const CheckoutPage = () => {
  const { merchItems, booking, resetCart, isHydrated } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasTriedSubmitting, setHasTriedSubmitting] = useState(false);

  const ORDER_ID_KEY = "rdp_order_id";
  const [orderId] = useState<string>(() => {
    return localStorage.getItem(ORDER_ID_KEY) || crypto.randomUUID();
  });

  useEffect(() => {
    localStorage.setItem(ORDER_ID_KEY, orderId);
  }, [orderId]);

  if (!isHydrated) {
    return <div className="text-center text-white py-20">Loading cart...</div>;
  }

  const PARTY_DECK_COST = 500;
  const hasMerch = Object.keys(merchItems).length > 0;
  const hasBooking = !!booking && booking.dates?.length > 0;

  const formatFriendlyDate = (iso: string): string => {
    const [yyyy, mm, dd] = iso.split("-");
    const year = Number(yyyy);
    const monthIndex = Number(mm) - 1;
    const day = Number(dd);
    const dateObj = new Date(year, monthIndex, day);
    const weekday = dateObj.toLocaleString("en-US", { weekday: "long" });
    const month = dateObj.toLocaleString("en-US", { month: "long" });
    const j = day % 10;
    const k = day % 100;
    let suffix = "th";
    if (j === 1 && k !== 11) suffix = "st";
    else if (j === 2 && k !== 12) suffix = "nd";
    else if (j === 3 && k !== 13) suffix = "rd";
    return `${weekday}, ${month} ${day}${suffix}, ${year}`;
  };

  const calculateMerchTotal = () =>
    Object.values(merchItems).reduce(
      (acc, item) => acc + item.product.price * item.quantity,
      0
    );

  const calculateBookingTotal = () => {
    if (!hasBooking) return 0;
    const dates = booking!.dates;
    const hunters = booking!.numberOfHunters || 0;
    const deckDays = booking!.partyDeckDates || [];

    const weekdayRate = 125;
    const baseWeekendRates = {
      singleDay: 200,
      twoConsecutiveDays: 350,
      threeDayCombo: 450,
    };

    const dateObjs = dates
      .map((d) => {
        const [y, m, d2] = d.split("-").map(Number);
        return new Date(y, m - 1, d2);
      })
      .sort((a, b) => a.getTime() - b.getTime());

    let perPersonTotal = 0;
    let i = 0;
    while (i < dateObjs.length) {
      const current = dateObjs[i];
      const dow = current.getDay();

      // Fri-Sat-Sun 3-day combo
      if (dow === 5 && i + 2 < dateObjs.length) {
        const d1 = dateObjs[i + 1];
        const d2 = dateObjs[i + 2];
        const diff1 = (d1.getTime() - current.getTime()) / 86400000;
        const diff2 = (d2.getTime() - d1.getTime()) / 86400000;
        if (
          diff1 === 1 &&
          diff2 === 1 &&
          d1.getDay() === 6 &&
          d2.getDay() === 0
        ) {
          perPersonTotal += baseWeekendRates.threeDayCombo;
          i += 3;
          continue;
        }
      }

      // Fri+Sat or Sat+Sun 2-day combo
      if (
        i + 1 < dateObjs.length &&
        ((dow === 5 && dateObjs[i + 1].getDay() === 6) ||
          (dow === 6 && dateObjs[i + 1].getDay() === 0))
      ) {
        const next = dateObjs[i + 1];
        const diff = (next.getTime() - current.getTime()) / 86400000;
        if (diff === 1) {
          perPersonTotal += baseWeekendRates.twoConsecutiveDays;
          i += 2;
          continue;
        }
      }

      // Single weekend day vs weekday
      if ([5, 6, 0].includes(dow)) perPersonTotal += baseWeekendRates.singleDay;
      else perPersonTotal += weekdayRate;

      i++;
    }

    const partyDeckCost = deckDays.length * PARTY_DECK_COST;
    return perPersonTotal * hunters + partyDeckCost;
  };

  const bookingSubtotal = calculateBookingTotal();
  const merchSubtotal = calculateMerchTotal();
  const total = bookingSubtotal + merchSubtotal;

  const handleCompleteCheckout = async () => {
    if (isSubmitting || hasTriedSubmitting) return;

    setIsSubmitting(true);
    setHasTriedSubmitting(true);
    setErrorMsg("");

    try {
      if (!user) throw new Error("Please sign in with Google first.");
      if (!hasBooking && !hasMerch) throw new Error("Your cart is empty.");

      const orderRef = doc(db, "orders", orderId);
      const existing = await getDoc(orderRef);
      if (existing.exists()) {
        navigate("/dashboard?status=pending");
        return;
      }

      await setDoc(orderRef, {
        userId: user.uid,
        ...(hasBooking ? { booking } : {}),
        ...(hasMerch ? { merchItems } : {}),
        total,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      const res = await fetch("/api/createDeluxePayment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid JSON response from payment API.");
      }

      if (!res.ok) throw new Error(data?.error || "Deluxe API failed");
      if (!data.paymentUrl) throw new Error("Missing payment URL");

      // Clear cart & redirect
      localStorage.removeItem(ORDER_ID_KEY);
      resetCart();
      window.location.href = data.paymentUrl;
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Checkout failed.");
      navigate("/dashboard?error=checkout-failed");
    }
  };

  const huntLabel =
    hasBooking && booking!.dates.length > 1
      ? "Selected Hunts"
      : "Selected Hunt";

  return (
    <div className="max-w-3xl bg-neutral-200 border-4 border-white mx-auto mt-50 text-[var(--color-background)] py-10 px-6">
      <h1 className="text-2xl font-acumin mb-6 text-center text-[var(--color-background)]">
        Order Summary
      </h1>

      {!hasBooking && !hasMerch && (
        <p className="text-center text-sm text-red-400 mb-8">
          Your cart is empty. Add bookings or merch before checking out.
        </p>
      )}

      {hasBooking && (
        <div className="mb-8">
          <h2 className="text-xl mb-2 font-acumin">{huntLabel}</h2>
          <p>Dates: {booking!.dates.map(formatFriendlyDate).join(", ")}</p>
          <p>Hunters: {booking!.numberOfHunters}</p>
          {!!booking!.partyDeckDates?.length && (
            <p>
              Party Deck: {booking!.partyDeckDates.length} × ${PARTY_DECK_COST}
            </p>
          )}
          <p className="mt-2 font-semibold">
            Booking Subtotal: ${bookingSubtotal}
          </p>
        </div>
      )}

      {hasMerch && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">Merchandise</h2>
          <ul className="list-disc ml-5 space-y-1">
            {Object.entries(merchItems).map(([id, item]) => (
              <li key={id}>
                {item.product.name} — {item.quantity} × ${item.product.price} =
                ${item.product.price * item.quantity}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-semibold">Merch Subtotal: ${merchSubtotal}</p>
        </div>
      )}

      {(hasBooking || hasMerch) && (
        <>
          <h2 className="text-2xl font-bold mt-4 text-center">
            Total Due: ${total}
          </h2>
          {errorMsg && (
            <p className="text-sm text-red-400 text-center mt-4">{errorMsg}</p>
          )}

          <button
            onClick={handleCompleteCheckout}
            disabled={isSubmitting || hasTriedSubmitting}
            className={`block w-full mt-6 max-w-[300px] mx-auto text-sm text-white py-3 px-6 rounded-md transition-all duration-200 ${
              isSubmitting || hasTriedSubmitting
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-[var(--color-button)] hover:bg-[var(--color-button-hover)]"
            }`}
          >
            {isSubmitting ? "Processing..." : "Complete Checkout"}
          </button>
        </>
      )}
    </div>
  );
};

export default CheckoutPage;
