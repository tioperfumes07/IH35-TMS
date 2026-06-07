export const TAG_NETWORKS = ["txtag", "ezpass", "ipass", "sunpass", "fastrak", "prepass"] as const;
export type TagNetwork = (typeof TAG_NETWORKS)[number];

export type UnitTollTagRow = {
  uuid: string;
  operating_company_id: string;
  unit_uuid: string;
  tag_network: TagNetwork;
  tag_number: string;
  activated_at: string;
  deactivated_at: string | null;
  monthly_fee: string | null;
  balance_current: string | null;
  auto_replenish: boolean;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function assertUnitScope(
  client: Queryable,
  unitUuid: string,
  operatingCompanyId: string
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM mdata.units
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [unitUuid, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

export function isLowBalance(balance: string | null | undefined, threshold = 25): boolean {
  if (balance == null || balance === "") return false;
  const value = Number(balance);
  return Number.isFinite(value) && value < threshold;
}

export async function listUnitTollTags(
  client: Queryable,
  unitUuid: string,
  operatingCompanyId: string
): Promise<UnitTollTagRow[]> {
  const res = await client.query<UnitTollTagRow>(
    `
      SELECT
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        tag_network,
        tag_number,
        activated_at::text,
        deactivated_at::text,
        monthly_fee::text,
        balance_current::text,
        auto_replenish,
        notes,
        deleted_at::text,
        created_at::text,
        updated_at::text
      FROM master_data.unit_toll_tags
      WHERE unit_uuid = $1::uuid
        AND operating_company_id = $2::uuid
        AND deleted_at IS NULL
      ORDER BY activated_at DESC, tag_network
    `,
    [unitUuid, operatingCompanyId]
  );
  return res.rows;
}

export async function createUnitTollTag(
  client: Queryable,
  unitUuid: string,
  operatingCompanyId: string,
  input: {
    tag_network: TagNetwork;
    tag_number: string;
    activated_at: string;
    deactivated_at?: string | null;
    monthly_fee?: number | null;
    balance_current?: number | null;
    auto_replenish?: boolean;
    notes?: string | null;
  }
): Promise<UnitTollTagRow> {
  const res = await client.query<UnitTollTagRow>(
    `
      INSERT INTO master_data.unit_toll_tags (
        operating_company_id,
        unit_uuid,
        tag_network,
        tag_number,
        activated_at,
        deactivated_at,
        monthly_fee,
        balance_current,
        auto_replenish,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        tag_network,
        tag_number,
        activated_at::text,
        deactivated_at::text,
        monthly_fee::text,
        balance_current::text,
        auto_replenish,
        notes,
        deleted_at::text,
        created_at::text,
        updated_at::text
    `,
    [
      operatingCompanyId,
      unitUuid,
      input.tag_network,
      input.tag_number,
      input.activated_at,
      input.deactivated_at ?? null,
      input.monthly_fee ?? null,
      input.balance_current ?? null,
      input.auto_replenish ?? true,
      input.notes ?? null,
    ]
  );
  return res.rows[0]!;
}

export async function updateUnitTollTag(
  client: Queryable,
  unitUuid: string,
  tagUuid: string,
  operatingCompanyId: string,
  patch: Partial<{
    tag_network: TagNetwork;
    tag_number: string;
    activated_at: string;
    deactivated_at: string | null;
    monthly_fee: number | null;
    balance_current: number | null;
    auto_replenish: boolean;
    notes: string | null;
  }>
): Promise<UnitTollTagRow | null> {
  const setParts: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  const add = (col: string, val: unknown) => {
    values.push(val);
    setParts.push(`${col} = $${values.length}`);
  };
  if ("tag_network" in patch) add("tag_network", patch.tag_network);
  if ("tag_number" in patch) add("tag_number", patch.tag_number);
  if ("activated_at" in patch) add("activated_at", patch.activated_at);
  if ("deactivated_at" in patch) add("deactivated_at", patch.deactivated_at ?? null);
  if ("monthly_fee" in patch) add("monthly_fee", patch.monthly_fee ?? null);
  if ("balance_current" in patch) add("balance_current", patch.balance_current ?? null);
  if ("auto_replenish" in patch) add("auto_replenish", patch.auto_replenish);
  if ("notes" in patch) add("notes", patch.notes ?? null);
  values.push(tagUuid, unitUuid, operatingCompanyId);
  const res = await client.query<UnitTollTagRow>(
    `
      UPDATE master_data.unit_toll_tags
      SET ${setParts.join(", ")}
      WHERE uuid = $${values.length - 2}::uuid
        AND unit_uuid = $${values.length - 1}::uuid
        AND operating_company_id = $${values.length}::uuid
        AND deleted_at IS NULL
      RETURNING
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        tag_network,
        tag_number,
        activated_at::text,
        deactivated_at::text,
        monthly_fee::text,
        balance_current::text,
        auto_replenish,
        notes,
        deleted_at::text,
        created_at::text,
        updated_at::text
    `,
    values
  );
  return res.rows[0] ?? null;
}

export async function softDeleteUnitTollTag(
  client: Queryable,
  unitUuid: string,
  tagUuid: string,
  operatingCompanyId: string
): Promise<boolean> {
  const res = await client.query(
    `
      UPDATE master_data.unit_toll_tags
      SET deleted_at = now(), updated_at = now()
      WHERE uuid = $1::uuid
        AND unit_uuid = $2::uuid
        AND operating_company_id = $3::uuid
        AND deleted_at IS NULL
      RETURNING uuid
    `,
    [tagUuid, unitUuid, operatingCompanyId]
  );
  return res.rows.length > 0;
}
