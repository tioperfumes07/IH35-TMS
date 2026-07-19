/**
 * Neutral FMCSA customer-verify contract (event type + payload).
 * Leaf module: imported by enqueue chain + outbox handler; not by registry.
 */

export const FMCSA_CUSTOMER_VERIFY_EVENT_TYPE = "fmcsa.customer.verify_requested" as const;

export type FmcsaCustomerVerifyTrigger = "create" | "update";

export type FmcsaCustomerVerifyRequestedPayload = {
  operating_company_id: string;
  customer_id: string;
  actor_user_id: string;
  trigger: FmcsaCustomerVerifyTrigger;
  lookup_fingerprint: string;
};
