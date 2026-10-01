/**
 * FEED GATE — runner (Lead, 2026-10-01). Owner law docs/bus/2026-10-01-OWNER-LAW-FEED-GATE-AND-FACTORING-IS-GENERATED.md.
 * openOrGetIntake → runIntake (appends one WORM row per check per run, sets passed/blocked) → closeIntake (refused while
 * any check is red). assertSubjectMayClose is the hook every feeder calls before it marks its subject complete
 * (settlement approve, load delivered→invoiced, batch grid Save all, factoring statement apply).
 */
export type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };
import { withCurrentUser } from "../../auth/db.js";
import { FEED_CHECKS, FEED_SUBJECT_TABLE, type FeedCheckDef } from "./feed-gate.checks.js";

export type FeedKind = keyof typeof FEED_CHECKS;

export type FeedIntakeRow = {
  id: string; operating_company_id: string; feed_kind: string; subject_table: string; subject_id: string; driver_id: string | null;
  status: string; opened_at: string; last_run_no: number; last_run_at: string | null; checks_total: number; checks_failed: number;
  passed_at: string | null; closed_at: string | null;
};
export type FeedCheckRow = {
  id: string; run_no: number; check_group: string; check_key: string; status: "pass" | "fail" | "na"; subject_table: string | null;
  subject_id: string | null; subject_label: string | null; missing: string | null; fix_link: string | null; measured: Record<string, unknown>; measured_at: string;
};

export class FeedGateError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); this.name = "FeedGateError"; }
}

async function subjectDriverId(client: DbClient, kind: string, companyId: string, subjectId: string): Promise<string | null> {
  if (kind === "settlement") {
    const r = await client.query<{ driver_id: string | null }>(`SELECT driver_id::text FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [subjectId, companyId]);
    if (!r.rows[0]) throw new FeedGateError("feed_gate_subject_not_found", `settlement ${subjectId} not found in this company`);
    return r.rows[0].driver_id;
  }
  if (kind === "load") {
    const r = await client.query<{ driver_id: string | null }>(`SELECT assigned_primary_driver_id::text AS driver_id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`, [subjectId, companyId]);
    if (!r.rows[0]) throw new FeedGateError("feed_gate_subject_not_found", `load ${subjectId} not found in this company`);
    return r.rows[0].driver_id;
  }
  if (kind === "invoice" || kind === "expense" || kind === "bill") {
    const table = FEED_SUBJECT_TABLE[kind]!;
    const r = await client.query<{ ok: boolean }>(`SELECT true AS ok FROM ${table} WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [subjectId, companyId]);
    if (!r.rows[0]) throw new FeedGateError("feed_gate_subject_not_found", `${kind} ${subjectId} not found in this company`);
    return null;
  }
  throw new FeedGateError("feed_gate_kind_not_supported", `feed kind ${kind} has no check set yet`);
}

/** Open (or return the live) intake for a subject. The one-settlement-at-a-time rule is enforced by the DB trigger. */
export async function openOrGetIntakeOnClient(client: DbClient, companyId: string, kind: FeedKind, subjectId: string, userId: string): Promise<FeedIntakeRow> {
  const existing = await client.query<FeedIntakeRow>(
    `SELECT * FROM driver_finance.feed_intakes WHERE operating_company_id = $1::uuid AND feed_kind = $2 AND subject_id = $3::uuid AND voided_at IS NULL`,
    [companyId, kind, subjectId]);
  if (existing.rows[0]) return existing.rows[0];
  const driverId = await subjectDriverId(client, kind, companyId, subjectId);
  try {
    const ins = await client.query<FeedIntakeRow>(
      `INSERT INTO driver_finance.feed_intakes (operating_company_id, feed_kind, subject_table, subject_id, driver_id, opened_by_user_id)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid) RETURNING *`,
      [companyId, kind, FEED_SUBJECT_TABLE[kind], subjectId, driverId, userId]);
    return ins.rows[0]!;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("feed_gate_one_settlement_at_a_time")) throw new FeedGateError("feed_gate_one_settlement_at_a_time", msg);
    throw err;
  }
}

type CheckResultRow = { subject_table: string; subject_id: string; subject_label: string; ok: boolean | null; missing: string | null; fix_link: string | null; measured: Record<string, unknown> | null };

