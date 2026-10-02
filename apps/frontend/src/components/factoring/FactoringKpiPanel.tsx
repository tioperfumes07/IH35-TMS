// ROUND 326.2 item 1 — Factoring KPI engine on screen: GET /api/v1/factoring/kpis (ledger + purchase document, server-side),
// every tile drilling to its rows with EntityLinks back to purchase / journal entry / bank deposit / invoice / load / customer.
import { getFactoringKpiDrill, getFactoringKpis } from "../../api/factoring-kpis";
import { LedgerKpiPanel } from "../shared/LedgerKpiPanel";

export function FactoringKpiPanel({ companyId, from, to }: { companyId: string; from?: string; to?: string }) {
  return (
    <LedgerKpiPanel
      domain="factoring"
      title="Factoring KPIs — from the ledger"
      companyId={companyId}
      from={from}
      to={to}
      fetchKpis={getFactoringKpis}
      fetchDrill={getFactoringKpiDrill}
    />
  );
}
