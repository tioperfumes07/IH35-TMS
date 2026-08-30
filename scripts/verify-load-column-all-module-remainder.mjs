#!/usr/bin/env node
/** @matrix-built {"modules":["customers","dispatch","maintenance"],"cols":["load"],"leafRe":"^(md\\.transaction_list|dispatch\\.modal\\.load_create|wo\\.create)$","task":"VERTICAL-LOAD-ALL-MODULES-REMAINDER","vertical":"all-module-remainder"} */
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["planning.reserve"],"task":"DISP-F5867-PLANNING-RESERVE-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
import fs from "node:fs";

const FILES = {
  listsMatrix: "docs/specs/scoreboard/modules/lists.required.json",
  customersMatrix: "docs/specs/scoreboard/modules/customers.required.json",
  legalMatrix: "docs/specs/scoreboard/modules/legal.required.json",
  dispatchMatrix: "docs/specs/scoreboard/modules/dispatch.required.json",
  maintenanceMatrix: "docs/specs/scoreboard/modules/maintenance.required.json",
  catalogPage: "apps/frontend/src/pages/lists/CatalogIndex.tsx",
  catalogFactory: "apps/backend/src/catalogs/generic-catalog.factory.ts",
  customerPage: "apps/frontend/src/pages/Customers.tsx",
  legalForm: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  legalService: "apps/backend/src/legal/matters.service.ts",
  bookLoad: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  dispatchApi: "apps/frontend/src/api/dispatch.ts",
  dispatchRoute: "apps/backend/src/dispatch/loads.routes.ts",
  bookLoadService: "apps/backend/src/dispatch/book-load.service.ts",
  dispatchPage: "apps/frontend/src/pages/Dispatch.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  woForm: "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
  woPicker: "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx",
  woRoute: "apps/backend/src/maintenance/work-orders.routes.ts",
  woTable: "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  self: "scripts/verify-load-column-all-module-remainder.mjs",
};
const RESERVE_HEADER = '/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["planning.reserve"],"task":"DISP-F5867-PLANNING-RESERVE-REVERSE-EXACT-LEAF","vertical":"column-wave"} */';

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const matrix = (source, key, failures) => {
  try { return JSON.parse(source[key]); }
  catch { failures.push(`${key} must remain valid JSON`); return null; }
};

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key].includes(token)) failures.push(message); };
  const forbid = (key, token, message) => { if (source[key].includes(token)) failures.push(message); };
  const lists = matrix(source, "listsMatrix", failures);
  const customers = matrix(source, "customersMatrix", failures);
  const legal = matrix(source, "legalMatrix", failures);
  const dispatch = matrix(source, "dispatchMatrix", failures);
  const maintenance = matrix(source, "maintenanceMatrix", failures);
  const required = (m, id) => m?.leaves?.find((leaf) => leaf.id === id)?.required ?? [];

  const catalogLoad = lists?.leaves?.filter((leaf) => leaf.id.startsWith("catalog.") && leaf.required?.includes("load")) ?? [];
  if (catalogLoad.length) failures.push(`generic catalogs must not invent load Required (${catalogLoad.map((leaf) => leaf.id).join(", ")})`);
  if (lists?.honesty_audit?.load_column_2026_08_14?.leaves_touched !== 98) failures.push("Lists load applicability audit must enumerate all 98 corrected catalog leaves");
  need("catalogPage", "selectedCompanyId", "catalog UI must remain explicitly company scoped");
  need("catalogFactory", "operating_company_id", "generic catalog CRUD must remain explicitly company scoped");
  forbid("catalogFactory", "load_id", "generic catalog CRUD must not grow an invented load_id");

  for (const id of ["home.roster", "md.new_transaction", "md.projects"]) {
    if (!customers?.leaves?.some((leaf) => leaf.id === id)) failures.push(`customers:${id} inventory leaf must remain present`);
    if (required(customers, id).includes("load")) failures.push(`customers:${id} must not claim an unowned load FK`);
  }
  if (!required(customers, "md.transaction_list").includes("load")) failures.push("customers:md.transaction_list must retain exact load Required");
  need("customerPage", "r.source_load_id ? (", "customer transaction list must branch on the persisted invoice source_load_id");
  need("customerPage", 'kind="load"', "customer transaction list must render canonical load drill-through");
  need("customerPage", "name={r.source_load_number}", "customer transaction list must consume the API-resolved load number");
  need("customerPage", "Projects groups loads/invoices under a customer project. Needs a projects data source", "Projects must remain an honest static placeholder until a real data source exists");

  if (!legal?.leaves?.some((leaf) => leaf.id === "matters.create")) failures.push("legal:matters.create inventory leaf must remain present");
  if (required(legal, "matters.create").includes("load")) failures.push("legal:matters.create must not invent a load FK");
  forbid("legalForm", "load_id", "legal matter form must not imply a nonexistent load field");
  forbid("legalService", "input.load_id", "legal matter service must not imply a nonexistent load input");

  if (!required(dispatch, "dispatch.modal.load_create").includes("load")) failures.push("dispatch load creator must retain exact load Required");
  need("bookLoad", "const payload = await createDispatchLoad({", "dispatch creator must submit through the canonical client");
  need("bookLoad", "operating_company_id: operatingCompanyId", "dispatch creator must submit explicit company scope");
  need("dispatchApi", '"/api/v1/dispatch/loads", { method: "POST", body: payload }', "dispatch client must call the mounted canonical create route");
  need("dispatchRoute", 'app.post("/api/v1/dispatch/loads"', "dispatch load create route must remain mounted");
  need("dispatchRoute", "withCompanyScope(authUser.uuid, body.data.operating_company_id", "dispatch create must validate within company scope");
  need("bookLoadService", "INSERT INTO mdata.loads", "dispatch create must persist the canonical load row");
  need("bookLoad", "onCreated(createdId ? { id: createdId, label: createdLabel } : undefined);", "dispatch creator must trigger canonical reload after success");
  if (!required(dispatch, "planning.reserve").includes("reverse_link")) failures.push("dispatch planning.reserve must retain exact reverse_link Required");
  need("manifest", 'path="/dispatch/book-load"', "Reserve a Load route must remain mounted");
  need("dispatchPage", 'const onBookPath = location.pathname.replace(/\\/$/, "") === "/dispatch/book-load";', "Reserve a Load canonical path must be recognized");
  need("dispatchPage", 'const q = searchParams.get("book_load") === "1";', "Reserve a Load legacy query bookmark must remain supported");
  need("dispatchPage", "if (!onBookPath && !q) return;", "Reserve a Load path or legacy query must open the canonical creator");
  need("dispatchPage", "void loadsQuery.refetch();", "Reserve a Load parent must reload canonical mdata.loads after create");
  need("bookLoad", 'data-testid="book-load-edit-header-load-link"', "reloaded/edit load must expose its canonical reverse drill");
  if (!source.self.split("\n").includes(RESERVE_HEADER)) failures.push("planning.reserve exact Built annotation drifted");

  if (!required(maintenance, "wo.create").includes("load")) failures.push("maintenance:wo.create must retain exact load Required");
  need("woPicker", '<EntityPicker\n                kind="load"', "WO creator must use the canonical load picker");
  need("woPicker", 'dataField="load_id"', "WO load picker must bind the canonical field");
  need("woForm", "load_id: values.load_id || undefined", "WO creator must submit selected load_id");
  need("woRoute", "load_id: z.string().uuid().optional()", "WO backend schema must accept load_id");
  need("woRoute", "w.load_id = $", "WO read path must filter by canonical load_id");
  need("woRoute", "LEFT JOIN mdata.loads l ON l.id = w.load_id AND l.operating_company_id = w.operating_company_id", "WO read model must resolve a same-company load label");
  need("woRoute", "body.load_id ?? null", "WO create must persist load_id");
  need("woTable", '<EntityLinkOrTombstone kind="load" id={row.load_id}', "reloaded WO rows must drill to the canonical load");
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) { console.error(`verify-load-column-all-module-remainder FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["listsMatrix", '"leaves_touched": 98'], ["catalogPage", "selectedCompanyId"], ["catalogFactory", "operating_company_id"],
    ["customersMatrix", '"id": "md.transaction_list"'], ["customerPage", "r.source_load_id ? ("], ["customerPage", 'kind="load"'], ["customerPage", "name={r.source_load_number}"],
    ["legalMatrix", '"id": "matters.create"'], ["dispatchMatrix", '"id": "dispatch.modal.load_create"'],
    ["bookLoad", "const payload = await createDispatchLoad({"], ["bookLoad", "operating_company_id: operatingCompanyId"],
    ["dispatchMatrix", '"id": "planning.reserve"'], ["manifest", 'path="/dispatch/book-load"'],
    ["dispatchPage", 'const onBookPath = location.pathname.replace(/\\/$/, "") === "/dispatch/book-load";'],
    ["dispatchPage", 'const q = searchParams.get("book_load") === "1";'],
    ["dispatchPage", "if (!onBookPath && !q) return;"], ["dispatchPage", "void loadsQuery.refetch();"],
    ["bookLoad", 'data-testid="book-load-edit-header-load-link"'], ["self", '"leaves":["planning.reserve"]'],
    ["dispatchApi", '"/api/v1/dispatch/loads", { method: "POST", body: payload }'], ["dispatchRoute", 'app.post("/api/v1/dispatch/loads"'],
    ["dispatchRoute", "withCompanyScope(authUser.uuid, body.data.operating_company_id"], ["bookLoadService", "INSERT INTO mdata.loads"],
    ["maintenanceMatrix", '"id": "wo.create"'], ["woPicker", 'dataField="load_id"'], ["woForm", "load_id: values.load_id || undefined"],
    ["woRoute", "load_id: z.string().uuid().optional()"], ["woRoute", "LEFT JOIN mdata.loads l ON l.id = w.load_id AND l.operating_company_id = w.operating_company_id"],
    ["woRoute", "body.load_id ?? null"], ["woTable", '<EntityLinkOrTombstone kind="load" id={row.load_id}'],
  ];
  mutations.forEach(([key, token], index) => {
    if (!source[key].includes(token)) throw new Error(`selftest fixture missing: ${key} ${token}`);
    const mutant = { ...source, [key]: source[key].replaceAll(token, `BROKEN_${index}`) };
    if (!verify(mutant).length) throw new Error(`selftest mutation ${index + 1} survived`);
  });
  for (const [key, id] of [["customersMatrix", "home.roster"], ["customersMatrix", "md.new_transaction"], ["customersMatrix", "md.projects"], ["legalMatrix", "matters.create"]]) {
    const parsed = JSON.parse(source[key]); parsed.leaves.find((leaf) => leaf.id === id).required.push("load");
    if (!verify({ ...source, [key]: JSON.stringify(parsed) }).length) throw new Error(`selftest false-applicability mutation survived: ${id}`);
  }
  const parsedLists = JSON.parse(source.listsMatrix); parsedLists.leaves.find((leaf) => leaf.id.startsWith("catalog.")).required.push("load");
  if (!verify({ ...source, listsMatrix: JSON.stringify(parsedLists) }).length) throw new Error("selftest catalog applicability mutation survived");
  console.log(`verify-load-column-all-module-remainder SELFTEST PASS — ${mutations.length + 5} planted defects rejected`);
}
console.log("verify-load-column-all-module-remainder PASS — all-module load remainder is applicability-honest and genuine create/read/drill paths are guarded");
