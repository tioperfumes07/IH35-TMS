#!/usr/bin/env node
/**
 * LST-F10 — Driver Teams Lists surface must stay a REAL screen wired to the REAL backend.
 *
 * The defect this guard pins: apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx was a
 * 20-line prose placeholder ("CRUD API: /api/v1/driver-teams …") with ZERO data fetching, mounted
 * at /lists/driver/teams, while apps/backend/src/mdata/driver-teams.routes.ts (~545 lines) had no
 * callers at all. A user clicked the leaf and got an API description instead of a screen.
 *
 * Asserts (static):
 *  - DOD-A  the page actually fetches: useQuery + listMdataDriverTeams + <ParityTable>
 *  - DOD-A  loading / empty / error states are wired (ParityTable loading+emptyText, ListErrorBanner)
 *  - DOD-B  create + edit + membership-replace + deactivate all reach the client
 *  - DOD-C  entity scope: useCompanyContext → operating_company_id on the list read
 *  - DOD-D  void-not-delete: the client has NO DELETE method and no delete helper
 *  - VERIFY anti-phantom: EVERY /api/v1/mdata/driver-teams path the client calls is registered in
 *           driver-teams.routes.ts, and the client never falls back to the `/api/v1/driver-teams`
 *           split-percentage API (a different backend)
 *  - §7     vocabulary "+ Create" (never "+ New"/"+ Add"), locked palette (no purple/blue/pink/yellow)
 *  - additive: the /lists/driver/teams route still mounts <DriverTeamsPage /> and the Lists hub map
 *           carries the reachable "Driver Teams" leaf
 *
 *   node scripts/verify-lst-f10-driver-teams-surface.mjs
 *   node scripts/verify-lst-f10-driver-teams-surface.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-f10-driver-teams-surface";

const FILES = {
  page: "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx",
  modal: "apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx",
  api: "apps/frontend/src/api/driver-teams.ts",
  backend: "apps/backend/src/mdata/driver-teams.routes.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  hub: "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx",
};

const MISSING = " MISSING ";

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return MISSING;
    throw error;
  }
}

/** Comments describe the WRONG API on purpose (the split routes) — only executable code counts. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Every driver-team path the client actually calls, normalised to the backend's route shape. */
function clientDriverTeamPaths(apiCode) {
  const found = new Set();
  for (const match of apiCode.matchAll(/\/api\/v1\/mdata\/driver-teams[^`"'\s)]*/g)) {
    let route = match[0].split("?")[0];
    route = route.replace(/\$\{[^}]*\}/g, ":id").replace(/\/$/, "");
    found.add(route);
  }
  return [...found].sort();
}

const REQUIRED_CLIENT_PATHS = [
  "/api/v1/mdata/driver-teams",
  "/api/v1/mdata/driver-teams/:id",
  "/api/v1/mdata/driver-teams/:id/deactivate",
  "/api/v1/mdata/driver-teams/:id/replace-driver",
];

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,400}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];

  for (const [key, source] of Object.entries(src)) {
    if (source === MISSING) errors.push(`missing file: ${FILES[key] ?? key}`);
  }
  if (errors.length) return errors;

  const page = src.page;
  const modal = src.modal;
  const apiCode = stripComments(src.api);

  // ---- DOD-A: the page is a real, data-fetching screen (the pinned defect) -------------------
  if (page.includes("CRUD API:") || page.includes("Split percentages are authoritative")) {
    errors.push("DOD-A: DriverTeamsPage is back to the prose API-description placeholder");
  }
  if (!page.includes("useQuery")) {
    errors.push("DOD-A: DriverTeamsPage must fetch with useQuery (placeholder had ZERO data fetching)");
  }
  if (!page.includes("listMdataDriverTeams")) {
    errors.push("DOD-A: DriverTeamsPage must call listMdataDriverTeams (the built backend had no callers)");
  }
  if (!page.includes("<ParityTable")) {
    errors.push("DOD-A: DriverTeamsPage must render <ParityTable> (shared Lists table grammar)");
  }
  if (!/loading=\{/.test(page) || !/emptyText=/.test(page)) {
    errors.push("DOD-A: DriverTeamsPage must wire ParityTable loading + emptyText states");
  }
  if (!page.includes("ListErrorBanner")) {
    errors.push("DOD-A: DriverTeamsPage must render ListErrorBanner for the error state");
  }
  if (!page.includes("BackArrowHeader")) {
    errors.push("DOD-A: DriverTeamsPage must keep the BackArrowHeader (module header lock)");
  }

  // ---- DOD-C: entity scoping, the sibling Lists idiom ----------------------------------------
  if (!page.includes("useCompanyContext")) {
    errors.push("DOD-C: DriverTeamsPage must scope via useCompanyContext (no unscoped roster read)");
  }
  if (!page.includes("operating_company_id")) {
    errors.push("DOD-C: DriverTeamsPage must pass operating_company_id to the list read");
  }
  if (!apiCode.includes("operating_company_id")) {
    errors.push("DOD-C: driver-teams client must bind operating_company_id on the list read");
  }

  // ---- DOD-B: create + membership + soft removal ---------------------------------------------
  if (!page.includes("DriverTeamModal")) {
    errors.push("DOD-B: DriverTeamsPage must mount DriverTeamModal (create/edit surface)");
  }
  for (const fn of [
    "createMdataDriverTeam",
    "updateMdataDriverTeam",
    "deactivateMdataDriverTeam",
    "replaceMdataDriverTeamDriver",
  ]) {
    if (!modal.includes(fn)) {
      errors.push(`DOD-B: DriverTeamModal must wire ${fn} (create / edit / membership / soft-remove)`);
    }
  }

  // ---- DOD-D: void-not-delete ------------------------------------------------------------------
  if (/method:\s*["']DELETE["']/.test(apiCode)) {
    errors.push("DOD-D: void-not-delete — the driver-teams client must never issue a DELETE");
  }
  if (/export function delete[A-Z]/.test(apiCode)) {
    errors.push("DOD-D: void-not-delete — no delete helper may be exported from the driver-teams client");
  }

  // ---- anti-phantom: client paths must exist in the backend route file -------------------------
  const clientPaths = clientDriverTeamPaths(apiCode);
  for (const route of clientPaths) {
    if (!src.backend.includes(`"${route}"`)) {
      errors.push(`PHANTOM: client calls ${route} but driver-teams.routes.ts registers no such route`);
    }
  }
  for (const route of REQUIRED_CLIENT_PATHS) {
    if (!clientPaths.includes(route)) {
      errors.push(`DOD-B: driver-teams client lost the ${route} call`);
    }
  }
  if (/["'`]\/api\/v1\/driver-teams/.test(apiCode)) {
    errors.push("WRONG-BACKEND: driver-teams client must call /api/v1/mdata/driver-teams, not the split API");
  }

  // ---- shared-control locks (caught by locked-guards on the first push) --------------------------
  if (/type\s*=\s*["']date["']/.test(modal)) {
    errors.push("SHARED-CONTROL: DriverTeamModal must use <DatePicker>, never a raw <input type=\"date\">");
  }
  if (!modal.includes("DatePicker")) {
    errors.push("SHARED-CONTROL: DriverTeamModal must render the shared DatePicker for Effective From");
  }
  if (!modal.includes("DriverPickerWithCreate")) {
    errors.push("PICKER-LAW: DriverTeamModal must use DriverPickerWithCreate (inherits inline + Create driver)");
  }

  // ---- §7 product locks -------------------------------------------------------------------------
  if (!page.includes("+ Create")) {
    errors.push('§7 vocabulary: DriverTeamsPage must offer "+ Create"');
  }
  if (/\+ New\b/.test(page) || /\+ Add\b/.test(page) || /\+ New\b/.test(modal) || /\+ Add\b/.test(modal)) {
    errors.push('§7 vocabulary: "+ New" / "+ Add" are forbidden — use "+ Create"');
  }
  for (const [name, source] of [
    ["DriverTeamsPage", page],
    ["DriverTeamModal", modal],
  ]) {
    const banned = source.match(/\b(?:bg|text|border)-(?:purple|pink|indigo|violet|fuchsia|yellow|amber|blue)-\d{2,3}\b/g);
    if (banned) errors.push(`§7 palette: ${name} uses locked-out colors: ${[...new Set(banned)].join(", ")}`);
  }

  // ---- additive: route + hub reachability --------------------------------------------------------
  const block = routeBlock(src.manifest, "/lists/driver/teams");
  if (!block) errors.push("ADDITIVE: route /lists/driver/teams must not be removed");
  else if (!block.includes("<DriverTeamsPage")) {
    errors.push("ADDITIVE: /lists/driver/teams must keep mounting <DriverTeamsPage />");
  }
  if (!/name:\s*"Driver Teams"[^}]*catalogKey:\s*"teams"/.test(src.hub)) {
    errors.push('NAV: Lists hub map must carry { name: "Driver Teams", catalogKey: "teams" } so the leaf is reachable');
  }

  return errors;
}

function selftest() {
  const good = {
    page: [
      'import { useQuery } from "@tanstack/react-query";',
      'import { listMdataDriverTeams } from "../../../api/driver-teams";',
      "useCompanyContext();",
      "operating_company_id: companyId,",
      "<ListErrorBanner onRetry={() => void query.refetch()} />",
      "<BackArrowHeader backTo=\"/lists\" />",
      "<Button>+ Create</Button>",
      '<ParityTable loading={query.isLoading} emptyText="No driver teams found." />',
      "<DriverTeamModal open={modalOpen} />",
    ].join("\n"),
    modal: [
      "createMdataDriverTeam",
      "updateMdataDriverTeam",
      "deactivateMdataDriverTeam",
      "replaceMdataDriverTeamDriver",
      "<DriverPickerWithCreate operatingCompanyId={id} />",
      "<DatePicker value={form.effective_from} />",
    ].join("\n"),
    api: [
      "export function listMdataDriverTeams(params) {",
      "  const query = new URLSearchParams({ operating_company_id: params.operating_company_id });",
      "  return apiRequest(`/api/v1/mdata/driver-teams?${query.toString()}`);",
      "}",
      "export function getMdataDriverTeam(id) { return apiRequest(`/api/v1/mdata/driver-teams/${id}`); }",
      'export function createMdataDriverTeam(body) { return apiRequest(`/api/v1/mdata/driver-teams`, { method: "POST", body }); }',
      'export function updateMdataDriverTeam(id, body) { return apiRequest(`/api/v1/mdata/driver-teams/${id}`, { method: "PATCH", body }); }',
      'export function deactivateMdataDriverTeam(id) { return apiRequest(`/api/v1/mdata/driver-teams/${id}/deactivate`, { method: "POST" }); }',
      'export function replaceMdataDriverTeamDriver(id, body) { return apiRequest(`/api/v1/mdata/driver-teams/${id}/replace-driver`, { method: "POST", body }); }',
    ].join("\n"),
    backend: [
      'app.get("/api/v1/mdata/driver-teams", h);',
      'app.get("/api/v1/mdata/driver-teams/:id", h);',
      'app.post("/api/v1/mdata/driver-teams", h);',
      'app.patch("/api/v1/mdata/driver-teams/:id", h);',
      'app.post("/api/v1/mdata/driver-teams/:id/deactivate", h);',
      'app.post("/api/v1/mdata/driver-teams/:id/replace-driver", h);',
    ].join("\n"),
    manifest: 'path="/lists/driver/teams"\n<DriverTeamsPage />\n',
    hub: '{ name: "Driver Teams", description: "…", live: true, catalogKey: "teams" },',
  };
  const baseline = contractErrors(good);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, baseline);
    process.exit(1);
  }

  // The REAL pre-fix file, verbatim (git show d3c6a9d543:…DriverTeamsPage.tsx). The guard must
  // reject it — this is the defect itself, not a stand-in for its shape.
  const prefixPlaceholder = [
    'import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";',
    "",
    "export function DriverTeamsPage() {",
    "  return (",
    '    <div className="mx-auto max-w-5xl space-y-3">',
    "      <BackArrowHeader",
    '        backTo="/lists"',
    '        breadcrumb={["Lists & Catalogs", "Driver", "Driver Teams"]}',
    '        title="Driver teams"',
    "      />",
    '      <p className="text-sm text-gray-500">Team loads + settlement splits (alias API)</p>',
    '      <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-700">',
    '        <p className="mb-2">',
    '          CRUD API: <span className="font-mono">/api/v1/driver-teams</span> (maps to `mdata.driver_teams` shares as split percentages).',
    "        </p>",
    '        <p className="text-xs text-gray-500">Split percentages are authoritative on the backend; UI must not invent percentages.</p>',
    "      </div>",
    "    </div>",
    "  );",
    "}",
  ].join("\n");
  const placeholderErrors = contractErrors({ ...good, page: prefixPlaceholder });
  for (const needle of ["placeholder", "useQuery", "listMdataDriverTeams", "ParityTable", "useCompanyContext"]) {
    if (!placeholderErrors.some((e) => e.includes(needle))) {
      console.error(`${LABEL} --selftest FAIL: pre-fix placeholder not caught for "${needle}"`, placeholderErrors);
      process.exit(1);
    }
  }

  const hardDelete = {
    ...good,
    api: `${good.api}\nexport function deleteMdataDriverTeam(id) { return apiRequest(\`/api/v1/mdata/driver-teams/\${id}\`, { method: "DELETE" }); }`,
  };
  const hardDeleteErrors = contractErrors(hardDelete);
  if (!hardDeleteErrors.some((e) => e.includes("void-not-delete") && e.includes("DELETE"))) {
    console.error(`${LABEL} --selftest FAIL: hard delete not caught`, hardDeleteErrors);
    process.exit(1);
  }
  if (!hardDeleteErrors.some((e) => e.includes("no delete helper"))) {
    console.error(`${LABEL} --selftest FAIL: exported delete helper not caught`, hardDeleteErrors);
    process.exit(1);
  }

  const phantom = {
    ...good,
    api: `${good.api}\nexport function archiveTeam(id) { return apiRequest(\`/api/v1/mdata/driver-teams/\${id}/archive\`, { method: "POST" }); }`,
  };
  if (!contractErrors(phantom).some((e) => e.startsWith("PHANTOM:") && e.includes("/archive"))) {
    console.error(`${LABEL} --selftest FAIL: phantom endpoint not caught`, contractErrors(phantom));
    process.exit(1);
  }

  const droppedMembership = { ...good, modal: good.modal.replace("replaceMdataDriverTeamDriver", "") };
  if (!contractErrors(droppedMembership).some((e) => e.includes("replaceMdataDriverTeamDriver"))) {
    console.error(`${LABEL} --selftest FAIL: dropped membership action not caught`);
    process.exit(1);
  }

  // The exact regression locked-guards caught on the first push of this branch.
  const rawDateInput = { ...good, modal: `${good.modal}\n<input type="date" value={form.effective_from} />` };
  if (!contractErrors(rawDateInput).some((e) => e.includes("raw <input"))) {
    console.error(`${LABEL} --selftest FAIL: raw <input type="date"> not caught`);
    process.exit(1);
  }

  const noDatePicker = { ...good, modal: good.modal.replace("<DatePicker value={form.effective_from} />", "") };
  if (!contractErrors(noDatePicker).some((e) => e.includes("shared DatePicker"))) {
    console.error(`${LABEL} --selftest FAIL: dropped DatePicker not caught`);
    process.exit(1);
  }

  const noDriverPicker = { ...good, modal: good.modal.replace("<DriverPickerWithCreate operatingCompanyId={id} />", "") };
  if (!contractErrors(noDriverPicker).some((e) => e.startsWith("PICKER-LAW:"))) {
    console.error(`${LABEL} --selftest FAIL: dropped DriverPickerWithCreate not caught`);
    process.exit(1);
  }

  const badVocab = { ...good, page: good.page.replace("+ Create", "+ New") };
  if (!contractErrors(badVocab).some((e) => e.includes("vocabulary"))) {
    console.error(`${LABEL} --selftest FAIL: "+ New" vocabulary not caught`);
    process.exit(1);
  }

  const badPalette = { ...good, page: `${good.page}\n<div className="bg-purple-500" />` };
  if (!contractErrors(badPalette).some((e) => e.includes("palette"))) {
    console.error(`${LABEL} --selftest FAIL: locked palette not caught`);
    process.exit(1);
  }

  const unmounted = { ...good, manifest: 'path="/lists/driver/teams"\n<ComingSoonPage />\n' };
  if (!contractErrors(unmounted).some((e) => e.includes("must keep mounting"))) {
    console.error(`${LABEL} --selftest FAIL: unmounted route not caught`);
    process.exit(1);
  }

  const unreachable = { ...good, hub: '{ name: "Termination Reasons", catalogKey: "termination-reasons" },' };
  if (!contractErrors(unreachable).some((e) => e.startsWith("NAV:"))) {
    console.error(`${LABEL} --selftest FAIL: unreachable hub leaf not caught`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS (12 defect fixtures rejected, good fixture accepted)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const paths = clientDriverTeamPaths(stripComments(src.api));
console.log(
  `${LABEL}: PASS — Driver Teams surface fetches + creates + replaces + soft-deactivates against ${paths.length} registered /api/v1/mdata/driver-teams routes`
);
process.exit(0);
