import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { getAccountingSourceLineage, type AccountingSourceLineageRow } from "../../api/accounting";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";
import { formatUsdCents } from "../../lib/money";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";

function formatMoney(cents: number) {
  return formatUsdCents(cents);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function postingEntityKind(type: string | null | undefined): EntityKind | null {
  const t = (type ?? "").toLowerCase();
  switch (t) {
    case "invoice":
      return "invoice";
    case "bill":
      return "bill";
    case "customer_payment":
    case "payment":
      return "payment";
    case "bill_payment":
      return "bill_payment";
    case "driver_advance":
    case "cash_advance":
      return "cash_advance";
    case "transfer":
      return "transfer";
    case "prepaid_asset":
    case "prepaid_amortization":
      return "prepaid_asset";
    case "fixed_asset":
    case "fixed_asset_depreciation":
      return "fixed_asset";
    case "loan":
    case "finance_loan":
      return "finance_loan";
    case "lease_contract":
      return "lease_contract";
    case "recurring_template":
      return "recurring_template";
    case "period_close":
      return "period_close";
    case "prepaid_amortization_row":
    case "depreciation_schedule_row":
    case "loan_amortization_row":
      return t;
    case "factoring_customer_payment":
    case "factoring_chargeback":
    case "factoring_reserve_release":
    case "factoring_default_interest":
      return "factoring_advance";
    case "loan_payment":
      return "finance_loan";
    case "prepaid_purchase":
      return "prepaid_asset";
    case "expense":
      return "expense";
    case "settlement":
    case "driver_settlement":
    case "driver_settlement_deduction":
      return "settlement";
    case "journal_entry":
      return "journal_entry";
    case "load":
      return "load";
    case "vendor":
      return "vendor";
    case "customer":
      return "customer";
    case "unit":
      return "unit";
    case "driver":
      return "driver";
    case "trailer":
      return "trailer";
    case "work_order":
      return "work_order";
    case "factoring_advance":
      return "factoring_advance";
    case "bank_transaction":
    case "bank_categorization":
      return "bank_transaction";
    case "claim":
      return "claim";
    case "matter":
      return "matter";
    case "liability":
      return "liability";
    default:
      return null;
  }
}

function PostingEntityLink({
  type,
  id,
  label,
}: {
  type: string | null | undefined;
  id: string | null | undefined;
  label?: ReactNode;
}) {
  const kind = postingEntityKind(type);
  if (!kind || !id) {
    return <>{label ?? id ?? ""}</>;
  }
  return <EntityLink kind={kind} id={id} label={label ?? entityLabel(null, id, "Record")} />;
}

export function PostingLineagePage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [submitted, setSubmitted] = useState<{ sourceType: string; sourceId: string } | null>(null);
  // BANK-SORT-ROLLOUT-ACCT: ?sort=&dir= URL persistence.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const lineageQuery = useMutation({
    mutationFn: (input: { sourceType: string; sourceId: string }) =>
      getAccountingSourceLineage(companyId, {
        source_transaction_type: input.sourceType,
        source_transaction_id: input.sourceId,
        limit: 500,
      }),
    onError: (err) =>
      pushToast(err instanceof Error ? err.message : "Failed to load posting lineage", "error"),
  });

  const totals = useMemo(() => {
    const rows = (lineageQuery.data?.rows ?? []) as AccountingSourceLineageRow[];
    let debit = 0;
    let credit = 0;
    for (const row of rows) {
      if (row.debit_or_credit === "debit") debit += row.amount_cents;
      else credit += row.amount_cents;
    }
    return { debit, credit, balanced: debit === credit };
  }, [lineageQuery.data?.rows]);

  const rows = (lineageQuery.data?.rows ?? []) as AccountingSourceLineageRow[];

  const columns = useMemo<ParityColumn<AccountingSourceLineageRow>[]>(
    () => [
      {
        key: "occurred_at",
        label: "Occurred",
        sortable: true,
        className: "whitespace-nowrap",
        render: (row) => formatWhen(row.occurred_at),
      },
      {
        key: "journal_entry_id",
        label: "JE",
        sortable: true,
        render: (row) => (
          <EntityLink kind="journal_entry" id={row.journal_entry_id} label={row.journal_entry_id ? entityLabel(row.memo, row.journal_entry_id, "Journal entry") : undefined} />
        ),
      },
      {
        key: "posting_batch_id",
        label: "Posting batch",
        sortable: true,
        sortValue: (row) => row.posting_batch_id ?? "",
        render: (row) => row.posting_batch_id ?? "—",
      },
      {
        key: "account_number",
        label: "Account",
        sortable: true,
        sortValue: (row) => `${row.account_name ?? ""}`.trim(),
        render: (row) => (
          <>
            {entityLabel(row.account_name, row.account_id, "Account")}
          </>
        ),
      },
      {
        key: "debit_or_credit",
        label: "Side",
        sortable: true,
        render: (row) => row.debit_or_credit.toUpperCase(),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        render: (row) => formatMoney(row.amount_cents),
      },
      {
        key: "linked_object_type",
        label: "Linked object",
        sortable: true,
        sortValue: (row) => `${row.linked_object_type ?? ""} ${row.linked_object_id ?? ""} ${row.relationship_role ?? ""}`.trim(),
        render: (row) => (
          <>
            {row.linked_object_type ?? "—"}
            {row.linked_object_id ? (
              <>
                {" / "}
                <PostingEntityLink
                  type={row.linked_object_entity_kind ?? row.linked_object_type}
                  id={row.linked_object_id}
                  label={entityLabel(row.linked_object_display_id, row.linked_object_id, "Linked object")}
                />
              </>
            ) : null}
            {row.relationship_role ? ` (${row.relationship_role})` : ""}
          </>
        ),
      },
    ],
    [],
  );

  return (
    <AccountingSubNavWrapper title="Posting Lineage" subtitle="Trace source transaction → posting rows → linked objects">

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {lineageQuery.isError ? <ReportBlockVPendingBanner error={lineageQuery.error} onRetry={() => void lineageQuery.reset()} /> : null}

      <form
        className="grid gap-3 rounded-sm border border-slate-200 bg-white p-3 md:grid-cols-[220px_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const next = {
            sourceType: sourceType.trim().toLowerCase(),
            sourceId: sourceId.trim(),
          };
          if (!next.sourceType || !next.sourceId || !companyId) return;
          setSubmitted(next);
          lineageQuery.mutate(next);
        }}
      >
        <label className="text-xs text-slate-600">
          Source type
          <input
            className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            placeholder="invoice | bill | payment"
          />
        </label>
        <label className="text-xs text-slate-600">
          Source transaction id
          <input
            className="mt-1 block h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="source_transaction_id"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" loading={lineageQuery.isPending} disabled={!companyId}>
            Load lineage
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSourceType("");
              setSourceId("");
              setSubmitted(null);
              lineageQuery.reset();
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {submitted ? (
        <div className="rounded-sm border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-800">
            Source: {submitted.sourceType} /{" "}
            <PostingEntityLink
              type={submitted.sourceType}
              id={submitted.sourceId}
              label={entityLabel(rows[0]?.source_transaction_display_id, submitted.sourceId, "Source")}
            />
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Debit {formatMoney(totals.debit)} · Credit {formatMoney(totals.credit)} ·{" "}
            <span className={totals.balanced ? "text-slate-700" : "text-red-700"}>
              {totals.balanced ? "Balanced" : "Out of balance"}
            </span>
          </div>
        </div>
      ) : null}

      {submitted ? (
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.posting_id}:${row.linked_object_id ?? "none"}`}
          loading={lineageQuery.isPending}
          storageKey="accounting-posting-lineage"
          exportFilename="posting-lineage"
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
          emptyText="No posting lineage rows found for this source transaction."
        />
      ) : null}
    </AccountingSubNavWrapper>
  );
}
