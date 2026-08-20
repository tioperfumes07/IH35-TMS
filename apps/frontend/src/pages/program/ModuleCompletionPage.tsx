import { useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import {
  MODULE_COMPLETION,
  FIRST_14_MODULE_IDS,
  type ModuleCompletionItem,
  type ModuleCompletionProof,
} from "../../generated/module-completion";
import { SIDEBAR_ITEM_IDS } from "../../components/layout/sidebar-config";

type ProofFilter = "all" | ModuleCompletionProof | "undefined";

// Module Completion — the build scoreboard, in the product.
//
// docs/module-completion/*.json has been the source of truth for "N of M" per module and is enforced
// in CI, but nothing in the app read it. The only way to see whether a module was advancing was to run
// a script, so months of work were invisible from the screen. Progress you cannot see reads as no
// progress. This surfaces it: every module, how many of its acceptance items pass, and exactly which
// ones are still open.
//
// Additive: a new route under the existing Program module. No sidebar item is added, so the locked
// sidebar count is untouched.
//
// Proof law (2026-08-04): complete:true / all-PASS is CODE-VERIFIED only. CERTIFIED (navy solid)
// requires every item prod_verified:true after a live GUARD click. Never paint complete:true as
// certified — that was the false-green scoreboard defect.

type ModuleRow = {
  id: string;
  label: string;
  done: number;
  total: number;
  defined: boolean;
  complete: boolean;
  prodVerifiedCount: number;
  proof: ModuleCompletionProof | "undefined";
  items: ModuleCompletionItem[];
};

const MODULE_LABELS: Record<string, string> = {
  "driver-hub": "Driver Hub",
  "cash-flow": "Cash Flow",
  eld: "ELD",
  form_425: "Form 425",
};

/** §7 navy — never blue. */
const NAVY = "#1f2a44";
const SLATE = "#64748b";
const AMBER = "#92400e";

function labelFor(id: string): string {
  if (MODULE_LABELS[id]) return MODULE_LABELS[id];
  return id
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function buildRows(ids: readonly string[]): ModuleRow[] {
  return ids.map((id) => {
    const m = MODULE_COMPLETION.find((x) => x.id === id);
    return {
      id,
      label: labelFor(id),
      done: m?.done ?? 0,
      total: m?.total ?? 0,
      defined: Boolean(m),
      complete: m?.complete === true,
      prodVerifiedCount: m?.prod_verified_count ?? 0,
      proof: m ? m.proof : "undefined",
      items: m?.items ?? [],
    };
  });
}

function ProofBadge({ proof }: { proof: ModuleRow["proof"] }) {
  if (proof === "undefined") {
    return <span className="text-xs italic text-[#64748b]">not yet defined</span>;
  }
  if (proof === "certified") {
    return (
      <span
        className="inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
        style={{ backgroundColor: NAVY }}
        title="Every acceptance item is prod_verified after a live GUARD click"
      >
        Certified
      </span>
    );
  }
  if (proof === "code_verified") {
    return (
      <span
        className="inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ borderColor: AMBER, color: AMBER, backgroundColor: "#fffbeb" }}
        title="Checklist PASS by code/CI — not yet live-proven on prod (prod_verified still false)"
      >
        Code-verified
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold tabular-nums" style={{ color: SLATE }}>
      In progress
    </span>
  );
}

function ProgressBar({
  done,
  total,
  defined,
  proof,
  prodVerifiedCount,
}: {
  done: number;
  total: number;
  defined: boolean;
  proof: ModuleRow["proof"];
  prodVerifiedCount: number;
}) {
  if (!defined) {
    // An undefined module is NOT drawn as an empty bar. An empty bar reads as "0% built", which is a
    // different and false claim: these modules have working screens, they just have no agreed list of
    // what "complete" means, so no honest number exists to draw.
    return <span className="text-xs italic text-[#64748b]">not yet defined</span>;
  }
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  // Certified = solid navy fill. Code-verified = slate fill (never the same as certified navy solid).
  // In-progress = navy partial (acceptance progress), with prod line called out separately.
  const fill =
    proof === "certified" ? NAVY : proof === "code_verified" ? SLATE : NAVY;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <div className="h-2 w-32 overflow-hidden rounded-sm bg-gray-200">
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: fill }} />
        </div>
        <span className="tabular-nums text-xs text-[#334155]">
          {done} of {total}
        </span>
      </div>
      <span className="tabular-nums text-[10px] text-[#64748b]">
        live-proven {prodVerifiedCount} of {total}
      </span>
    </div>
  );
}

