import { PageHeader } from "../../components/layout/PageHeader";
import { RUNBOOKS } from "./runbooks-data";

export { RUNBOOKS } from "./runbooks-data";

// Bundle runbook markdown files via Vite's import.meta.glob with eager loading.
// Includes docs/runbooks/operational-tuning-catalog.md (see ./runbooks-data), rendered below.
// Path is relative to this file (apps/frontend/src/pages/help/) -> repo-root docs/runbooks
// needs 5 levels up (help -> pages -> src -> frontend -> apps -> root), not 3.
const runbookModules = import.meta.glob("../../../../../docs/runbooks/*.md", {
  query: "?url",
  import: "default",
  eager: true,
});

export function RunbooksIndex() {
  return (
    <div className="space-y-4" data-testid="runbooks-index">
      <PageHeader breadcrumb={["Help", "Runbooks"]} title="Operator runbooks" subtitle="Step-by-step procedures for recurring office workflows" />
      <ul className="grid gap-3 md:grid-cols-2">
        {RUNBOOKS.map((rb) => {
          const moduleKey = `../../../../../${rb.docPath}`;
          const runbookUrl = runbookModules[moduleKey] as string | undefined;
          return (
            <li key={rb.slug} className="rounded-sm border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                {runbookUrl ? (
                  <a
                    href={runbookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-slate-700 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    {rb.title}
                  </a>
                ) : (
                  <span className="text-sm font-semibold text-gray-400">{rb.title} (file not found)</span>
                )}
                <span className="shrink-0 rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{rb.frequency}</span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{rb.description}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
