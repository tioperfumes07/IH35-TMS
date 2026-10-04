#!/usr/bin/env node
/**
 * verify-driver-subaccount-numbers-one-per-driver — ROUND 389.3 RULING 2, CC-1.
 *
 * Every LIVE account under a driver-receivable or escrow parent is numbered <parent>-00-nnn
 * (^(1245|1255|1256|1257|2100)-00-[0-9]{3}$), and a driver's nnn is the SAME under every parent he has an account
 * in (LUIS ARMANDO SOSA PEREZ: 2100-00-001 and 1245-00-001). No more generated DRIVERCASHAD896665-nnn strings.
 *
 * STATIC:
 *   RULE 1 — both provisioners number their leaf from the shared allocator (allocateDriverSubAccountNnn) as
 *            <parent number>-00-nnn / <sub-parent number>-nnn; neither inserts a NULL account_number, and the advance
 *            parent resolves through the advance_recovery role.
 *   RULE 2 — hire allocates ONE nnn and passes it to both provisioners.
 *   RULE 3 — migration 202615390200 renames the existing advance sub-accounts in place to 1245-00-<escrow nnn>.
 * LIVE (direct, read-only, USMCA only):
 *   RULE 4 — 0 live accounts under 1245 / 1255 / 1256 / 1257 / 2100-00 (resolved by role / number shape) whose number
 *            does not match the pattern.
 *   RULE 5 — 0 drivers whose linked accounts (escrow + advance) carry more than one nnn.
 * --selftest exercises every rule, including a planted DRIVERCASHAD… number and a driver with mismatched nnn.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-subaccount-numbers-one-per-driver";
export const REQUIRES_LIVE_DB = "the chart of accounts is live money structure — fails closed without a database";
export const PATTERN = /^(1245|1255|1256|1257|2100)-00-[0-9]{3}$/;
const SRC = "apps/backend/src";
export const F = {
  provision: `${SRC}/accounting/driver-subaccount-provision.service.ts`,
  allocator: `${SRC}/accounting/driver-subaccount-number.ts`,
  hire: `${SRC}/mdata/drivers.routes.ts`,
  migration: "db/migrations/202615390200_driver_subaccount_numbers_one_per_driver.sql",
};

function fnBody(src, name) {
  const i = src.indexOf(`export async function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

export function staticProblems(read) {
  const out = [];
  const p = read(F.provision) ?? "";
  const adv = fnBody(p, "provisionDriverAdvanceSubAccount");
  const esc = fnBody(p, "provisionDriverEscrowSubAccount");
  if (!/allocateDriverSubAccountNnn\(/.test(adv) || !/p\.account_number \|\| '-00-' \|\| \$6/.test(adv)) out.push("RULE 1 the advance provisioner does not number <parent>-00-nnn from the shared allocator");
  if (!/resolveRoleAccountOptional\([^)]*"advance_recovery"\)/.test(adv)) out.push("RULE 1 the advance provisioner does not resolve its parent through the advance_recovery role");
  if (!/allocateDriverSubAccountNnn\(/.test(esc) || !/p\.account_number \|\| '-' \|\| \$6/.test(esc)) out.push("RULE 1 the escrow provisioner does not number <sub-parent>-nnn from the shared allocator");
  for (const [n, body] of [["advance", adv], ["escrow", esc]]) {
    if (/SELECT\s*\n(\s*--[^\n]*\n)*\s*NULL,\s*\n\s*\$1, '(Asset|Liability)'/.test(body)) out.push(`RULE 1 the ${n} provisioner still inserts a NULL account_number`);
  }
  const a = read(F.allocator) ?? "";
  if (!/pg_advisory_xact_lock/.test(a) || !/escrow_accounts/.test(a) || !/driver_advance_accounts/.test(a)) out.push("RULE 1 the allocator does not reuse the driver's existing number under a per-entity lock");
  const h = read(F.hire) ?? "";
  if (!/nnn: await allocateDriverSubAccountNnn\(/.test(h)) out.push("RULE 2 hire does not allocate one driver number for both sub-accounts");
  const m = read(F.migration);
  if (!m || !/SET account_number = '1245-00-' \|\| t\.nnn/.test(m) || /deactivated_at = now\(\)/.test(m)) out.push(`RULE 3 ${F.migration} does not rename the advance sub-accounts in place to 1245-00-<escrow nnn>`);
  return out;
}

export function numberProblems(accounts) {
  const out = [];
  for (const acc of accounts) if (!PATTERN.test(String(acc.account_number ?? ""))) out.push(`RULE 4 live driver sub-account ${acc.account_number ?? "(no number)"} "${acc.account_name}" is not <parent>-00-nnn`);
  const byDriver = new Map();
  for (const acc of accounts) {
    const m = PATTERN.test(String(acc.account_number ?? "")) ? String(acc.account_number).slice(-3) : null;
    for (const d of acc.driver_ids ?? []) {
      if (!m) continue;
      if (!byDriver.has(d)) byDriver.set(d, new Set());
      byDriver.get(d).add(m);
    }
  }
  for (const [d, set] of byDriver) if (set.size > 1) out.push(`RULE 5 driver ${d} carries ${set.size} different numbers (${[...set].join(", ")})`);
  return out;
}

export function run() {
  return staticProblems((f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : null));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const real = (f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : null);
    const plant = (file, from, to) => (f) => (f === file ? (real(f) ?? "").replace(from, to) : real(f));
    const has = (r, rule) => staticProblems(r).some((x) => x.startsWith(rule));
    const good = [
      { account_number: "2100-00-001", account_name: "LUIS — Driver Escrow", driver_ids: ["d1"] },
      { account_number: "1245-00-001", account_name: "LUIS — Driver Cash Advance", driver_ids: ["d1"] },
    ];
    const cases = [
      ["the shipped tree passes", staticProblems(real).length === 0],
      ["an advance provisioner without the allocator fails", has(plant(F.provision, "p.account_number || '-00-' || $6", "NULL"), "RULE 1")],
      ["hire allocating per provisioner fails", has(plant(F.hire, "nnn: await allocateDriverSubAccountNnn(", "nnnX: await allocateDriverSubAccountNnn("), "RULE 2")],
      ["a create-and-deactivate migration fails", has(plant(F.migration, "updated_at = now()", "deactivated_at = now()"), "RULE 3")],
      ["live clean passes", numberProblems(good).length === 0],
      ["a planted DRIVERCASHAD number fails", numberProblems([...good, { account_number: "DRIVERCASHAD896665-007", account_name: "Driver Cash Advance- X", driver_ids: ["d2"] }]).some((x) => x.startsWith("RULE 4"))],
      ["a driver with mismatched nnn fails", numberProblems([good[0], { ...good[1], account_number: "1245-00-007" }]).some((x) => x.startsWith("RULE 5"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const rows = (await client.query(`
      WITH c AS (SELECT id FROM org.companies WHERE code = 'USMCA'),
      parents AS (
        SELECT r.account_id AS id FROM accounting.chart_of_accounts_roles r
         WHERE r.operating_company_id = (SELECT id FROM c) AND r.is_active
           AND r.role IN ('advance_recovery', 'driver_damage_receivable', 'driver_fine_receivable', 'driver_negative_settlement_receivable')
        UNION
        SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = (SELECT id FROM c) AND a.account_number = '2100-00'
      )
      SELECT a.account_number, a.account_name,
             ARRAY(SELECT ea.holder_id::text FROM accounting.escrow_accounts ea WHERE ea.holder_type = 'driver' AND ea.coa_account_id = a.id
                   UNION
                   SELECT d.driver_id::text FROM driver_finance.driver_advance_accounts d WHERE d.coa_account_id = a.id AND d.is_active) AS driver_ids
        FROM catalogs.accounts a
       WHERE a.operating_company_id = (SELECT id FROM c) AND a.deactivated_at IS NULL AND a.parent_account_id IN (SELECT id FROM parents)
    `)).rows;
    await client.query("ROLLBACK");
    problems.push(...numberProblems(rows));
    if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.slice(0, 40).join("\n  ")}${problems.length > 40 ? `\n  … ${problems.length - 40} more` : ""}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — static rules 1-3 hold; ${rows.length} live USMCA driver sub-account(s), every one <parent>-00-nnn, one nnn per driver.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
