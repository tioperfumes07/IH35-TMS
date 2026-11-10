/**
 * ENG-17 BUILD-ONLY — Faro 1090 undeposited-funds wire proposal pick screen.
 * Shows PROPOSED / AMBIGUOUS / NO_EVIDENCE for each unmatched purchase.
 * Dry-run Accept previews the existing match / createBankDeposit path; never executes a match
 * (owner BUILD-FIRST — match later). Undo is documented for the future execute path.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  dryRunAcceptFaro1090WireProposal,
  listFaro1090WireProposals,
  type Faro1090WireProposal,
  type Faro1090WireProposalClass,
} from "../../api/factoring-purchases";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { formatQuantityTable, formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { SelectCombobox } from "../../components/Combobox";
import { statusOptions } from "../../lib/statusListParams";

const CLASS_OPTIONS = statusOptions({
  PROPOSED: "Proposed (1 wire)",
  AMBIGUOUS: "Ambiguous (pick)",
  NO_EVIDENCE: "No evidence",
});

function classTone(c: Faro1090WireProposalClass): string {
  if (c === "PROPOSED") return "bg-[#F7F8FA] text-[#1F2A44]";
  if (c === "AMBIGUOUS") return "bg-[#F7F8FA] text-[#4B5563]";
  return "bg-[#E5E7EB] text-[#4B5563]";
}

export function Faro1090WireProposalsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [dryRunNote, setDryRunNote] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["factoring", "1090-wire-proposals", companyId],
    queryFn: () => listFaro1090WireProposals(companyId),
    enabled: Boolean(companyId),
  });

  const dryRun = useMutation({
    mutationFn: (input: { purchase_id: string; bank_transaction_id: string }) =>
      dryRunAcceptFaro1090WireProposal({
        operating_company_id: companyId,
        purchase_id: input.purchase_id,
        bank_transaction_id: input.bank_transaction_id,
      }),
    onSuccess: (res) => {
      setDryRunNote(
        `Dry-run OK — would link the selected bank transaction to the matched factoring advance (${formatUsdCents(res.net_to_company_cents)}). Match execution deferred.`,
      );
      pushToast("Dry-run accept previewed — no match written", "success");
    },
    onError: (error) => pushToast(userFacingApiError(error, "Dry-run failed"), "error"),
  });

  const rows = useMemo(() => {
    const all = query.data?.proposals ?? [];
    if (!classFilter.length) return all;
    return all.filter((row) => classFilter.includes(row.classification));
  }, [query.data?.proposals, classFilter]);

  const columns = useMemo<Array<ParityColumn<Faro1090WireProposal>>>(
    () => [
      {
        key: "display_id",
        label: "Purchase",
        sortable: true,
        render: (row) => (
          <EntityLink kind="factoring_purchase" id={row.purchase_id} label={row.display_id} className="font-mono text-xs" />
        ),
      },
      {
        key: "purchase_date",
        label: "Purchase date",
        sortable: true,
        render: (row) => formatDateUS(row.purchase_date),
      },
      {
        key: "net_to_company_cents",
        label: "Net to company",
        sortable: true,
        cellClass: "text-right tabular-nums",
        render: (row) => formatUsdCents(row.net_to_company_cents),
      },
      {
        key: "days_unfunded",
        label: "Days unfunded",
        sortable: true,
        cellClass: "text-right",
        render: (row) => formatQuantityTable(row.days_unfunded),
      },
      {
        key: "classification",
        label: "Class",
        sortable: true,
        render: (row) => (
          <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${classTone(row.classification)}`}>
            {row.classification}
          </span>
        ),
      },
      {
        key: "candidates",
        label: "Wire candidates",
        render: (row) => {
          if (row.candidates.length === 0) return <span className="text-xs text-[#6B7280]">None in ±14d window</span>;
          const selected = picked[row.purchase_id] ?? row.dry_run_accept_preview.bank_transaction_id ?? row.candidates[0]?.bank_transaction_id ?? "";
          return (
            <div className="space-y-1" data-testid={`faro-1090-candidates-${row.purchase_id}`}>
              <SelectCombobox
                className="h-8 w-full min-w-[16rem] text-xs"
                value={selected}
                onChange={(event) => setPicked((prev) => ({ ...prev, [row.purchase_id]: event.target.value }))}
                aria-label={`Wire candidate for ${row.display_id}`}
              >
                {row.candidates.map((c) => (
                  <option key={c.bank_transaction_id} value={c.bank_transaction_id}>
                    {formatDateUS(c.transaction_date)} · {formatUsdCents(c.amount_cents)}
                    {c.exact_amount
                      ? " · exact"
                      : ` · Δ${formatUsdCents(Math.abs(c.amount_delta_cents))}`}{" "}
                    · {(c.merchant_name || c.description || "bank").slice(0, 40)}
                  </option>
                ))}
              </SelectCombobox>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={dryRun.isPending}
                  disabled={!selected}
                  data-testid={`faro-1090-dry-run-${row.purchase_id}`}
                  onClick={() =>
                    dryRun.mutate({
                      purchase_id: row.purchase_id,
                      bank_transaction_id: selected,
                    })
                  }
                >
                  Dry-run Accept
                </Button>
                <Button size="sm" variant="secondary" disabled title="Owner BUILD-FIRST — match execution deferred">
                  Accept (deferred)
                </Button>
                <Button size="sm" variant="secondary" disabled title="Undo wires after a future owner-approved execute">
                  Undo (after execute)
                </Button>
              </div>
            </div>
          );
        },
      },
    ],
    [picked, dryRun],
  );

  const summary = query.data?.summary;

  if (!companyId) {
    return (
      <div className="space-y-3 p-4" data-testid="faro-1090-wire-proposals-page">
        <PageHeader
          backHref="/factoring"
          breadcrumb={["Factoring", "1090 wire proposals"]}
          title="Faro 1090 wire proposals"
          subtitle="ENG-17 BUILD-ONLY — propose / pick wire candidates for unmatched purchases. Matches deferred (owner BUILD-FIRST)."
        />
        <BoardSection title="Faro 1090 wire proposals" testId="faro-1090-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
        </BoardSection>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="faro-1090-wire-proposals-page">
      <PageHeader
        backHref="/factoring"
        breadcrumb={["Factoring", "1090 wire proposals"]}
        title="Faro 1090 wire proposals"
        subtitle="ENG-17 BUILD-ONLY — propose / pick wire candidates for unmatched purchases. Matches deferred (owner BUILD-FIRST)."
        actions={
          <Link to="/factoring/payments-to-you" className="text-xs font-semibold text-[#1F2A44] hover:underline">
            Payments to You →
          </Link>
        }
      />

      <BoardSection title="Proposal summary (1090 Undeposited Funds)" testId="faro-1090-summary-board">
        <div className="flex flex-wrap gap-4 px-3 py-2 text-xs text-[#4B5563]">
          <span data-testid="faro-1090-summary-proposed">PROPOSED: {summary?.PROPOSED ?? "—"}</span>
          <span data-testid="faro-1090-summary-ambiguous">AMBIGUOUS: {summary?.AMBIGUOUS ?? "—"}</span>
          <span data-testid="faro-1090-summary-none">NO_EVIDENCE: {summary?.NO_EVIDENCE ?? "—"}</span>
          <span>as of {query.data?.as_of ?? "—"}</span>
        </div>
        <p className="px-3 pb-2 text-xs text-[#6B7280]">
          Dry-run Accept previews the existing factoring_advance match / createBankDeposit path. Accept stays disabled until
          the owner starts matching. Dreamline 2510 deferred.
        </p>
        {dryRunNote ? (
          <p className="px-3 pb-2 text-xs font-medium text-[#1F2A44]" data-testid="faro-1090-dry-run-note">
            {dryRunNote}
          </p>
        ) : null}
      </BoardSection>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load 1090 wire proposals"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <BoardSection title="Unmatched purchases → wire candidates" testId="faro-1090-proposals-board">
          <div className="mb-2 px-3 pt-2">
            <MultiSelectDropdown
              label="Classification"
              options={CLASS_OPTIONS}
              selected={classFilter}
              onChange={setClassFilter}
              allLabel="All classes"
              data-testid="faro-1090-class-filter"
            />
          </div>
          <ParityTable appearance="board"
            title="1090 wire proposals"
            rows={rows}
            columns={columns}
            rowKey={(row) => row.purchase_id}
            loading={query.isLoading}
            emptyText="No unmatched Faro purchases — every posted purchase already has a wire match, or none are posted."
            storageKey="faro-1090-wire-proposals"
            tableTestId="faro-1090-wire-proposals-table"
          />
        </BoardSection>
      )}
    </div>
  );
}
