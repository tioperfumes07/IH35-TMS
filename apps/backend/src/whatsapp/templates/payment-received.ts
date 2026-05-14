/**
 * WhatsApp Business — AR payment posted notification (pre-approved draft).
 *
 * @preview
 * Payment $4,200.00 received from ACME Logistics on 2026-05-14. Posted to Operating Checking ••••1234.
 *
 * Meta submission: prefer CATEGORY utility / marketing per your program; keep copy transactional.
 */
export const paymentReceivedTemplateName = "ih35_payment_received_v1";

export const paymentReceivedTemplateBody =
  "Payment ${amount} received from {customer} on {date}. Posted to {bank_account}.";

export const paymentReceivedTemplateVariables = ["amount", "customer", "date", "bank_account"] as const;

export type PaymentReceivedTemplateVars = {
  amount: string;
  customer: string;
  date: string;
  bank_account: string;
};
