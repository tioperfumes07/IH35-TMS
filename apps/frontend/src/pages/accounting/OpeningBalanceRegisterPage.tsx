import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import {
  cloneAsIsImportAndCommit,
  commitOpeningBalanceRegister,
  getOpeningBalanceRegister,
  getOpeningBalanceRegisterAudit,
  importOpeningBalancesFromFixture,
  importOpeningBalancesFromQbo,
  patchOpeningBalanceLine,
  setOpeningBalanceSourceFinality,
  type ObCommitBlocker,
  type ObRegisterLine,
} from "../../api/opening-balance-register";

/**
 * OB-01 — Opening Balance Register.
 *
 * Owner ruling 2026-07-29: balances are LIVE and CHANGE — there is no finality gate. Three columns
 * per account: QBO Snapshot (read-only, refreshed by re-import) | Adjustment (owner/accountant
 * editable, persists across re-import) | Adjusted Opening (= Snapshot + Adjustment, the value a
 * commit writes to the account). The commit button is deliberately not "disabled and unexplained":
 * every reason the backend would refuse is listed. The backend re-checks all of them — this screen
 * never decides.
 */
const BLOCKER_COPY: Record<ObCommitBlocker, string> = {
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

function AdjustmentCell({
  row,
  disabled,
  onSave,
}: {
  row: ObRegisterLine;
  disabled: boolean;
  onSave: (accountId: string, cents: number) => void;
}) {
  const [draft, setDraft] = useState(() => centsToInput(row.adjustment_cents));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(centsToInput(row.adjustment_cents));
  }, [row.adjustment_cents]);

  const commitDraft = () => {
    const cents = inputToCents(draft);
    if (cents === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (cents !== row.adjustment_cents) onSave(row.account_id, cents);
  };

  return (
    <input
      value={draft}
      disabled={disabled}
      aria-label={`Adjustment for ${row.account_name}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitDraft();
      }}
      className={`w-32 rounded-sm border px-2 py-1 text-right text-xs tabular-nums disabled:bg-gray-50 ${
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
    mutationFn: (input: { account_id: string; adjustment_cents: number }) =>
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
        text: `Refreshed the QBO Snapshot for ${result.staged_count} account${result.staged_count === 1 ? "" : "s"} as of ${result.as_of_date} (Adjustments preserved)${
          result.unmapped.length > 0 ? ` · ${result.unmapped.length} line(s) could not be mapped and were not staged` : ""
        }`,
      });
      refresh();
    },
    onError,
  });

  const importFromFixture = useMutation({
    mutationFn: () => importOpeningBalancesFromFixture(operatingCompanyId),
    onSuccess: (result) => {
      setBanner({
        tone: "ok",
        text: `Refreshed the QBO Snapshot for ${result.staged_count} account${result.staged_count === 1 ? "" : "s"} from the clone-as-is fixture as of ${result.as_of_date}${
          result.unmapped.length > 0 ? ` · ${result.unmapped.length} line(s) had no matching account and were not staged` : ""
        }`,
      });
      refresh();
    },
    onError,
  });

  const cloneAsIs = useMutation({
    mutationFn: () => cloneAsIsImportAndCommit(operatingCompanyId),
    onSuccess: (result) => {
      if (result.commit.committed) {
        setBanner({
          tone: "ok",
          text: `Clone-as-is: imported from ${result.import_source} and committed ${result.commit.accounts_written} account${result.commit.accounts_written === 1 ? "" : "s"} as of ${result.as_of_date}, Adjustment 0.`,
        });
      } else {
        setBanner({
          tone: "error",
          text: `Clone-as-is imported ${result.staged_count} line(s) from ${result.import_source} but the commit was refused: ${(result.commit.blockers ?? []).join(", ") || "unknown"}`,
        });
      }
      refresh();
    },
    onError: (error: unknown) => {
      onError(error);
      refresh();
    },
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
        render: (row) => (
          <EntityLink
            kind="account"
            id={row.account_id}
            label={entityLabel(row.account_name, row.account_id, "Account")}
          />
        ),
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
        key: "qbo_snapshot_cents",
        label: "QBO Snapshot",
        className: "text-right",
        cellClass: "text-right tabular-nums text-gray-700",
        render: (row) => (row.qbo_snapshot_cents === null ? "—" : formatUsdCents(row.qbo_snapshot_cents)),
      },
      {
        key: "adjustment_cents",
        label: "Adjustment",
        alwaysVisible: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => (
          <AdjustmentCell
            row={row}
            disabled={patchLine.isPending}
            onSave={(account_id, adjustment_cents) => patchLine.mutate({ account_id, adjustment_cents })}
          />
        ),
      },
      {
        key: "amount_cents",
        label: "Adjusted Opening",
        alwaysVisible: true,
        className: "text-right",
        cellClass: "text-right tabular-nums font-semibold text-gray-900",
        render: (row) => formatUsdCents(row.amount_cents),
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
  const canImportFixture = view?.company_code === "TRANSP";

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
          <p className="text-xs font-semibold tabular-nums text-gray-900">{kpi.value}</p>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <AccountingSubNavWrapper
      title="Opening Balance Register"
      subtitle={
        view
          ? `${view.company_code} · as of ${view.as_of_date} · ${view.period_basis} · balances are live and adjustable — no finality lock`
          : "Import, adjust and commit per-account opening balances — Snapshot | Adjustment | Adjusted Opening"
      }
      kpiStrip={kpiStrip}
      actions={
        <>
          {canImportFixture ? (
            <button
              type="button"
              disabled={cloneAsIs.isPending || !operatingCompanyId}
              onClick={() => cloneAsIs.mutate()}
              title="Import the QBO/fixture snapshot AND commit it now, Adjustment 0 — no maker/checker pair required"
              className="rounded-sm border border-slate-700 bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {cloneAsIs.isPending ? "Cloning…" : "Clone-as-is import + commit"}
            </button>
          ) : null}
          {canImportFixture ? (
            <button
              type="button"
              disabled={importFromFixture.isPending || !operatingCompanyId}
              onClick={() => importFromFixture.mutate()}
              title="Refresh the QBO Snapshot column from the owner-provided fixture — Adjustments are preserved"
              className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >
              {importFromFixture.isPending ? "Importing…" : "Refresh Snapshot from fixture"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canImport || importFromQbo.isPending || !operatingCompanyId}
            onClick={() => importFromQbo.mutate()}
            title={canImport ? "Refresh the QBO Snapshot column — Adjustments are preserved" : "This entity has no QuickBooks connection — enter balances by hand"}
            className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            {importFromQbo.isPending ? "Importing…" : "Refresh Snapshot from QBO"}
          </button>
          <button
            type="button"
            disabled={commit.isPending || !operatingCompanyId}
            onClick={() => commit.mutate()}
            className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:opacity-40"
          >
            {commit.isPending ? "Committing…" : "Commit opening balances"}
          </button>
        </>
      }
    >
      {banner ? (
        <p
          className={`rounded-sm border px-3 py-2 text-xs ${
            banner.tone === "ok" ? "border-slate-200 bg-slate-100 text-slate-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      {registerQuery.isError ? (
        <p className="py-2 text-center text-xs text-red-600">Failed to load the opening balance register.</p>
      ) : null}

      {view ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-900">
                Source period cleanup{" "}
                <span className="ml-1 rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-500">
                  advisory only — does not block commit
                </span>
              </p>
              <p className="text-xs text-gray-600">
                {view.finality.is_final
                  ? `Marked final${view.finality.set_by_name ? ` by ${view.finality.set_by_name}` : ""}${
                      view.finality.set_at ? ` on ${formatDateUS(view.finality.set_at)}` : ""
                    }. Balances are live and can still be adjusted and re-committed at any time.`
                  : "Not yet marked final by the accountant. This is Martin's own tracking note — it no longer blocks committing; balances are live and change (owner ruling 2026-07-29)."}
              </p>
            </div>
            <button
              type="button"
              disabled={setFinality.isPending || !operatingCompanyId}
              onClick={() => setFinality.mutate(!view.finality.is_final)}
              className="rounded-sm border border-gray-300 px-3 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >
              {view.finality.is_final ? "Mark not final" : "Mark source final"}
            </button>
          </div>

          {blockers.length > 0 ? (
            <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs font-medium text-slate-700">
              {blockers.map((b) => (
                <li key={b}>· {BLOCKER_COPY[b]}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-slate-600">
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
        emptyText="No opening balances staged yet. Import from QuickBooks (or the clone-as-is fixture), or enter them by hand."
      />

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold text-gray-900">Audit trail</p>
        <p className="text-xs text-gray-500">
          Every import, edit, finality change, refused commit and commit is recorded and cannot be altered or deleted.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-gray-700">
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
