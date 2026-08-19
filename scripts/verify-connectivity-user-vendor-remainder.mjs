#!/usr/bin/env node
/** @matrix-built {"modules":["users","vendors"],"cols":["connectivity"],"leafRe":"^(detail\\.drawer\\.dispatcher_safety_event|md\\.(transaction_list|notes|header\\.(edit|new_transaction)|txn\\.filters))$","task":"VERTICAL-CONNECTIVITY-USER-VENDOR-REMAINDER","vertical":"all-nonmoney-remainder"} */
import fs from "node:fs";

const FILES = {
  usersMatrix: "docs/specs/scoreboard/modules/users.required.json",
  vendorsMatrix: "docs/specs/scoreboard/modules/vendors.required.json",
  userPage: "apps/frontend/src/pages/UserDetail.tsx",
  identityApi: "apps/frontend/src/api/identity.ts",
  safetyRoute: "apps/backend/src/mdata/dispatcher-safety-events.routes.ts",
  vendorPage: "apps/frontend/src/pages/Vendors.tsx",
};
const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const IDS = {
  users: ["detail.drawer.dispatcher_safety_event"],
  vendors: ["md.transaction_list", "md.notes", "md.header.edit", "md.header.new_transaction", "md.txn.filters"],
};

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key].includes(token)) failures.push(message); };
  for (const [moduleId, ids] of Object.entries(IDS)) {
    let matrix;
    try { matrix = JSON.parse(source[`${moduleId}Matrix`]); }
    catch { failures.push(`${moduleId} matrix must remain valid JSON`); continue; }
    for (const id of ids) {
      if (!matrix.leaves?.find((leaf) => leaf.id === id)?.required?.includes("connectivity")) failures.push(`${moduleId}:${id} must retain exact connectivity Required`);
    }
  }

  need("userPage", '<Modal variant="drawer" open={addEventOpen}', "dispatcher safety creator must remain a mounted drawer");
  need("userPage", "await createEventMutation.mutateAsync({", "dispatcher safety drawer must submit through its canonical mutation");
  need("userPage", "related_load_id: enableRelated ? relatedLoadId", "dispatcher event submit must forward its canonical related FKs");
  need("identityApi", "createDispatcherSafetyEvent(", "identity client must expose dispatcher safety creation");
  need("identityApi", '`/api/v1/identity/users/${userId}/safety-events`', "identity client must call the mounted user safety route");
  need("safetyRoute", 'app.post("/api/v1/identity/users/:user_id/safety-events"', "dispatcher safety POST route must remain mounted");
  need("safetyRoute", "const opco = await scopeToRelatedEntity(client, authUser.uuid", "dispatcher safety writer must derive and validate company scope from canonical related entities");
  need("safetyRoute", "INSERT INTO mdata.dispatcher_safety_events", "dispatcher safety writer must persist the canonical row");
  need("safetyRoute", '"mdata.dispatcher_safety_events.created"', "dispatcher safety create must remain audited");

  need("vendorPage", 'listBills(companyId, {', "vendor transactions must query the canonical scoped bill source");
  need("vendorPage", "vendor_id: selectedVendor!.id", "vendor transactions must bind the selected vendor FK");
  need("vendorPage", '<EntityLink kind="bill" id={r.id}', "vendor transaction rows must drill to canonical bills");
  need("vendorPage", "selectedVendorPublicNotes", "vendor Notes tab must read the selected canonical vendor row");
  need("vendorPage", 'navigate(`/vendors/${selectedVendor.id}`)', "vendor Edit must open the canonical profile route");
  need("vendorPage", 'navigate(`/accounting/bills?vendor_id=${selectedVendor.id}`)', "New transaction must preserve vendor context into the canonical bill creator");
  need("vendorPage", 'date_from: dateFrom || undefined', "vendor transaction filters must forward the start date");
  need("vendorPage", 'date_to: dateTo || undefined', "vendor transaction filters must forward the end date");
  need("vendorPage", 'status: statusFilter === "unpaid"', "vendor transaction filters must forward canonical status semantics");
  // LV-VENDOR-TXN-FILTER-INLINE-NO-APPLY — Type/Status/Date/Category must stage until Apply (CollapsedListFilters).
  need("vendorPage", "const txnFilters = useStagedListFilters({", "vendor txn filters must use staged draft state until Apply");
  need("vendorPage", 'testIdPrefix="vendor-txn"', "vendor txn filters must use CollapsedListFilters with vendor-txn prefix");
  need("vendorPage", "onApply={txnFilters.apply}", "vendor txn filters must commit only via Apply");
  need("vendorPage", "onCancel={txnFilters.cancel}", "vendor txn filters must support Cancel without mutating applied query");
  need("vendorPage", "onReset={txnFilters.reset}", "vendor txn filters must support Reset");
  need("vendorPage", "value={txnFilters.draft.typeFilter}", "type control must bind draft, not applied typeFilter");
  need("vendorPage", "value={txnFilters.draft.statusFilter}", "status control must bind draft, not applied statusFilter");
  need("vendorPage", "value={txnFilters.draft.dateFrom}", "date-from control must bind draft");
  need("vendorPage", "value={txnFilters.draft.dateTo}", "date-to control must bind draft");
  need("vendorPage", "value={txnFilters.draft.txnCategoryFilter}", "category control must bind draft");
  need("vendorPage", "setTypeFilter(next.typeFilter)", "type must commit only via txnFilters.onApply");
  if (source.vendorPage.includes("setShowFilterBox") || source.vendorPage.includes("showFilterBox")) {
    failures.push("vendor txn filters must not use immediate inline showFilterBox (Apply triad required)");
  }
  if (/onChange=\{\(event\) => setTypeFilter\(/.test(source.vendorPage)) {
    failures.push("vendor txn Type must not apply immediately via setTypeFilter onChange");
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) { console.error(`verify-connectivity-user-vendor-remainder FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["usersMatrix", '"id": "detail.drawer.dispatcher_safety_event"'], ["vendorsMatrix", '"id": "md.transaction_list"'],
    ["vendorsMatrix", '"id": "md.notes"'], ["vendorsMatrix", '"id": "md.header.edit"'], ["vendorsMatrix", '"id": "md.header.new_transaction"'], ["vendorsMatrix", '"id": "md.txn.filters"'],
    ["userPage", '<Modal variant="drawer" open={addEventOpen}'], ["userPage", "await createEventMutation.mutateAsync({"], ["userPage", "related_load_id: enableRelated ? relatedLoadId"],
    ["identityApi", '`/api/v1/identity/users/${userId}/safety-events`'], ["safetyRoute", 'app.post("/api/v1/identity/users/:user_id/safety-events"'],
    ["safetyRoute", "const opco = await scopeToRelatedEntity(client, authUser.uuid"], ["safetyRoute", "INSERT INTO mdata.dispatcher_safety_events"], ["safetyRoute", '"mdata.dispatcher_safety_events.created"'],
    ["vendorPage", 'listBills(companyId, {'], ["vendorPage", "vendor_id: selectedVendor!.id"], ["vendorPage", '<EntityLink kind="bill" id={r.id}'],
    ["vendorPage", "selectedVendorPublicNotes"], ["vendorPage", 'navigate(`/vendors/${selectedVendor.id}`)'], ["vendorPage", 'navigate(`/accounting/bills?vendor_id=${selectedVendor.id}`)'],
    ["vendorPage", 'date_from: dateFrom || undefined'], ["vendorPage", 'date_to: dateTo || undefined'], ["vendorPage", 'status: statusFilter === "unpaid"'],
    ["vendorPage", "const txnFilters = useStagedListFilters({"], ["vendorPage", 'testIdPrefix="vendor-txn"'], ["vendorPage", "onApply={txnFilters.apply}"],
    ["vendorPage", "onCancel={txnFilters.cancel}"], ["vendorPage", "onReset={txnFilters.reset}"],
    ["vendorPage", "value={txnFilters.draft.typeFilter}"], ["vendorPage", "value={txnFilters.draft.statusFilter}"], ["vendorPage", "value={txnFilters.draft.dateFrom}"],
    ["vendorPage", "value={txnFilters.draft.dateTo}"], ["vendorPage", "value={txnFilters.draft.txnCategoryFilter}"],
    ["vendorPage", "setTypeFilter(next.typeFilter)"],
  ];
  const typeImmediateMutant = {
    ...source,
    vendorPage: source.vendorPage.replace(
      "value={txnFilters.draft.typeFilter}",
      'value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} BROKEN_TYPE',
    ),
  };
  if (!verify(typeImmediateMutant).some((f) => f.includes("setTypeFilter onChange") || f.includes("type control must bind draft"))) {
    throw new Error("selftest immediate typeFilter onChange survived");
  }
  mutations.forEach(([key, token], index) => {
    if (!source[key].includes(token)) throw new Error(`selftest fixture missing: ${key} ${token}`);
    const mutant = { ...source, [key]: source[key].replaceAll(token, `BROKEN_${index}`) };
    if (!verify(mutant).length) throw new Error(`selftest mutation ${index + 1} survived`);
  });
  const filterBoxMutant = { ...source, vendorPage: source.vendorPage + "\nconst [showFilterBox, setShowFilterBox] = useState(false);\n" };
  if (!verify(filterBoxMutant).some((f) => f.includes("showFilterBox"))) throw new Error("selftest showFilterBox regression survived");
  console.log(`verify-connectivity-user-vendor-remainder SELFTEST PASS — ${mutations.length + 2} planted defects rejected`);
}
console.log("verify-connectivity-user-vendor-remainder PASS — final non-money user/vendor connectivity leaves are mounted, scoped, canonical, and drillable");
