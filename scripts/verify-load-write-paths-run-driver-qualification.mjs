#!/usr/bin/env node
/**
 * GUARD (ratchet): every path that writes a DRIVER onto a load must run the driver-qualification gate.
 *
 * FAIL-DQF-GATE — specced by CC-3 2026-08-08 from the prod audit trail, not from current row state.
 *
 * WHAT WAS MEASURED (Neon prod br-fancy-credit-akjnd07a, USMCA):
 *   - 13 loads have ever reached `dispatched` or beyond. **4 of them moved while their driver had NO
 *     `cdl_expires_at` on record at that instant**: L-20260802-0258 (2026-08-06 16:50:09),
 *     LUSMCAFREIGHT-20260806-0001 (17:03:34), L-20260806-0008 (2026-08-08 07:13:50) and
 *     LUSMCAFREIGHT-20260808-0001 (20:00:01). Reconstructed from audit.row_changes — DQF columns were
 *     edited only 5 times ever, so each driver's state at each transition is exactly determined.
 *   - The gate itself is CORRECT and is satisfiable: the other 9 transitions happened after their
 *     driver's CDL was set, and were clean. This is a plumbing gap, not a broken rule.
 *   - `audit.audit_events` holds ZERO override/attestation rows, so these were not Owner overrides —
 *     the gate never evaluated on those paths.
 *
 * THE GATE: `assertDriverQualifiedForLoad` in dispatch/driver-qualification.service.ts (predicate at
 * ~:330 — cdl_missing / cdl_expired / med_missing / med_expired, plus the D3-1 hazmat branch which DOES
 * test `hazmat_endorsement_expires_at` for NULL and for expiry).
 *
 * WHY A RATCHET AND NOT A HARD ASSERT: `mdata/loads.routes.ts` does not call the gate today and that is
 * a real open P1 owned by the dispatch write-path seat, not by this guard. A hard assert would ship red
 * and block every unrelated PR, which is how guards get disabled. So the known gap is listed explicitly
 * below and the guard fails when the list is WRONG — a new load-writing path appears, or a path that
 * already runs the gate stops running it. The list is a debt register that may only shrink.
 *
 * WHAT THIS DOES NOT COVER (stated so nobody reads a green here as "qualification is enforced"):
 *   - Reassignment after dispatch. Measured: L-20260808-0099 passed the gate with a qualified driver at
 *     20:32:33 and today carries a driver with NULL cdl_expires_at — swapped in while `in_transit`, with
 *     no re-check. A source guard cannot see that; it needs the gate wired into the reassign path.
 *   - Fixture-vs-real. `is_sample_data = true` on **0 of 95** USMCA drivers, so nothing tells the gate
 *     which incomplete drivers are legitimately incomplete. That is a data problem, not a code one.
 *
 * Run:  node scripts/verify-load-write-paths-run-driver-qualification.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(root, "apps/backend/src");
const LABEL = "verify-load-write-paths-run-driver-qualification";
const GATE = "assertDriverQualifiedForLoad";

/**
 * Known gaps at the time of writing, each with WHY it is tolerated. This list may only shrink — adding
 * to it is a deliberate act that shows up in review.
 */
const KNOWN_GAPS = new Map([
  [
    "apps/backend/src/mdata/loads.routes.ts",
    "OPEN P1 (FAIL-DQF-GATE hole #1): creates loads WITH a driver and never calls the gate. Produced " +
      "LUSMCAFREIGHT-20260808-0001, dispatched 2026-08-08 20:00:01 with no CDL on record. Owner: dispatch write-path.",
  ],
  [
    "apps/backend/src/seed/csv-seed-import.ts",
    "Bulk seed importer, not an operator surface — imported rows are exempt by the row-origin ruling.",
  ],
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

/** A file is in scope when it INSERTs a load AND names the driver column — i.e. it can seat a driver. */
export function classify(files) {
  const inScope = [];
  for (const { rel, src } of files) {
    const code = strip(src);
    if (!/INSERT\s+INTO\s+mdata\.loads/i.test(code)) continue;
    if (!/assigned_primary_driver_id/.test(code)) continue;
    inScope.push({ rel, runsGate: code.includes(GATE) });
  }
  return inScope;
}

export function collectProblems(files) {
  const problems = [];
  const inScope = classify(files);

  for (const { rel, runsGate } of inScope) {
    const known = KNOWN_GAPS.has(rel);
    if (!runsGate && !known) {
      problems.push(
        `${rel}: writes a driver onto a load (INSERT INTO mdata.loads + assigned_primary_driver_id) but never ` +
          `calls ${GATE}. A new unqualified-dispatch path — wire the gate or add it to KNOWN_GAPS with a reason.`
      );
    }
    if (runsGate && known) {
      problems.push(
        `${rel}: now calls ${GATE} — remove it from KNOWN_GAPS so the ratchet cannot slip back. (Good news; ` +
          `this failure is the guard telling you the debt register is stale.)`
      );
    }
  }

  for (const rel of KNOWN_GAPS.keys()) {
    if (!inScope.some((f) => f.rel === rel)) {
      problems.push(
        `${rel}: listed in KNOWN_GAPS but no longer writes a driver onto a load. Delete the entry — a stale ` +
          `exemption silently widens the guard.`
      );
    }
  }
  return problems;
}

function selftest() {
  const mk = (rel, src) => ({ rel, src });
  const INSERT = "INSERT INTO mdata.loads (operating_company_id, assigned_primary_driver_id)";
  const cases = [
    { name: "real tree passes", files: null, expect: 0 },
    {
      name: "a NEW ungated driver-writing path is caught",
      files: [mk("apps/backend/src/dispatch/new-thing.ts", `await c.query(\`${INSERT} VALUES ($1,$2)\`)`)],
      expectAtLeast: 1,
    },
    {
      name: "a gated path passes",
      files: [mk("apps/backend/src/dispatch/x.ts", `${GATE}(c,{}); await c.query(\`${INSERT}\`)`)],
      expect: 0,
    },
    {
      name: "a KNOWN_GAP that starts calling the gate is flagged so the list shrinks",
      files: [mk("apps/backend/src/mdata/loads.routes.ts", `${GATE}(c,{}); await c.query(\`${INSERT}\`)`)],
      expectAtLeast: 1,
    },
    {
      name: "a load INSERT with no driver column is out of scope",
      files: [mk("apps/backend/src/x.ts", "await c.query(`INSERT INTO mdata.loads (operating_company_id)`)")],
      expect: 0,
    },
    {
      name: "a comment mentioning the gate does not satisfy it",
      files: [mk("apps/backend/src/dispatch/y.ts", `// ${GATE}\nawait c.query(\`${INSERT}\`)`)],
      expectAtLeast: 1,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const files = c.files ?? readTree();
    // Synthetic cases carry only their own file; suppress the stale-entry arm for them.
    const problems = c.files
      ? collectProblems(files).filter((p) => !p.includes("no longer writes a driver"))
      : collectProblems(files);
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function readTree() {
  return walk(SRC_DIR).map((f) => ({
    rel: path.relative(root, f),
    src: fs.readFileSync(f, "utf8"),
  }));
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
