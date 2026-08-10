import { ArrowRight, Mail, ReceiptText, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Order } from "../types/Types";
import "./ClientDashboard.css";

const previewOrder: Order = {
  id: "RPB-DEMO-2026-1048",
  userId: "payment-success-preview",
  status: "paid",
  total: 1160,
  currency: "USD",
  customer: {
    firstName: "Mateo",
    lastName: "Garza",
    email: "mateo.garza@example.com",
    phone: "956-555-0142",
  },
  booking: {
    userId: "payment-success-preview",
    name: "Mateo Garza",
    email: "mateo.garza@example.com",
    phone: "956-555-0142",
    dates: ["2026-10-02", "2026-10-03"],
    numberOfHunters: 3,
    partyDeckDates: ["2026-10-03"],
    backTheBlueAccepted: true,
    price: 1100,
    status: "paid",
    attendees: [
      { fullName: "Mateo Garza", waiverSigned: true },
      { fullName: "Sofia Garza", waiverSigned: true },
      { fullName: "Daniel Ruiz", waiverSigned: false },
    ],
  },
  merchItems: {
    "preview-rancho-cap": {
      product: {
        id: "preview-rancho-cap",
        name: "Rancho Cap",
        price: 30,
        size: "OS",
      },
      quantity: 2,
    },
  },
};

