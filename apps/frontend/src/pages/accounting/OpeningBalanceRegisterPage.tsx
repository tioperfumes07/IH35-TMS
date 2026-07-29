import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import {
  commitOpeningBalanceRegister,
  getOpeningBalanceRegister,
  getOpeningBalanceRegisterAudit,
  importOpeningBalancesFromQbo,
  patchOpeningBalanceLine,
  setOpeningBalanceSourceFinality,
  type ObCommitBlocker,
  type ObRegisterLine,
} from "../../api/opening-balance-register";

/**
 * OB-01 — Opening Balance Register.
 *
 * The commit button is deliberately not "disabled and unexplained": every reason the backend would
 * refuse is listed, because an operator staring at a greyed-out button is how an opening-balance
 * ceremony stalls. The backend re-checks all of them — this screen never decides.
 */
const BLOCKER_COPY: Record<ObCommitBlocker, string> = {
  source_not_final:
    "The QBO cleanup for this entity and period is not marked final yet. Only the accountant who finished the cleanup can mark it.",
  no_staged_lines: "Nothing is staged. Import from QuickBooks or enter balances by hand first.",
  maker_is_checker:
    "You staged or edited these balances. A second person has to commit them (maker/checker).",
  unbalanced: "Debits and credits do not tie. Fix the register before committing.",
  obe_not_reclassed:
    "Opening Balance Equity still carries a balance. Reclass it to Retained Earnings in QuickBooks, then re-import.",
  non_balance_sheet_account_type:
    "A staged line sits on an account that is not an Asset, Liability or Equity. Opening balances are balance-sheet only.",
};

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function inputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

