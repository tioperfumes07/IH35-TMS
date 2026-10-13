/**
 * ROUND 443.26 (owner, 2026-10-10 6:58 PM CT): "all drivers must have only one profile and escrow and liability account.
 * they can have multiple users in samsara. those should already be mapped." + owner ruling 7:02 PM CT on near-duplicates:
 * a name that is the other with an extra surname, or differs only in capitalisation/accents, is the SAME person -> merge,
 * survivor = the fuller name with the Samsara id. Pairs whose first names or first surnames differ are only LISTED.
 *
 * Every merge goes through the ONE engine, executeDriverMerge (src/mdata/driver-merge.service.ts:231 — sets
 * merged_into_driver_id at :338-339, repoints every catalog-discovered reference incl. mdata.driver_samsara_accounts,
 * moves escrow through the ledger, audits). This script never UPDATEs mdata.drivers itself and never DELETEs.
 *
 * Grouping (USMCA, unmerged only): name key = lower(accent-folded first + ' ' + last), whitespace-collapsed.
 *   exact     — same key
 *   surname+  — one key is the other plus trailing surname(s) (shorter key has >= 2 tokens)
 * Test/dummy profiles (driver dummy, safety —, codex, test, sample, demo) are never merged — listed.
 * Survivor (rule 2): active escrow account > Samsara id > fuller name > Active/Probation > completeness > newest.
 *
 * MODES: --branch=<neon branch id> REQUIRED (refuses on any other branch). DRY by default: prints the plan, writes nothing.
 *   --apply on the production branch additionally needs OWNER_AUTH_ID=<AUTH-NNN> whose block in
 *   docs/bus/OWNER-AUTHORIZATIONS.md is status OPEN and names this script.
 * RUN: DATABASE_URL=<branch> npx tsx apps/backend/scripts/auth404-merge-duplicate-drivers.mts --branch=br-xxx [--apply] [--report=<file>]
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { executeDriverMerge } from "../src/mdata/driver-merge.service.js";
import { createJournalEntryOnClient } from "../src/accounting/journal-entries.service.js";
import { recordEscrowPostingOnly } from "../src/accounting/escrow/service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PROD_BRANCH = "br-fancy-credit-akjnd07a";
const SCRIPT = "apps/backend/scripts/auth404-merge-duplicate-drivers.mts";
const APPLY = process.argv.includes("--apply");
const BRANCH = (process.argv.find((a) => a.startsWith("--branch=")) ?? "").slice("--branch=".length);
const REPORT = (process.argv.find((a) => a.startsWith("--report=")) ?? "").slice("--report=".length);
const AUTH = (process.env.OWNER_AUTH_ID ?? "").trim();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL (the target branch) is required");
if (!BRANCH) throw new Error("--branch=<neon branch id> is required");

export type DriverRow = {
  id: string; first_name: string | null; last_name: string | null; status: string; samsara_driver_id: string | null;
  samsara_accounts: number; escrow_active: number; completeness: number; created_at: string;
};

const FOLD: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n", à: "a", è: "e", ì: "i", ò: "o", ù: "u" };
export function nameKey(first: string | null, last: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.toLowerCase().replace(/[áéíóúüñàèìòù]/g, (c) => FOLD[c] ?? c).replace(/\s+/g, " ").trim();
}
export function isTestProfile(key: string): boolean {
  return /\b(dummy|codex|test|sample|demo)\b/.test(key) || key.startsWith("safety ");
}
/** Owner ruling 7:02 PM: same person when equal, or one is the other plus trailing surname(s). */
export function sameDriverName(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.split(" ").length >= 2 && l.startsWith(`${s} `);
}
/** Pairs worth the owner's eye: share first name + first surname OR last two tokens, but are not the same name. */
export function nearButDifferent(a: string, b: string): boolean {
  if (sameDriverName(a, b)) return false;
  const x = a.split(" "), y = b.split(" ");
  if (x.length < 2 || y.length < 2) return false;
  const shareFirstTwo = x[0] === y[0] && x[1] === y[1];
  const shareLastTwo = x.slice(-2).join(" ") === y.slice(-2).join(" ");
  return shareFirstTwo || shareLastTwo;
}
const ACTIVE = new Set(["Active", "Probation"]);
export function pickSurvivor(rows: DriverRow[]): DriverRow {
  return [...rows].sort(
    (p, q) =>
      (q.escrow_active > 0 ? 1 : 0) - (p.escrow_active > 0 ? 1 : 0) ||
      (q.samsara_driver_id || q.samsara_accounts ? 1 : 0) - (p.samsara_driver_id || p.samsara_accounts ? 1 : 0) ||
      nameKey(q.first_name, q.last_name).split(" ").length - nameKey(p.first_name, p.last_name).split(" ").length ||
      (ACTIVE.has(q.status) ? 1 : 0) - (ACTIVE.has(p.status) ? 1 : 0) ||
      q.completeness - p.completeness ||
      q.created_at.localeCompare(p.created_at)
  )[0]!;
}
/** Union the same-name relation into clusters (test profiles excluded). */
export function planClusters(rows: DriverRow[]) {
  const real = rows.filter((r) => !isTestProfile(nameKey(r.first_name, r.last_name)));
  const parent = new Map(real.map((r) => [r.id, r.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (let i = 0; i < real.length; i++)
    for (let j = i + 1; j < real.length; j++)
      if (sameDriverName(nameKey(real[i]!.first_name, real[i]!.last_name), nameKey(real[j]!.first_name, real[j]!.last_name)))
        parent.set(find(real[j]!.id), find(real[i]!.id));
  const groups = new Map<string, DriverRow[]>();
  for (const r of real) groups.set(find(r.id), [...(groups.get(find(r.id)) ?? []), r]);
  const clusters = [...groups.values()].filter((g) => g.length > 1).map((g) => {
    const survivor = pickSurvivor(g);
    return { survivor, merged: g.filter((r) => r.id !== survivor.id) };
  });
  const nearPairs: Array<[DriverRow, DriverRow]> = [];
  // Compare only the profiles that remain after the merges: each cluster's survivor + every unclustered profile.
  const mergedAway = new Set(clusters.flatMap((c) => c.merged.map((m) => m.id)));
  const reps = real.filter((r) => !mergedAway.has(r.id));
  for (let i = 0; i < reps.length; i++)
    for (let j = i + 1; j < reps.length; j++)
      if (find(reps[i]!.id) !== find(reps[j]!.id) &&
          nearButDifferent(nameKey(reps[i]!.first_name, reps[i]!.last_name), nameKey(reps[j]!.first_name, reps[j]!.last_name)))
        nearPairs.push([reps[i]!, reps[j]!]);
  return { clusters, nearPairs, tests: rows.filter((r) => isTestProfile(nameKey(r.first_name, r.last_name))) };
}

function authIsOpen(id: string): boolean {
  const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../docs/bus/OWNER-AUTHORIZATIONS.md");
  const text = fs.readFileSync(file, "utf8");
  const block = text.split(/^## /m).find((b) => b.startsWith(`${id}\n`));
  return Boolean(block && /^status:\s*OPEN\b/m.test(block) && block.includes(SCRIPT));
}

async function census(c: pg.Client) {
  const r = await c.query(`
    SELECT (SELECT count(*) FROM mdata.drivers WHERE operating_company_id=$1 AND merged_into_driver_id IS NULL)::int AS unmerged,
           (SELECT count(*) FROM mdata.driver_samsara_accounts a JOIN mdata.drivers d ON d.id=a.driver_id WHERE d.operating_company_id=$1)::int AS samsara_accounts,
           (SELECT count(DISTINCT x) FROM (SELECT samsara_driver_id::text x FROM mdata.drivers WHERE operating_company_id=$1 AND samsara_driver_id IS NOT NULL
              UNION SELECT a.samsara_driver_id::text FROM mdata.driver_samsara_accounts a JOIN mdata.drivers d ON d.id=a.driver_id WHERE d.operating_company_id=$1) s)::int AS samsara_ids,
           (SELECT count(*) FROM accounting.escrow_accounts e JOIN mdata.drivers d ON d.id=e.holder_id WHERE e.holder_type='driver' AND e.status='active' AND d.operating_company_id=$1)::int AS escrow_active`,
    [USMCA]);
  return r.rows[0] as Record<string, number>;
}

async function main() {
  const client = new pg.Client({ connectionString: url, statement_timeout: 120000 });
  await client.connect();
  const branch = (await client.query<{ b: string | null }>(`SELECT current_setting('neon.branch_id', true) AS b`)).rows[0]?.b ?? null;
  if (branch !== BRANCH) throw new Error(`refused: connected to neon branch ${branch ?? "(unknown)"}, --branch says ${BRANCH}`);
  if (APPLY && branch === PROD_BRANCH && !(AUTH && authIsOpen(AUTH)))
    throw new Error(`refused: --apply on production needs OWNER_AUTH_ID naming an OPEN block in OWNER-AUTHORIZATIONS.md that names ${SCRIPT}`);
  const actor = (await client.query<{ id: string }>(`SELECT id::text FROM identity.users WHERE role::text='Owner' ORDER BY created_at LIMIT 1`)).rows[0]!.id;

  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const before = await census(client);
  const rows = (await client.query(`
    SELECT d.id::text, d.first_name, d.last_name, d.status::text AS status, d.samsara_driver_id::text,
           (SELECT count(*) FROM mdata.driver_samsara_accounts a WHERE a.driver_id=d.id)::int AS samsara_accounts,
           (SELECT count(*) FROM accounting.escrow_accounts e WHERE e.holder_type='driver' AND e.holder_id=d.id AND e.status='active')::int AS escrow_active,
           ((d.phone IS NOT NULL)::int+(d.email IS NOT NULL)::int+(d.cdl_number IS NOT NULL)::int+(d.cdl_expires_at IS NOT NULL)::int
             +(d.dot_medical_expires_at IS NOT NULL)::int+(d.date_of_birth IS NOT NULL)::int) AS completeness,
           d.created_at::text
      FROM mdata.drivers d WHERE d.operating_company_id=$1 AND d.merged_into_driver_id IS NULL`, [USMCA])).rows as DriverRow[];
  await client.query("COMMIT");
  const plan = planClusters(rows);
  const show = (r: DriverRow) => `${nameKey(r.first_name, r.last_name)} ${r.id.slice(0, 8)} ${r.status} sam=${r.samsara_driver_id ?? "-"} esc=${r.escrow_active}`;
  console.log(`MODE ${APPLY ? "APPLY" : "DRY"} on ${branch} | before ${JSON.stringify(before)}`);
  console.log(`clusters ${plan.clusters.length}, surplus ${plan.clusters.reduce((n, c) => n + c.merged.length, 0)}, near-but-different ${plan.nearPairs.length}, test/dummy ${plan.tests.length}`);
  for (const c of plan.clusters) console.log(`  KEEP ${show(c.survivor)}  <- ${c.merged.map(show).join(" | ")}`);
  for (const [a, b] of plan.nearPairs) console.log(`  OWNER? ${show(a)}  vs  ${show(b)}`);
  for (const t of plan.tests) console.log(`  TEST (not merged) ${show(t)}`);

  const done: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  if (APPLY) {
    // Clusters are independent (disjoint driver ids); each runs serially on its own connection, one transaction per
    // merge. CONCURRENCY connections work the queue in parallel — the engine's catalog discovery is per merge and slow
    // over the network.
    const CONCURRENCY = Math.max(1, Number(process.env.MERGE_CONCURRENCY ?? "8"));
    const queue = [...plan.clusters];
    const worker = async () => {
      const w = new pg.Client({ connectionString: url, statement_timeout: 120000 });
      await w.connect();
      try {
        for (let c = queue.shift(); c; c = queue.shift()) {
          for (const m of c.merged) {
            await w.query("BEGIN");
            try {
              await w.query(`SELECT set_config('app.bypass_rls','lucia',true), set_config('app.current_user_id',$1,true), set_config('app.operating_company_id',$2,true)`, [actor, USMCA]);
              const res = await executeDriverMerge(
                w as never,
                { companyId: USMCA, survivorId: c.survivor.id, mergedId: m.id, actorUserId: actor, actorRole: "Owner",
                  overrideReason: "ROUND 443.26 owner order: one profile per driver; survivor chosen by escrow/Samsara/fuller-name rule" },
                { createJournalEntryOnClient: createJournalEntryOnClient as never, recordEscrowPostingOnly: recordEscrowPostingOnly as never }
              );
              await w.query("COMMIT");
              done.push({ survivor: c.survivor.id, merged: m.id, escrow_je_id: res.escrow_je_id });
              console.log(`  merged ${m.id.slice(0, 8)} -> ${c.survivor.id.slice(0, 8)} (${done.length})`);
            } catch (e) {
              await w.query("ROLLBACK");
              failed.push({ survivor: c.survivor.id, merged: m.id, error: (e as Error).message, details: (e as { details?: unknown }).details ?? null });
            }
          }
        }
      } finally {
        await w.end();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const after = await census(client);
  await client.query("COMMIT");
  console.log(`after ${JSON.stringify(after)} | merged ${done.length} | failed ${failed.length}`);
  for (const f of failed) console.log(`  FAILED ${JSON.stringify(f)}`);
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ branch, apply: APPLY, before, after, plan: {
    clusters: plan.clusters.map((c) => ({ survivor: c.survivor, merged: c.merged })), nearPairs: plan.nearPairs, tests: plan.tests }, done, failed }, null, 2));
  await client.end();
  if (failed.length) process.exit(1);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
