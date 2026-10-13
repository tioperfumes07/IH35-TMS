#!/usr/bin/env node
/**
 * USMCA-PV-STACK — FLEET-S01..S07, FUEL-S01..S09, TASK-S01..S05 prod_verified ratchet.
 *
 * Static: docs/module-completion/{fleet,fuel,tasks}.json items must carry prod_verified:true.
 * Live (when DATABASE_URL set, non-pooler): Neon lucia ih35_app counts scoped USMCA
 * (5c854333-6ea5-4faa-af31-67cb272fef80) — shared fleet lease counts OK; honest zero fuel txns.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-fleet-fuel-tasks-neon-pv";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BRANCH = "br-fancy-credit-akjnd07a";

const MANIFESTS = [
  { file: "docs/module-completion/fleet.json", prefix: "FLEET-S", count: 7 },
  { file: "docs/module-completion/fuel.json", prefix: "FUEL-S", count: 9 },
  { file: "docs/module-completion/tasks.json", prefix: "TASK-S", count: 5 },
];

function assertNotPooler(connectionString) {
  if (/-pooler\./.test(String(connectionString ?? ""))) {
    throw new Error(`${LABEL}: refusing -pooler DATABASE_URL (session GUC would not survive)`);
  }
}

/**
 * Prod proof per item. The 2026-08-29 GUARD rewrite (#17642) moved proof out of a free-text "PROD-VERIFIED / Neon lucia"
 * citation into STRUCTURED fields — live_verified_at + live_verified_sha — plus a GUARD PACKET that records the guard
 * seat's own independent live re-verification. 9 items carry only the new shape, so the text-only check reported them
 * unproven although their proof is present and stronger. 443.101: every item must now carry the structured fields
 * (a real timestamp + a git sha) — required of ALL 21, which the text check never asked — AND either the legacy Neon
 * citation or a GUARD PACKET that states a live re-verification. A bare phrase alone no longer passes.
 */
export function prodProofProblems(row) {
  const p = [];
  const ev = String(row.evidence ?? "");
  if (!(typeof row.live_verified_at === "string" && !Number.isNaN(Date.parse(row.live_verified_at)))) p.push("must carry live_verified_at (timestamp of the live proof)");
  if (!(typeof row.live_verified_sha === "string" && /^[0-9a-f]{7,40}$/.test(row.live_verified_sha))) p.push("must carry live_verified_sha (the deployed sha it was proven on)");
  const legacy = /PROD-VERIFIED|Neon lucia/i.test(ev);
  const packet = /GUARD PACKET[\s\S]*(re-verified live|re-confirm|spot-checked live|live Chrome)/i.test(ev);
  if (!legacy && !packet) p.push("evidence must cite PROD-VERIFIED / Neon lucia proof or a GUARD PACKET live re-verification");
  return p;
}

export function auditManifests(root = ROOT, manifests = MANIFESTS) {
  const problems = [];
  for (const { file, prefix, count } of manifests) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) {
      problems.push(`missing ${file}`);
      continue;
    }
    const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
    const items = Array.isArray(doc.items) ? doc.items : [];
    for (let i = 1; i <= count; i += 1) {
      const id = `${prefix}${String(i).padStart(2, "0")}`;
      const row = items.find((it) => it.id === id);
      if (!row) {
        problems.push(`${file}: missing item ${id}`);
        continue;
      }
      if (row.status !== "PASS") {
        problems.push(`${file}: ${id} must be PASS before prod_verified (got ${row.status})`);
      }
      if (row.prod_verified !== true) {
        problems.push(`${file}: ${id} prod_verified must be true`);
      }
      for (const why of prodProofProblems(row)) problems.push(`${file}: ${id} ${why}`);
    }
  }
  return problems;
}

