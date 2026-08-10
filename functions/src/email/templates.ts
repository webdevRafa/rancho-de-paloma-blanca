// functions/src/email/templates.ts

export type EmailAttendee = {
  fullName?: string;
  email?: string;
  waiverSigned?: boolean;
};

export type EmailMerchItem = {
  skuCode?: string;
  name?: string;
  price?: number;
  quantity?: number;
};

export type OrderEmailDetails = {
  orderId: string;
  total: number;
  currency?: string;
  createdAt?: string;
  dashboardUrl: string;
  adminUrl?: string;
  customer?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string;
    billingAddress?: {
      address?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      postalCode?: string;
      countryCode?: string;
      country?: string;
    };
  };
  booking?: {
    dates?: string[];
    numberOfHunters?: number;
    partyDeckDates?: string[];
    partyDeckRatePerDay?: number;
    attendees?: EmailAttendee[];
  };
  merchItems?: EmailMerchItem[] | Record<string, EmailMerchItem>;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

const RANCH_NAME = "Rancho de Paloma Blanca";
const CONTACT_NAME = "Justin S.";
const CONTACT_PHONE = "956-466-9614";
const CONTACT_EMAIL = "info@ranchodepalomablanca.com";
const BACK_THE_BLUE_DATE = "2026-10-03";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown, currency = "USD"): string {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function friendlyDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function friendlyDateTime(value?: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });
}

function customerName(details: OrderEmailDetails): string {
  const first = details.customer?.firstName?.trim() || "";
  const last = details.customer?.lastName?.trim() || "";
  return `${first} ${last}`.trim() || details.customer?.name?.trim() || "Guest";
}

function firstName(details: OrderEmailDetails): string {
  return (
    details.customer?.firstName?.trim() ||
    customerName(details).split(/\s+/)[0] ||
    "there"
  );
}

function normalizeMerch(
  merchItems: OrderEmailDetails["merchItems"]
): EmailMerchItem[] {
  if (!merchItems) return [];
  return Array.isArray(merchItems)
    ? merchItems
    : Object.values(merchItems);
}

function billingAddress(details: OrderEmailDetails): string {
  const address = details.customer?.billingAddress;
  if (!address) return "Not provided";

  const street = [address.address || address.line1, address.line2]
    .filter(Boolean)
    .join(", ");
  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  const postal = address.zipCode || address.postalCode;
  const country = address.countryCode || address.country;
  return [street, cityState, postal, country].filter(Boolean).join(" ") || "Not provided";
}

