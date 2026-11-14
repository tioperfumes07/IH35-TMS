import type { CashFlowNavOpts, CashFlowTabId } from "../CashFlowPage";

/** ROUND 8.20 board5 — shareable sibling-tab KPI href (same provenance as openSibling / setActiveTab). */
export function cashFlowTabHref(tab: Exclude<CashFlowTabId, "home">, opts?: CashFlowNavOpts): string {
  const params = new URLSearchParams({ tab });
  if (opts?.rl_from) params.set("rl_from", opts.rl_from);
  if (opts?.rl_to) params.set("rl_to", opts.rl_to);
  if (opts?.rl_types) params.set("rl_types", opts.rl_types);
  if (opts?.rl_kind && opts.rl_kind !== "all") params.set("rl_kind", opts.rl_kind);
  if (opts?.rl_explain) params.set("rl_explain", opts.rl_explain);
  if (opts?.rl_scenario) params.set("rl_scenario", opts.rl_scenario);
  if (opts?.rl_bucket) params.set("rl_bucket", opts.rl_bucket);
  if (opts?.rl_invoice != null) params.set("rl_invoice", opts.rl_invoice);
  if (opts?.rl_topup != null) params.set("rl_topup", opts.rl_topup);
  if (opts?.rl_finance != null) params.set("rl_finance", opts.rl_finance);
  if (opts?.rl_driver != null) params.set("rl_driver", opts.rl_driver);
  if (opts?.rl_diesel != null) params.set("rl_diesel", opts.rl_diesel);
  if (opts?.rl_vendor != null) params.set("rl_vendor", opts.rl_vendor);
  if (opts?.rl_other != null) params.set("rl_other", opts.rl_other);
  if (opts?.rl_income != null) params.set("rl_income", opts.rl_income);
  if (opts?.rl_expenses != null) params.set("rl_expenses", opts.rl_expenses);
  if (opts?.rl_net != null) params.set("rl_net", opts.rl_net);
  if (opts?.rl_ending != null) params.set("rl_ending", opts.rl_ending);
  if (opts?.rl_opening != null) params.set("rl_opening", opts.rl_opening);
  if (opts?.rl_rr) params.set("rl_rr", opts.rl_rr);
  return `/cash-flow?${params.toString()}`;
}
