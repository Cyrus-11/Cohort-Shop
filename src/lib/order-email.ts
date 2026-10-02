import { formatKobo } from "@/lib/money";
import type { OrderItem } from "@/lib/order-items";

export type OrderEmail = {
  orderId: string;
  to: string;
  reference: string;
  totalKobo: number;
  items: OrderItem[];
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function buildConfirmationText(order: OrderEmail): string {
  return [
    "COHORT SHOP",
    "Payment confirmed",
    "",
    "Thank you for your order. Here is your payment receipt.",
    "",
    ...order.items.map((item) =>
      `${item.name} x ${item.quantity} — ${formatKobo(item.unitPriceKobo)} each — ${formatKobo(item.unitPriceKobo * item.quantity)}`,
    ),
    "",
    `Total paid: ${formatKobo(order.totalKobo)}`,
    `Order ID: ${order.orderId}`,
    `Payment reference: ${order.reference}`,
    "",
    "Keep this email for your records.",
    "You received this receipt because your payment at Cohort Shop was confirmed.",
  ].join("\n");
}

export function buildConfirmationHtml(order: OrderEmail): string {
  const rows = order.items.map((item) => `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;overflow-wrap:anywhere;">
        <strong>${escapeHtml(item.name)}</strong><br>
        <span style="font-size:13px;color:#666666;">${escapeHtml(formatKobo(item.unitPriceKobo))} each</span>
      </td>
      <td style="padding:16px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;text-align:center;">${item.quantity}</td>
      <td style="padding:16px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;text-align:right;white-space:nowrap;">${escapeHtml(formatKobo(item.unitPriceKobo * item.quantity))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cohort Shop payment receipt</title></head>
<body style="margin:0;padding:0;background:#f4f6f5;color:#171717;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Payment confirmed. Your Cohort Shop receipt for ${escapeHtml(formatKobo(order.totalKobo))}.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f5;">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
        <tr><td style="padding:24px;background:#171717;border-radius:16px 16px 0 0;">
          <p style="margin:0;color:#ebd96b;font-size:20px;font-weight:bold;letter-spacing:1px;">COHORT SHOP</p>
        </td></tr>
        <tr><td style="padding:24px 20px;">
          <p style="margin:0 0 12px;color:#067647;font-size:13px;font-weight:bold;">PAYMENT CONFIRMED</p>
          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.2;letter-spacing:-1px;">Thank you for your order.</h1>
          <p style="margin:0 0 24px;color:#666666;">Your payment is confirmed. Here is your receipt.</p>
          <table width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;line-height:1.5;">
            <caption style="padding:0 0 12px;text-align:left;font-weight:bold;font-size:18px;">Order summary</caption>
            <thead><tr>
              <th scope="col" style="padding:8px 0;border-bottom:2px solid #171717;text-align:left;">Item</th>
              <th scope="col" style="padding:8px;border-bottom:2px solid #171717;text-align:center;">Qty</th>
              <th scope="col" style="padding:8px 0;border-bottom:2px solid #171717;text-align:right;">Amount</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;background:#ebd96b;">
            <tr>
              <td style="padding:16px 12px;font-weight:bold;">Total paid</td>
              <td align="right" style="padding:16px 12px;font-weight:bold;white-space:nowrap;">${escapeHtml(formatKobo(order.totalKobo))}</td>
            </tr>
          </table>
          <p style="margin:24px 0 4px;font-size:12px;color:#666666;">ORDER ID</p>
          <p style="margin:0;font-size:13px;word-break:break-all;">${escapeHtml(order.orderId)}</p>
          <p style="margin:16px 0 4px;font-size:12px;color:#666666;">PAYMENT REFERENCE</p>
          <p style="margin:0;font-size:13px;word-break:break-all;">${escapeHtml(order.reference)}</p>
          <p style="margin:24px 0 0;color:#666666;font-size:13px;">Keep this email for your records.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      <p style="max-width:540px;margin:16px 0 0;color:#666666;font-size:12px;">You received this receipt because your payment at Cohort Shop was confirmed.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildOrderConfirmationEmail(order: OrderEmail) {
  return {
    subject: `Payment confirmed — Cohort Shop order ${order.orderId.slice(0, 8)}`,
    text: buildConfirmationText(order),
    html: buildConfirmationHtml(order),
  };
}
