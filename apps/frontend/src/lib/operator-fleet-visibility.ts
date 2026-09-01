/**
 * Client-side defense-in-depth for operator fleet surfaces (Dispatch OOS strip, truck planner).
 * Backend list endpoints must exclude first; this mirrors mdata/fleet-visibility.ts name patterns.
 */

const DEMO_PHANTOM_RE = /^(SAM-|TEST)|DEMO/i;

export function isOperatorVisibleUnitNumber(unitNumber: string | null | undefined): boolean {
  const n = String(unitNumber ?? "").trim();
  if (!n) return true;
  return !DEMO_PHANTOM_RE.test(n);
}

export function isOperatorVisibleUnit(row: {
  unit_number?: string | null;
  is_sample_data?: boolean | null;
}): boolean {
  if (row.is_sample_data === true) return false;
  return isOperatorVisibleUnitNumber(row.unit_number);
}

export function isOperatorVisibleWorkOrder(row: {
  display_id?: string | null;
}): boolean {
  const id = String(row.display_id ?? "").trim().toUpperCase();
  if (!id) return true;
  return !id.startsWith("DEMO-") && !id.startsWith("TEST-");
}