function formatMoney(value: unknown): string {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function formatFriendlyDate(value?: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "Unknown date";
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";

  return `${date.toLocaleString("en-US", {
    weekday: "long",
  })}, ${date.toLocaleString("en-US", { month: "long" })} ${day}${suffix}, ${year}`;
}

function formatDateRange(dates?: string[]): string {
  if (!dates?.length) return "No hunt dates";
  const sorted = [...dates].sort();
  if (sorted.length === 1) return formatFriendlyDate(sorted[0]);
  return `${formatFriendlyDate(sorted[0])} – ${formatFriendlyDate(sorted.at(-1))}`;
}

function PaymentSuccessPreview() {
  const navigate = useNavigate();
  const order = previewOrder;
  const customerName = `${order.customer?.firstName ?? ""} ${
    order.customer?.lastName ?? ""
  }`.trim();
  const merchandise = Object.entries(order.merchItems ?? {}).map(
    ([id, item]) => ({
      id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price,
    })
  );

  return (
    <div className="client-dashboard">
      <section className="client-dashboard__shell">
        <header className="client-dashboard-hero">
          <div className="client-dashboard-hero__copy">
            <span className="client-dashboard-kicker">
              <ReceiptText aria-hidden="true" size={15} /> Client dashboard
            </span>
            <h1>Your bookings</h1>
            <p>Review your hunt dates, payment status, and order details.</p>
            <button
              type="button"
              className="client-dashboard-book-button"
              onClick={() => navigate("/book")}
            >
              Book another hunt <ArrowRight aria-hidden="true" size={17} />
            </button>
          </div>

          <aside className="client-account-card" aria-label="Signed in account">
            <div className="client-account-card__label">
              <ShieldCheck aria-hidden="true" size={15} /> Signed in as
            </div>
            <div className="client-account-card__identity">
              <div className="client-account-card__avatar" aria-hidden="true">
                MG
              </div>
              <div className="client-account-card__text">
                <strong>Mateo Garza</strong>
                <span>
                  <Mail aria-hidden="true" size={14} />
                  mateo.garza@example.com
                </span>
              </div>
            </div>
          </aside>
        </header>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-black/10 bg-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.10)]">
            <div className="border-b border-black/5 bg-white/70 px-5 py-4 md:px-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                Payment Confirmed
              </p>
              <h2 className="mt-1 text-2xl font-acumin text-[var(--color-footer)] md:text-3xl">
                Your booking has been secured
              </h2>
              <p className="mt-1 text-sm text-[var(--color-footer)]/70">
                Thank you for your payment. Your reservation is now confirmed
                and has been added to your dashboard.
              </p>
            </div>

            <div className="space-y-5 px-5 py-5 md:px-6 md:py-6">
              <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-[0_10px_30px_rgba(16,185,129,0.08)]">
                <div className="border-b border-emerald-200/70 bg-emerald-100/60 px-5 py-4 md:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-300 bg-white text-xl text-emerald-600 shadow-sm">
                      ✓
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900/60">
                        Reservation Status
                      </p>
                      <h3 className="mt-1 text-lg font-acumin text-emerald-950">
                        Payment received successfully
                      </h3>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-5 md:px-6">
                  <p className="text-sm leading-7 text-emerald-900">
                    Your order has been recorded and your dates are now
                    reserved. Please keep this confirmation for your records.
                  </p>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                    Order Overview
                  </p>
                  <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                    Confirmation details
                  </h3>
                </div>
                <div className="px-5 py-5 md:px-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                        Order Number
                      </p>
                      <p className="mt-2 break-all text-sm font-semibold text-[var(--color-footer)]">
                        #{order.id}
                      </p>
                    </div>
                    <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                        Total Paid
                      </p>
                      <p className="mt-2 text-2xl font-bold text-[var(--color-footer)]">
                        ${formatMoney(order.total)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                        Status
                      </p>
                      <p className="mt-2 text-base font-semibold text-emerald-700">
                        Paid
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                    Booking Overview
                  </p>
                  <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                    Your hunt details
                  </h3>
                </div>
                <div className="px-5 py-5 md:px-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                        Hunters
                      </p>
                      <p className="mt-2 text-2xl font-bold text-[var(--color-footer)]">
                        {order.booking?.numberOfHunters}
                      </p>
                    </div>
                    <div className="rounded-xl border border-black/5 bg-neutral-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/55">
                        Selected Dates
                      </p>
                      <p className="mt-2 text-base font-semibold text-[var(--color-footer)]">
                        {formatDateRange(order.booking?.dates)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-black/5 bg-neutral-50 p-3">
                    <div className="details-scroll max-h-36 overflow-y-auto pr-1">
                      <div className="flex flex-wrap gap-2">
                        {order.booking?.dates.map((date) => (
                          <span
                            key={date}
                            className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-[var(--color-footer)] shadow-sm"
                          >
                            {formatFriendlyDate(date)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/10 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-footer)]/60">
                      Party Deck
                    </p>
                    <div className="details-scroll mt-2 max-h-36 overflow-y-auto pr-1">
                      <div className="flex flex-wrap gap-2">
                        {order.booking?.partyDeckDates.map((date) => (
                          <span
                            key={date}
                            className="inline-flex items-center rounded-full border border-[var(--color-accent-gold)]/20 bg-white px-3 py-1 text-xs font-medium text-[var(--color-footer)] shadow-sm"
                          >
                            {formatFriendlyDate(date)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
                <div className="border-b border-blue-200/70 bg-blue-100/50 px-5 py-4 md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-900/60">
                    Back the Blue
                  </p>
                  <h3 className="mt-1 text-lg font-acumin text-blue-950">
                    Special event booking confirmed
                  </h3>
                </div>
                <div className="px-5 py-5 md:px-6">
                  <p className="text-sm leading-7 text-blue-900">
                    Your order includes the October 3rd, 2026 Back the Blue
                    event. Proof will still be required at check-in for this
                    booking.
                  </p>
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                  <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                      Customer Details
                    </p>
                    <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                      Contact information
                    </h3>
                  </div>
                  <div className="space-y-3 px-5 py-5 text-sm text-[var(--color-footer)] md:px-6">
                    <div className="flex items-start justify-between gap-4 border-b border-black/5 pb-3">
                      <span className="text-[var(--color-footer)]/65">Name</span>
                      <span className="text-right font-semibold">
                        {customerName}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-black/5 pb-3">
                      <span className="text-[var(--color-footer)]/65">Email</span>
                      <span className="break-all text-right font-semibold">
                        {order.customer?.email}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[var(--color-footer)]/65">Phone</span>
                      <span className="text-right font-semibold">
                        {order.customer?.phone}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
                  <div className="border-b border-black/5 bg-neutral-50 px-5 py-4 md:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/60">
                      Merchandise
                    </p>
                    <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                      Items included
                    </h3>
                  </div>
                  <div className="px-5 py-5 md:px-6">
                    <div className="space-y-3">
                      {merchandise.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-4 rounded-xl border border-black/10 bg-neutral-50 px-4 py-4"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-footer)]">
                              {item.name}
                            </p>
                            <p className="mt-1 text-xs text-[var(--color-footer)]/60">
                              Quantity: {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-[var(--color-footer)]">
                            ${formatMoney(item.price * item.quantity)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              <section className="overflow-hidden rounded-2xl border border-[var(--color-accent-gold)]/30 bg-[var(--color-accent-gold)]/10 shadow-[0_12px_35px_rgba(0,0,0,0.06)]">
                <div className="border-b border-[var(--color-footer)]/10 px-5 py-4 md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-footer)]/65">
                    Next Steps
                  </p>
                  <h3 className="mt-1 text-xl font-acumin text-[var(--color-footer)]">
                    What happens next
                  </h3>
                </div>
                <div className="space-y-3 px-5 py-5 text-sm text-[var(--color-footer)] md:px-6">
                  <p>
                    Your reservation has been saved to your dashboard and can
                    be reviewed anytime.
                  </p>
                  <p>
                    Please arrive prepared for your booked dates and keep your
                    order number available if you need support.
                  </p>
                  <p className="text-[var(--color-footer)]/70">
                    If your booking includes a special event or party deck
                    reservation, those details are reflected above.
                  </p>
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="order-2 inline-flex items-center justify-center rounded-md border border-[var(--color-footer)]/15 bg-white px-6 py-3 text-sm font-semibold text-[var(--color-footer)] transition hover:bg-neutral-50 sm:order-1"
                >
                  View My Orders
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/book")}
                  className="order-1 inline-flex items-center justify-center rounded-md border border-[var(--color-footer)] bg-[var(--color-footer)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-button-hover)] sm:order-2"
                >
                  Book Another Hunt
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export default PaymentSuccessPreview;