function orderSummary(details: OrderEmailDetails) {
  const dates = [...(details.booking?.dates ?? [])].filter(Boolean).sort();
  const partyDeckDates = [...(details.booking?.partyDeckDates ?? [])]
    .filter(Boolean)
    .sort();
  const attendees = (details.booking?.attendees ?? []).filter(
    (attendee) => attendee.fullName?.trim() || attendee.email?.trim()
  );
  const merch = normalizeMerch(details.merchItems);
  const merchSubtotal = merch.reduce(
    (total, item) =>
      total + Number(item.price || 0) * Math.max(0, Number(item.quantity || 0)),
    0
  );
  const partyDeckRate = Number(details.booking?.partyDeckRatePerDay || 500);
  const partyDeckSubtotal = partyDeckDates.length * partyDeckRate;
  const huntSubtotal = Math.max(
    0,
    Number(details.total || 0) - merchSubtotal - partyDeckSubtotal
  );

  return {
    dates,
    partyDeckDates,
    attendees,
    merch,
    merchSubtotal,
    partyDeckRate,
    partyDeckSubtotal,
    huntSubtotal,
    hunters: Math.max(0, Number(details.booking?.numberOfHunters || 0)),
    includesBackTheBlue: dates.includes(BACK_THE_BLUE_DATE),
  };
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e9e0d3;color:#74685d;font-size:13px;vertical-align:top;width:38%">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e9e0d3;color:#20140d;font-size:13px;font-weight:600;text-align:right;vertical-align:top">${escapeHtml(value)}</td>
    </tr>`;
}

function priceRow(label: string, value: string, note?: string): string {
  return `
    <tr>
      <td style="padding:9px 0;color:#302219;font-size:13px;vertical-align:top">
        ${escapeHtml(label)}
        ${note ? `<div style="margin-top:2px;color:#897c70;font-size:11px">${escapeHtml(note)}</div>` : ""}
      </td>
      <td style="padding:9px 0;color:#302219;font-size:13px;font-weight:600;text-align:right;vertical-align:top;white-space:nowrap">${escapeHtml(value)}</td>
    </tr>`;
}

function attendeeHtml(details: OrderEmailDetails): string {
  const { attendees } = orderSummary(details);
  if (!attendees.length) {
    return `<p style="margin:8px 0 0;color:#74685d;font-size:13px">No attendee names were saved with this order.</p>`;
  }

  return attendees
    .map(
      (attendee, index) => `
        <div style="padding:10px 0;${index ? "border-top:1px solid #e9e0d3;" : ""}">
          <div style="color:#24170f;font-size:13px;font-weight:600">${escapeHtml(
            attendee.fullName || `Attendee ${index + 1}`
          )}</div>
          ${
            attendee.email
              ? `<div style="margin-top:2px;color:#817468;font-size:12px">${escapeHtml(attendee.email)}</div>`
              : ""
          }
        </div>`
    )
    .join("");
}

function orderDetailsHtml(details: OrderEmailDetails, partyDeckConfirmed: boolean): string {
  const summary = orderSummary(details);
  const dateText = summary.dates.length
    ? summary.dates.map(friendlyDate).join("<br>")
    : "No hunt dates";
  const partyDeckText = summary.partyDeckDates.length
    ? `${partyDeckConfirmed ? "Confirmed" : "Requested"} for ${summary.partyDeckDates
        .map(friendlyDate)
        .join(", ")}`
    : "Not included";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
      ${detailRow("Order reference", details.orderId)}
      ${detailRow("Order placed", friendlyDateTime(details.createdAt))}
      ${detailRow("Hunt date(s)", dateText.replaceAll("<br>", " · "))}
      ${detailRow(
        "Hunters",
        `${summary.hunters} hunter${summary.hunters === 1 ? "" : "s"}`
      )}
      ${detailRow("Party Deck", partyDeckText)}
    </table>`;
}

function customerDetailsHtml(details: OrderEmailDetails): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
      ${detailRow("Booked by", customerName(details))}
      ${detailRow("Email", details.customer?.email || "Not provided")}
      ${detailRow("Phone", details.customer?.phone || "Not provided")}
    </table>`;
}

function priceBreakdownHtml(details: OrderEmailDetails): string {
  const summary = orderSummary(details);
  const currency = details.currency || "USD";
  const rows: string[] = [];

  if (details.booking) {
    rows.push(
      priceRow(
        "Dove hunt reservation",
        money(summary.huntSubtotal, currency),
        `${summary.hunters} hunter${summary.hunters === 1 ? "" : "s"} · ${summary.dates.length} hunt day${summary.dates.length === 1 ? "" : "s"}`
      )
    );
  }

  if (summary.partyDeckDates.length) {
    rows.push(
      priceRow(
        "Party Deck",
        money(summary.partyDeckSubtotal, currency),
        `${summary.partyDeckDates.length} day${summary.partyDeckDates.length === 1 ? "" : "s"} × ${money(summary.partyDeckRate, currency)}`
      )
    );
  }

  for (const item of summary.merch) {
    const quantity = Math.max(0, Number(item.quantity || 0));
    rows.push(
      priceRow(
        item.name || item.skuCode || "Merchandise",
        money(Number(item.price || 0) * quantity, currency),
        `Quantity ${quantity}`
      )
    );
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
      ${rows.join("")}
      <tr>
        <td style="padding:14px 0 0;border-top:1px solid #d9c9b6;color:#20140d;font-size:14px;font-weight:700">Total</td>
        <td style="padding:14px 0 0;border-top:1px solid #d9c9b6;color:#20140d;font-size:18px;font-weight:700;text-align:right">${escapeHtml(
          money(details.total, currency)
        )}</td>
      </tr>
    </table>`;
}

