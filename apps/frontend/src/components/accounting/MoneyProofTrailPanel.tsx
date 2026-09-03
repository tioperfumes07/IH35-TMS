import { useQuery } from "@tanstack/react-query";
import { getMoneyProofTrail, type MoneyProofDocumentType } from "../../api/accounting";
import { formatUsdCents } from "../../lib/money";
import { entityLabel } from "../../lib/entity-label";
import { Button } from "../Button";
import { DataPanel } from "../layout/DataPanel";
import { DataPanelRow } from "../layout/DataPanelRow";
import { EntityLink, type EntityKind } from "../shared/EntityLink";

const LINK_KINDS = new Set<EntityKind>([
  "load", "bill", "invoice", "settlement", "vendor", "customer", "unit", "driver",
  "trailer", "expense", "payment", "bill_payment", "work_order", "claim", "bank_transaction",
]);

export function MoneyProofTrailPanel({
  operatingCompanyId,
  documentType,
  documentId,
}: {
  operatingCompanyId: string;
  documentType: MoneyProofDocumentType;
  documentId: string;
}) {
  const proof = useQuery({
    queryKey: ["accounting", "proof-trail", operatingCompanyId, documentType, documentId],
    queryFn: () => getMoneyProofTrail(operatingCompanyId, documentType, documentId),
    enabled: Boolean(operatingCompanyId && documentId),
  });

  if (proof.isLoading) return <DataPanel title="Proof trail"><div className="text-xs text-slate-600">Loading proof trail…</div></DataPanel>;
  if (proof.isError) return <DataPanel title="Proof trail"><div className="flex items-center justify-between gap-2 text-xs text-red-700"><span>Proof trail could not be loaded.</span><Button variant="secondary" onClick={() => void proof.refetch()}>Retry</Button></div></DataPanel>;
  if (!proof.data) return null;

  const journalEntries = [...new Map(proof.data.postings.map((row) => [row.journal_entry_id, row])).values()];
  return (
    <DataPanel title="Proof trail">
      <DataPanelRow>
        <span className="text-xs text-slate-600">Trace</span>
        <span className="font-mono text-xs text-slate-900">{proof.data.trace_key}</span>
      </DataPanelRow>
      {journalEntries.length === 0 ? (
        <div className="text-xs text-slate-600">No ledger posting exists for this document.</div>
      ) : journalEntries.map((row) => (
        <DataPanelRow key={row.journal_entry_id}>
          <EntityLink kind="journal_entry" id={row.journal_entry_id} label={entityLabel(row.memo, row.journal_entry_id, "Journal entry")} />
          <span className="text-xs text-slate-600">{row.status ?? "—"}</span>
        </DataPanelRow>
      ))}
      {proof.data.postings.map((row) => (
        <DataPanelRow key={`${row.posting_id}-${row.linked_object_id ?? "account"}`}>
          <span className="text-xs text-slate-700">{[row.account_number, row.account_name].filter(Boolean).join(" — ")}</span>
          <span className="text-xs text-slate-900">{row.debit_or_credit} {formatUsdCents(row.amount_cents)}</span>
          {row.linked_object_id && LINK_KINDS.has(row.linked_object_type as EntityKind) ? (
            <EntityLink kind={row.linked_object_type as EntityKind} id={row.linked_object_id} label={row.relationship_role ?? "Linked record"} />
          ) : null}
        </DataPanelRow>
      ))}
    </DataPanel>
  );
}
