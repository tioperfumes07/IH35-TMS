import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const filesRoute = read("apps/backend/src/docs/files.routes.ts");
const foundationRoute = read("apps/backend/src/docs/docs.routes.ts");
const labelHelper = read("apps/backend/src/docs/entity-labels.ts");
const frontendPage = read("apps/frontend/src/pages/docs/DocsHomePage.tsx");
const legacyDocumentsPage = read("apps/frontend/src/pages/Documents.tsx");
const frontendApi = read("apps/frontend/src/api/docs.ts");
const completion = read("docs/module-completion/docs.json");
const board = read("docs/audit/GUARD-WORKORDERS.md");

const source = { filesRoute, foundationRoute, labelHelper, frontendPage, legacyDocumentsPage, frontendApi, completion, board };

function verify(candidate) {
  const failures = [];
  const need = (file, token, message) => {
    if (!candidate[file].includes(token)) failures.push(message);
  };
  need("labelHelper", "export async function hydrateEntityLabels", "shared label hydrator must exist");
  need("labelHelper", "d.operating_company_id = $1::uuid", "canonical label reads must be explicitly company-scoped");
  need("labelHelper", "d.id = ANY($2::uuid[])", "canonical label reads must retain batched UUID lookup");
  need("filesRoute", "await hydrateEntityLabels(client, operatingCompanyId, res.rows)", "files list must hydrate scoped labels");
  need("filesRoute", 'filters.push("f.operating_company_id = $1::uuid")', "files list itself must use one explicit company predicate");
  need("foundationRoute", "await hydrateEntityLabels(client, operatingCompanyId, rowsRes.rows)", "DocsHome list must hydrate scoped labels");
  need("frontendApi", "entity_label", "frontend docs type must expose entity_label");
  need("frontendApi", "filters: { operating_company_id: string }", "listFiles callers must supply an explicit company id");
  need("frontendPage", "link.entity_label", "DocsHome must consume entity_label");
  need("frontendPage", "isUnresolvedEntityTombstone(rawLabel, link.entity_id, noun)", "DocsHome must tombstone unresolved or UUID-shaped entity labels");
  need("frontendPage", "label={String(rawLabel).trim()}", "DocsHome must pass only a resolved human label to EntityLink");
  need("frontendPage", "link.entity_label ?? link.entity_type", "DocsHome sorting must not prefer raw UUIDs");
  need("legacyDocumentsPage", "return firstLink.entity_label ?", "legacy Documents route must render hydrated labels");
  if (candidate.legacyDocumentsPage.includes('formatEntityLabel(null, firstLink.entity_id')) {
    failures.push("legacy Documents route must not render a raw UUID fallback");
  }
  const docsCompletion = JSON.parse(candidate.completion);
  const linkItem = docsCompletion.items.find((item) => item.id === "DOCS-LINK-01");
  if (!linkItem?.prod_verified || !/USMCA LIVE PASS/.test(linkItem.evidence) || !/zero Record — not visible/.test(linkItem.evidence)) {
    failures.push("DOCS-LINK-01 must retain exact post-deploy Live label proof");
  }
  if (!/FIXED DEPLOYED \(Codex Live 2026-08-16\):\*\* `LV-DOCS-LEGACY-FRONTEND-BUNDLE-BEHIND-BACKEND`/.test(candidate.board)) {
    failures.push("docs legacy split-deploy blocker must remain closed with exact deployed evidence");
  }
  return failures;
}

const failures = verify(source);
if (failures.length) {
  console.error(`FAIL: docs entity label wiring:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test") || process.argv.includes("--selftest")) {
  const mutations = [
    { file: "labelHelper", token: "d.operating_company_id = $1::uuid" },
    { file: "filesRoute", token: "await hydrateEntityLabels(client, operatingCompanyId, res.rows)" },
    { file: "filesRoute", token: 'filters.push("f.operating_company_id = $1::uuid")' },
    { file: "foundationRoute", token: "await hydrateEntityLabels(client, operatingCompanyId, rowsRes.rows)" },
    { file: "frontendPage", token: "isUnresolvedEntityTombstone(rawLabel, link.entity_id, noun)" },
    { file: "frontendPage", token: "label={String(rawLabel).trim()}" },
    { file: "legacyDocumentsPage", token: "return firstLink.entity_label ?" },
    { file: "completion", token: "USMCA LIVE PASS after frontend deploy #7821" },
    { file: "board", token: "FIXED DEPLOYED (Codex Live 2026-08-16):** `LV-DOCS-LEGACY-FRONTEND-BUNDLE-BEHIND-BACKEND`" },
  ];
  mutations.forEach(({ file, token }, index) => {
    const mutated = { ...source, [file]: source[file].replace(token, "BROKEN_DOCS_ENTITY_LABEL_WIRING") };
    if (mutated[file] === source[file]) throw new Error(`self-test fixture ${index + 1} drifted`);
    if (!verify(mutated).length) throw new Error(`self-test mutation ${index + 1} survived`);
  });
  console.log(`PASS: ${mutations.length} planted docs entity-label defects were rejected`);
}

console.log("PASS: both docs list APIs return company-scoped canonical entity labels");
