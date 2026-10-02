// ROUND 326.2 item 2 — Banking KPI engine on screen: GET /api/v1/banking/kpis (bank feed + GL + factoring purchases,
// server-side), every tile drilling to its rows with EntityLinks back to bank line / bank account / invoice / bill /
// settlement / factoring advance / journal entry / load.
import { getBankingLedgerKpiDrill, getBankingLedgerKpis } from "../../api/banking-kpis";
import { LedgerKpiPanel } from "../shared/LedgerKpiPanel";

export function BankingKpiPanel({ companyId, from, to }: { companyId: string; from?: string; to?: string }) {
  return (
    <LedgerKpiPanel
      domain="banking-ledger"
      title="Banking KPIs — from the bank feed and the ledger"
      companyId={companyId}
      from={from}
      to={to}
      fetchKpis={getBankingLedgerKpis}
      fetchDrill={getBankingLedgerKpiDrill}
    />
  );
}