async function runOneCheck(client: DbClient, def: FeedCheckDef, companyId: string, subjectId: string): Promise<CheckResultRow[]> {
  // Every check returns the same 7 columns positionally; name them here once so a check never depends on aliases.
  const r = await client.query<CheckResultRow>(
    `SELECT * FROM (${def.sql}) AS chk(subject_table, subject_id, subject_label, ok, missing, fix_link, measured)`,
    [companyId, subjectId]);
  return r.rows;
}

/** Run every check for the intake: appends run_no+1 rows (WORM), updates the intake counters/status. */
export async function runIntakeOnClient(client: DbClient, companyId: string, intakeId: string): Promise<{ intake: FeedIntakeRow; checks: FeedCheckRow[] }> {
  const head = await client.query<FeedIntakeRow>(`SELECT * FROM driver_finance.feed_intakes WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL FOR UPDATE`, [intakeId, companyId]);
  const intake = head.rows[0];
  if (!intake) throw new FeedGateError("feed_gate_intake_not_found", `intake ${intakeId} not found`);
  if (intake.status === "closed") throw new FeedGateError("feed_gate_intake_closed", `intake ${intakeId} is closed; open a new feed to re-check`);
  const defs = FEED_CHECKS[intake.feed_kind];
  if (!defs) throw new FeedGateError("feed_gate_kind_not_supported", `feed kind ${intake.feed_kind} has no check set yet`);
  const runNo = intake.last_run_no + 1;
  let total = 0; let failed = 0;
  for (const def of defs) {
    const rows = await runOneCheck(client, def, companyId, intake.subject_id);
    if (rows.length === 0) {
      await client.query(
        `INSERT INTO driver_finance.feed_intake_checks (operating_company_id, intake_id, run_no, check_group, check_key, status, missing, measured)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'na', 'nothing to inspect for this check', '{}'::jsonb)`,
        [companyId, intakeId, runNo, def.group, def.key]);
      continue;
    }
    for (const row of rows) {
      const status: "pass" | "fail" | "na" = row.ok === null ? "na" : row.ok ? "pass" : "fail";
      if (status !== "na") total += 1;
      if (status === "fail") failed += 1;
      await client.query(
        `INSERT INTO driver_finance.feed_intake_checks (operating_company_id, intake_id, run_no, check_group, check_key, status, subject_table, subject_id, subject_label, missing, fix_link, measured)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid, $9, $10, $11, $12::jsonb)`,
        [companyId, intakeId, runNo, def.group, def.key, status, row.subject_table, row.subject_id, row.subject_label, status === "fail" ? (row.missing || "check failed") : null, row.fix_link, JSON.stringify(row.measured ?? {})]);
    }
  }
  const newStatus = failed === 0 && total > 0 ? "passed" : "blocked";
  const upd = await client.query<FeedIntakeRow>(
    `UPDATE driver_finance.feed_intakes SET last_run_no = $3, last_run_at = now(), checks_total = $4, checks_failed = $5, status = $6,
            passed_at = CASE WHEN $6 = 'passed' THEN now() ELSE NULL END
      WHERE id = $1::uuid AND operating_company_id = $2::uuid RETURNING *`,
    [intakeId, companyId, runNo, total, failed, newStatus]);
  const checks = await listRunChecks(client, companyId, intakeId, runNo);
  return { intake: upd.rows[0]!, checks };
}

async function listRunChecks(client: DbClient, companyId: string, intakeId: string, runNo: number): Promise<FeedCheckRow[]> {
  const r = await client.query<FeedCheckRow>(
    `SELECT id::text, run_no, check_group, check_key, status, subject_table, subject_id::text, subject_label, missing, fix_link, measured, measured_at::text
       FROM driver_finance.feed_intake_checks WHERE intake_id = $1::uuid AND operating_company_id = $2::uuid AND run_no = $3
      ORDER BY (status = 'fail') DESC, check_group, check_key, subject_label`, [intakeId, companyId, runNo]);
  return r.rows;
}

