import { useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import {
  MODULE_COMPLETION,
  FIRST_14_MODULE_IDS,
  type ModuleCompletionItem,
} from "../../generated/module-completion";
import { SIDEBAR_ITEM_IDS } from "../../components/layout/sidebar-config";

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

type ModuleRow = {
  id: string;
  label: string;
  done: number;
  total: number;
  defined: boolean;
  items: ModuleCompletionItem[];
};

const MODULE_LABELS: Record<string, string> = {
  "driver-hub": "Driver Hub",
  "cash-flow": "Cash Flow",
  eld: "ELD",
  form_425: "Form 425",
};

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
      items: m?.items ?? [],
    };
  });
}

function ProgressBar({ done, total, defined }: { done: number; total: number; defined: boolean }) {
  if (!defined) {
    // An undefined module is NOT drawn as an empty bar. An empty bar reads as "0% built", which is a
    // different and false claim: these modules have working screens, they just have no agreed list of
    // what "complete" means, so no honest number exists to draw.
    return <span className="text-xs italic text-[#64748b]">not yet defined</span>;
  }
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-sm bg-gray-200">
        <div className="h-full bg-[#1f2a44]" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs text-[#334155]">
        {done} of {total}
      </span>
    </div>
  );
}

export function ModuleCompletionPage() {
  const [scope, setScope] = useState<"first14" | "all">("first14");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const ids = scope === "first14" ? FIRST_14_MODULE_IDS : [...SIDEBAR_ITEM_IDS];
    return buildRows(ids);
  }, [scope]);

  const defined = rows.filter((r) => r.defined);
  const totals = defined.reduce(
    (acc, r) => ({ done: acc.done + r.done, total: acc.total + r.total }),
    { done: 0, total: 0 }
  );
  const undefinedCount = rows.length - defined.length;

  const columns = useMemo<Array<ParityColumn<ModuleRow>>>(
    () => [
      {
        key: "label",
        label: "Module",
        sortable: true,
        render: (row) => <span className="font-medium text-[#1f2a44]">{row.label}</span>,
      },
      {
        key: "progress",
        label: "Acceptance items passing",
        render: (row) => <ProgressBar done={row.done} total={row.total} defined={row.defined} />,
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
          row.defined && row.total > row.done ? (
            <button
              type="button"
              className="text-xs text-[#1f2a44] underline"
              onClick={() => setExpanded((cur) => (cur === row.id ? null : row.id))}
            >
              {expanded === row.id ? "Hide open items" : "Show open items"}
            </button>
          ) : null,
      },
    ],
    [expanded]
  );

  const expandedRow = rows.find((r) => r.id === expanded);
  const openItems = (expandedRow?.items ?? []).filter((i) => i.status !== "PASS");

  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: "Program", href: "/program" }, { label: "Module Completion" }]} />
      <PageHeader title="Module Completion" />

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

      <ParityTable<ModuleRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyText="No modules found."
        storageKey="program-module-completion"
        exportFilename="module-completion"
      />

      {expandedRow && openItems.length > 0 ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-[#1f2a44]">
            {expandedRow.label} — {openItems.length} open item
            {openItems.length === 1 ? "" : "s"}
          </div>
          <ul className="space-y-1">
            {openItems.map((item) => (
              <li key={item.id} className="flex gap-2 text-xs text-[#334155]">
                <span className="w-28 shrink-0 font-mono text-[#64748b]">{item.id}</span>
                <span
                  className={`w-24 shrink-0 font-semibold ${
                    item.status === "FAIL" ? "text-[#dc2626]" : "text-[#64748b]"
                  }`}
                >
                  {item.status}
                </span>
                <span>{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
