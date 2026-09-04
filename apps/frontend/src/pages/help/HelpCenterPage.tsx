import { useMemo, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { EntityLink } from "../../components/shared/EntityLink";
import { getAllHelpArticles, helpArticlesByCategory, searchHelpArticles, type HelpCategory } from "../../help/helpCenterContent";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { SelectCombobox } from "../../components/Combobox";

const CATEGORY_ORDER: HelpCategory[] = [
  "Getting Started",
  "Dispatching Loads",
  "Driver Settlements",
  "Banking & Reconciliation",
  "Reports",
  "Account & Billing",
  // Audit gap #18 — content exists in helpCenterContent; must stay in render order.
  "Module Guides",
  // HELP-S01 — 8th category (auditor 2026-08-01): Driver App was folded under Module Guides.
  "Driver App",
];

export function HelpCenterPage() {
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<HelpCategory | "">("");
  const staged = useStagedListFilters({
    applied: { categoryFilter },
    empty: { categoryFilter: "" as HelpCategory | "" },
    onApply: (next) => setCategoryFilter(next.categoryFilter),
  });
  const all = useMemo(() => getAllHelpArticles(), []);
  const trimmed = q.trim();
  const results = useMemo(() => (trimmed ? searchHelpArticles(trimmed, all) : null), [trimmed, all]);
  const byCat = useMemo(() => helpArticlesByCategory(), []);
  const visibleCategories = useMemo(
    () => (categoryFilter ? CATEGORY_ORDER.filter((c) => c === categoryFilter) : CATEGORY_ORDER),
    [categoryFilter],
  );

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={["Help"]} title="Help center" subtitle="Guides for dispatch, finance, and account tasks" />
      <div>
        <label htmlFor="help-search" className="sr-only">
          Search help articles
        </label>
        <input
          id="help-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or keywords…"
          className="w-full max-w-xl rounded-sm border border-gray-300 px-3 py-2 text-xs text-gray-900 shadow-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
        />
      </div>

      <CollapsedListFilters
        activeFilterCount={categoryFilter ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="help-center"
        dataAttributes={{ "data-help-center-filter-toolbar": "collapsed" }}
      >
        <label className="text-xs text-gray-700">
          Category{" "}
          <SelectCombobox
            className="ml-1 rounded-sm border px-2 py-1"
            value={staged.draft.categoryFilter}
            onChange={(e) => staged.setDraft({ categoryFilter: e.target.value as HelpCategory | "" })}
          >
            <option value="">All categories</option>
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </SelectCombobox>
        </label>
      </CollapsedListFilters>

      {results ? (
        <section aria-label="Search results">
          <h2 className="text-xs font-semibold text-gray-800">Results</h2>
          {results.length === 0 ? <p className="text-xs text-gray-600">No articles matched.</p> : null}
          <ul className="mt-2 space-y-2">
            {results
              .filter((a) => !categoryFilter || a.category === categoryFilter)
              .map((a) => (
                <li key={a.slug}>
                  <EntityLink
                    kind="help_article"
                    id={a.slug}
                    label={a.title}
                    className="text-xs font-medium text-slate-700 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
                  />
                  <span className="ml-2 text-xs text-gray-500">{a.category}</span>
                </li>
              ))}
          </ul>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleCategories.map((cat) => (
            <section key={cat} className="rounded-sm border border-gray-200 bg-white p-4">
              <h2 className="text-xs font-semibold text-gray-900">{cat}</h2>
              <ul className="mt-2 space-y-1">
                {(byCat[cat] ?? []).map((a) => (
                  <li key={a.slug}>
                    <EntityLink
                      kind="help_article"
                      id={a.slug}
                      label={a.title}
                      className="text-xs text-slate-700 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