/** Close the intake: only when the latest run is green. */
export async function closeIntakeOnClient(client: DbClient, companyId: string, intakeId: string, userId: string): Promise<FeedIntakeRow> {
  const r = await client.query<FeedIntakeRow>(
    `UPDATE driver_finance.feed_intakes SET status = 'closed', closed_at = now(), closed_by_user_id = $3::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL AND status = 'passed' RETURNING *`, [intakeId, companyId, userId]);
  if (!r.rows[0]) {
    const cur = await client.query<{ status: string; checks_failed: number }>(`SELECT status, checks_failed FROM driver_finance.feed_intakes WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [intakeId, companyId]);
    throw new FeedGateError("feed_gate_not_green", `intake is ${cur.rows[0]?.status ?? "missing"} with ${cur.rows[0]?.checks_failed ?? "?"} red check(s); fix them and re-run before closing`);
  }
  return r.rows[0];
}

/**
 * The hook every feeder calls before marking its subject complete. Runs the checks now (fresh evidence) and throws
 * FeedGateError('feed_gate_blocked') with the red rows when anything is missing. Opens the intake if none exists.
 */
export async function assertSubjectMayCloseOnClient(client: DbClient, companyId: string, kind: FeedKind, subjectId: string, userId: string): Promise<{ intake: FeedIntakeRow; checks: FeedCheckRow[] }> {
  const intake = await openOrGetIntakeOnClient(client, companyId, kind, subjectId, userId);
  if (intake.status === "closed") return { intake, checks: await listRunChecks(client, companyId, intake.id, intake.last_run_no) };
  const run = await runIntakeOnClient(client, companyId, intake.id);
  if (run.intake.status !== "passed") {
    const reds = run.checks.filter((c) => c.status === "fail");
    throw new FeedGateError("feed_gate_blocked", `${reds.length} check(s) red on ${kind} ${subjectId}: ${reds.slice(0, 5).map((c) => `${c.subject_label}: ${c.missing}`).join(" · ")}${reds.length > 5 ? " · …" : ""}`, { intake_id: run.intake.id, reds });
  }
  return run;
}

// ---- user-scoped wrappers for the routes ----
export async function openAndRunIntake(userId: string, companyId: string, kind: FeedKind, subjectId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const intake = await openOrGetIntakeOnClient(client as DbClient, companyId, kind, subjectId, userId);
    if (intake.status === "closed") return { intake, checks: await listRunChecks(client as DbClient, companyId, intake.id, intake.last_run_no) };
    return runIntakeOnClient(client as DbClient, companyId, intake.id);
  });
}
export async function getIntake(userId: string, companyId: string, intakeId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const r = await client.query<FeedIntakeRow>(`SELECT * FROM driver_finance.feed_intakes WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [intakeId, companyId]);
    if (!r.rows[0]) throw new FeedGateError("feed_gate_intake_not_found", "intake not found");
    return { intake: r.rows[0], checks: await listRunChecks(client as DbClient, companyId, intakeId, r.rows[0].last_run_no) };
  });
}
export async function closeIntake(userId: string, companyId: string, intakeId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return closeIntakeOnClient(client as DbClient, companyId, intakeId, userId);
  });
}
export async function listIntakes(userId: string, companyId: string, limit = 100) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const r = await client.query<FeedIntakeRow & { subject_label: string | null; driver_name: string | null }>(
      `SELECT fi.*, d.first_name || ' ' || d.last_name AS driver_name,
              CASE fi.feed_kind WHEN 'settlement' THEN (SELECT 'Settlement ' || s.display_id FROM driver_finance.driver_settlements s WHERE s.id = fi.subject_id)
                                WHEN 'load' THEN (SELECT 'Load ' || l.load_number FROM mdata.loads l WHERE l.id = fi.subject_id)
                                WHEN 'invoice' THEN (SELECT 'Invoice ' || i.display_id FROM accounting.invoices i WHERE i.id = fi.subject_id)
                                WHEN 'expense' THEN (SELECT 'Expense ' || coalesce(e.expense_number, left(e.id::text, 8)) FROM accounting.expenses e WHERE e.id = fi.subject_id)
                                WHEN 'bill' THEN (SELECT 'Bill ' || coalesce(b.display_id, b.bill_number, left(b.id::text, 8)) FROM accounting.bills b WHERE b.id = fi.subject_id) END AS subject_label
         FROM driver_finance.feed_intakes fi LEFT JOIN mdata.drivers d ON d.id = fi.driver_id
        WHERE fi.operating_company_id = $1::uuid AND fi.voided_at IS NULL ORDER BY fi.opened_at DESC LIMIT $2`, [companyId, limit]);
    return r.rows;
  });
}
