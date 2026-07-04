// G10-C1 — audit hash-chain verify cron (tick orchestration).
//
// WHY: the tamper-evident verifier verifyEventChain() was built (B19-V2, spec §4/§5) but nothing invoked
// it — no cron, route, or script. ops.audit_chain_verifications sat permanently empty, so the legal-
// evidence ledger had NO live proof-of-integrity: a tamper of events.event_log could sit undetected. This
// tick is the missing wiring: once daily it (a) runs the verifier for every ACTIVE operating company,
// recording each result to ops.audit_chain_verifications (append-only evidence), and (b) alarms the owner
// via the shared reliability-alarm spine when a chain break is found (CRITICAL) or when verification had
// lapsed / the cron missed a run (WARNING). Read-only against events.event_log — never repairs, never
// posts money, flips no flag. It only WIRES verifyEventChain; the verifier's SQL/logic is untouched.
//
// PATTERN: mirrors accounting/recon/recon-cron.service.ts (runReconTick) — one withLuciaBypass tick that
// enumerates companies and runs per-entity under the system identity (so the FORCED-RLS insert into
// ops.audit_chain_verifications is permitted). A per-company failure is logged and the loop continues; it
// must NOT kill the whole run (a single entity's error can't blind the rest of the fleet's integrity check).
// Alarms are collected during the DB tick and dispatched AFTER it commits, so email/SMS I/O never holds the
// verification transaction open (dispatchReliabilityAlarm opens its own bypass connection and never throws).

import { withLuciaBypass } from "../auth/db.js";
import { dispatchReliabilityAlarm } from "../notifications/reliability-alarm.js";
import { verifyEventChain, type ChainVerifyResult } from "./audit-chain-verify.service.js";

// Daily cron → any gap beyond ~26h since the last recorded verification means a run was missed (the cron
// died silently). 26h (not 24) tolerates normal scheduler jitter without false-flagging every day.
const STALE_HOURS = 26;

type AlarmIntent = {
  operatingCompanyId: string;
  severity: "critical" | "warning";
  title: string;
  body: string;
  smsBody?: string;
};

export type AuditChainVerifyRun = {
  operating_company_id: string;
  chain_ok: boolean;
  events_checked: number;
  hash_breaks: number;
  link_breaks: number;
  first_break_seq: string | null;
  hours_since_last: number | null;
  stale_before: boolean;
};

export type AuditChainVerifyTickResult = {
  ran_at: string;
  companies_checked: number;
  companies_verified: number;
  chain_breaks: number;
  stale_before: number;
  errors: number;
  alarms_dispatched: number;
  runs: AuditChainVerifyRun[];
};

/** Run one audit-chain-verify tick across every active operating company. `now` is injectable for tests. */
export async function runAuditChainVerifyTick(now: Date = new Date()): Promise<AuditChainVerifyTickResult> {
  const result: AuditChainVerifyTickResult = {
    ran_at: now.toISOString(),
    companies_checked: 0,
    companies_verified: 0,
    chain_breaks: 0,
    stale_before: 0,
    errors: 0,
    alarms_dispatched: 0,
    runs: [],
  };
  const alarms: AlarmIntent[] = [];

  await withLuciaBypass(async (client) => {
    // Active entities only — mirrors the org.companies is_active/deactivated_at gate used elsewhere
    // (USMCA stays hidden pre-launch via is_active=false, so it's correctly excluded until go-live).
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id
         FROM org.companies
        WHERE is_active = true AND deactivated_at IS NULL
        ORDER BY id`,
    );

    for (const c of companies.rows) {
      result.companies_checked++;
      try {
        // Staleness of the PRIOR verification (before this run writes a fresh one) → proves the cron ran.
        const prior = await client.query<{ hours: string | null }>(
          `SELECT EXTRACT(EPOCH FROM (now() - max(run_at))) / 3600.0 AS hours
             FROM ops.audit_chain_verifications
            WHERE operating_company_id = $1::uuid`,
          [c.id],
        );
        const hoursSinceLast = prior.rows[0]?.hours == null ? null : Number(prior.rows[0].hours);
        const staleBefore = hoursSinceLast === null || hoursSinceLast > STALE_HOURS;
        if (staleBefore) result.stale_before++;

        const r: ChainVerifyResult = await verifyEventChain(client, c.id);
        result.companies_verified++;
        result.runs.push({
          operating_company_id: c.id,
          chain_ok: r.chain_ok,
          events_checked: r.events_checked,
          hash_breaks: r.hash_breaks,
          link_breaks: r.link_breaks,
          first_break_seq: r.first_break_seq,
          hours_since_last: hoursSinceLast,
          stale_before: staleBefore,
        });

        if (!r.chain_ok) {
          // Highest severity — tamper-evidence break. Fan out everywhere (on-screen + email + SMS).
          result.chain_breaks++;
          alarms.push({
            operatingCompanyId: c.id,
            severity: "critical",
            title: "Audit hash-chain TAMPER detected",
            body:
              `[audit-chain-verify] chain integrity FAILED for company ${c.id}: ` +
              `hash_breaks=${r.hash_breaks}, link_breaks=${r.link_breaks}, ` +
              `first_break_seq=${r.first_break_seq ?? "n/a"}, events_checked=${r.events_checked}. ` +
              `The tamper-evident event log no longer verifies — investigate immediately.`,
            smsBody: `IH35 CRITICAL: audit chain break (co ${c.id.slice(0, 8)}): ${r.hash_breaks} hash / ${r.link_breaks} link breaks`,
          });
        } else if (staleBefore) {
          // Chain is fine now, but verification had lapsed — the cron missed a run (or first-ever run).
          alarms.push({
            operatingCompanyId: c.id,
            severity: "warning",
            title: "Audit chain verification had lapsed",
            body:
              `[audit-chain-verify] chain OK for company ${c.id}, but the previous verification was ` +
              `${hoursSinceLast === null ? "never recorded" : `${hoursSinceLast.toFixed(1)}h ago`} ` +
              `(threshold ${STALE_HOURS}h) — the daily verify cron appears to have missed a run.`,
          });
        }
      } catch (err) {
        // A single entity's failure must NOT blind the rest of the fleet's integrity check. Log + continue.
        result.errors++;
        console.error(
          `[audit-chain-verify] company ${c.id} failed — continuing:`,
          (err as Error)?.message ?? err,
        );
      }
    }
  });

  // Dispatch alarms AFTER the verification transaction has committed. dispatchReliabilityAlarm opens its
  // own bypass connection and never throws (fail-loud per channel), so a channel outage can't crash the tick.
  for (const a of alarms) {
    await dispatchReliabilityAlarm({
      operatingCompanyId: a.operatingCompanyId,
      severity: a.severity,
      source: "audit-chain-verify",
      title: a.title,
      body: a.body,
      smsBody: a.smsBody,
    });
    result.alarms_dispatched++;
  }

  return result;
}
