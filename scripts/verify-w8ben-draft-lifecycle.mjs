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
const bodyTokens = [
  "full_legal_name:", "country_of_citizenship:", "permanent_residence_street:",
  "permanent_residence_city:", "permanent_residence_country:", "mailing_address_street:",
  "mailing_address_city:", "mailing_address_country:", "us_tin:", "foreign_tin:",
  "reference_numbers:", "date_of_birth:", "treaty_country:", "treaty_article:",
  "certification_name:", "signed_date:", "notes:",
];

function failures(input = source) {
  const reset = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[driverName\]\);/)?.[1] ?? "";
  return [
    ["reset complete W-8BEN draft", resetTokens.every((part) => reset.includes(part))],
    ["reset on open/company/driver change", /if \(open\) resetDraft\(\);\s*\}, \[open, companyId, driverId, resetDraft\]\);/.test(input)],
    ["request snapshots driver/company/body", /const input = \{[\s\S]*driverId,[\s\S]*companyId,[\s\S]*generation: requestGenerationRef\.current,[\s\S]*body: \{/.test(input)],
    ["complete body remains snapshotted", bodyTokens.every((token) => input.includes(token)) && input.includes("satisfies W8BenBody")],
    ["all async callbacks generation guarded", (input.match(/input\.generation (?:!==|===) requestGenerationRef\.current/g)?.length ?? 0) >= 3],
    ["context transition retires request", /requestGenerationRef\.current \+= 1;[\s\S]*setPending\(false\);[\s\S]*if \(open\) resetDraft\(\);/.test(input)],
    ["dirty drawer confirmation", input.includes("confirmDiscardOnClose") && input.includes("isDirty={isDirty}")],
    ["cancel uses confirm-aware close", input.includes("onRegisterAttemptClose") && /variant="secondary" onClick=\{attemptClose\}/.test(input)],
    ["canonical driver/company writer remains", /createDriverW8ben\(input\.driverId, input\.companyId, input\.body\)/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleTin = source.replace('setForeignTin("");', "void foreignTin;");
  const staleDriver = source.replace("[open, companyId, driverId, resetDraft]", "[open, companyId, resetDraft]");
  const bypassCancel = source.replace('variant="secondary" onClick={attemptClose}', 'variant="secondary" onClick={handleClose}');
  const staleCallback = source.replaceAll("input.generation !== requestGenerationRef.current", "false");
  const noConfirm = source.replace("confirmDiscardOnClose", "");
  const checks = [
    failures(staleTin).includes("reset complete W-8BEN draft"),
    failures(staleDriver).includes("reset on open/company/driver change"),
    failures(bypassCancel).includes("cancel uses confirm-aware close"),
    failures(staleCallback).includes("all async callbacks generation guarded"),
    failures(noConfirm).includes("dirty drawer confirmation"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-w8ben-draft-lifecycle selftest PASS — 5/5 stale/discard W-8BEN mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-w8ben-draft-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-w8ben-draft-lifecycle PASS — W-8BEN snapshots requests, rejects stale callbacks and protects dirty dismissal");
