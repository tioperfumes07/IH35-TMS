#!/usr/bin/env node
/**
 * GUARD (ratchet): REASSIGNING a driver must run the qualification gate, not just seating one at create.
 *
 * WIRE-QUEUE FAIL-D1 (P1): "Reassign bypasses the DQF gate that Book enforces."
 *
 * PROVEN ON PROD, not inferred: `L-20260808-0099` was dispatched at 20:32:33 with Neftali, whose CDL
 * expiry was set at 17:55:50 — it passed the gate legitimately. Today that load carries LUIS ARMANDO
 * SOSA PEREZ, `cdl_expires_at` and `dot_medical_expires_at` both NULL, swapped in while `in_transit`.
 * The load was compliant when it moved and is not now, and nothing looked.
 *
 * WHY THE EXISTING GUARD DOES NOT COVER THIS: verify-load-write-paths-run-driver-qualification asserts
 * the gate on paths that INSERT a load with a driver. This is the other half — an UPDATE that changes
 * `assigned_primary_driver_id` on a load that already exists. Create-time enforcement plus no re-check
 * means a qualified load can become unqualified after the fact, which is the worse of the two for a
 * DOT/FMCSA reviewer: the record shows a clean dispatch and an unqualified driver actually driving.
 *
 * SWEPT ON MAIN — every file that both UPDATEs mdata.loads and names the driver column was checked for
 * whether its UPDATE actually SETs the driver. Only ONE does:
 *   dispatch/dispatch-refinements.service.ts:78   SET assigned_primary_driver_id = $2   gate refs 0
 * The others (update-load, load-distribution, loads.routes, driver/loads.routes, abandonment,
 * driver-pwa, samsara detector) reference the column only in SELECTs or WHEREs — they do not reassign,
 * so demanding the gate there would be a false positive.
 *
 * Listed rather than failing red: the fix is product code owned by the dispatch write-path seat. The
 * guard fails when the LIST is wrong — a new reassign path appears, or the listed one starts calling
 * the gate and the entry is left stale. The register may only shrink.
 *
 * Run:  node scripts/verify-driver-reassign-runs-qualification.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(root, "apps/backend/src");
const LABEL = "verify-driver-reassign-runs-qualification";
const GATE = "assertDriverQualifiedForLoad";

const KNOWN_GAPS = new Map([
  [
    "apps/backend/src/onboarding/seed-sample-data.ts",
    "Sample-data seeder; rows it writes are fixtures by construction.",
  ],
]);

const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** True when the file contains an UPDATE of mdata.loads whose SET clause assigns the driver column. */
export function reassignsDriver(code) {
  const re = /UPDATE\s+mdata\.loads\b/gi;
  let m;
  while ((m = re.exec(code)) !== null) {
    const end = code.indexOf("`", m.index);
    const stmt = code.slice(m.index, end === -1 ? m.index + 700 : end);
    if (/\bassigned_primary_driver_id\s*=/.test(stmt)) return true;
  }
  return false;
}

export function collectProblems(files) {
  const problems = [];
  const inScope = [];
  for (const { rel, src } of files) {
    const code = strip(src);
    if (!reassignsDriver(code)) continue;
    inScope.push({ rel, runsGate: code.includes(GATE) });
  }
  for (const { rel, runsGate } of inScope) {
    const known = KNOWN_GAPS.has(rel);
    if (!runsGate && !known) {
      problems.push(
        `${rel}: UPDATEs mdata.loads SET assigned_primary_driver_id without calling ${GATE}. A load that passed ` +
          `the gate at dispatch can be handed to an unqualified driver afterwards (FAIL-D1). Wire the gate or add ` +
          `it to KNOWN_GAPS with a reason.`
      );
    }
    if (runsGate && known) {
      problems.push(`${rel}: now calls ${GATE} — remove it from KNOWN_GAPS so the ratchet cannot slip back.`);
    }
  }
  for (const rel of KNOWN_GAPS.keys()) {
    if (!inScope.some((f) => f.rel === rel)) {
      problems.push(`${rel}: listed in KNOWN_GAPS but no longer reassigns a driver — delete the entry.`);
    }
  }
  return problems;
}

function readTree() {
  return walk(SRC_DIR).map((f) => ({ rel: path.relative(root, f), src: fs.readFileSync(f, "utf8") }));
}

function selftest() {
  const mk = (rel, src) => ({ rel, src });
  const UPD = "await c.query(`UPDATE mdata.loads SET assigned_primary_driver_id = $2 WHERE id = $1`)";
  const cases = [
    { name: "real tree passes", files: null, expect: 0 },
    { name: "new ungated reassign path caught", files: [mk("apps/backend/src/dispatch/new.ts", UPD)], expectAtLeast: 1 },
    { name: "gated reassign passes", files: [mk("apps/backend/src/dispatch/g.ts", `${GATE}(c,{}); ${UPD}`)], expect: 0 },
    {
      name: "SELECT-only reference is out of scope (no false positive)",
      files: [mk("apps/backend/src/dispatch/s.ts", "await c.query(`SELECT assigned_primary_driver_id FROM mdata.loads`); await c.query(`UPDATE mdata.loads SET status = $2`)")],
      expect: 0,
    },
    { name: "comment-only gate mention rejected", files: [mk("apps/backend/src/dispatch/c.ts", `// ${GATE}\n${UPD}`)], expectAtLeast: 1 },
  ];
  let pass = 0;
  for (const c of cases) {
    const files = c.files ?? readTree();
    const problems = c.files
      ? collectProblems(files).filter((p) => !p.includes("no longer reassigns"))
      : collectProblems(files);
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`${LABEL}: FAIL — ${SRC_DIR} not found`);
    return 1;
  }
  const problems = collectProblems(readTree());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  for (const [rel, why] of KNOWN_GAPS) console.log(`  KNOWN GAP (must shrink) — ${rel}\n      ${why}`);
  return 0;
}

process.exit(main());
