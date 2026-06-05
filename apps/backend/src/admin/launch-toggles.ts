import type pg from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { dispatchNotification } from "../notifications/dispatcher.js";

type DbClient = Pick<pg.PoolClient, "query">;

export type LaunchToggleRow = {
  operating_company_id: string;
  company_code: string;
  legal_name: string;
  short_name: string | null;
  is_active: boolean;
  hidden: boolean;
  launched_at: string | null;
  launched_by_user_id: string | null;
  launched_by_email: string | null;
  rollback_at: string | null;
  notes: string | null;
};

export async function listLaunchToggles(client: DbClient): Promise<LaunchToggleRow[]> {
  const res = await client.query<LaunchToggleRow>(
    `
      SELECT
        c.id AS operating_company_id,
        c.code AS company_code,
        c.legal_name,
        c.short_name,
        c.is_active,
        COALESCE(lt.hidden, NOT c.is_active) AS hidden,
        lt.launched_at::text,
        lt.launched_by_user_id::text,
        lu.email AS launched_by_email,
        lt.rollback_at::text,
        lt.notes
      FROM org.companies c
      LEFT JOIN admin.launch_toggles lt ON lt.operating_company_id = c.id
      LEFT JOIN identity.users lu ON lu.id = lt.launched_by_user_id
      WHERE c.deactivated_at IS NULL
        AND c.company_type = 'operating_carrier'
      ORDER BY c.code
    `
  );
  return res.rows;
}

async function upsertToggleRow(
  client: DbClient,
  operatingCompanyId: string,
  patch: {
    hidden: boolean;
    launched_at?: string | null;
    launched_by_user_id?: string | null;
    rollback_at?: string | null;
    rollback_by_user_id?: string | null;
    notes?: string | null;
  }
) {
  await client.query(
    `
      INSERT INTO admin.launch_toggles (
        operating_company_id, hidden, launched_at, launched_by_user_id,
        rollback_at, rollback_by_user_id, notes, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (operating_company_id) DO UPDATE SET
        hidden = EXCLUDED.hidden,
        launched_at = EXCLUDED.launched_at,
        launched_by_user_id = EXCLUDED.launched_by_user_id,
        rollback_at = EXCLUDED.rollback_at,
        rollback_by_user_id = EXCLUDED.rollback_by_user_id,
        notes = COALESCE(EXCLUDED.notes, admin.launch_toggles.notes),
        updated_at = now()
    `,
    [
      operatingCompanyId,
      patch.hidden,
      patch.launched_at ?? null,
      patch.launched_by_user_id ?? null,
      patch.rollback_at ?? null,
      patch.rollback_by_user_id ?? null,
      patch.notes ?? null,
    ]
  );
}

async function notifyOwnerAccountingLaunch(client: DbClient, companyCode: string, action: "launch" | "rollback") {
  const owners = await client.query<{ id: string; email: string | null }>(
    `
      SELECT id, email
      FROM identity.users
      WHERE role = 'Owner'
        AND deactivated_at IS NULL
    `
  );
  for (const owner of owners.rows) {
    void dispatchNotification({
      user_id: owner.id,
      event_type: "report.scheduled.delivered" as const,
      actor_user_id: null,
      payload: {
        company_code: companyCode,
        action,
        link: "/admin/launch-toggles",
        subject: `Carrier ${action}: ${companyCode}`,
      },
    }).catch(() => undefined);
  }
}

export async function toggleCarrierLaunch(
  client: DbClient,
  actorUserId: string,
  carrierId: string,
  targetState: "launch" | "rollback",
  notes?: string | null
) {
  const companyRes = await client.query<{ id: string; code: string; is_active: boolean }>(
    `
      SELECT id, code, is_active
      FROM org.companies
      WHERE id = $1 AND deactivated_at IS NULL
      LIMIT 1
    `,
    [carrierId]
  );
  const company = companyRes.rows[0];
  if (!company) throw new Error("carrier_not_found");

  if (targetState === "launch") {
    if (company.is_active) throw new Error("already_launched");
    await client.query(
      `UPDATE org.companies SET is_active = true, updated_at = now(), updated_by_user_id = $2 WHERE id = $1`,
      [carrierId, actorUserId]
    );
    await upsertToggleRow(client, carrierId, {
      hidden: false,
      launched_at: new Date().toISOString(),
      launched_by_user_id: actorUserId,
      rollback_at: null,
      rollback_by_user_id: null,
      notes: notes ?? null,
    });
    await appendCrudAudit(
      client,
      actorUserId,
      "admin.carrier.launched",
      {
        resource_id: carrierId,
        resource_type: "org.companies",
        company_code: company.code,
        notes: notes ?? null,
      },
      "info",
      "USMCA-3"
    );
    await notifyOwnerAccountingLaunch(client, company.code, "launch");
    return { operating_company_id: carrierId, is_active: true, hidden: false };
  }

  if (!company.is_active) throw new Error("already_hidden");
  await client.query(
    `UPDATE org.companies SET is_active = false, updated_at = now(), updated_by_user_id = $2 WHERE id = $1`,
    [carrierId, actorUserId]
  );
  await upsertToggleRow(client, carrierId, {
    hidden: true,
    launched_at: null,
    launched_by_user_id: null,
    rollback_at: new Date().toISOString(),
    rollback_by_user_id: actorUserId,
    notes: notes ?? null,
  });
  await appendCrudAudit(
    client,
    actorUserId,
    "admin.carrier.rollback",
    {
      resource_id: carrierId,
      resource_type: "org.companies",
      company_code: company.code,
      notes: notes ?? null,
    },
    "info",
    "USMCA-3"
  );
  await notifyOwnerAccountingLaunch(client, company.code, "rollback");
  return { operating_company_id: carrierId, is_active: false, hidden: true };
}
