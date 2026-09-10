#!/usr/bin/env node
/**
 * LDT-6 guard — Settlement tab: driver + company settlement from the SAME tour readout as Pre-Settlement; closed = frozen.
 * Register § LDT-6 (owner order 2026-09-05 23:00Z). Lead build 2026-09-06.
 *   - no <input>/<select>/<textarea> in the Settlement tab (frozen; corrections are reversing entries)
 *   - driver card: loaded miles / rate / pay · empty miles / rate / pay · gross · escrow · recoveries · net; company card: revenue · costs · driver pay
 *     · factoring · margin with $/mi practical AND real; every settlement line shows its GL account or "no account"
 *   - both readouts sum from the readout (company margin = readout margin; driver gross = bills or header)
 *   - state chip + frozen note; PDF link to the settlement PDF route; unknown numbers render "—" never 0
 * `--selftest` plants an <input>, a second read model, and removes the frozen note.
 */
import fs from "node:fs";
const SET = "apps/frontend/src/components/dispatch/TourSettlementTab.tsx";
const read = (p) => fs.readFileSync(p, "utf8");
function audit(src) {
  const p = [];
  if (/<input|<select|<textarea/.test(src)) p.push("Settlement tab has an editable field — closed settlements are frozen");
  if (!/getTourReadoutForLoad\(/.test(src)) p.push("Settlement tab does not read the tour readout");
  if (/getPreSettlementForDriver|settlement-summary/.test(src)) p.push("Settlement tab reads a second model");
  for (const [label, re] of [
    ["driver settlement card", /data-testid="driver-settlement-card"/],
    ["company settlement card", /data-testid="company-settlement-card"/],
    ["driver bills use distinct data columns", /<ParityTable rows=\{bills\} rowKey=\{b => b\.id\}/],
    ["loaded miles column", /key: "loaded_miles", label: "Loaded miles"[^\n]*render: b => miles\(b\.miles_basis\)/],
    ["loaded rate column", /key: "loaded_rate", label: "Loaded rate"[^\n]*render: b => rate\(b\.rate_per_mile_cents\)/],
    ["loaded pay column", /key: "loaded_pay", label: "Loaded pay"[^\n]*render: b => money\(b\.loaded_pay_cents, currencyCode\)/],
    ["empty miles column", /key: "empty_miles", label: "Empty miles"[^\n]*render: b => miles\(b\.miles_deadhead\)/],
    ["empty rate column", /key: "empty_rate", label: "Empty rate"[^\n]*render: b => rate\(b\.rate_empty_per_mile_cents\)/],
    ["empty pay column", /key: "empty_pay", label: "Empty pay"[^\n]*render: b => money\(b\.deadhead_pay_cents, currencyCode\)/],
    ["gross · escrow · recoveries · net", /data-testid="driver-gross"[\s\S]*Escrow contribution[\s\S]*Recoveries[\s\S]*data-testid="driver-net"/],
    ["company revenue · costs · driver pay · factoring · margin", /Revenue \(\{r\.legs\.length\}[\s\S]*Costs \(\{r\.costs\.length\}[\s\S]*Driver pay[\s\S]*Factoring[\s\S]*data-testid="company-margin"/],
    ["$/mi practical row", /<span>Per practical mile<\/span><span className="ldt-m">\{perMile\(tot\.per_mile_practical_cents\)\}/],
    ["$/mi real row", /<span>Per real mile<\/span><span className="ldt-m">\{perMile\(tot\.per_mile_real_cents\)\}/],
    ["GL account per line", /l\.account_label \?\? <span className="ldt-pill bad">no account<\/span>/],
    // REG-024 (owner 2026-09-10) — AlwaysTrack Company Settlement parity: the four PDF sections must
    // be on-screen (CUSTOMER CHARGES · DRIVER PAYMENT is the driver card above · FUEL + EXPENSES · REVENUE
    // waterfall). Every figure is DERIVED from the same readout (no second sum), so this only asserts the
    // sections render — the numbers are guarded by the readout's own tests.
    ["REG-024 customer charges section", /data-testid="settlement-customer-charges"/],
    ["REG-024 customer charges total line haul", /data-testid="customer-charges-total-amount"/],
    ["REG-024 fuel & expenses section", /data-testid="settlement-fuel-expenses"/],
    ["REG-024 revenue waterfall section", /data-testid="settlement-revenue-waterfall"/],
    ["REG-024 revenue net row (% + per-mile)", /data-testid="revenue-row-net"/],
    ["frozen note", /Closed = frozen: no editable field; corrections are a reversing entry\./],
    ["PDF link", /data-testid="settlement-pdf-link"/],
    ["dash never zero for unknown miles", /const miles = \(m: number \| null \| undefined\) => \(m == null \? DASH/],
  ]) if (!re.test(src)) p.push(`${label} missing`);
  if (/Loaded \{miles\([^\n]*×|Empty \{miles\([^\n]*×/.test(src)) p.push("compound miles × rate cell is forbidden by REG-010/011");
  return p;
}
const src = read(SET);
if (process.argv.includes("--selftest")) {
  const plants = [
    ["loaded rate column missing", src.replace('label: "Loaded rate"', 'label: "Loaded"')],
    ["empty miles column missing", src.replace('label: "Empty miles"', 'label: "Empty"')],
    ["real per-mile row missing", src.replace("Per real mile", "Per mile")],
    ["compound rate cell restored", src + "\nLoaded {miles(b.miles_basis)} × {rate(b.rate_per_mile_cents)}"],
    ["editable field planted", src + '\n// <input value="x" />'],
    ["second read model", src + "\n// getPreSettlementForDriver()"],
    ["frozen note removed", src.replace("Closed = frozen: no editable field; corrections are a reversing entry.", "Closed.")],
    ["REG-024 customer charges removed", src.replace('data-testid="settlement-customer-charges"', 'data-testid="x"')],
    ["REG-024 fuel & expenses removed", src.replace('data-testid="settlement-fuel-expenses"', 'data-testid="x"')],
    ["REG-024 revenue waterfall removed", src.replace('data-testid="settlement-revenue-waterfall"', 'data-testid="x"')],
    ["dash rule removed", src.replace("const miles = (m: number | null | undefined) => (m == null ? DASH", "const miles = (m: number | null | undefined) => (m == null ? 0")],
  ];
  let escaped = 0; for (const [l, m] of plants) if (audit(m).length === 0) { console.error(`SELFTEST FAIL — not caught: ${l}`); escaped++; }
  const clean = audit(src); if (clean.length) { console.error("SELFTEST FAIL — clean rejected:\n  " + clean.join("\n  ")); process.exit(1); }
  if (escaped) process.exit(1);
  console.log(`PASS verify-ldt-6-settlement-frozen --selftest: ${plants.length}/${plants.length} planted mutations caught`);
} else {
  const p = audit(src); if (p.length) { console.error("FAIL verify-ldt-6-settlement-frozen:\n  " + p.join("\n  ")); process.exit(1); }
  console.log("PASS verify-ldt-6-settlement-frozen: frozen · one readout · driver + company cards · GL per line · $/mi practical+real");
}
