import fs from "node:fs";

// SAF-TRAILER-COLUMN — SafetyIncidentsClusterSurface.tsx is the shared list table behind BOTH
// damage_reports.list and trailer_interchanges.list (the latter's entire subject is a trailer). The
// backend list query (SAF-C06) already JOINs and returns trailer_number/trailer_id on every row
// specifically so the frontend could link it — "operators could read a name but could not drill
// through to ... trailer" — but incidentColumns never rendered a Trailer column, so that intended
// drill-through was dead on arrival for the list view: an operator opening the Trailer Interchanges
// list could not see which trailer each row was about without opening every row's detail drawer.

const file = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(text) {
  const errors = [];
  // A dedicated trailer_id column entry must exist in incidentColumns, not just the create/detail form.
  // Captures from the column's `key: "trailer_id", label: "Trailer"` header through its closing `},`.
  const columnMatch = text.match(/key:\s*"trailer_id",\s*label:\s*"Trailer"[\s\S]{0,400}?"—"\s*\)\s*,\s*\n\s*\},/);
  if (!columnMatch) {
    errors.push("no trailer_id list column found (incidentColumns never renders a Trailer column)");
    return errors;
  }
  const block = columnMatch[0];
  if (!/row\.trailer_id\s*\?/.test(block)) errors.push("trailer column does not branch on row.trailer_id");
  if (!/kind="trailer"/.test(block)) errors.push("trailer column does not render an EntityLink kind=\"trailer\"");
  if (!/entityLabel\(str\(row\.trailer_number\)\s*\|\|\s*null,\s*row\.trailer_id,\s*"Trailer"\)/.test(block)) {
    errors.push("trailer column does not use the server-joined trailer_number for its label (raw id would leak)");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const withoutColumn = source.replace(
    /\{\s*\/\/ SAF-C06[\s\S]*?key:\s*"trailer_id",\s*label:\s*"Trailer",[\s\S]*?\},\s*\n\s*\{\s*\n\s*key:\s*"location",/,
    "{\n        key: \"location\",",
  );
  const brokenLabel = source.replace(
    'entityLabel(str(row.trailer_number) || null, row.trailer_id, "Trailer")',
    'entityLabel(null, row.trailer_id, "Trailer")',
  );
  const ok = failures(source).length === 0;
  const catchesRemoval = failures(withoutColumn).includes(
    "no trailer_id list column found (incidentColumns never renders a Trailer column)",
  );
  const catchesDroppedLabel = failures(brokenLabel).length > 0;
  if (!ok || !catchesRemoval || !catchesDroppedLabel) {
    console.error("verify-safety-incidents-cluster-trailer-column selftest FAIL", {
      ok,
      catchesRemoval,
      catchesDroppedLabel,
    });
    process.exit(1);
  }
  console.log("verify-safety-incidents-cluster-trailer-column selftest PASS — missing-column and dropped-label regressions turn red");
  process.exit(0);
}

const errors = failures(source);
if (errors.length) {
  console.error(`verify-safety-incidents-cluster-trailer-column FAIL:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(
  "verify-safety-incidents-cluster-trailer-column PASS — damage_reports.list and trailer_interchanges.list both render a real Trailer EntityLink column sourced from the server-joined trailer_number",
);
