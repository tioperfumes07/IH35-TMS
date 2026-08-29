#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["accident"],"leaves":["accidents.list","accidents.create"],"task":"SAF-F7061-ACCIDENT-IDENTITY-VERTICAL","vertical":"column-wave"} */
/**
 * GUARD: every field the accident wizard renders is controlled AND persisted (SAF-F05 / DoD layer B).
 *
 * WHY THIS EXISTS (2026-07-23 audit, verified on prod)
 * AccidentReportDrawer rendered 7 fields as UNCONTROLLED <input>s (no value/onChange) — Police Report
 * Number, Insurance Claim Number, Location, 3rd Party Name, 3rd Party Plate, Vendor Invoice, Bill/
 * Expense ref. Their columns did not exist on safety.accident_reports, and the save payload carried
 * none of them, so the operator's accident evidence was silently dropped on every save.
 *
 * DoD layer B: "every rendered field is controlled AND present in the submit payload." This guard ties
 * the four layers together so a field can never again render-but-not-persist: the drawer must control
 * it (value=), the API client type must declare it, the backend route must accept it (zod) AND write
 * it (INSERT + patchable), and the HOLD migration must add the column.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const CLIENT = "apps/frontend/src/api/safety.ts";
const ROUTE = "apps/backend/src/safety/safety.routes.ts";
const MIGRATION = "db/migrations/202607810000_accident_reports_capture_fields.sql";
const PAGE = "apps/frontend/src/pages/safety/AccidentsPage.tsx";
const LABEL = "verify-accident-wizard-fields-persisted";
const SELFTEST = process.argv.includes("--selftest");

// snake_case column ↔ camelCase drawer state, and the testid the input must carry.
const FIELDS = [
  { col: "police_report_number", state: "policeReportNumber", testid: "accident-police-report-number" },
  { col: "insurance_claim_number", state: "insuranceClaimNumber", testid: "accident-insurance-claim-number" },
  { col: "location", state: "location", testid: "accident-location" },
  { col: "third_party_name", state: "thirdPartyName", testid: "accident-third-party-name" },
  { col: "third_party_plate", state: "thirdPartyPlate", testid: "accident-third-party-plate" },
  { col: "vendor_invoice_number", state: "vendorInvoiceNumber", testid: "accident-vendor-invoice-number" },
  { col: "bill_or_expense_ref", state: "billOrExpenseRef", testid: "accident-bill-or-expense-ref" },
];

// SAF-B04: enum comboboxes. Not in FIELDS above because they are `z.enum(...)`, not accidentTextField,
// and are written by an UPDATE ... SET rather than appearing in the accident INSERT column list.
const ENUM_FIELDS = [
  { col: "record_type", state: "recordType", setter: "setRecordType" },
  { col: "service_type", state: "serviceType", setter: "setServiceType" },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// RE-ANCHOR (found stale 2026-08-29): PR #17629 (SCEN01-HOP1-COST-LINES-PATCH-SILENT-DROP) added
// a SECOND `INSERT INTO safety.accident_cost_lines` inside the PATCH handler (append-only
// reconciliation, not a plain re-insert). A whole-file /INSERT INTO safety\.accident_cost_lines/
// test can no longer detect a regression in the CREATE (POST) handler specifically — the PATCH
// handler's copy keeps the assertion true even if the POST handler's INSERT is removed. Bound the
// check to the POST route's own body, the same way the sibling
// verify-safety-accident-patch-persists-cost-lines.mjs guard bounds its PATCH-only check.
const POST_ROUTE_MARKER = `app.post("/api/v1/safety/accidents",`;
const NEXT_ROUTE_MARKERS = [`app.patch("/api/v1/safety/accidents/:id",`, `app.get("/api/v1/safety/accidents/:id/`];

function extractPostRouteBody(routeSrc) {
  const start = routeSrc.indexOf(POST_ROUTE_MARKER);
  if (start === -1) return null;
  let end = routeSrc.length;
  for (const marker of NEXT_ROUTE_MARKERS) {
    const idx = routeSrc.indexOf(marker, start + POST_ROUTE_MARKER.length);
    if (idx !== -1) end = Math.min(end, idx);
  }
  if (end === routeSrc.length) end = Math.min(routeSrc.length, start + 6000);
  return routeSrc.slice(start, end);
}

export function assertAccidentFieldsPersisted(sources) {
  const drawer = sources?.[DRAWER] ?? read(DRAWER);
  const client = sources?.[CLIENT] ?? read(CLIENT);
  const route = sources?.[ROUTE] ?? read(ROUTE);
  const migration = sources?.[MIGRATION] ?? read(MIGRATION);
  const page = sources?.[PAGE] ?? read(PAGE);
  const problems = [];
  const postRouteBody = extractPostRouteBody(route);
  if (!postRouteBody) {
    problems.push(`${ROUTE}: could not find the POST /api/v1/safety/accidents route registration.`);
  }

  for (const f of FIELDS) {
    // 1. Drawer controls the input (value={state}) — not uncontrolled, not defaultValue.
    const controlled = new RegExp(`value=\\{${f.state}\\}`).test(drawer);
    if (!controlled) {
      problems.push(`${DRAWER}: input for ${f.col} is not controlled (expected value={${f.state}}) — a rendered-but-uncontrolled field is discarded on save.`);
    }
    if (!drawer.includes(`data-testid="${f.testid}"`)) {
      problems.push(`${DRAWER}: input for ${f.col} is missing data-testid="${f.testid}".`);
    }
    // 2. Drawer sends it in the payload.
    if (!new RegExp(`${f.col}:\\s*${f.state}`).test(drawer)) {
      problems.push(`${DRAWER}: ${f.col} is not in the save payload — it is controlled but never sent.`);
    }
    // 3. API client type declares it.
    if (!new RegExp(`${f.col}\\?:\\s*string`).test(client)) {
      problems.push(`${CLIENT}: CreateAccidentInput/PatchAccidentInput does not declare ${f.col}.`);
    }
    // 4. Backend accepts (zod) + writes it (INSERT column list) + patchable.
    if (!new RegExp(`${f.col}:\\s*accidentTextField`).test(route)) {
      problems.push(`${ROUTE}: the accident zod schema does not accept ${f.col}.`);
    }
    // A column line in the INSERT list — the LAST column has no trailing comma (followed by `)`), so
    // accept comma OR newline after the name.
    if (!new RegExp(`\\n\\s*${f.col}[,\\n]`).test(route)) {
      problems.push(`${ROUTE}: the INSERT column list does not include ${f.col} — accepted but not written.`);
    }
    if (!new RegExp(`key:\\s*"${f.col}"`).test(route)) {
      problems.push(`${ROUTE}: ${f.col} is not in the PATCH patchable whitelist — a patch would drop it.`);
    }
    // 5. Migration adds the column.
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${f.col}\\b`).test(migration)) {
      problems.push(`${MIGRATION}: does not ADD COLUMN ${f.col} — the write would 500 (phantom column).`);
    }
  }
  // ── SAF-B04: the NON-TEXT controls the FIELDS loop above cannot describe ───────────────────────
  //
  // The original defect (verified 2026-07-25) was that Record Type and Service Type were hardcoded
  // no-op comboboxes — `value` fixed, `onChange` EMPTY — and every cost line had state, an editor and
  // a running total but was never sent. The code has since been fixed, but this guard still only knew
  // about the 7 TEXT fields, so CI stayed green either way. A fix nothing asserts is a fix that can
  // silently regress, which is precisely the shape-vs-substance failure this file exists to kill.
  //
  // These two shapes cannot join the FIELDS loop: the enums are `z.enum([...]).nullish()` rather than
  // `accidentTextField`, and cost lines are an ARRAY written to a DIFFERENT table
  // (safety.accident_cost_lines), so they have no column in the accident INSERT list at all.

  for (const e of ENUM_FIELDS) {
    // P44 (2026-08-20, CC-3): record_type is no longer its own directly-bound combobox — the visible
    // control is now the real accident_type_id catalog picker (ReferenceSelect), and recordType is a
    // DERIVED legacy field kept in sync from the picked row's code. Check the derived shape instead
    // of a direct value={recordType} binding, and — this IS the substance the original guard existed
    // to protect — require the derivation to be UNCONDITIONAL (an inline ternary with an "accident"
    // fallback), not an `if (knownCodes.includes(code)) setRecordType(...)` gate that silently leaves
    // recordType STALE whenever an operator picks/creates a non-canonical accident type.
    if (e.col === "record_type" && /value=\{accidentTypeId \|\| null\}/.test(drawer)) {
      if (!/setAccidentTypeId\(next \?\? ""\)/.test(drawer)) {
        problems.push(`${DRAWER}: accident_type_id picker is not controlled — a rendered-but-uncontrolled field is discarded on save.`);
      }
      if (!/setRecordType\(code === "damage" \|\| code === "vandalism" \? code : "accident"\)/.test(drawer)) {
        problems.push(`${DRAWER}: recordType derivation from the accident_type_id picker is not unconditional — a non-canonical accident type would leave record_type stale instead of resolving it.`);
      }
      if (!new RegExp(`${e.col}:\\s*${e.state}`).test(drawer)) {
        problems.push(`${DRAWER}: ${e.col} is not in the save payload.`);
      }
      if (!new RegExp(`${e.col}:\\s*z\\.enum`).test(route)) {
        problems.push(`${ROUTE}: the accident zod schema does not accept ${e.col} as an enum.`);
      }
      if (!new RegExp(`${e.col}\\s*=\\s*\\$`).test(route)) {
        problems.push(`${ROUTE}: ${e.col} is never written (no "SET ${e.col} = $n") — accepted but discarded.`);
      }
      continue;
    }

    if (!new RegExp(`value=\\{${e.state}\\}`).test(drawer)) {
      problems.push(`${DRAWER}: ${e.col} combobox is not controlled (expected value={${e.state}}).`);
    }
    // The exact original defect: a control that renders and accepts clicks but throws them away.
    const onChange = new RegExp(`value=\\{${e.state}\\}\\s*\\n?\\s*onChange=\\{\\(([^)]*)\\)\\s*=>\\s*([^}]*)\\}`);
    const m = onChange.exec(drawer);
    if (!m) {
      problems.push(`${DRAWER}: ${e.col} combobox has no onChange — a no-op control discards the user's choice on save.`);
    } else if (!m[2].includes(e.setter)) {
      problems.push(`${DRAWER}: ${e.col} onChange does not call ${e.setter} — the control renders but never updates state.`);
    }
    if (!new RegExp(`${e.col}:\\s*${e.state}`).test(drawer)) {
      problems.push(`${DRAWER}: ${e.col} is not in the save payload.`);
    }
    if (!new RegExp(`${e.col}:\\s*z\\.enum`).test(route)) {
      problems.push(`${ROUTE}: the accident zod schema does not accept ${e.col} as an enum.`);
    }
    if (!new RegExp(`${e.col}\\s*=\\s*\\$`).test(route)) {
      problems.push(`${ROUTE}: ${e.col} is never written (no "SET ${e.col} = $n") — accepted but discarded.`);
    }
  }

  // Cost lines: money on an accident report. These feed insurance claims and litigation, so a silently
  // dropped line is not a cosmetic loss.
  if (!/const \[costLines, setCostLines\]/.test(drawer)) {
    problems.push(`${DRAWER}: costLines state is gone — the cost-line editor would have nowhere to write.`);
  }
  // Anchored on a property boundary: an unanchored /cost_lines:/ also matches `unused_cost_lines:`,
  // so a renamed-and-therefore-ignored key would have slipped through. The mutation arm caught this.
  if (!/(^|[{,(\s])cost_lines:\s*costLines/m.test(drawer)) {
    problems.push(`${DRAWER}: cost_lines is not in the save payload — every cost line the user entered is discarded.`);
  }
  if (!/cost_lines:\s*z\.array/.test(route)) {
    problems.push(`${ROUTE}: the accident zod schema does not accept cost_lines as an array.`);
  }
  if (postRouteBody && !/INSERT INTO safety\.accident_cost_lines/.test(postRouteBody)) {
    problems.push(`${ROUTE}: the POST /api/v1/safety/accidents handler accepts cost lines but never INSERTs them into safety.accident_cost_lines.`);
  }
  if (!/getSafetyAccidentDetail\(String\(accidentIdParam\), operatingCompanyId\)/.test(page)) {
    problems.push(`${PAGE}: deep-linked accident does not use the exact company/id detail read.`);
  }
  if (!/const openAccident = \(row:[\s\S]{0,180}setSelectedAccident\(row\)/.test(page)) {
    problems.push(`${PAGE}: accident list row no longer opens its canonical record identity.`);
  }
  if (!/createSafetyAccident\(\{ operating_company_id: companyId, \.\.\.payload \}\)/.test(drawer)) {
    problems.push(`${DRAWER}: create does not write the submitted company-scoped accident record.`);
  }
  if (!/onUpdated=\{\(\) => \{[\s\S]{0,180}invalidateQueries\(\{ queryKey: \["safety"\] \}\)/.test(page)) {
    problems.push(`${PAGE}: successful accident create does not refresh the canonical list.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = {
    [DRAWER]: read(DRAWER),
    [CLIENT]: read(CLIENT),
    [ROUTE]: read(ROUTE),
    [MIGRATION]: read(MIGRATION),
    [PAGE]: read(PAGE),
  };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: mutation did not change source — inert`);
      return;
    }
    const problems = assertAccidentFieldsPersisted(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  // 1. an input goes back to uncontrolled.
  expectCaught("uncontrolled-input", { ...live, [DRAWER]: live[DRAWER].replace("value={location}", "") }, "not controlled");
  // 2. the migration drops a column.
  expectCaught("missing-column", { ...live, [MIGRATION]: live[MIGRATION].replace("ADD COLUMN IF NOT EXISTS location", "-- removed") }, "does not ADD COLUMN location");
  // 3. the backend stops writing a column (INSERT).
  expectCaught("insert-drops-field", { ...live, [ROUTE]: live[ROUTE].replace(/\n            third_party_name,/, "") }, "INSERT column list does not include third_party_name");
  // 4. the payload stops sending a field.
  expectCaught("payload-drops-field", { ...live, [DRAWER]: live[DRAWER].replace(/police_report_number: policeReportNumber\.trim\(\) \|\| null,/, "") }, "police_report_number is not in the save payload");

  // ── SAF-B04 arms: the enum controls and the cost lines ────────────────────────────────────────
  // 5a. service_type: THE ORIGINAL DEFECT — a combobox whose onChange throws the choice away. This is
  //     the exact shape verified on 2026-07-25: value fixed, onChange empty, CI green.
  expectCaught(
    "enum-onchange-noop",
    { ...live, [DRAWER]: live[DRAWER].replace(/onChange=\{\(([^)]*)\) => setServiceType\([^}]*\}/, "onChange={() => {}}") },
    "service_type"
  );
  expectCaught("detail-identity", { ...live, [PAGE]: live[PAGE].replace("getSafetyAccidentDetail(String(accidentIdParam), operatingCompanyId)", "getSafetyAccidentDetail('', operatingCompanyId)") }, "exact company/id detail read");
  expectCaught("list-open-identity", { ...live, [PAGE]: live[PAGE].replace("setSelectedAccident(row);", "setSelectedAccident(null);") }, "canonical record identity");
  expectCaught("create-company-scope", { ...live, [DRAWER]: live[DRAWER].replace("createSafetyAccident({ operating_company_id: companyId, ...payload })", "createSafetyAccident(payload)") }, "company-scoped accident record");
  expectCaught("create-refresh", { ...live, [PAGE]: live[PAGE].replace('invalidateQueries({ queryKey: ["safety"] })', 'invalidateQueries({ queryKey: ["unrelated"] })') }, "refresh the canonical list");
  // 5b. record_type (P44 derived shape): the REGRESSED version of the fix itself — gating the
  //     derivation behind an `if (knownCodes.includes(code))` so a non-canonical accident type leaves
  //     recordType stale instead of resolving it. This is the exact defect this session's fix closed.
  expectCaught(
    "record-type-derivation-gated",
    {
      ...live,
      [DRAWER]: live[DRAWER].replace(
        'setRecordType(code === "damage" || code === "vandalism" ? code : "accident");',
        'if (code === "damage" || code === "vandalism") setRecordType(code);'
      ),
    },
    "not unconditional"
  );
  // 6. the enum stops being sent.
  expectCaught(
    "enum-dropped-from-payload",
    { ...live, [DRAWER]: live[DRAWER].replace("record_type: recordType,", "") },
    "record_type is not in the save payload"
  );
  // 7. the backend stops writing the enum.
  expectCaught(
    "enum-not-written",
    { ...live, [ROUTE]: live[ROUTE].replace(/SET record_type = \$3,/, "SET ") },
    "record_type is never written"
  );
  // 8. cost lines stop being sent — money silently discarded.
  expectCaught(
    "cost-lines-dropped-from-payload",
    { ...live, [DRAWER]: live[DRAWER].replace(/cost_lines: costLines/, "unused_cost_lines: costLines") },
    "every cost line the user entered is discarded"
  );
  // 9. cost lines accepted but never persisted.
  expectCaught(
    "cost-lines-not-inserted",
    { ...live, [ROUTE]: live[ROUTE].replace("INSERT INTO safety.accident_cost_lines", "SELECT 1 -- safety.accident_cost_lines") },
    "never INSERTs them into safety.accident_cost_lines"
  );
  // 9b. RE-ANCHOR REGRESSION GUARD: the mutation above only removes the FIRST occurrence in the
  // whole file (String.replace is non-global) — since PR #17629 there are TWO (POST create + PATCH
  // append-only reconciliation). If a future edit removed the POST-route scoping added in this
  // re-anchor and went back to a whole-file test, the PATCH handler's copy would mask a POST
  // regression again. Prove the bounded check actually looks at the POST route, not the whole file,
  // by mutating ONLY the PATCH handler's copy (the second occurrence) and confirming that alone
  // does NOT trip this guard (a real PATCH-only regression is verify-safety-accident-patch-persists-
  // cost-lines.mjs's job, not this file's).
  {
    const patchOnlyMutated = live[ROUTE].replace(
      /(app\.patch\("\/api\/v1\/safety\/accidents\/:id",[\s\S]*?)INSERT INTO safety\.accident_cost_lines/,
      "$1SELECT 1 -- safety.accident_cost_lines"
    );
    if (patchOnlyMutated === live[ROUTE]) {
      failures.push("post-route-scope-selftest-setup FAIL: could not locate the PATCH handler's INSERT to mutate");
    } else {
      const problems = assertAccidentFieldsPersisted({ ...live, [ROUTE]: patchOnlyMutated });
      if (problems.some((p) => p.includes("never INSERTs them into safety.accident_cost_lines"))) {
        failures.push("post-route-scope FAIL: mutating only the PATCH handler's copy wrongly tripped the POST-scoped check — the bounding is not actually scoped to POST");
      }
    }
  }

  const liveProblems = assertAccidentFieldsPersisted(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 13 planted persistence/identity defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertAccidentFieldsPersisted();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — accident create→list→exact detail identity plus ${FIELDS.length} text fields, ${ENUM_FIELDS.length} enums and cost lines persist`
);
