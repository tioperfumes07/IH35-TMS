#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":"^dispatch\\.loads_list\\.drafts$","task":"ROUND-24.2-LOADS-LIST-DRAFTS-VISIBLE"} */
/**
 * ROUND 24.2 (owner, 2026-09-14): "a saved draft load must be findable from the Loads list so the
 * booking can be finished" — supersedes claude/OWNER-REQUEST-REGISTER-2026-09-04.md row 13, "Live
 * loads only — drafts never appear." Static source-shape guard for the 5 build items, all on the
 * existing Loads list (no separate Drafts page):
 *   1. A "Drafts" filter pill on Dispatch.tsx, filtering status='draft' OR is_quicksave_draft=true
 *      (mdata/loads.routes.ts's own drafts_only override).
 *   2. A DRAFT badge on the row (DispatchBoard.tsx), independent of status.
 *   3. A count badge on Dispatch in the nav, fed by listQuicksaveDrafts (sidebar-config.ts +
 *      Sidebar.tsx) — that endpoint existed with zero callers before this round.
 *   4. A draft row's click opens the Book Load wizard to resume (Dispatch.tsx reuses
 *      BookLoadModalV4's existing editLoadId edit-mode prop — no new route).
 *   5. The row renders a real load number via the existing EntityLink/entityLabel path (unchanged
 *      -- verified NOT a bare dash/id for a real row, matching the ticket's own item 5).
 */
import fs from "node:fs";