export async function auditNeonLive(client) {
  const problems = [];
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);

  const mask = await client.query(
    `SELECT (SELECT count(*)::int FROM org.companies) AS companies,
            (SELECT count(*)::int FROM catalogs.accounts) AS accounts,
            current_user AS who`
  );
  const m = mask.rows[0] ?? {};
  if (!Number(m.companies) || !Number(m.accounts)) {
    problems.push(
      `RLS masking check failed (who=${m.who}, companies=${m.companies}, accounts=${m.accounts})`
    );
    return problems;
  }

  const q = async (sql, params = []) => {
    const r = await client.query(sql, params);
    return Number(r.rows[0]?.n ?? 0);
  };

  const units = await q(
    `SELECT count(*)::int AS n FROM mdata.units u
     WHERE u.deactivated_at IS NULL
       AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)`,
    [USMCA]
  );
  if (units < 1) problems.push(`USMCA fleet units (owner/leased) expected >=1, got ${units}`);

  const equipment = await q(
    `SELECT count(*)::int AS n FROM mdata.equipment e
     WHERE e.deactivated_at IS NULL
       AND (e.owner_company_id = $1::uuid OR e.currently_leased_to_company_id = $1::uuid)`,
    [USMCA]
  );

  const planner = await q(
    `SELECT count(*)::int AS n FROM fuel.fuel_planner_settings WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  if (planner < 1) problems.push(`USMCA fuel_planner_settings expected >=1, got ${planner}`);

  const fuelTxn = await q(
    `SELECT count(*)::int AS n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );

  const tasks = await q(
    `SELECT count(*)::int AS n FROM tasks.task WHERE operating_company_id = $1::uuid AND is_active = true`,
    [USMCA]
  );
  if (tasks < 1) problems.push(`USMCA active tasks expected >=1, got ${tasks}`);

  console.log(
    `[${LABEL}] Neon lucia USMCA: units=${units} equipment=${equipment} fuel_txn=${fuelTxn} planner=${planner} tasks=${tasks} branch=${BRANCH}`
  );
  return problems;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/usmca-pv-stack-");
    try {
      for (const { file } of MANIFESTS) {
        fs.mkdirSync(path.join(tmp, path.dirname(file)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file), path.join(tmp, file));
      }
      const fleetPath = path.join(tmp, "docs/module-completion/fleet.json");
      const fleet = JSON.parse(fs.readFileSync(fleetPath, "utf8"));
      fleet.items[0].prod_verified = false;
      fs.writeFileSync(fleetPath, JSON.stringify(fleet, null, 2) + "\n");
      const planted = auditManifests(tmp);
      if (!planted.some((p) => /prod_verified must be true/.test(p))) {
        console.error(`${LABEL} SELFTEST FAIL: planted prod_verified:false not caught`);
        process.exit(1);
      }
      // 443.101 proof arms: the real manifests are clean; each planted gap is caught.
      if (auditManifests().length !== 0) {
        console.error(`${LABEL} SELFTEST FAIL: real manifests report problems`);
        process.exit(1);
      }
      const base = { live_verified_at: "2026-08-30T02:20:00.000Z", live_verified_sha: "ed4e2f2", evidence: "PASS | GUARD PACKET (CC-2): Independently re-verified live myself via live Chrome." };
      const arms = [
        ["structured proof passes", prodProofProblems(base).length === 0],
        ["missing live_verified_at caught", prodProofProblems({ ...base, live_verified_at: undefined }).length > 0],
        ["garbage live_verified_at caught", prodProofProblems({ ...base, live_verified_at: "soon" }).length > 0],
        ["missing live_verified_sha caught", prodProofProblems({ ...base, live_verified_sha: "" }).length > 0],
        ["bare PROD-VERIFIED phrase without structured fields caught", prodProofProblems({ evidence: "PROD-VERIFIED Neon lucia" }).length > 0],
        ["GUARD PACKET with no live re-verification caught", prodProofProblems({ ...base, evidence: "GUARD PACKET (CC-2): bound on the coder's word." }).length > 0],
        ["legacy Neon citation + structured fields passes", prodProofProblems({ ...base, evidence: "PROD-VERIFIED Neon lucia 2026-08-09" }).length === 0],
      ];
      for (const [name, ok] of arms) if (!ok) { console.error(`${LABEL} SELFTEST FAIL: ${name}`); process.exit(1); }
      console.log(`${LABEL} SELFTEST PASS (${arms.length + 2} arms)`);
      process.exit(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  const problems = auditManifests();
  // 443.101: the live half fails closed (ROUND 29.9-B, verify-no-silent-db-skip) — a fleet/fuel prod-proof guard that
  // cannot reach a database is a FAIL, never a static-only pass.
  if (process.env.DATABASE_URL) assertNotPooler(process.env.DATABASE_URL);
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    problems.push(...(await auditNeonLive(client)));
  } finally {
    client.release();
    await pool.end();
  }

  if (problems.length) {
    console.error(`[${LABEL}] FAIL:\n` + problems.map((p) => `  ✗ ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
