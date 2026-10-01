#!/usr/bin/env node
// CC-2, owner law 2026-10-01: "fuel fraud -> expense dispute chain -- build the money side".
// Confirming a fuel fraud alert used to change its status and nothing else. Now it opens (or reuses) the
// purchase's recovery in the FUEL-03 overage engine; the approve route (contract authority) posts the
// receivable through postFuelOverageReceivable; the alert reaches 'recovered' only when that posts.
//
// --selftest: decideRecoverCents; the recovery service never posts; confirm-fraud calls it and stores the
//   link; the approve path marks alerts recovered only after the receivable JE exists; migration shape.
// live (read-only): every linked alert points at a live confirmed_fraud event of ITS purchase; no alert
//   reads 'recovered' unless its event carries a journal entry.
import pg from "pg";
import { readFileSync } from "node:fs";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();
const LABEL = "verify-fuel-fraud-recovery-chain";
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { decideRecoverCents } = await import(new URL("apps/backend/src/fuel/fuel-fraud-recovery.service.ts", ROOT));
  assert.deepEqual(decideRecoverCents(5000, null), { cents: 5000 }, "default = the whole purchase");
  assert.deepEqual(decideRecoverCents(5000, 1200), { cents: 1200 });
  assert.ok("refused" in decideRecoverCents(5000, 6000), "never more than the purchase");
  assert.ok("refused" in decideRecoverCents(5000, 0), "never zero");
  assert.ok("refused" in decideRecoverCents(0, null), "nothing to recover on a zero purchase");
  const svc = read("apps/backend/src/fuel/fuel-fraud-recovery.service.ts");
  assert.ok(!/postFuelOverageReceivable|journal_entr/i.test(svc.replace(/\/\*\*[\s\S]*?\*\//g, "")), "confirming must never post — approval does");
  assert.ok(/'confirmed_fraud'/.test(svc) && /company_variance/.test(svc), "no contract authority -> company_variance, never a driver charge");
  const routes = read("apps/backend/src/integrations/fuel/fraud-detector/routes.ts");
  assert.ok(/openFraudRecoveryForAlert\(/.test(routes) && /SET recovery_event_id = \$3::uuid/.test(routes), "confirm-fraud opens the recovery and stores the link");
  const ov = read("apps/backend/src/fuel/fuel-card-overage.service.ts");
  assert.ok(/if \(posted\.journal_entry_id\) await markFraudAlertsRecovered\(/.test(ov), "recovered only after the receivable posts");
  const mig = read("db/migrations/202615140800_fuel_fraud_recovery_link.sql");
  assert.ok(/'confirmed_fraud'::text/.test(mig) && /recovery_event_id uuid NULL REFERENCES fuel\.fuel_card_overage_events\(id\)/.test(mig), "migration shape");
  console.log(`${LABEL} --selftest PASS (10/10)`);
}

await selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  const hasOwner = (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner'`)).rows.length > 0;
  if (hasOwner) await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const col = (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='fuel' AND table_name='fraud_alerts' AND column_name='recovery_event_id'`)).rows.length > 0;
  if (!col) {
    await client.query("ROLLBACK");
    console.log(`DATABASE PHASE: fuel.fraud_alerts.recovery_event_id not on this database yet (migration 202615140800 lands with the next deploy) — static proof only, NOT live proof`);
    process.exit(0);
  }
  const bad = await client.query(`
    SELECT fa.uuid::text, CASE
      WHEN ev.id IS NULL THEN 'link points at no event'
      WHEN ev.voided_at IS NOT NULL THEN 'linked event is voided'
      WHEN ev.overage_rule <> 'confirmed_fraud' THEN 'linked event is not a fraud recovery'
      WHEN ev.fuel_transaction_id <> fa.fuel_transaction_uuid THEN 'linked event recovers another purchase'
      END AS why
      FROM fuel.fraud_alerts fa LEFT JOIN fuel.fuel_card_overage_events ev ON ev.id = fa.recovery_event_id
     WHERE fa.recovery_event_id IS NOT NULL
       AND (ev.id IS NULL OR ev.voided_at IS NOT NULL OR ev.overage_rule <> 'confirmed_fraud' OR ev.fuel_transaction_id <> fa.fuel_transaction_uuid)
    UNION ALL
    SELECT fa.uuid::text, 'recovered without a posted receivable'
      FROM fuel.fraud_alerts fa LEFT JOIN fuel.fuel_card_overage_events ev ON ev.id = fa.recovery_event_id
     WHERE fa.status = 'recovered' AND (ev.journal_entry_id IS NULL)`);
  const n = (await client.query(`SELECT count(*)::int alerts, count(recovery_event_id)::int linked, count(*) FILTER (WHERE status='confirmed_fraud')::int confirmed FROM fuel.fraud_alerts`)).rows[0];
  await client.query("ROLLBACK");
  if (bad.rows.length) {
    console.error(`${LABEL}: FAIL — ${bad.rows.slice(0, 10).map((r) => `${r.uuid}: ${r.why}`).join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${n.alerts} alert(s), ${n.confirmed} confirmed, ${n.linked} linked to a recovery; every link is a live fraud recovery of its own purchase; no unposted 'recovered'.`);
} finally {
  await client.end();
}
