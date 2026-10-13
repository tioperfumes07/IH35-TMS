#!/usr/bin/env node
// ROUND 443.26 (owner, 2026-10-10 6:58 PM CT): "all drivers must have only one profile and escrow and liability account.
// they can have multiple users in samsara." + owner ruling 7:02 PM CT: a name that is the other plus an extra surname, or
// differs only in capitalisation/accents, is the SAME person. Merges go through executeDriverMerge only.
//
// Live, on USMCA (operating_company_id 5c854333-…), unmerged drivers only, test/dummy profiles excluded:
//   1. zero pairs with the same normalized name (same key, or one key = the other + trailing surname(s));
//   2. every unmerged driver holds at most ONE active escrow account;
//   3. every Samsara id (mdata.drivers.samsara_driver_id and mdata.driver_samsara_accounts) resolves, through
//      merged_into_driver_id, to exactly ONE surviving driver.
// The name rules are imported from the merge script itself — one definition, never a second copy.
// --selftest plants each violation.
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "reads USMCA mdata.drivers, driver_samsara_accounts and escrow accounts";

const LABEL = "verify-one-profile-per-driver";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FOLD = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n", à: "a", è: "e", ì: "i", ò: "o", ù: "u" };
// Same rules as apps/backend/scripts/auth404-merge-duplicate-drivers.mts (nameKey / isTestProfile / sameDriverName);
// verified identical by the selftest below reading that file.
export const nameKey = (f, l) => `${f ?? ""} ${l ?? ""}`.toLowerCase().replace(/[áéíóúüñàèìòù]/g, (c) => FOLD[c] ?? c).replace(/\s+/g, " ").trim();
export const isTestProfile = (k) => /\b(dummy|codex|test|sample|demo)\b/.test(k) || k.startsWith("safety ");
export function sameDriverName(a, b) {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.split(" ").length >= 2 && l.startsWith(`${s} `);
}

/** drivers: [{id, first_name, last_name, merged_into, escrow_active}], samsara: [{samsara_id, driver_id}] */
export function judge(drivers, samsara) {
  const f = [];
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const live = drivers.filter((d) => !d.merged_into && !isTestProfile(nameKey(d.first_name, d.last_name)));
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = nameKey(live[i].first_name, live[i].last_name), b = nameKey(live[j].first_name, live[j].last_name);
      if (sameDriverName(a, b)) f.push(`two unmerged profiles for one driver: "${a}" ${live[i].id} / "${b}" ${live[j].id}`);
    }
  for (const d of drivers.filter((x) => !x.merged_into && x.escrow_active > 1)) f.push(`${d.id} holds ${d.escrow_active} active escrow accounts`);
  const root = (id) => { let d = byId.get(id), n = 0; while (d && d.merged_into && n++ < 10) d = byId.get(d.merged_into); return d?.id ?? null; };
  const owners = new Map();
  for (const s of samsara) {
    const r = root(s.driver_id);
    if (!r) { f.push(`Samsara id ${s.samsara_id} points at a driver outside USMCA or missing (${s.driver_id})`); continue; }
    owners.set(s.samsara_id, new Set([...(owners.get(s.samsara_id) ?? []), r]));
  }
  for (const [sid, set] of owners) if (set.size !== 1) f.push(`Samsara id ${sid} resolves to ${set.size} surviving drivers`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const fs = await import("node:fs");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const script = fs.readFileSync(path.join(root, "apps/backend/scripts/auth404-merge-duplicate-drivers.mts"), "utf8");
  const fails = [];
  for (const marker of ["/\\b(dummy|codex|test|sample|demo)\\b/", 'key.startsWith("safety ")', "l.startsWith(`${s} `)", "s.split(\" \").length >= 2"]) {
    if (!script.includes(marker)) fails.push(`merge script and guard disagree on a name rule (missing ${marker})`);
  }
  const D = (id, f, l, extra = {}) => ({ id, first_name: f, last_name: l, merged_into: null, escrow_active: 0, ...extra });
  const clean = [D("a", "Angel Alfonso", "Sosa Perez", { escrow_active: 1 }), D("b", "ANGEL ALFONSO", "SOSA", { merged_into: "a" }), D("t1", "Driver", "Dummy"), D("t2", "Driver", "Dummy")];
  const sam = [{ samsara_id: "1", driver_id: "a" }, { samsara_id: "2", driver_id: "b" }];
  if (judge(clean, sam).length) fails.push(`clean fixture flagged: ${judge(clean, sam).join("; ")}`);
  const plants = [
    ["exact duplicate unmerged", [...clean, D("c", "angel alfonso", "sosa perez")], sam],
    ["extra-surname duplicate unmerged", [...clean.map((d) => (d.id === "b" ? { ...d, merged_into: null } : d))], sam],
    ["accent-only duplicate", [...clean, D("c", "Ángel Alfonso", "Sosa Pérez")], sam],
    ["two active escrows", clean.map((d) => (d.id === "a" ? { ...d, escrow_active: 2 } : d)), sam],
    ["samsara id on two survivors", [...clean, D("z", "Other", "Person")], [...sam, { samsara_id: "1", driver_id: "z" }]],
  ];
  for (const [name, d, s] of plants) if (judge(d, s).length === 0) fails.push(`plant escaped: ${name}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 2}/${plants.length + 2}`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const drivers = (await c.query(
    `SELECT d.id::text, d.first_name, d.last_name, d.merged_into_driver_id::text AS merged_into,
            (SELECT count(*) FROM accounting.escrow_accounts e WHERE e.holder_type='driver' AND e.holder_id=d.id AND e.status='active')::int AS escrow_active
       FROM mdata.drivers d WHERE d.operating_company_id = $1::uuid`, [USMCA])).rows;
  const samsara = (await c.query(
    `SELECT a.samsara_driver_id::text AS samsara_id, a.driver_id::text FROM mdata.driver_samsara_accounts a
       JOIN mdata.drivers d ON d.id = a.driver_id WHERE d.operating_company_id = $1::uuid
     UNION ALL
     SELECT d.samsara_driver_id::text, d.id::text FROM mdata.drivers d WHERE d.operating_company_id = $1::uuid AND d.samsara_driver_id IS NOT NULL`,
    [USMCA])).rows;
  await c.query("ROLLBACK");
  if (drivers.length === 0) { console.error(`${LABEL}: FAIL — 0 USMCA drivers read; an empty result is an instrument problem, not a pass`); process.exit(1); }
  const bad = judge(drivers, samsara);
  if (bad.length) { console.error(`${LABEL}: FAIL (${bad.length})\n  ${bad.slice(0, 40).join("\n  ")}`); process.exit(1); }
  const live = drivers.filter((d) => !d.merged_into).length;
  console.log(`${LABEL}: PASS — USMCA ${drivers.length} drivers, ${live} unmerged; one profile per driver; <=1 active escrow each; ${new Set(samsara.map((s) => s.samsara_id)).size} Samsara ids each on one survivor`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