export function ModuleCompletionPage() {
  const [scope, setScope] = useState<"first14" | "all">("first14");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [proofFilter, setProofFilter] = useState<ProofFilter>("all");
  const staged = useStagedListFilters({
    applied: { proofFilter },
    empty: { proofFilter: "all" as ProofFilter },
    onApply: (next) => setProofFilter(next.proofFilter),
  });

  const rows = useMemo(() => {
    const ids = scope === "first14" ? FIRST_14_MODULE_IDS : [...SIDEBAR_ITEM_IDS];
    return buildRows(ids);
  }, [scope]);

  const filteredRows = useMemo(() => {
    if (proofFilter === "all") return rows;
    return rows.filter((row) => row.proof === proofFilter);
  }, [rows, proofFilter]);

  const defined = rows.filter((r) => r.defined);
  const totals = defined.reduce(
    (acc, r) => ({
      done: acc.done + r.done,
      total: acc.total + r.total,
      prod: acc.prod + r.prodVerifiedCount,
    }),
    { done: 0, total: 0, prod: 0 }
  );
  const undefinedCount = rows.length - defined.length;
  const certifiedCount = defined.filter((r) => r.proof === "certified").length;
  const codeVerifiedCount = defined.filter((r) => r.proof === "code_verified").length;

  const columns = useMemo<Array<ParityColumn<ModuleRow>>>(
    () => [
      {
        key: "label",
        label: "Module",
        sortable: true,
        render: (row) => <span className="font-medium text-[#1f2a44]">{row.label}</span>,
      },
      {
        key: "proof",
        label: "Proof",
        sortable: true,
        render: (row) => <ProofBadge proof={row.proof} />,
      },
      {
        key: "progress",
        label: "Acceptance items",
        render: (row) => (
          <ProgressBar
            done={row.done}
            total={row.total}
            defined={row.defined}
            proof={row.proof}
            prodVerifiedCount={row.prodVerifiedCount}
          />
        ),
      },
      {
        key: "open",
        label: "Open",
        sortable: true,
        render: (row) => (row.defined ? String(row.total - row.done) : "—"),
      },
      {
        key: "detail",
        label: "",
        render: (row) =>
          row.defined ? (
            <button
              type="button"
              className="text-xs text-[#1f2a44] underline"
              onClick={() => setExpanded((cur) => (cur === row.id ? null : row.id))}
            >
              {expanded === row.id ? "Hide items" : "Show items"}
            </button>
          ) : null,
      },
    ],
    [expanded]
  );

  const expandedRow = rows.find((r) => r.id === expanded);
  const detailItems = expandedRow?.items ?? [];

  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: "Program", href: "/program" }, { label: "Module Completion" }]} />
      <PageHeader title="Module Completion" />
      <p
        className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700"
        data-testid="module-completion-honest-purpose"
      >
        This is Rule 24&apos;s <b>N of M</b> checklist from <code>docs/module-completion/*.json</code> — CI
        items, not USMCA launch. <b>Code-verified</b> = repo/CI says the item passed. <b>Certified</b> =
        GUARD live-clicked it. Launch 100% is Module matrix Box 1–4 + money on USMCA, then Scenario
        tracker. Frozen TRANSP/TRK rows here are historical.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`rounded-sm px-2 py-1 text-xs font-semibold ${
            scope === "first14" ? "bg-[#1f2a44] text-white" : "border border-gray-300 text-[#334155]"
          }`}
          onClick={() => setScope("first14")}
        >
          First 14 modules
        </button>
        <button
          type="button"
          className={`rounded-sm px-2 py-1 text-xs font-semibold ${
            scope === "all" ? "bg-[#1f2a44] text-white" : "border border-gray-300 text-[#334155]"
          }`}
          onClick={() => setScope("all")}
        >
          All modules
        </button>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs text-[#334155]">
        <span className="font-semibold text-[#1f2a44]">
          {totals.done} of {totals.total}
        </span>{" "}
        acceptance items passing across {defined.length} module
        {defined.length === 1 ? "" : "s"} with a defined scope.
        {" "}
        <span className="font-semibold text-[#1f2a44]">{totals.prod} of {totals.total}</span>{" "}
        live-proven (<code className="text-[10px]">prod_verified</code>).
        {" "}
        <span className="font-semibold" style={{ color: NAVY }}>
          {certifiedCount} certified
        </span>
        {" · "}
        <span className="font-semibold" style={{ color: AMBER }}>
          {codeVerifiedCount} code-verified only
        </span>
        {undefinedCount > 0 ? (
          <>
            {" "}
            <span className="font-semibold text-[#dc2626]">{undefinedCount}</span> module
            {undefinedCount === 1 ? " has" : "s have"} no acceptance list yet — until one exists,
            &ldquo;complete&rdquo; has no definition for {undefinedCount === 1 ? "it" : "them"} and
            no honest percentage can be shown.
          </>
        ) : null}
      </div>

      <CollapsedListFilters
        activeFilterCount={proofFilter === "all" ? 0 : 1}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="program-modules"
        dataAttributes={{ "data-program-modules-filter-toolbar": "collapsed" }}
        className="rounded-sm border border-gray-200 bg-white p-2"
      >
        <label className="text-xs font-semibold text-slate-600">
          Proof status
          <select
            className="mt-1 w-full max-w-xs rounded-sm border border-gray-300 px-2 py-1 text-xs"
            value={staged.draft.proofFilter}
            onChange={(event) =>
              staged.setDraft({ proofFilter: event.target.value as ProofFilter })
            }
            data-testid="program-modules-proof-filter"
          >
            <option value="all">All proofs</option>
            <option value="certified">Certified</option>
            <option value="code_verified">Code-verified</option>
            <option value="in_progress">In progress</option>
            <option value="undefined">Not yet defined</option>
          </select>
        </label>
      </CollapsedListFilters>

      <ParityTable<ModuleRow>
        columns={columns}
        rows={filteredRows}
        rowKey={(row) => row.id}
        emptyText="No modules match the applied filters."
        storageKey="program-module-completion"
        exportFilename="module-completion"
      />

      {expandedRow && detailItems.length > 0 ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-[#1f2a44]">
            {expandedRow.label} — {detailItems.length} item
            {detailItems.length === 1 ? "" : "s"}
          </div>
          <ul className="space-y-1">
            {detailItems.map((item) => (
              <li key={item.id} className="flex flex-wrap gap-2 text-xs text-[#334155]">
                <span className="w-28 shrink-0 font-mono text-[#64748b]">{item.id}</span>
                <span
                  className={`w-24 shrink-0 font-semibold ${
                    item.status === "FAIL"
                      ? "text-[#dc2626]"
                      : item.status === "PASS"
                        ? "text-[#1f2a44]"
                        : "text-[#64748b]"
                  }`}
                >
                  {item.status}
                </span>
                {item.status === "PASS" || item.status === "HOLD" ? (
                  item.prod_verified ? (
                    <span
                      className="w-28 shrink-0 text-[10px] font-bold uppercase"
                      style={{ color: NAVY }}
                    >
                      prod-verified
                    </span>
                  ) : (
                    <span
                      className="w-28 shrink-0 text-[10px] font-bold uppercase"
                      style={{ color: AMBER }}
                    >
                      code only
                    </span>
                  )
                ) : (
                  <span className="w-28 shrink-0 text-[10px] text-[#64748b]">—</span>
                )}
                <span>{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
