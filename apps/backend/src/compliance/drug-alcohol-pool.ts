import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { dispatchNotification, listCompanyUserIdsByRoles } from "../notifications/dispatcher.js";

export type PoolMember = {
  driver_id: string;
  added_at: string;
  removed_at: string | null;
};

export type RandomDrawResult = {
  draw_id: string;
  quarter: number;
  year: number;
  drug_count: number;
  alcohol_count: number;
  selections: Array<{ driver_id: string; test_type: "drug" | "alcohol" }>;
};

const DRUG_QUARTERLY_RATE = 0.125;
const ALCOHOL_QUARTERLY_RATE = 0.025;

export function fisherYatesShuffle<T>(items: T[], random: (max: number) => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function selectionCounts(poolSize: number) {
  const drugCount = Math.max(1, Math.ceil(poolSize * DRUG_QUARTERLY_RATE));
  const alcoholCount = Math.max(poolSize > 0 ? 1 : 0, Math.ceil(poolSize * ALCOHOL_QUARTERLY_RATE));
  return { drugCount, alcoholCount };
}

export function pickRandomSelections(
  memberIds: string[],
  quarter: number,
  year: number,
  seed: string
): RandomDrawResult["selections"] {
  if (memberIds.length === 0) {
    return [];
  }
  const { drugCount, alcoholCount } = selectionCounts(memberIds.length);
  const seedNum = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + year * 10 + quarter;
  const random = (max: number) => randomInt(0, max + 1) ^ (seedNum % (max + 1));
  const shuffled = fisherYatesShuffle(memberIds, random);
  const drugDrivers = shuffled.slice(0, Math.min(drugCount, shuffled.length));
  const alcoholDrivers = fisherYatesShuffle(
    shuffled.filter((id) => !drugDrivers.includes(id)),
    random
  ).slice(0, Math.min(alcoholCount, Math.max(0, shuffled.length - drugDrivers.length)));

  return [
    ...drugDrivers.map((driver_id) => ({ driver_id, test_type: "drug" as const })),
    ...alcoholDrivers.map((driver_id) => ({ driver_id, test_type: "alcohol" as const })),
  ];
}

export async function syncPoolFromCdlDrivers(client: PoolClient, operatingCompanyId: string): Promise<number> {
  const active = await client.query<{ id: string }>(
    `
      SELECT d.id::text AS id
      FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid
        AND d.deactivated_at IS NULL
        AND d.archived_at IS NULL
        AND d.cdl_class IN ('A', 'B', 'C')
        AND NOT EXISTS (
          SELECT 1
          FROM compliance.drug_alcohol_pool_members pm
          WHERE pm.operating_company_id = $1::uuid
            AND pm.driver_id = d.id
            AND pm.removed_at IS NULL
        )
    `,
    [operatingCompanyId]
  );

  let inserted = 0;
  for (const row of active.rows) {
    await client.query(
      `
        INSERT INTO compliance.drug_alcohol_pool_members (operating_company_id, driver_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT (operating_company_id, driver_id) DO UPDATE
          SET removed_at = NULL, removal_reason = NULL, added_at = now()
        WHERE compliance.drug_alcohol_pool_members.removed_at IS NOT NULL
      `,
      [operatingCompanyId, row.id]
    );
    inserted += 1;
  }
  return inserted;
}

export async function listActivePoolMembers(client: PoolClient, operatingCompanyId: string): Promise<PoolMember[]> {
  const res = await client.query<PoolMember>(
    `
      SELECT driver_id::text, added_at::text, removed_at::text
      FROM compliance.drug_alcohol_pool_members
      WHERE operating_company_id = $1::uuid
        AND removed_at IS NULL
      ORDER BY added_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export async function runQuarterlyRandomDraw(
  client: PoolClient,
  operatingCompanyId: string,
  year: number,
  quarter: number
): Promise<RandomDrawResult> {
  await syncPoolFromCdlDrivers(client, operatingCompanyId);
  const members = await listActivePoolMembers(client, operatingCompanyId);
  const memberIds = members.map((m) => m.driver_id);
  const seed = `${operatingCompanyId}:${year}:Q${quarter}:${Date.now()}`;
  const selections = pickRandomSelections(memberIds, quarter, year, seed);
  const drugCount = selections.filter((s) => s.test_type === "drug").length;
  const alcoholCount = selections.filter((s) => s.test_type === "alcohol").length;

  const drawRes = await client.query<{ id: string }>(
    `
      INSERT INTO compliance.drug_alcohol_random_draws (
        operating_company_id, quarter, year, drug_count, alcohol_count, selection_seed
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6)
      ON CONFLICT (operating_company_id, year, quarter) DO UPDATE
        SET drug_count = EXCLUDED.drug_count,
            alcohol_count = EXCLUDED.alcohol_count,
            drawn_at = now(),
            selection_seed = EXCLUDED.selection_seed
      RETURNING id::text
    `,
    [operatingCompanyId, quarter, year, drugCount, alcoholCount, seed]
  );
  const drawId = drawRes.rows[0]?.id;
  if (!drawId) throw new Error("draw_insert_failed");

  await client.query(`DELETE FROM compliance.drug_alcohol_random_selections WHERE draw_id = $1::uuid`, [drawId]);
  for (const sel of selections) {
    await client.query(
      `
        INSERT INTO compliance.drug_alcohol_random_selections (
          operating_company_id, draw_id, driver_id, test_type, notified_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, now())
      `,
      [operatingCompanyId, drawId, sel.driver_id, sel.test_type]
    );
  }

  return { draw_id: drawId, quarter, year, drug_count: drugCount, alcohol_count: alcoholCount, selections };
}

export async function notifyRandomSelections(
  operatingCompanyId: string,
  selections: RandomDrawResult["selections"]
): Promise<void> {
  const recipients = await listCompanyUserIdsByRoles(operatingCompanyId, ["Owner", "Administrator", "Safety", "Manager"]);
  const headline = `Random drug/alcohol selections (${selections.length} drivers)`;
  await Promise.all(
    recipients.map((userId) =>
      dispatchNotification({
        user_id: userId,
        event_type: "wo.created",
        actor_user_id: null,
        payload: {
          operating_company_id: operatingCompanyId,
          headline,
          bodyText: `${selections.length} drivers selected for random testing. Review Safety > Drug/Alcohol.`,
          selection_count: selections.length,
          whatsapp_skip: true,
        },
      }).catch(() => undefined)
    )
  );
}
