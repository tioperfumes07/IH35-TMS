#!/usr/bin/env node
/**
 * LEGAL-PAPER-01 — the driver-escrow FORFEIT route must resolve the signed clause before it moves
 * money, and the resolver must accept a WET (paper) signature.
 *
 * WHY THIS GUARD EXISTS
 * POST /api/v1/driver-finance/escrow/:driverId/forfeit gated ONLY on requireAuth +
 * canForfeit(role). Role answers WHO may act; it does not answer WHETHER any signed document
 * authorises taking a worker's held funds. The READ path next door (debt.routes.ts →
 * /escrow-target) already resolved has_signed_clause and the UI displayed it — so the flag existed,
 * was shown to the operator, and was then ignored by the one call that actually takes the money.
 * Forfeiting driver escrow with no signed authorisation is wage-deduction exposure (DOL / TX Payday
 * Law), and with escrow booked as a Chapter-11 liability it is an estate-property problem too.
 *
 * The second half is the reason the gate was survivable to add: Jorge's driver contracts are signed
 * ON PAPER, and (verified on the prod branch 2026-07-26) legal.contract_instance_status had no value
 * meaning a wet signature. So the gate had to be widened at the same time it was enforced, or it
 * would have refused every real contract. Held migration 202609140000 adds 'signed_on_paper'.
 *
 * WHAT THIS ASSERTS — all static, no DB required:
 *   1. the forfeit route imports and CALLS the shared resolver (not a second, drifting definition)
 *   2. it branches on hasSignedClause and refuses with escrow_forfeit_no_signed_clause
 *   3. the refusal is positioned BEFORE forfeitDriverEscrow( — a gate after the money mover is not a gate
 *   4. the shared resolver accepts BOTH signed states, via ::text (the enum value is not on prod yet)
 *   5. a paper signature only counts when the scan (signed_pdf_attachment_id) is attached
 *   6. migration 202609140000 adds the value idempotently and is registered as HELD
 *   7. the route stays out of the escrow-posting lane (no apply_escrow_posting_delta / new GL math)
 *
 *   node scripts/verify-escrow-forfeit-signed-clause-gate.mjs
 *   node scripts/verify-escrow-forfeit-signed-clause-gate.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-forfeit-signed-clause-gate";

const FORFEIT_ROUTES = "apps/backend/src/driver-finance/escrow-forfeit.routes.ts";
const TARGET_SVC = "apps/backend/src/driver-finance/escrow-target.service.ts";
const MIG = "db/migrations/202609140000_legal_contract_signed_on_paper_status.sql";
const HELD = "db/migrations/.held-migrations.json";
const MIG_BASENAME = path.basename(MIG);
const RESOLVER = "resolveDriverEscrowTarget";
const REFUSAL = "escrow_forfeit_no_signed_clause";
const PAPER = "signed_on_paper";

const FILES = [FORFEIT_ROUTES, TARGET_SVC, MIG, HELD];

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Comments explain a gate; they are not the gate. Every code assertion runs on stripped source. */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function stripSqlComments(s) {
  return s.replace(/^[ \t]*--.*$/gm, "");
}

