#!/usr/bin/env node
/**
 * USMCA compliance PV — COMP-S01..S03 + COMP-T01..T06 prod_verified ratchet.
 *
 * Static: docs/module-completion/compliance.json items must carry prod_verified:true.
 * Live (when DATABASE_URL set, non-pooler): Neon lucia USMCA counts — honest zero OK.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-compliance-neon-pv";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BRANCH = "br-fancy-credit-akjnd07a";

const ITEMS = [
  { id: "COMP-S01", prefix: "COMP-S", n: 1 },
  { id: "COMP-S02", prefix: "COMP-S", n: 2 },
  { id: "COMP-S03", prefix: "COMP-S", n: 3 },
  { id: "COMP-T01", prefix: "COMP-T", n: 1 },
  { id: "COMP-T02", prefix: "COMP-T", n: 2 },
  { id: "COMP-T03", prefix: "COMP-T", n: 3 },
  { id: "COMP-T04", prefix: "COMP-T", n: 4 },
  { id: "COMP-T05", prefix: "COMP-T", n: 5 },
  { id: "COMP-T06", prefix: "COMP-T", n: 6 },
];

function assertNotPooler(connectionString) {
  if (/-pooler\./.test(String(connectionString ?? ""))) {
    throw new Error(`${LABEL}: refusing -pooler DATABASE_URL (session GUC would not survive)`);
  }
}

export function auditManifest(root = ROOT) {
  const problems = [];
  const abs = path.join(root, "docs/module-completion/compliance.json");
  if (!fs.existsSync(abs)) {
    problems.push("missing docs/module-completion/compliance.json");
    return problems;
  }
  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  const items = Array.isArray(doc.items) ? doc.items : [];
  for (const { id } of ITEMS) {
    const row = items.find((it) => it.id === id);
    if (!row) {
      problems.push(`compliance.json: missing item ${id}`);
      continue;
    }
    if (row.status !== "PASS") {
      problems.push(`compliance.json: ${id} must be PASS (got ${row.status})`);
    }
    if (row.prod_verified !== true) {
      problems.push(`compliance.json: ${id} prod_verified must be true`);
    }
    if (!/PROD-VERIFIED|Neon lucia/i.test(String(row.evidence ?? ""))) {
      problems.push(`compliance.json: ${id} evidence must cite PROD-VERIFIED / Neon lucia`);
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

  const renditions = await q(
    `SELECT count(*)::int AS n FROM compliance.property_tax_renditions WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  const reqDocs = await q(
    `SELECT count(*)::int AS n FROM compliance.required_document_types WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  if (reqDocs < 1) {
    problems.push(`USMCA required_document_types expected >=1, got ${reqDocs}`);
  }

  for (const [schema, table] of [
    ["compliance", "property_tax_renditions"],
    ["compliance", "required_document_types"],
  ]) {
    const stat = await client.query(
      `SELECT n_live_tup::int AS live FROM pg_stat_all_tables WHERE schemaname = $1 AND relname = $2`,
      [schema, table]
    );
    if (Number(stat.rows[0]?.live ?? -1) < 0) {
      problems.push(`pg_stat missing for ${schema}.${table}`);
    }
  }

  console.log(
    `[${LABEL}] Neon lucia USMCA: renditions=${renditions} req_docs=${reqDocs} branch=${BRANCH}`
  );
  return problems;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/usmca-compliance-pv-");
    try {
      fs.mkdirSync(path.join(tmp, "docs/module-completion"), { recursive: true });
      fs.copyFileSync(
        path.join(ROOT, "docs/module-completion/compliance.json"),
        path.join(tmp, "docs/module-completion/compliance.json")
      );
      const doc = JSON.parse(
        fs.readFileSync(path.join(tmp, "docs/module-completion/compliance.json"), "utf8")
      );
      doc.items[0].prod_verified = false;
      fs.writeFileSync(
        path.join(tmp, "docs/module-completion/compliance.json"),
        JSON.stringify(doc, null, 2) + "\n"
      );
      const planted = auditManifest(tmp);
      if (!planted.some((p) => /prod_verified must be true/.test(p))) {
        console.error(`${LABEL} SELFTEST FAIL: planted prod_verified:false not caught`);
        process.exit(1);
      }
      console.log(`${LABEL} SELFTEST PASS`);
      process.exit(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  const problems = auditManifest();
  if (process.env.DATABASE_URL) {
    assertNotPooler(process.env.DATABASE_URL);
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      problems.push(...(await auditNeonLive(client)));
    } finally {
      client.release();
      await pool.end();
    }
  } else {
    console.log(`[${LABEL}] DATABASE_URL unset — static manifest checks only`);
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