function AmountCell({
  row,
  disabled,
  onSave,
}: {
  row: ObRegisterLine;
  disabled: boolean;
  onSave: (accountId: string, cents: number) => void;
}) {
  const [draft, setDraft] = useState(() => centsToInput(row.amount_cents));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(centsToInput(row.amount_cents));
  }, [row.amount_cents]);

  const commitDraft = () => {
    const cents = inputToCents(draft);
    if (cents === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (cents !== row.amount_cents) onSave(row.account_id, cents);
  };

  return (
    <input
      value={draft}
      disabled={disabled}
      aria-label={`Opening balance for ${row.account_name}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitDraft();
      }}
      className={`w-32 rounded-sm border px-2 py-1 text-right text-sm tabular-nums disabled:bg-gray-50 ${
        invalid ? "border-red-400 bg-red-50" : "border-gray-300"
      }`}
    />
  );
}

export function OpeningBalanceRegisterPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const registerQuery = useQuery({
    queryKey: ["ob-register", operatingCompanyId],
    queryFn: () => getOpeningBalanceRegister(operatingCompanyId),
    enabled: Boolean(selectedCompanyId),
  });
  const auditQuery = useQuery({
    queryKey: ["ob-register-audit", operatingCompanyId],
    queryFn: () => getOpeningBalanceRegisterAudit(operatingCompanyId),
    enabled: Boolean(selectedCompanyId),
  });

  const view = registerQuery.data;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ob-register", operatingCompanyId] });
    queryClient.invalidateQueries({ queryKey: ["ob-register-audit", operatingCompanyId] });
  };
  const onError = (error: unknown) =>
    setBanner({ tone: "error", text: error instanceof Error ? error.message : "Request failed" });

  const patchLine = useMutation({
    mutationFn: (input: { account_id: string; amount_cents: number }) =>
      patchOpeningBalanceLine({ operating_company_id: operatingCompanyId, ...input }),
    onSuccess: () => {
      setBanner(null);
      refresh();
    },
    onError,
  });

  const importFromQbo = useMutation({
    mutationFn: () => importOpeningBalancesFromQbo(operatingCompanyId),
    onSuccess: (result) => {
      setBanner({
        tone: "ok",
        text: `Staged ${result.staged_count} account${result.staged_count === 1 ? "" : "s"} from QuickBooks as of ${result.as_of_date}${
          result.unmapped.length > 0 ? ` · ${result.unmapped.length} line(s) could not be mapped and were not staged` : ""
        }`,
      });
      refresh();
    },
    onError,
  });

  const setFinality = useMutation({
    mutationFn: (is_final: boolean) =>
      setOpeningBalanceSourceFinality({ operating_company_id: operatingCompanyId, is_final }),
    onSuccess: () => {
      setBanner(null);
      refresh();
    },
    onError,
  });

  const commit = useMutation({
    mutationFn: () => commitOpeningBalanceRegister(operatingCompanyId),
    onSuccess: (result) => {
      setBanner({
        tone: "ok",
        text: `Committed opening balances to ${result.accounts_written} account${result.accounts_written === 1 ? "" : "s"} as of ${result.as_of_date}`,
      });
      refresh();
    },
    // A refused commit is a 409 that the server AUDITED — reload so the audit trail below shows the
    // attempt and the blocker list reflects whatever changed underneath.
    onError: (error: unknown) => {
      onError(error);
      refresh();
    },
  });

  const columns = useMemo<ParityColumn<ObRegisterLine>[]>(
    () => [
      { key: "account_number", label: "No.", sortable: true, render: (row) => row.account_number ?? "—" },
      {
        key: "account_name",
        label: "Account",
        sortable: true,
        // Both-way drill: the register line hands off to the account it will write.
        render: (row) => <EntityLink kind="account" id={row.account_id} label={row.account_name} />,
      },
      { key: "account_type", label: "Type", sortable: true, render: (row) => row.account_type ?? "—" },
      {
        key: "source",
        label: "Source",
        sortable: true,
        render: (row) => (
          <span className="inline-block rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {row.source === "qbo_import" ? "QBO import" : "Manual"}
          </span>
        ),
      },
      {
        key: "posted_opening_balance_cents",
        label: "On account now",
        className: "text-right",
        cellClass: "text-right tabular-nums text-gray-500",
        render: (row) =>
          row.posted_opening_balance_cents === null ? "—" : formatUsdCents(row.posted_opening_balance_cents),
      },
      {
        key: "amount_cents",
        label: "Staged balance",
        alwaysVisible: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => (
          <AmountCell
            row={row}
            disabled={patchLine.isPending}
            onSave={(account_id, amount_cents) => patchLine.mutate({ account_id, amount_cents })}
          />
        ),
      },
      {
        key: "debit_or_credit",
        label: "Dr/Cr",
        cellClass: "text-xs uppercase text-gray-500",
        render: (row) => row.debit_or_credit ?? "—",
      },
    ],
    [patchLine],
  );

  const totals = view?.totals;
  const blockers = view?.commit_blockers ?? [];
  const canImport = view?.import_source === "qbo";

  const kpiStrip = view ? (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[
        { label: "As of", value: formatDateUS(view.as_of_date) || view.as_of_date },
        { label: "Total debits", value: formatUsdCents(totals?.total_debits_cents ?? 0) },
        { label: "Total credits", value: formatUsdCents(totals?.total_credits_cents ?? 0) },
        {
          label: "Opening Balance Equity",
          value: formatUsdCents(totals?.obe_residual_cents ?? 0),
        },
      ].map((kpi) => (
        <div key={kpi.label} className="rounded-sm border border-gray-200 bg-white px-3 py-2">
          <p className="text-xs text-gray-500">{kpi.label}</p>
          <p className="text-sm font-semibold tabular-nums text-gray-900">{kpi.value}</p>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <AccountingSubNavWrapper
      title="Opening Balance Register"
      subtitle={
        view
          ? `${view.company_code} · as of ${view.as_of_date} · ${view.period_basis}`
          : "Import, review and commit per-account opening balances"
      }
      kpiStrip={kpiStrip}
      actions={
        <>
          <button
            type="button"
            disabled={!canImport || importFromQbo.isPending || !operatingCompanyId}
            onClick={() => importFromQbo.mutate()}
            title={canImport ? undefined : "This entity has no QuickBooks connection — enter balances by hand"}
            className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            {importFromQbo.isPending ? "Importing…" : "Import from QBO"}
          </button>
          <button
            type="button"
            disabled={commit.isPending || !operatingCompanyId}
            onClick={() => commit.mutate()}
            className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1 text-sm font-semibold text-white hover:bg-[#0f1729] disabled:opacity-40"
          >
            {commit.isPending ? "Committing…" : "Commit opening balances"}
          </button>
        </>
      }
    >
      {banner ? (
        <p
          className={`rounded-sm border px-3 py-2 text-sm ${
            banner.tone === "ok" ? "border-slate-200 bg-slate-100 text-slate-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      {registerQuery.isError ? (
        <p className="py-2 text-center text-sm text-red-600">Failed to load the opening balance register.</p>
      ) : null}

      {view ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Source period finality</p>
              <p className="text-sm text-gray-600">
                {view.finality.is_final
                  ? `Marked final${view.finality.set_by_name ? ` by ${view.finality.set_by_name}` : ""}${
                      view.finality.set_at ? ` on ${formatDateUS(view.finality.set_at)}` : ""
                    }. Committing is permitted.`
                  : "Not final. The commit is refused until the accountant confirms the QuickBooks cleanup for this entity and period is done."}
              </p>
            </div>
            <button
              type="button"
              disabled={setFinality.isPending || !operatingCompanyId}
              onClick={() => setFinality.mutate(!view.finality.is_final)}
              className="rounded-sm border border-gray-300 px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >
              {view.finality.is_final ? "Mark not final" : "Mark source final"}
            </button>
          </div>

          {blockers.length > 0 ? (
            <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm font-medium text-slate-700">
              {blockers.map((b) => (
                <li key={b}>· {BLOCKER_COPY[b]}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-slate-600">
              Nothing is blocking the commit. It will write {view.totals.staged_line_count} account
              {view.totals.staged_line_count === 1 ? "" : "s"} as of {view.as_of_date}.
            </p>
          )}

          {canImport && !view.qbo_import_flag_on ? (
            <p className="mt-2 text-xs text-gray-500">
              The QuickBooks opening-balance import is switched off for this entity. Manual entry and commit still work.
            </p>
          ) : null}
        </div>
      ) : null}

      <ParityTable
        columns={columns}
        rows={view?.lines ?? []}
        rowKey={(row) => row.account_id}
        loading={registerQuery.isPending}
        storageKey="accounting-opening-balance-register"
        initialPageSize={100}
        emptyText="No opening balances staged yet. Import from QuickBooks, or enter them by hand."
      />

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold text-gray-900">Audit trail</p>
        <p className="text-xs text-gray-500">
          Every import, edit, finality change, refused commit and commit is recorded and cannot be altered or deleted.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          {(auditQuery.data?.events ?? []).slice(0, 25).map((event) => (
            <li key={event.id} className="border-b border-gray-100 pb-1 last:border-b-0">
              <span className="font-medium">{event.event_type}</span>
              {event.account_name ? ` · ${event.account_name}` : ""}
              {event.actor_name ? ` · ${event.actor_name}` : ""}
              {event.detail ? ` — ${event.detail}` : ""}
              <span className="ml-1 text-xs text-gray-400">{formatDateUS(event.created_at)}</span>
            </li>
          ))}
          {(auditQuery.data?.events ?? []).length === 0 ? (
            <li className="text-gray-500">No activity on this period yet.</li>
          ) : null}
        </ul>
      </div>
    </AccountingSubNavWrapper>
  );
}

export default OpeningBalanceRegisterPage;