export function assertGate(root = ROOT) {
  const problems = [];

  for (const rel of FILES) {
    if (!fs.existsSync(path.join(root, rel))) {
      problems.push(`missing ${rel}`);
    }
  }
  if (problems.length) return problems;

  // ---- 1..3, 7: the forfeit ROUTE -----------------------------------------------------------
  const route = stripComments(read(root, FORFEIT_ROUTES));

  if (!new RegExp(`import[\\s\\S]{0,200}\\b${RESOLVER}\\b[\\s\\S]{0,80}escrow-target\\.service\\.js`).test(route)) {
    problems.push(
      `${FORFEIT_ROUTES}: must import ${RESOLVER} from ./escrow-target.service.js — the forfeit gate has to use the SAME definition of "signed" as the read path, or the screen and the gate drift apart`,
    );
  }
  if (!new RegExp(`${RESOLVER}\\s*\\(`).test(route)) {
    problems.push(`${FORFEIT_ROUTES}: must CALL ${RESOLVER}( — importing it is not gating on it`);
  }
  if (!/hasSignedClause/.test(route)) {
    problems.push(`${FORFEIT_ROUTES}: must branch on hasSignedClause — resolving it and discarding it is the defect this guard exists for`);
  }
  if (!/if\s*\(\s*!\s*\w+\.hasSignedClause\s*\)/.test(route)) {
    problems.push(`${FORFEIT_ROUTES}: must REFUSE on a falsy hasSignedClause (fail closed), e.g. \`if (!clause.hasSignedClause) return reply.code(409)...\``);
  }
  if (!route.includes(REFUSAL)) {
    problems.push(`${FORFEIT_ROUTES}: the refusal must carry the stable error code "${REFUSAL}" so the UI can explain the remedy`);
  }

  // 3 — ordering. The gate is worthless if the money already moved.
  const gateAt = route.search(/if\s*\(\s*!\s*\w+\.hasSignedClause\s*\)/);
  const moverAt = route.search(/forfeitDriverEscrow\s*\(/);
  if (gateAt >= 0 && moverAt >= 0 && gateAt > moverAt) {
    problems.push(
      `${FORFEIT_ROUTES}: the hasSignedClause refusal appears AFTER the forfeitDriverEscrow( call — a gate that runs once the money has moved is not a gate`,
    );
  }
  const resolveAt = route.search(new RegExp(`${RESOLVER}\\s*\\(`));
  if (resolveAt >= 0 && moverAt >= 0 && resolveAt > moverAt) {
    problems.push(`${FORFEIT_ROUTES}: ${RESOLVER}( is called AFTER forfeitDriverEscrow( — resolve the authorisation before acting on it`);
  }

  // 7 — lane boundary: this route authorises, it does not post. No new GL math here.
  if (/apply_escrow_posting_delta|accounting\.escrow_/.test(route)) {
    problems.push(`${FORFEIT_ROUTES}: must not reach into the escrow-posting lane (apply_escrow_posting_delta / accounting.escrow_*) — it gates, the service posts`);
  }

  // ---- 4..5: the shared RESOLVER ------------------------------------------------------------
  const svc = stripComments(read(root, TARGET_SVC));

  if (!/has_signed_clause/.test(svc)) {
    problems.push(`${TARGET_SVC}: must still expose has_signed_clause`);
  }
  if (!/legal\.contract_instances/.test(svc)) {
    problems.push(`${TARGET_SVC}: has_signed_clause must read legal.contract_instances — never infer a signature from a data side-effect`);
  }
  if (!/ci\.status::text\s+IN\s*\(/i.test(svc)) {
    problems.push(
      `${TARGET_SVC}: compare ci.status::text, not the bare enum — migration 202609140000 is HELD, so an unqualified '${PAPER}' literal raises 22P02 on prod until the owner applies it`,
    );
  }
  // Read the ACCEPTED-STATUS LIST itself, not the whole file: '${PAPER}' also appears in the
  // scan-required clause below, so a file-wide includes() stayed green when the value was dropped
  // out of the IN list — caught by this guard's own selftest before it shipped.
  const inList = /ci\.status::text\s+IN\s*\(([^)]*)\)/i.exec(svc)?.[1] ?? "";
  if (!inList.includes("'signed_electronically'")) {
    problems.push(`${TARGET_SVC}: e-signed contracts must still count as signed (missing from the accepted-status list)`);
  }
  if (!inList.includes(`'${PAPER}'`)) {
    problems.push(
      `${TARGET_SVC}: must accept '${PAPER}' in the accepted-status list — the owner's driver contracts are signed on paper, and a gate that refuses every real contract gets disabled instead of respected`,
    );
  }
  if (!/signed_at IS NOT NULL/.test(svc) || !/voided_at IS NULL/.test(svc)) {
    problems.push(`${TARGET_SVC}: a signed contract must have signed_at set and voided_at null`);
  }
  if (!new RegExp(`${PAPER}'\\s*OR ci\\.signed_pdf_attachment_id IS NOT NULL`).test(svc)) {
    problems.push(
      `${TARGET_SVC}: a '${PAPER}' row must carry signed_pdf_attachment_id (the scan of the executed original) — otherwise "signed on paper" is an unfalsifiable claim that unlocks a forfeiture`,
    );
  }

  // ---- 6: the MIGRATION ----------------------------------------------------------------------
  const mig = stripSqlComments(read(root, MIG));

  if (!new RegExp(`ALTER TYPE legal\\.contract_instance_status\\s*\\n?\\s*ADD VALUE IF NOT EXISTS '${PAPER}'`, "i").test(mig)) {
    problems.push(`${MIG}: must ADD VALUE IF NOT EXISTS '${PAPER}' on legal.contract_instance_status (idempotent form)`);
  }
  if (/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/i.test(mig)) {
    problems.push(`${MIG}: additive only — no DROP/TRUNCATE/DELETE (void-not-delete)`);
  }
  if (!/contract_instances_paper_signature_evidence_check/.test(mig)) {
    problems.push(`${MIG}: must add the evidence CHECK requiring signed_at + signed_pdf_attachment_id for a paper signature`);
  }
  if (!/FROM pg_constraint/i.test(mig)) {
    problems.push(`${MIG}: the CHECK must be catalog-guarded (idempotent) — ADD CONSTRAINT has no IF NOT EXISTS`);
  }
  // The enum value cannot be USED in the transaction that adds it.
  const addAt = mig.search(/ADD VALUE IF NOT EXISTS/i);
  const commitAfterAdd = mig.indexOf("COMMIT", addAt < 0 ? 0 : addAt);
  const checkAt = mig.search(/ADD CONSTRAINT contract_instances_paper_signature_evidence_check/i);
  if (addAt >= 0 && checkAt >= 0 && !(commitAfterAdd > addAt && commitAfterAdd < checkAt)) {
    problems.push(
      `${MIG}: the CHECK compares against '${PAPER}' and must come AFTER a COMMIT of the ALTER TYPE — PostgreSQL forbids using an enum value in the transaction that added it`,
    );
  }
  if (!/DO NOT RUN ON PROD/i.test(read(root, MIG).slice(0, 1200))) {
    problems.push(`${MIG}: must carry the DO-NOT-RUN-ON-PROD marker in its header — it is build-and-hold`);
  }

  const held = JSON.parse(read(root, HELD));
  const registered = Object.values(held)
    .filter(Array.isArray)
    .flat()
    .some((h) => h?.file === MIG_BASENAME);
  if (!registered) {
    problems.push(`${HELD}: ${MIG_BASENAME} is not registered — an unregistered migration is auto-applied by db:migrate on the next prod deploy`);
  }

  return problems;
}

/** Plant a defect, assert the guard catches it. Each entry is a real regression shape. */
function selftest() {
  const failures = [];

  const live = assertGate();
  if (live.length) failures.push(`live repo FAILS its own guard: ${live.join("; ")}`);

  const mutations = [
    {
      name: "gate removed entirely (the pre-fix code)",
      file: FORFEIT_ROUTES,
      // NB: \x7d, not a literal closing brace. verify-selftests-can-fail extracts this function by
      // counting braces, so an unpaired closing brace anywhere in here — even inside a regex
      // literal or a comment — truncates the body early and makes it read as fake-green.
      apply: (s) =>
        s
          .replace(/const clause = await withCurrentUser[\s\S]*?\n      \x7d\n\n/, "")
          .replace(/if \(!clause\.hasSignedClause\)[\s\S]*?\n      \x7d\n/, ""),
      expect: /must CALL|must branch on hasSignedClause|must REFUSE/,
    },
    {
      name: "resolved but discarded (flag computed, never enforced)",
      file: FORFEIT_ROUTES,
      apply: (s) => s.replace(/if \(!clause\.hasSignedClause\)/, "if (false && !clause.hasSignedClause)"),
      expect: /must REFUSE on a falsy hasSignedClause/,
    },
    {
      name: "paper signature dropped from the predicate",
      file: TARGET_SVC,
      apply: (s) => s.replace(/'signed_electronically', 'signed_on_paper'/, "'signed_electronically'"),
      expect: /must accept 'signed_on_paper'/,
    },
    {
      name: "paper accepted with no scan attached",
      file: TARGET_SVC,
      apply: (s) => s.replace(/AND \(ci\.status::text <> 'signed_on_paper' OR ci\.signed_pdf_attachment_id IS NOT NULL\)/, ""),
      expect: /must carry signed_pdf_attachment_id/,
    },
    {
      name: "bare enum literal that 22P02s until the held migration lands",
      file: TARGET_SVC,
      apply: (s) => s.replace(/ci\.status::text IN \(/, "ci.status IN ("),
      expect: /compare ci\.status::text/,
    },
    {
      name: "CHECK moved into the transaction that adds the enum value",
      file: MIG,
      apply: (s) => s.replace(/COMMIT;\s*\n\s*BEGIN;/, ""),
      expect: /must come AFTER a COMMIT of the ALTER TYPE/,
    },
    {
      name: "migration loses its held marker",
      file: MIG,
      apply: (s) => s.replace(/DO NOT RUN ON PROD/g, "safe to run"),
      expect: /DO-NOT-RUN-ON-PROD marker/,
    },
  ];

  for (const m of mutations) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-forfeit-clause-"));
    try {
      for (const rel of FILES) {
        const dest = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(ROOT, rel), dest);
      }
      const before = read(tmp, m.file);
      const after = m.apply(before);
      if (after === before) {
        failures.push(`mutation "${m.name}" did not change ${m.file} — the plant is stale, so it proves nothing`);
        continue;
      }
      fs.writeFileSync(path.join(tmp, m.file), after);
      const found = assertGate(tmp);
      if (!found.some((p) => m.expect.test(p))) {
        failures.push(`mutation "${m.name}" NOT caught (expected ${m.expect}); got: ${found.join("; ") || "no problems at all"}`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAILED:\n${failures.map((f) => `  ✗ ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — ${mutations.length} planted defects all caught`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  selftest();
}

const problems = assertGate();
if (problems.length) {
  console.error(`${LABEL} FAILED:\n${problems.map((p) => `  ✗ ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — forfeit gates on the shared signed-clause resolver; paper signatures count only with the scan attached.`);