function backTheBlueHtml(details: OrderEmailDetails): string {
  if (!orderSummary(details).includesBackTheBlue) return "";
  return `
    <div style="margin:22px 0 0;padding:16px;border:1px solid #4165df;background:#eef2ff">
      <div style="color:#1632a6;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">Back the Blue · October 3, 2026</div>
      <p style="margin:8px 0 0;color:#243b91;font-size:13px;line-height:1.6">
        This special event is exclusively for qualifying first responders. Proof of eligibility is required at check-in. Anyone unable to provide proof will be turned away without a refund.
      </p>
    </div>`;
}

function emailShell(args: {
  eyebrow: string;
  heading: string;
  intro: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  return `<!doctype html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#f2ede5;color:#20140d">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(args.intro)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f2ede5">
        <tr>
          <td align="center" style="padding:28px 12px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;background:#fffdf9;border:1px solid #ded4c7">
              <tr>
                <td style="padding:25px 28px;background:#160d08;border-bottom:3px solid #d9b56a">
                  <div style="color:#d9b56a;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Brownsville, Texas</div>
                  <div style="margin-top:7px;color:#fff9ef;font-family:Georgia,serif;font-size:22px;font-weight:700">${RANCH_NAME}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 28px">
                  <div style="color:#9a7430;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase">${escapeHtml(args.eyebrow)}</div>
                  <h1 style="margin:10px 0 0;color:#20140d;font-family:Georgia,serif;font-size:30px;line-height:1.15">${escapeHtml(args.heading)}</h1>
                  <p style="margin:14px 0 0;color:#62564c;font-family:Arial,sans-serif;font-size:14px;line-height:1.7">${escapeHtml(args.intro)}</p>
                  ${args.body}
                  ${
                    args.ctaLabel && args.ctaUrl
                      ? `<div style="margin-top:26px"><a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;padding:13px 18px;background:#d9b56a;color:#160d08;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-decoration:none;text-transform:uppercase">${escapeHtml(args.ctaLabel)}</a></div>`
                      : ""
                  }
                </td>
              </tr>
              <tr>
                <td style="padding:20px 28px;background:#f6f0e7;border-top:1px solid #e1d7ca;color:#71655a;font-family:Arial,sans-serif;font-size:12px;line-height:1.7">
                  Questions about your booking?<br>
                  <strong style="color:#35261c">${CONTACT_NAME}</strong> · ${CONTACT_PHONE}<br>
                  <a href="mailto:${CONTACT_EMAIL}" style="color:#755719">${CONTACT_EMAIL}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

function section(title: string, content: string): string {
  return `
    <div style="margin-top:24px;padding:18px;border:1px solid #e2d8cb;background:#fbf8f3">
      <div style="margin-bottom:8px;color:#9a7430;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(title)}</div>
      ${content}
    </div>`;
}

function orderDetailsText(details: OrderEmailDetails, partyDeckConfirmed: boolean): string {
  const summary = orderSummary(details);
  const lines = [
    `Order reference: ${details.orderId}`,
    `Order placed: ${friendlyDateTime(details.createdAt)}`,
    `Hunt date(s): ${
      summary.dates.length ? summary.dates.map(friendlyDate).join("; ") : "No hunt dates"
    }`,
    `Hunters: ${summary.hunters}`,
    `Party Deck: ${
      summary.partyDeckDates.length
        ? `${partyDeckConfirmed ? "Confirmed" : "Requested"} for ${summary.partyDeckDates
            .map(friendlyDate)
            .join("; ")}`
        : "Not included"
    }`,
  ];
  return lines.join("\n");
}

function customerDetailsText(details: OrderEmailDetails): string {
  return [
    `Booked by: ${customerName(details)}`,
    `Email: ${details.customer?.email || "Not provided"}`,
    `Phone: ${details.customer?.phone || "Not provided"}`,
  ].join("\n");
}

function attendeesText(details: OrderEmailDetails): string {
  const attendees = orderSummary(details).attendees;
  if (!attendees.length) return "No attendee names were saved with this order.";
  return attendees
    .map(
      (attendee, index) =>
        `${index + 1}. ${attendee.fullName || `Attendee ${index + 1}`}${
          attendee.email ? ` — ${attendee.email}` : ""
        }`
    )
    .join("\n");
}

function priceBreakdownText(details: OrderEmailDetails): string {
  const summary = orderSummary(details);
  const currency = details.currency || "USD";
  const rows: string[] = [];

  if (details.booking) {
    rows.push(`Dove hunt reservation: ${money(summary.huntSubtotal, currency)}`);
  }
  if (summary.partyDeckDates.length) {
    rows.push(
      `Party Deck (${summary.partyDeckDates.length} day${
        summary.partyDeckDates.length === 1 ? "" : "s"
      }): ${money(summary.partyDeckSubtotal, currency)}`
    );
  }
  for (const item of summary.merch) {
    const quantity = Math.max(0, Number(item.quantity || 0));
    rows.push(
      `${item.name || item.skuCode || "Merchandise"} × ${quantity}: ${money(
        Number(item.price || 0) * quantity,
        currency
      )}`
    );
  }
  rows.push(`Total: ${money(details.total, currency)}`);
  return rows.join("\n");
}

function backTheBlueText(details: OrderEmailDetails): string {
  if (!orderSummary(details).includesBackTheBlue) return "";
  return `\n\nBACK THE BLUE — OCTOBER 3, 2026\nThis event is exclusively for qualifying first responders. Proof of eligibility is required at check-in. Anyone unable to provide proof will be turned away without a refund.`;
}

export function renderPendingOrderEmail(details: OrderEmailDetails): RenderedEmail {
  const name = firstName(details);
  const intro = `Hi ${name}, we saved your hunt selection, but payment is still required before your reservation is confirmed.`;
  const body = `
    <div style="margin-top:18px;padding:14px 16px;border-left:3px solid #d9b56a;background:#fff8e7;color:#665124;font-family:Arial,sans-serif;font-size:13px;line-height:1.6">
      Your hunt dates and Party Deck request are not secured until payment is completed and approved.
    </div>
    ${section("Order details", orderDetailsHtml(details, false))}
    ${section("Customer", customerDetailsHtml(details))}
    ${section("Attendees", attendeeHtml(details))}
    ${section("Amount due", priceBreakdownHtml(details))}
    ${backTheBlueHtml(details)}`;

  return {
    subject: `Complete your booking — ${RANCH_NAME}`,
    html: emailShell({
      eyebrow: "Payment required",
      heading: "Complete your booking",
      intro,
      body,
      ctaLabel: "Continue payment",
      ctaUrl: details.dashboardUrl,
    }),
    text: `${RANCH_NAME}\n\nCOMPLETE YOUR BOOKING\n\n${intro}\n\nYour reservation is not confirmed until payment is completed and approved.\n\nORDER DETAILS\n${orderDetailsText(
      details,
      false
    )}\n\nCUSTOMER\n${customerDetailsText(details)}\n\nATTENDEES\n${attendeesText(details)}\n\nAMOUNT DUE\n${priceBreakdownText(
      details
    )}${backTheBlueText(details)}\n\nContinue payment: ${details.dashboardUrl}\n\nQuestions? ${CONTACT_NAME} · ${CONTACT_PHONE} · ${CONTACT_EMAIL}`,
  };
}

export function renderOrderPaidEmail(details: OrderEmailDetails): RenderedEmail {
  const name = firstName(details);
  const intro = `Hi ${name}, your payment was approved and your reservation at ${RANCH_NAME} is confirmed.`;
  const body = `
    <div style="margin-top:18px;padding:14px 16px;border-left:3px solid #6f965f;background:#f0f7ed;color:#36502e;font-family:Arial,sans-serif;font-size:13px;line-height:1.6">
      Payment received. Your booked dates and any Party Deck dates listed below are confirmed.
    </div>
    ${section("Confirmed reservation", orderDetailsHtml(details, true))}
    ${section("Customer", customerDetailsHtml(details))}
    ${section("Attendees", attendeeHtml(details))}
    ${section("Payment summary", priceBreakdownHtml(details))}
    ${backTheBlueHtml(details)}`;

  return {
    subject: `Your hunt is confirmed — ${RANCH_NAME}`,
    html: emailShell({
      eyebrow: "Booking confirmed",
      heading: "Your hunt is confirmed",
      intro,
      body,
      ctaLabel: "View your booking",
      ctaUrl: details.dashboardUrl,
    }),
    text: `${RANCH_NAME}\n\nYOUR HUNT IS CONFIRMED\n\n${intro}\n\nCONFIRMED RESERVATION\n${orderDetailsText(
      details,
      true
    )}\n\nCUSTOMER\n${customerDetailsText(details)}\n\nATTENDEES\n${attendeesText(details)}\n\nPAYMENT SUMMARY\n${priceBreakdownText(
      details
    )}\nPayment status: Paid in full${backTheBlueText(details)}\n\nView your booking: ${
      details.dashboardUrl
    }\n\nQuestions? ${CONTACT_NAME} · ${CONTACT_PHONE} · ${CONTACT_EMAIL}`,
  };
}

export function renderAdminOrderPaidEmail(details: OrderEmailDetails): RenderedEmail {
  const summary = orderSummary(details);
  const name = customerName(details);
  const intro = `${name} completed payment for order ${details.orderId}.`;
  const customerContent = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
      ${detailRow("Customer", name)}
      ${detailRow("Email", details.customer?.email || "Not provided")}
      ${detailRow("Phone", details.customer?.phone || "Not provided")}
      ${detailRow("Billing address", billingAddress(details))}
    </table>`;
  const body = `
    ${section("Customer", customerContent)}
    ${section("Reservation", orderDetailsHtml(details, true))}
    ${section("Attendees", attendeeHtml(details))}
    ${section("Paid order summary", priceBreakdownHtml(details))}
    ${backTheBlueHtml(details)}`;
  const firstHuntDate = summary.dates[0] ? friendlyDate(summary.dates[0]) : "No hunt date";

  return {
    subject: `Paid order — ${name} — ${money(details.total, details.currency)}`,
    html: emailShell({
      eyebrow: "Administrative notification",
      heading: "A booking has been paid",
      intro,
      body,
      ctaLabel: "Open admin dashboard",
      ctaUrl: details.adminUrl || details.dashboardUrl,
    }),
    text: `${RANCH_NAME}\n\nPAID BOOKING\n\n${intro}\n\nCUSTOMER\nName: ${name}\nEmail: ${
      details.customer?.email || "Not provided"
    }\nPhone: ${details.customer?.phone || "Not provided"}\nBilling address: ${billingAddress(
      details
    )}\n\nRESERVATION\n${orderDetailsText(details, true)}\n\nATTENDEES\n${attendeesText(
      details
    )}\n\nPAID ORDER SUMMARY\n${priceBreakdownText(details)}\nPayment status: Paid in full${backTheBlueText(
      details
    )}\n\nFirst hunt date: ${firstHuntDate}\nAdmin dashboard: ${
      details.adminUrl || details.dashboardUrl
    }`,
  };
}

export function renderRefundEmail(p: {
  firstName?: string;
  orderId: string;
  amount: number;
}) {
  return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 8px">Refund processed${p.firstName ? `, ${escapeHtml(p.firstName)}` : ""}</h2>
      <p>We’ve issued a refund for <strong>Order ${escapeHtml(p.orderId)}</strong>.</p>
      <p><strong>Amount:</strong> ${escapeHtml(money(p.amount))}</p>
    </div>`;
}
