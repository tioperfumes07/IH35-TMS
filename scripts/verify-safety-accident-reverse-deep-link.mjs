import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/AccidentsPage.tsx";
const source = fs.readFileSync(file, "utf8");
const drawerFile = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const drawerSource = fs.readFileSync(drawerFile, "utf8");

function failures(text, drawer = drawerSource) {
  const errors = [];
  if (!/getSafetyAccidentDetail/.test(text)) errors.push("missing exact detail read");
  if (!/queryKey:\s*\["safety",\s*"accident",\s*operatingCompanyId,\s*accidentIdParam\]/.test(text)) {
    errors.push("detail query is not keyed by company and accident id");
  }
  if (!/enabled:\s*Boolean\(operatingCompanyId\s*&&\s*accidentIdParam\)/.test(text)) {
    errors.push("detail query is not company/id gated");
  }
  if (!/const match = linkedAccidentQuery\.data/.test(text)) errors.push("drawer still depends on capped list");
  if (!/initialLoadName\s*=\s*accident\s*\?\s*String\(accident\.load_number/.test(drawer)) {
    errors.push("persisted accident load label is not captured");
  }
  if (!/kind="load"[\s\S]{0,180}?selectedOption=\{[\s\S]{0,180}?initialLoadName/.test(drawer)) {
    errors.push("load picker does not hydrate its persisted human label");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const broken = source.replace("const match = linkedAccidentQuery.data", "const match = allRows.find(() => true)");
  const brokenLabel = drawerSource.replace(
    /(kind="load"[\s\S]{0,180}?)selectedOption=\{/,
    "$1persistedOption={",
  );
  if (
    failures(source).length ||
    !failures(broken).includes("drawer still depends on capped list") ||
    !failures(source, brokenLabel).includes("load picker does not hydrate its persisted human label")
  ) {
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
console.log("verify-safety-accident-reverse-deep-link PASS — exact detail read and persisted human load label are guarded");
