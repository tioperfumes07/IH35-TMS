export type DetentionEventStatus = "accruing" | "closed" | "billed";

export function detentionNotifyThresholdMinutes(): number {
  const raw = Number(process.env.DISPATCH_DETENTION_NOTIFY_THRESHOLD_MINUTES ?? 60);
  if (!Number.isFinite(raw) || raw < 0) return 60;
  return Math.floor(raw);
}

export function resolveFreeTimeMinutes(stopType: string, customer: {
  free_time_pickup_minutes?: number | null;
  free_time_delivery_minutes?: number | null;
}): number {
  const pickup = Number(customer.free_time_pickup_minutes ?? 120);
  const delivery = Number(customer.free_time_delivery_minutes ?? 120);
  if (String(stopType).toLowerCase() === "pickup") return Math.max(0, pickup);
  return Math.max(0, delivery);
}

export function resolveDetentionRatePerHourCents(load: {
  detention_bill_customer_per_hour_cents?: number | null;
}, customer: { detention_rate_per_hour?: string | number | null }): number {
  const loadRate = Number(load.detention_bill_customer_per_hour_cents ?? 0);
  if (loadRate > 0) return Math.floor(loadRate);
  const customerRate = Number(customer.detention_rate_per_hour ?? 0);
  if (!Number.isFinite(customerRate) || customerRate <= 0) return 0;
  return Math.round(customerRate * 100);
}

/** Billable minutes after free time, from arrival start through optional stop instant. */
export function computeDetentionBillableMinutes(input: {
  started_at: string;
  stopped_at?: string | null;
  free_time_minutes: number;
  nowMs?: number;
}): number {
  const startMs = new Date(input.started_at).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const endMs = input.stopped_at
    ? new Date(input.stopped_at).getTime()
    : (input.nowMs ?? Date.now());
  if (!Number.isFinite(endMs) || endMs <= startMs) return 0;
  const elapsed = Math.floor((endMs - startMs) / 60_000);
  return Math.max(0, elapsed - Math.max(0, Number(input.free_time_minutes || 0)));
}

export function computeDetentionAccrualCents(billableMinutes: number, ratePerHourCents: number): number {
  const minutes = Math.max(0, Number(billableMinutes || 0));
  const rate = Math.max(0, Number(ratePerHourCents || 0));
  if (minutes <= 0 || rate <= 0) return 0;
  return Math.round((minutes / 60) * rate);
}

export function shouldNotifyCustomerAtThreshold(input: {
  billable_minutes: number;
  notify_threshold_minutes: number;
  customer_notified_at?: string | null;
}): boolean {
  if (input.customer_notified_at) return false;
  return input.billable_minutes >= Math.max(0, Number(input.notify_threshold_minutes || 0));
}

export function buildDetentionAccessorialBridge(input: {
  detention_event_id: string;
  load_id: string;
  amount_cents: number;
  billable_minutes: number;
}): { code: string; amount_cents: number; description: string; source: string; detention_event_id: string; load_id: string } {
  return {
    code: "DETENTION",
    amount_cents: Math.max(0, input.amount_cents),
    description: `Detention ${input.billable_minutes} billable min`,
    source: "dispatch.detention_events",
    detention_event_id: input.detention_event_id,
    load_id: input.load_id,
  };
}
