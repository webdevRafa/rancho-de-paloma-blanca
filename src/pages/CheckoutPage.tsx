import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const CheckoutPage = () => {
  const {
    selectedDates,
    numberOfHunters,
    partyDeckDates,
    merchItems,
    booking,
  } = useCart();
  const { user } = useAuth();
  const { isHydrated } = useCart();

  if (!isHydrated) {
    return <div className="text-center text-white py-20">Loading cart...</div>;
  }

  const PARTY_DECK_COST = 500;
  const hasMerch = Object.keys(merchItems).length > 0;

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

  const fallbackDates = booking?.dates || selectedDates;
  const fallbackHunters = booking?.numberOfHunters || numberOfHunters;
  const fallbackDeckDays = booking?.partyDeckDates || partyDeckDates;

  const calculateMerchTotal = () =>
    Object.values(merchItems).reduce(
      (acc, item) => acc + item.product.price * item.quantity,
      0
    );

  const calculateBookingTotal = () => {
    if (!fallbackDates.length) return 0;
    const weekdayRate = 125;
    const baseWeekendRates = {
      singleDay: 200,
      twoConsecutiveDays: 350,
      threeDayCombo: 450,
    };
    const dateObjs = fallbackDates
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
      if ([5, 6, 0].includes(dow)) {
        perPersonTotal += baseWeekendRates.singleDay;
      } else {
        perPersonTotal += weekdayRate;
      }
      i++;
    }
    const partyDeckCost = fallbackDeckDays.length * PARTY_DECK_COST;
    return perPersonTotal * fallbackHunters + partyDeckCost;
  };

  const total = calculateBookingTotal() + calculateMerchTotal();

  const handleCompleteCheckout = async () => {
    if (!user) {
      alert("Please sign in with Google first.");
      return;
    }
    if (!booking && !hasMerch) {
      alert("You have nothing in your cart to checkout.");
      return;
    }
    try {
      const orderId = crypto.randomUUID();
      const orderRef = doc(db, "pendingOrders", orderId);
      await setDoc(orderRef, {
        userId: user.uid,
        booking,
        merchItems,
        total,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      const res = await fetch("/api/createDeluxePayment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!data.paymentUrl) throw new Error("Failed to get payment link");
      window.location.href = data.paymentUrl;
    } catch (err) {
      console.error(err);
      alert("Checkout failed: " + (err as any).message);
    }
  };

  return (
    <div className="max-w-3xl bg-[var(--color-card)] mx-auto mt-50 text-[var(--color-text)] py-10 px-6">
      <h1 className="text-3xl font-broadsheet mb-6 text-center text-[var(--color-accent-gold)]">
        Checkout
      </h1>

      {!booking && !hasMerch && (
        <p className="text-center text-sm text-red-400 mb-8">
          Your cart is empty. Add bookings or merch before checking out.
        </p>
      )}

      {(booking || fallbackDates.length > 0) && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">Booking Summary</h2>
          <p>Dates: {fallbackDates.map(formatFriendlyDate).join(", ")}</p>
          <p>Hunters: {fallbackHunters}</p>
          {fallbackDeckDays.length > 0 && (
            <p>
              Party Deck: {fallbackDeckDays.length} × ${PARTY_DECK_COST}
            </p>
          )}
          <p className="mt-2 font-semibold">
            Booking Subtotal: ${calculateBookingTotal()}
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
          <p className="mt-2 font-semibold">
            Merch Subtotal: ${calculateMerchTotal()}
          </p>
        </div>
      )}

      {(booking || hasMerch) && (
        <>
          <h2 className="text-2xl font-bold mt-4 text-center">
            Total Due: ${total}
          </h2>
          <button
            onClick={handleCompleteCheckout}
            className="block w-full mt-6 max-w-[300px] mx-auto text-sm bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] font-light text-white py-3 px-6 rounded-md"
          >
            Complete Checkout
          </button>
        </>
      )}
    </div>
  );
};

export default CheckoutPage;
