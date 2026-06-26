#!/usr/bin/env node
/**
 * reconcile-drift.mjs  —  BLOCK-RELIABILITY-03  (SKELETON / pre-draft)
 *
 * Daily TMS-local-ledger vs QBO drift report. Phase-7 cutover (blueprint 12.5.3) requires DAILY
 * reconciliation drift = $0 across key totals for 14 CONSECUTIVE days before v2 is decommissioned.
 * Building it now so the $0-streak starts accruing the moment posting goes live (TRANSP only — the
 * QBO-connected entity; never cross-compare entities).
 *
 * GROUNDING (live schema, 2026-06-26):
 *   - Findings sink = `_system.reconciliation_findings` — its CHECK enums FIT this use:
 *       integration='qbo', finding_type IN ('value_drift','count_drift'), severity IN ('critical',
 *       'important','cleanup'). Required NOT-NULL cols: operating_company_id, integration,
 *       mirror_category, finding_type, severity, resource_scope(jsonb), local_value(jsonb),
 *       threshold_snapshot(jsonb), first_seen_at, last_seen_at. (USE IT — do not create a new table.)
 *   - QBO side = the in-backend QBO MIRROR tables (mdata.qbo_invoices / qbo_bills / qbo_accounts ...),
 *     NOT the Claude QuickBooks MCP (a backend cron can't call MCP; the MCP is for GUARD spot-checks).
 *
 * MODE: OFF by default (RECON_DRIFT_CRON_ENABLED — no point running while the local ledger is
 * intentionally near-empty pre-posting; Jorge flips ON at posting go-live). Advisory. Read-only on BOTH
 * sides; NEVER writes QBO; NEVER repairs drift (a human fixes via manual JE per 10a.1.5.16).
 * DEGRADE-SAFE: no DATABASE_URL -> skip+exit0 (never crash). Each total wrapped degrade-safe.
 */

import process from "node:process";

const ENABLED = process.env.RECON_DRIFT_CRON_ENABLED === "true";
const TRANSP_OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

// TODO(verify-before-enable): confirm each TMS column + the QBO-mirror total against db/migrations
// (avoid phantom columns). mirror_category is a free-text label on the finding. Each total is wrapped
// degrade-safe below so a bad query warns rather than crashing the run.
const KEY_TOTALS = [
  // { key: "ar_open",   label: "Total AR open balance",  mirror_category: "ar_aging",
  //   tmsSql: `SELECT COALESCE(SUM(open_balance_cents),0)::bigint AS n FROM accounting.invoices WHERE operating_company_id=$1 AND status NOT IN ('paid','void')`,
  //   qboSql: `SELECT COALESCE(SUM(balance_cents),0)::bigint AS n FROM mdata.qbo_invoices WHERE operating_company_id=$1` },
  // { key: "ap_open",   label: "Total AP open balance",  mirror_category: "ap_aging",  tmsSql: ..., qboSql: ... },
  // settlement payable, top-20 driver debt, fuel-month total, IFTA quarterly subtotal (blueprint 12.5.3.1).
];

async function probeTotal(client, t) {
  // table/column come from a fixed internal config (not user input); verified before enable.
  const tms = Number((await client.query(t.tmsSql, [TRANSP_OCI])).rows[0]?.n ?? 0);
  const qbo = Number((await client.query(t.qboSql, [TRANSP_OCI])).rows[0]?.n ?? 0);
  return { ...t, tms, qbo, driftAbs: Math.abs(tms - qbo) };
}

function severityFor(driftAbs) {
  if (driftAbs === 0) return null;
  if (driftAbs > 100000) return "critical"; // >$1,000
  if (driftAbs > 1000) return "important";
  return "cleanup";
}

async function writeFinding(client, r, severity) {
  // _system.reconciliation_findings — all NOT-NULL columns supplied. finding_type='value_drift'.
  await client.query(
    `INSERT INTO _system.reconciliation_findings
       (operating_company_id, integration, mirror_category, finding_type, severity,
        resource_scope, local_value, remote_value, drift_metric_abs, threshold_snapshot,
        first_seen_at, last_seen_at)
     VALUES ($1,'qbo',$2,'value_drift',$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8::jsonb, now(), now())`,
    [
      TRANSP_OCI, r.mirror_category, severity,
      JSON.stringify({ key: r.key, label: r.label }),
      JSON.stringify({ cents: r.tms }), JSON.stringify({ cents: r.qbo }),
      r.driftAbs / 100, JSON.stringify({ threshold_cents: 0, rule: "blueprint 12.5.3.2 ($0 drift)" }),
    ],
  );
  // TODO(00b): also fan an alarm (email+screen+SMS for critical) via dispatchNotification/createNotification.
}

async function main() {
  if (!ENABLED) {
    console.log("[recon-drift] disabled (RECON_DRIFT_CRON_ENABLED!=true) — flip ON at posting go-live.");
    process.exit(0);
  }
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) { console.warn("[recon-drift] no DATABASE_URL — skipping (advisory)."); process.exit(0); }

  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: cs, max: 2 });
  try {
    const results = [];
    for (const t of KEY_TOTALS) {
      try { results.push(await probeTotal(pool, t)); }
      catch (e) { console.warn(`[recon-drift] total '${t.key}' failed: ${e?.message ?? e}`); }
    }

    let drifted = 0;
    for (const r of results) {
      const sev = severityFor(r.driftAbs);
      const line = `${r.label}: TMS=${r.tms} QBO=${r.qbo} drift=${r.driftAbs}`;
      if (sev) { drifted++; console.error(`  DRIFT ${line}`); await writeFinding(pool, r, sev); }
      else console.log(`  OK    ${line}`);
    }

    // TODO: persist the daily summary + the consecutive-$0-day STREAK (the Phase-7 sign-off metric).
    // FIRST check whether an existing runs/log table can hold it before adding reconciliation_drift_runs.
    const overall = drifted === 0 && results.length > 0 ? "PASS ($0 across all totals)" : `${drifted} drifted / ${results.length} totals`;
    console.log(`[recon-drift] ${overall}`);
    process.exit(0); // advisory — never blocks; findings + (future) alarm carry the signal
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error("[recon-drift] error:", e?.message ?? e); process.exit(0); });
