#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","reverse_link"],"leaves":["drivers.modal.w8ben"],"task":"CLASS-F6519-W8BEN-DRAFT-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/drivers/W8BenModal.tsx";
const source = fs.readFileSync(file, "utf8");

const resetTokens = [
  "setFullName(driverName)", 'setCitizenship("Mexico")', 'setResStreet("")', 'setResCity("")',
  'setResCountry("Mexico")', 'setMailStreet("")', 'setMailCity("")', 'setMailCountry("")',
  'setUsTin("")', 'setForeignTin("")', 'setReferenceNumbers("")', 'setDob("")',
  'setTreatyCountry("")', 'setTreatyArticle("")', 'setCertName("")', "setSignedDate(companyToday())",
  'setNotes("")', 'setError("")',
];

function failures(input = source) {
  const reset = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[driverName\]\);/)?.[1] ?? "";
  return [
    ["reset complete W-8BEN draft", resetTokens.every((part) => reset.includes(part))],
    ["reset on open/company/driver change", /if \(open\) resetDraft\(\);\s*\}, \[open, companyId, driverId, resetDraft\]\);/.test(input)],
    ["dismiss resets before close", /const handleClose = useCallback\(\(\) => \{\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
    ["drawer and cancel use reset close", input.includes('open={open} onClose={handleClose}') && /variant="secondary" onClick=\{handleClose\}/.test(input)],
    ["success uses reset close", /onCreated\?\.\(\);\s*handleClose\(\);/.test(input)],
    ["canonical driver/company writer remains", /createDriverW8ben\(driverId, companyId, \{/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleTin = source.replace('setForeignTin("");', "void foreignTin;");
  const staleDriver = source.replace("[open, companyId, driverId, resetDraft]", "[open, companyId, resetDraft]");
  const bypassCancel = source.replace('variant="secondary" onClick={handleClose}', 'variant="secondary" onClick={onClose}');
  const checks = [
    failures(staleTin).includes("reset complete W-8BEN draft"),
    failures(staleDriver).includes("reset on open/company/driver change"),
    failures(bypassCancel).includes("drawer and cancel use reset close"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-w8ben-draft-lifecycle selftest PASS — 3/3 stale driver/TIN mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-w8ben-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-w8ben-draft-lifecycle PASS — complete W-8BEN draft resets per driver/company/open cycle");
