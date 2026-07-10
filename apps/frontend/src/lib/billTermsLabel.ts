// Shared label map for bill/payment "terms" codes (net_30, net_15, ...). The backend accepts any
// string for `bill_terms` (no DB enum constraint), but every terms field in the app should DISPLAY a
// human label ("Net 30") — never the raw stored code ("net_30"). Add new codes here rather than
// hardcoding a label per-page (visual-sweep M-05, 2026-07-02).
export type BillTermsOption = { value: string; label: string };

export const BILL_TERMS_OPTIONS: BillTermsOption[] = [
  { value: "due_on_receipt", label: "Due on receipt" },
  { value: "net_7", label: "Net 7" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
];

const BILL_TERMS_LABEL_MAP: Record<string, string> = Object.fromEntries(
  BILL_TERMS_OPTIONS.map((option) => [option.value, option.label]),
);

// Renders a human label for a raw terms code. Unknown/legacy codes pass through unchanged so real
// data is never hidden behind a blank label.
export function billTermsLabel(code: string | null | undefined): string {
  if (!code) return "";
  return BILL_TERMS_LABEL_MAP[code] ?? code;
}
