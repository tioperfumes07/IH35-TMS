import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { getAllHelpArticles, helpArticlesByCategory, searchHelpArticles, type HelpCategory } from "../../help/helpCenterContent";

const CATEGORY_ORDER: HelpCategory[] = [
  "Getting Started",
  "Dispatching Loads",
  "Driver Settlements",
  "Banking & Reconciliation",
  "Reports",
  "Account & Billing",
];

export function HelpCenterPage() {
  const [q, setQ] = useState("");
  const all = useMemo(() => getAllHelpArticles(), []);
  const trimmed = q.trim();
  const results = useMemo(() => (trimmed ? searchHelpArticles(trimmed, all) : null), [trimmed, all]);
  const byCat = useMemo(() => helpArticlesByCategory(), []);

  return (
    <div className="space-y-4">
      <PageHeader title="Help center" subtitle="Guides for dispatch, finance, and account tasks" />
      <div>
        <label htmlFor="help-search" className="sr-only">
          Search help articles
        </label>
        <input
          id="help-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or keywords…"
          className="w-full max-w-xl rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        />
      </div>

      {results ? (
        <section aria-label="Search results">
          <h2 className="text-sm font-semibold text-gray-800">Results</h2>
          {results.length === 0 ? <p className="text-sm text-gray-600">No articles matched.</p> : null}
          <ul className="mt-2 space-y-2">
            {results.map((a) => (
              <li key={a.slug}>
                <Link
                  to={`/help/${a.slug}`}
                  className="text-sm font-medium text-slate-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  {a.title}
                </Link>
                <span className="ml-2 text-xs text-gray-500">{a.category}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {CATEGORY_ORDER.map((cat) => (
            <section key={cat} className="rounded border border-gray-200 bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">{cat}</h2>
              <ul className="mt-2 space-y-1">
                {(byCat[cat] ?? []).map((a) => (
                  <li key={a.slug}>
                    <Link
                      to={`/help/${a.slug}`}
                      className="text-sm text-slate-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      {a.title}
                    </Link>
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
