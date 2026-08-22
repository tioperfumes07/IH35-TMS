#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.banking"],"task":"DISP-F5856-LOAD-BANKING-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
/**
 * Banking Full Audit LINKAGE-REV FAIL 22 — by-linkage reverse API must have UI callers.
 * EntityLink kind="load" must keep `/dispatch/loads/:id` → Dispatch board (never a bank-feed stub).
 * Reverse bank panel lives at `/dispatch/loads/:id/banking`.
 *
 * CLS-BANKING-VENDOR-CUSTOMER-REVERSE-MISSING — categorization_vendor_id / categorization_customer_id
 * are written on categorize and already joined for forward display, but the reverse endpoint + panel +
 * api client never accepted them until this pass. Only the shared plumbing is asserted here (api client
 * param, panel LinkageKind, backend route param) — mounting the panel on VendorDetail/CustomerDetail is
 * Codex's lane (Lists/Customers/Vendors) and is routed, not built, by this guard's author.
 */
import fs from "node:fs";

const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";
const SELF = "scripts/verify-banking-by-linkage-reverse.mjs";

function evidenceFailures(matrixSource, selfSource) {
  const failures = [];
  const leaf = JSON.parse(matrixSource).leaves?.find((candidate) => candidate.id === "load.banking");
  if (!leaf?.required?.includes("reverse_link")) failures.push(`${MATRIX}: load.banking must require reverse_link`);
  const annotations = selfSource.split("\n").filter((line) => line.includes("@matrix-built"));
  if (!annotations.includes('/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.banking"],"task":"DISP-F5856-LOAD-BANKING-REVERSE-EXACT-LEAF","vertical":"column-wave"} */')) {
    failures.push(`${SELF}: Built annotation must credit only load.banking:reverse_link`);
  }
  return failures;
}

