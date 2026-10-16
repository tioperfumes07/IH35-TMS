// LEAD 443.174 — Summary and Detail must be different views (owner: "it has summary and detail. but it shows the same
// data"). Detail is one row per invoice / fee record; Summary is one row per debtor / customer with totals.
import { EntityLink } from "../../components/shared/EntityLink";
import type { ParityColumn } from "../../components/parity/ParityTable";
import type { FactoringChargebackFeeRow } from "../../api/factoring";

type Money = (value: unknown) => string;
type AgingInput = { customer_id: string | null; customer_name: string; invoice_amount: number; bucket: "0-30" | "31-60" | "61-90" | "90+" };

export type AgingByDebtorRow = {
  key: string;
  customer_id: string | null;
  customer_name: string;
  invoices: number;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b90: number;
  balance: number;
};

export function groupAgingByDebtor(rows: AgingInput[]): AgingByDebtorRow[] {
  const by = new Map<string, AgingByDebtorRow>();
  for (const r of rows) {
    const key = r.customer_id ?? `name:${r.customer_name}`;
    const g = by.get(key) ?? { key, customer_id: r.customer_id, customer_name: r.customer_name, invoices: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90: 0, balance: 0 };
    const amt = Number(r.invoice_amount ?? 0) || 0;
    g.invoices += 1;
    g.balance += amt;
    if (r.bucket === "0-30") g.b0_30 += amt;
    else if (r.bucket === "31-60") g.b31_60 += amt;
    else if (r.bucket === "61-90") g.b61_90 += amt;
    else g.b90 += amt;
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => b.balance - a.balance);
}

const num = { className: "text-right", cellClass: "text-right" } as const;
const debtorCell = (r: { customer_id: string | null; customer_name: string }) =>
  r.customer_id ? <EntityLink kind="customer" id={r.customer_id} label={r.customer_name} /> : r.customer_name;

export const AGING_BY_DEBTOR_COLUMNS = (money: Money): ParityColumn<AgingByDebtorRow>[] => [
  { key: "customer_name", label: "Debtor", sortable: true, render: debtorCell },
  { key: "invoices", label: "Invoices", sortable: true, ...num, render: (r) => r.invoices },
  { key: "b0_30", label: "0-30", sortable: true, ...num, render: (r) => money(r.b0_30) },
  { key: "b31_60", label: "31-60", sortable: true, ...num, render: (r) => money(r.b31_60) },
  { key: "b61_90", label: "61-90", sortable: true, ...num, render: (r) => money(r.b61_90) },
  { key: "b90", label: "90+", sortable: true, ...num, render: (r) => money(r.b90) },
  { key: "balance", label: "Balance", sortable: true, ...num, render: (r) => money(r.balance) },
];

export type ChargebacksByCustomerRow = {
  key: string;
  customer_id: string | null;
  customer_name: string;
  records: number;
  chargebacks: number;
  fees: number;
};

export function groupChargebacksByCustomer(rows: FactoringChargebackFeeRow[]): ChargebacksByCustomerRow[] {
  const by = new Map<string, ChargebacksByCustomerRow>();
  for (const r of rows) {
    const name = r.customer_name ?? "No customer linked";
    const key = r.customer_id ?? `name:${name}`;
    const g = by.get(key) ?? { key, customer_id: r.customer_id, customer_name: name, records: 0, chargebacks: 0, fees: 0 };
    g.records += 1;
    g.chargebacks += Number(r.chargeback_amount ?? 0) || 0;
    g.fees += Number(r.factor_fee_amount ?? 0) || 0;
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => b.chargebacks - a.chargebacks);
}

export const CHARGEBACKS_BY_CUSTOMER_COLUMNS = (money: Money): ParityColumn<ChargebacksByCustomerRow>[] => [
  { key: "customer_name", label: "Customer", sortable: true, render: debtorCell },
  { key: "records", label: "Records", sortable: true, ...num, render: (r) => r.records },
  { key: "chargebacks", label: "Chargebacks / overpayments", sortable: true, ...num, render: (r) => money(r.chargebacks) },
  { key: "fees", label: "Factor fees", sortable: true, ...num, render: (r) => money(r.fees) },
];
