#!/usr/bin/env node
// GUARD — verify-settlement-line-off-is-voided.mjs (Claude-Lead, AUTH-072, 2026-09-26)
//
// A settlement line is switched off ONLY by voiding it. voided_at is the void marker the unique index
// (uniq_settlement_lines_source_driver_bill_id_line_type ... WHERE voided_at IS NULL), every reader and every
// guard key on; the pay-run engine additionally reads is_active. Measured 2026-09-26: 113 lines ($3,010.50;
// 77 escrow_contribution x $25) across 35 settlements were is_active=false with voided_at NULL — the GL
// excluded them, every void-keyed view counted them (the "duplicate escrow lines", S-5816 closed with no JE).
//
// FAIL (whole book, USMCA, not windowed — a half-void is a defect at any age):
//   A. OFF_NOT_VOIDED  — is_active = false AND voided_at IS NULL
//   B. VOIDED_STILL_ON — is_active = true  AND voided_at IS NOT NULL
// Static: no backend writer sets settlement_lines.is_active = false without also setting voided_at.
//
// Self-test: node scripts/verify-settlement-line-off-is-voided.mjs --selftest
export const REQUIRES_LIVE_DB = "driver_finance.settlement_lines — must fail-closed, never skip";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-settlement-line-off-is-voided";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every UPDATE of settlement_lines that sets is_active = false must also set voided_at. Pure — selftested. */
export function findBareSwitchOffs(source) {
  const hits = [];
  const re = /UPDATE\s+driver_finance\.settlement_lines\b[\s\S]*?\bSET\b([\s\S]*?)\bWHERE\b/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    const setClause = m[1];
    if (/\bis_active\s*=\s*false\b/i.test(setClause) && !/\bvoided_at\s*=/i.test(setClause)) {
      hits.push(source.slice(0, m.index).split("\n").length);
    }
  }
  return hits;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

export function classify({ offNotVoided, voidedStillOn, bareWriters }) {
  const problems = [];
  if (offNotVoided.n > 0) problems.push(`OFF_NOT_VOIDED: ${offNotVoided.n} settlement line(s) ($${offNotVoided.amount}) across ${offNotVoided.settlements} settlement(s) are is_active=false with voided_at NULL — stamp the void. e.g. ${offNotVoided.sample.join(", ")}`);
  if (voidedStillOn.n > 0) problems.push(`VOIDED_STILL_ON: ${voidedStillOn.n} voided settlement line(s) are still is_active=true.`);
  for (const w of bareWriters) problems.push(`BARE_SWITCH_OFF: ${w} sets settlement_lines.is_active=false without voided_at.`);
  return problems;
}

function runSelftest() {
  let fail = 0;
  const check = (name, ok) => { if (!ok) { console.error(`${LABEL} --selftest FAIL — ${name}`); fail += 1; } };
  check("bare flip is caught", findBareSwitchOffs("await q(`UPDATE driver_finance.settlement_lines\n SET is_active = false, updated_at = now()\n WHERE id=$1`)").length === 1);
  check("void-stamped flip passes", findBareSwitchOffs("UPDATE driver_finance.settlement_lines SET is_active = false, voided_at = COALESCE(voided_at, now()) WHERE id=$1").length === 0);
  check("other table ignored", findBareSwitchOffs("UPDATE driver_finance.driver_bills SET is_active = false WHERE id=$1").length === 0);
  check("RED on off-not-voided", classify({ offNotVoided: { n: 113, amount: "3010.50", settlements: 35, sample: ["S-5816"] }, voidedStillOn: { n: 0 }, bareWriters: [] }).length === 1);
  check("RED on voided-still-on", classify({ offNotVoided: { n: 0, sample: [] }, voidedStillOn: { n: 1 }, bareWriters: [] }).length === 1);
  check("GREEN when whole", classify({ offNotVoided: { n: 0, sample: [] }, voidedStillOn: { n: 0 }, bareWriters: [] }).length === 0);
  if (fail) process.exitCode = 1;
  else console.log(`${LABEL} --selftest PASS — 6 fixtures`);
}

async function runFull() {
  const bareWriters = [];
  for (const f of walk(path.join(ROOT, "apps/backend/src"))) {
    for (const line of findBareSwitchOffs(fs.readFileSync(f, "utf8"))) bareWriters.push(`${path.relative(ROOT, f)}:${line}`);
  }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let offNotVoided, voidedStillOn;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    offNotVoided = (await client.query(
      `SELECT count(*)::int n, COALESCE(sum(sl.amount),0)::text amount, count(DISTINCT sl.settlement_id)::int settlements,
              COALESCE((array_agg(DISTINCT s.display_id))[1:10], '{}') sample
         FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
        WHERE sl.operating_company_id = $1::uuid AND sl.is_active = false AND sl.voided_at IS NULL`, [USMCA_COMPANY_ID])).rows[0];
    voidedStillOn = (await client.query(
      `SELECT count(*)::int n FROM driver_finance.settlement_lines
        WHERE operating_company_id = $1::uuid AND is_active = true AND voided_at IS NOT NULL`, [USMCA_COMPANY_ID])).rows[0];
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
  const problems = classify({ offNotVoided, voidedStillOn, bareWriters });
  if (problems.length) {
    console.error(`${LABEL}: FAIL\n` + problems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${LABEL}: PASS — 0 off-not-voided, 0 voided-still-on, 0 bare switch-off writers in apps/backend/src.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) runSelftest();
  else await runFull();
}
