import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/AccidentsPage.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(text) {
  const errors = [];
  if (!/getSafetyAccidentDetail/.test(text)) errors.push("missing exact detail read");
  if (!/queryKey:\s*\["safety",\s*"accident",\s*operatingCompanyId,\s*accidentIdParam\]/.test(text)) {
    errors.push("detail query is not keyed by company and accident id");
  }
  if (!/enabled:\s*Boolean\(operatingCompanyId\s*&&\s*accidentIdParam\)/.test(text)) {
    errors.push("detail query is not company/id gated");
  }
  if (!/const match = linkedAccidentQuery\.data/.test(text)) errors.push("drawer still depends on capped list");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const broken = source.replace("const match = linkedAccidentQuery.data", "const match = allRows.find(() => true)");
  if (failures(source).length || !failures(broken).includes("drawer still depends on capped list")) {
    console.error("verify-safety-accident-reverse-deep-link selftest FAIL");
    process.exit(1);
  }
  console.log("verify-safety-accident-reverse-deep-link selftest PASS — capped-list regression turns red");
  process.exit(0);
}

const errors = failures(source);
if (errors.length) {
  console.error(`verify-safety-accident-reverse-deep-link FAIL:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-safety-accident-reverse-deep-link PASS — reverse link uses company-scoped exact detail read");