const files = {
  backendRoutes: "apps/backend/src/mdata/loads.routes.ts",
  apiLoads: "apps/frontend/src/api/loads.ts",
  dispatchPage: "apps/frontend/src/pages/Dispatch.tsx",
  dispatchBoard: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  sidebarConfig: "apps/frontend/src/components/layout/sidebar-config.ts",
  sidebar: "apps/frontend/src/components/Sidebar.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(input = source) {
  const out = [];

  // 1. Backend drafts_only override + frontend pill wired to it.
  if (!/drafts_only:\s*z\.coerce\.boolean\(\)\.default\(false\)/.test(input.backendRoutes)) out.push("backend drafts_only query param missing");
  if (!/if \(drafts_only\) \{[\s\S]{0,1200}l\.status = 'draft' OR l\.is_quicksave_draft = true/.test(input.backendRoutes)) out.push("backend drafts_only filter override missing");
  if (!/drafts_only\?:\s*boolean/.test(input.apiLoads)) out.push("frontend LoadsListFilters.drafts_only missing");
  if (!/filters\.drafts_only\)\s*query\.set\("drafts_only"/.test(input.apiLoads)) out.push("frontend listLoads does not send drafts_only");
  if (!/data-testid="dispatch-drafts-pill"/.test(input.dispatchPage)) out.push("Dispatch.tsx Drafts pill missing");
  if (!/draftsOnly = searchParams\.get\("drafts"\) === "1"/.test(input.dispatchPage)) out.push("Dispatch.tsx draftsOnly state missing");
  if (!/drafts_only:\s*draftsOnly \|\| undefined/.test(input.dispatchPage)) out.push("Dispatch.tsx loadListFilters does not pass drafts_only");

  // 2. DRAFT badge, independent of status (checks is_quicksave_draft, not just status==='draft').
  if (!/is_quicksave_draft\?\?:\s*boolean/.test(input.apiLoads) && !/is_quicksave_draft\?:\s*boolean/.test(input.apiLoads)) out.push("DispatchLoadRow.is_quicksave_draft type missing");
  if (!/l\.is_quicksave_draft,/.test(input.backendRoutes)) out.push("backend list SELECT does not project is_quicksave_draft");
  if (!/const isDraft = load\.status === "draft" \|\| load\.is_quicksave_draft === true/.test(input.dispatchBoard)) out.push("DispatchBoard isDraft predicate missing");
  if (!/data-testid=\{`dispatch-draft-badge-\$\{load\.id\}`\}/.test(input.dispatchBoard)) out.push("DispatchBoard DRAFT badge missing");

  // 3. Nav count badge fed by listQuicksaveDrafts.
  if (!/badgeKey:\s*"dispatch_drafts"/.test(input.sidebarConfig)) out.push("sidebar-config dispatch badgeKey missing");
  if (!/import \{ listQuicksaveDrafts \} from "\.\.\/api\/dispatch"/.test(input.sidebar)) out.push("Sidebar.tsx does not import listQuicksaveDrafts");
  if (!/queryFn: \(\) => listQuicksaveDrafts\(selectedCompanyId!\)/.test(input.sidebar)) out.push("Sidebar.tsx does not call listQuicksaveDrafts");
  if (!/showDraftsBadge = meta\.badgeKey === "dispatch_drafts" && draftsBadgeCount > 0/.test(input.sidebar)) out.push("Sidebar.tsx showDraftsBadge predicate missing");
  if (!/data-testid="dispatch-nav-drafts-badge"/.test(input.sidebar)) out.push("Sidebar.tsx nav drafts badge render missing");

  // 4. Row click on a draft opens the wizard (editLoadId), never the LoadDetailDrawer.
  if (!/const isDraft = clicked \? clicked\.status === "draft" \|\| clicked\.is_quicksave_draft === true/.test(input.dispatchPage))
    out.push("Dispatch.tsx onRowClick draft detection missing");
  if (!/if \(isDraft\) \{\s*setEditLoadId\(id\);\s*openBookLoadModal\(\);\s*return;/.test(input.dispatchPage))
    out.push("Dispatch.tsx onRowClick does not route a draft to the wizard");
  if (!/editLoadId=\{editLoadId\}/.test(input.dispatchPage)) out.push("Dispatch.tsx BookLoadModal missing editLoadId prop");

  return out;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { key: "backendRoutes", from: "l.status = 'draft' OR l.is_quicksave_draft = true", to: "l.status = 'draft'", expect: "backend drafts_only filter override missing" },
    { key: "dispatchPage", from: 'data-testid="dispatch-drafts-pill"', to: 'data-testid="removed"', expect: "Dispatch.tsx Drafts pill missing" },
    { key: "dispatchBoard", from: 'const isDraft = load.status === "draft" || load.is_quicksave_draft === true;', to: 'const isDraft = load.status === "draft";', expect: "DispatchBoard isDraft predicate missing" },
    { key: "sidebar", from: 'showDraftsBadge = meta.badgeKey === "dispatch_drafts" && draftsBadgeCount > 0', to: "showDraftsBadge = false", expect: "Sidebar.tsx showDraftsBadge predicate missing" },
    { key: "dispatchPage", from: "if (isDraft) {\n                setEditLoadId(id);\n                openBookLoadModal();\n                return;\n              }", to: "", expect: "Dispatch.tsx onRowClick does not route a draft to the wizard" },
  ];
  let ok = true;
  for (const [i, m] of mutations.entries()) {
    const mutated = { ...source, [m.key]: source[m.key].replace(m.from, m.to) };
    if (mutated[m.key] === source[m.key]) {
      console.error(`verify-loads-list-drafts-visible SELFTEST FAIL — mutation ${i} matched nothing (needle drifted): ${m.from.slice(0, 60)}`);
      ok = false;
      continue;
    }
    if (!failures(mutated).includes(m.expect)) {
      console.error(`verify-loads-list-drafts-visible SELFTEST FAIL — mutation ${i} not caught: expected "${m.expect}"`);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
  console.log(`verify-loads-list-drafts-visible SELFTEST PASS — ${mutations.length}/${mutations.length} planted mutations caught`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-loads-list-drafts-visible FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-loads-list-drafts-visible PASS — Drafts pill, DRAFT badge, nav count badge, and draft-row-to-wizard all wired");
