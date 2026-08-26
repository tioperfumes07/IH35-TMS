#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","qbo_chrome","reverse_link"],"leaves":["drivers.modal.create_driver","drivers.parity.create_driver"],"task":"CLASS-F6522-CREATE-DRIVER-COMPANY-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  const reset = input.match(/\/\/ Reset the whole create flow[\s\S]*?useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[open, companyId\]\);/)?.[1] ?? "";
  const resetTokens = [
    "setForm({ ...DRIVER_CREATE_FORM_INITIAL })", "setWizardStep(1)", "setDrugScreenAcknowledged(false)",
    "setPendingDocs({})", "setReturningDetection(null)", "setReturningCheckLoading(false)",
    "setReturningCheckError(null)", "setReturningCheckRetry(0)", "setOverrideReturningWarning(false)",
    'setRehireAction("rehire")', "setSelectedPriorDriverId(null)", "setInvitePending(false)",
    "setInviteSent(false)", "setInviteConfirmOpen(false)", 'saveModeRef.current = "default"',
  ];
  return [
    ["reset complete creator context", resetTokens.every((part) => reset.includes(part))],
    ["draft reset follows selected company", /\}, \[open, companyId\]\);/.test(input)],
    ["validation reset follows selected company", /resetDriverCreateErrors\(\);\s*\}, \[open, companyId, resetDriverCreateErrors\]\);/.test(input)],
    ["canonical create writer remains", /createDriver\(input\.payload\)/.test(input)],
    ["company FK remains in form schema", input.includes('operating_company_id: z.string().uuid("operating company is required")')],
    ["company generation advances", /companyGenerationRef\.current \+= 1;[\s\S]*if \(!open\) return;/.test(input)],
    ["create uses immutable payload", /createDriver\(input\.payload\)/.test(input)],
    ["documents and categories are snapshotted", /pendingDocs: \[\.\.\.pendingDocEntries\][\s\S]*categoryIds: Object\.fromEntries\(categoryIdByCode\)/.test(input)],
    ["success uses submitted documents", /for \(const \[key, file\] of input\.pendingDocs\)/.test(input)],
    ["success rejects stale company", /input\.generation !== companyGenerationRef\.current/.test(input)],
    ["validation rejects stale errors", /generation !== companyGenerationRef\.current\) return;[\s\S]*throw error;/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleCompany = source.replace("}, [open, companyId]);", "}, [open]);");
  const staleDocs = source.replace("setPendingDocs({});", "void pendingDocs;");
  const staleValidation = source.replace("[open, companyId, resetDriverCreateErrors]", "[open, resetDriverCreateErrors]");
  const mutablePayload = source.replace("createDriver(input.payload)", "createDriver(form)");
  const staleSuccess = source.replace("input.generation !== companyGenerationRef.current", "false");
  const liveDocs = source.replace("pendingDocs: [...pendingDocEntries]", "pendingDocs: []");
  const checks = [
    failures(staleCompany).includes("draft reset follows selected company"),
    failures(staleDocs).includes("reset complete creator context"),
    failures(staleValidation).includes("validation reset follows selected company"),
    failures(mutablePayload).includes("create uses immutable payload"),
    failures(staleSuccess).includes("success rejects stale company"),
    failures(liveDocs).includes("documents and categories are snapshotted"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-create-driver-company-lifecycle selftest PASS — 6/6 stale-company/document mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-create-driver-company-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-create-driver-company-lifecycle PASS — canonical driver wizard resets complete state per selected company/open cycle");
