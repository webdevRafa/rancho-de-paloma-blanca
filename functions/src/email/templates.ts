// functions/src/email/templates.ts

export function renderOrderPlacedEmail(p: {
    firstName?: string;
    orderId: string;
    total: number;
    dates?: string[];
    hunters?: number;
  }) {
    const when = (p.dates ?? []).join(", ");
    return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 8px">Thanks${p.firstName ? `, ${p.firstName}` : ""}!</h2>
      <p>We received your order <strong>${p.orderId}</strong>.</p>
      <ul style="padding-left:18px">
        ${when ? `<li><strong>Dates:</strong> ${when}</li>` : ""}
        ${p.hunters ? `<li><strong>Hunters:</strong> ${p.hunters}</li>` : ""}
        <li><strong>Total:</strong> $${p.total.toFixed(2)}</li>
      </ul>
      <p>We’ll follow up when your payment is approved.</p>
    </div>`;
  }
  
  export function renderOrderPaidEmail(p: {
    firstName?: string;
    orderId: string;
    total: number;
    dates?: string[];
    hunters?: number;
  }) {
    const when = (p.dates ?? []).join(", ");
    return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 8px">Payment received${p.firstName ? `, ${p.firstName}` : ""}!</h2>
      <p>Your payment for <strong>Order ${p.orderId}</strong> was approved.</p>
      <ul style="padding-left:18px">
        ${when ? `<li><strong>Dates:</strong> ${when}</li>` : ""}
        ${p.hunters ? `<li><strong>Hunters:</strong> ${p.hunters}</li>` : ""}
        <li><strong>Total:</strong> $${p.total.toFixed(2)}</li>
      </ul>
      <p>We’ll see you at Rancho de Paloma Blanca.</p>
    </div>`;
  }
  
  export function renderRefundEmail(p: {
    firstName?: string;
    orderId: string;
    amount: number;
  }) {
    return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 8px">Refund processed${p.firstName ? `, ${p.firstName}` : ""}</h2>
      <p>We’ve issued a refund for <strong>Order ${p.orderId}</strong>.</p>
      <p><strong>Amount:</strong> $${p.amount.toFixed(2)}</p>
    </div>`;
  }
  