export function run(root = process.cwd()) {
  const failures = [];
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const panel = fs.readFileSync(
    `${root}/apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx`,
    "utf8"
  );
  const driver = fs.readFileSync(`${root}/apps/frontend/src/pages/drivers/DriverProfilePage.tsx`, "utf8");
  const unit = fs.readFileSync(`${root}/apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx`, "utf8");
  const load = fs.readFileSync(
    `${root}/apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx`,
    "utf8"
  );
  const vendor = fs.readFileSync(`${root}/apps/frontend/src/pages/VendorDetail.tsx`, "utf8");
  const customer = fs.readFileSync(`${root}/apps/frontend/src/pages/CustomerDetail.tsx`, "utf8");
  const manifest = fs.readFileSync(`${root}/apps/frontend/src/routes/manifest.tsx`, "utf8");
  const entityLink = fs.readFileSync(`${root}/apps/frontend/src/components/shared/EntityLink.tsx`, "utf8");
  const backendRoute = fs.readFileSync(
    `${root}/apps/backend/src/banking/categorization.routes.ts`,
    "utf8"
  );

  if (!api.includes("getBankTransactionsByLinkage")) {
    failures.push("api client missing getBankTransactionsByLinkage");
  }
  if (!panel.includes("getBankTransactionsByLinkage")) {
    failures.push("LinkedBankTransactionsPanel must call getBankTransactionsByLinkage");
  }
  if (!panel.includes("query.isSuccess")) {
    failures.push("panel empty state must gate on isSuccess (not !isLoading)");
  }
  if (!panel.includes('data-testid="linked-bank-transactions-panel"')) {
    failures.push("missing linked-bank-transactions-panel testid");
  }
  if (!api.includes("vendor_id") || !api.includes("customer_id")) {
    failures.push("api client getBankTransactionsByLinkage must accept vendor_id and customer_id");
  }
  if (!panel.includes('"vendor_id"') && !panel.includes("'vendor_id'")) {
    failures.push("LinkedBankTransactionsPanel LinkageKind must include vendor_id");
  }
  if (!panel.includes('"customer_id"') && !panel.includes("'customer_id'")) {
    failures.push("LinkedBankTransactionsPanel LinkageKind must include customer_id");
  }
  const byLinkageHandler = backendRoute.match(
    /\/api\/v1\/banking\/transactions\/by-linkage[\s\S]{0,3800}/
  )?.[0] ?? "";
  if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(byLinkageHandler)) {
    failures.push("backend by-linkage route must accept vendor_id");
  }
  if (!/customer_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(byLinkageHandler)) {
    failures.push("backend by-linkage route must accept customer_id");
  }
  if (!/categorization_vendor_id\s*=\s*\$\d/.test(byLinkageHandler)) {
    failures.push("backend by-linkage route must filter bt.categorization_vendor_id");
  }
  if (!/categorization_customer_id\s*=\s*\$\d/.test(byLinkageHandler)) {
    failures.push("backend by-linkage route must filter bt.categorization_customer_id");
  }
  if (!driver.includes("LinkedBankTransactionsPanel")) {
    failures.push("DriverProfilePage must mount LinkedBankTransactionsPanel");
  }
  if (!unit.includes("LinkedBankTransactionsPanel")) {
    failures.push("UnitFinanceLinkageTab must mount LinkedBankTransactionsPanel");
  }
  if (!load.includes("LinkedBankTransactionsPanel") || !load.includes("load_id")) {
    failures.push("LoadBankingLinkagePage must mount panel with load_id");
  }
  if (!/LinkedBankTransactionsPanel[\s\S]{0,220}?kind:\s*"vendor_id"/.test(vendor)) {
    failures.push("VendorDetail must mount LinkedBankTransactionsPanel with vendor_id");
  }
  if (!/LinkedBankTransactionsPanel[\s\S]{0,220}?kind:\s*"customer_id"/.test(customer)) {
    failures.push("CustomerDetail must mount LinkedBankTransactionsPanel with customer_id");
  }
  if (!manifest.includes("LoadBankingLinkagePage") || !manifest.includes('/dispatch/loads/:id/banking')) {
    failures.push("manifest must route /dispatch/loads/:id/banking to LoadBankingLinkagePage");
  }
  // Critical: never let the bank stub own EntityLink's load target.
  const loadsIdRouteBlock = manifest.match(
    /path=["']\/dispatch\/loads\/:id["'][\s\S]{0,400}?element=\{[\s\S]{0,200}?\}/
  );
  if (loadsIdRouteBlock && loadsIdRouteBlock[0].includes("LoadBankingLinkagePage")) {
    failures.push(
      "/dispatch/loads/:id must NOT mount LoadBankingLinkagePage (EntityLink load target — use DispatchLoadDetailRedirect)"
    );
  }
  if (!manifest.includes("DispatchLoadDetailRedirect")) {
    failures.push("manifest must keep DispatchLoadDetailRedirect for /dispatch/loads/:id");
  }
  if (!manifest.includes("/dispatch?load_id=") && !manifest.includes("`/dispatch?load_id=${")) {
    failures.push("DispatchLoadDetailRedirect must Navigate to /dispatch?load_id= (board), not a bank stub");
  }
  if (!entityLink.includes("`/dispatch/loads/${id}`") && !entityLink.includes("/dispatch/loads/${id}")) {
    failures.push('EntityLink kind="load" must resolve to /dispatch/loads/${id}');
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-by-linkage-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/frontend/src/api/banking.ts",
    "export function getBankTransactionsByLinkage(linkage) { linkage.vendor_id; linkage.customer_id; }\n"
  );
  mk(
    "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx",
    `getBankTransactionsByLinkage\nquery.isSuccess\ndata-testid="linked-bank-transactions-panel"\ntype LinkageKind = "driver_id" | "vendor_id" | "customer_id";\n`
  );
  mk("apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "LinkedBankTransactionsPanel\n");
  mk("apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx", "LinkedBankTransactionsPanel\n");
  mk(
    "apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx",
    "LinkedBankTransactionsPanel\nload_id\n"
  );
  mk("apps/frontend/src/pages/VendorDetail.tsx", '<LinkedBankTransactionsPanel linkage={{ kind: "vendor_id", id }} />\n');
  mk("apps/frontend/src/pages/CustomerDetail.tsx", '<LinkedBankTransactionsPanel linkage={{ kind: "customer_id", id }} />\n');
  mk(
    "apps/backend/src/banking/categorization.routes.ts",
    [
      '"/api/v1/banking/transactions/by-linkage"',
      "vendor_id: z.string().uuid().optional(),",
      "customer_id: z.string().uuid().optional(),",
      "bt.categorization_vendor_id = $7",
      "bt.categorization_customer_id = $8",
    ].join("\n")
  );
  mk(
    "apps/frontend/src/routes/manifest.tsx",
    [
      "function DispatchLoadDetailRedirect() {",
      "  return <Navigate to={`/dispatch?load_id=${encodeURIComponent(id)}`} replace />;",
      "}",
      'path="/dispatch/loads/:id/banking"',
      "element={<LoadBankingLinkagePage />}",
      'path="/dispatch/loads/:id"',
      "element={<DispatchLoadDetailRedirect />}",
      "",
    ].join("\n")
  );
  mk(
    "apps/frontend/src/components/shared/EntityLink.tsx",
    'case "load":\n      return `/dispatch/loads/${id}`;\n'
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk(
    "apps/frontend/src/routes/manifest.tsx",
    'path="/dispatch/loads/:id"\nelement={<LoadBankingLinkagePage />}\nLoadBankingLinkagePage\npath="/dispatch/loads/:id/banking"\nDispatchLoadDetailRedirect\n`/dispatch?load_id=${`\n'
  );
  if (!run(tmp).some((f) => f.includes("must NOT mount LoadBankingLinkagePage"))) {
    throw new Error("FAIL fail: hijack should trip");
  }
  // Restore the good manifest, then mutate ONLY the vendor/customer plumbing to prove those checks
  // are load-bearing, not vacuous.
  mk(
    "apps/frontend/src/routes/manifest.tsx",
    [
      "function DispatchLoadDetailRedirect() {",
      "  return <Navigate to={`/dispatch?load_id=${encodeURIComponent(id)}`} replace />;",
      "}",
      'path="/dispatch/loads/:id/banking"',
      "element={<LoadBankingLinkagePage />}",
      'path="/dispatch/loads/:id"',
      "element={<DispatchLoadDetailRedirect />}",
      "",
    ].join("\n")
  );
  mk(
    "apps/frontend/src/api/banking.ts",
    "export function getBankTransactionsByLinkage(linkage) { linkage.customer_id; }\n"
  );
  if (!run(tmp).some((f) => f.includes("must accept vendor_id and customer_id"))) {
    throw new Error("FAIL fail: dropping vendor_id from api client should trip");
  }
  mk("apps/frontend/src/pages/VendorDetail.tsx", "vendor detail without reverse panel\n");
  if (!run(tmp).some((f) => f.includes("VendorDetail must mount"))) {
    throw new Error("FAIL fail: dropping VendorDetail reverse panel should trip");
  }
  mk("apps/frontend/src/pages/VendorDetail.tsx", '<LinkedBankTransactionsPanel linkage={{ kind: "vendor_id", id }} />\n');
  mk(
    "apps/frontend/src/api/banking.ts",
    "export function getBankTransactionsByLinkage(linkage) { linkage.vendor_id; linkage.customer_id; }\n"
  );
  mk(
    "apps/backend/src/banking/categorization.routes.ts",
    [
      '"/api/v1/banking/transactions/by-linkage"',
      "vendor_id: z.string().uuid().optional(),",
      "bt.categorization_vendor_id = $7",
    ].join("\n")
  );
  const droppedCustomer = run(tmp);
  if (
    !droppedCustomer.some((f) => f.includes("must accept customer_id")) &&
    !droppedCustomer.some((f) => f.includes("must filter bt.categorization_customer_id"))
  ) {
    throw new Error("FAIL fail: dropping customer_id from backend route should trip");
  }
  const matrixSource = fs.readFileSync(MATRIX, "utf8");
  const selfSource = fs.readFileSync(SELF, "utf8");
  const matrix = JSON.parse(matrixSource);
  const leaf = matrix.leaves.find((candidate) => candidate.id === "load.banking");
  leaf.required = leaf.required.filter((column) => column !== "reverse_link");
  if (!evidenceFailures(JSON.stringify(matrix), selfSource).some((failure) => failure.includes("must require reverse_link"))) {
    throw new Error("FAIL fail: dropping load.banking Required reverse_link should trip");
  }
  if (!evidenceFailures(matrixSource, selfSource.replace('"leaves":["load.banking"]', '"leaves":["load.detail"]')).some((failure) => failure.includes("Built annotation"))) {
    throw new Error("FAIL fail: changing exact load.banking Built leaf should trip");
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-by-linkage-reverse --selftest OK");
} else {
  const f = run().concat(evidenceFailures(fs.readFileSync(MATRIX, "utf8"), fs.readFileSync(SELF, "utf8")));
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-by-linkage-reverse — OK");
}
