import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { getValidAccessToken } from "./qbo-oauth.service.js";

type LinkableEntityType = "driver" | "unit" | "equipment" | "asset";
type QboClassEntityType = "unit" | "trailer";

type VendorRow = {
  qbo_vendor_id: string;
  display_name: string;
  company_name: string | null;
  active: boolean;
};

type DriverCreateInput = {
  operatingCompanyId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  qboVendorName: string;
};

type UnitCreateInput = {
  unitNumber: string;
  vin: string;
  qboClassName: string;
};

type RetryableResult<T> = {
  ok: true;
  value: T;
} | {
  ok: false;
  error: string;
};

function normalizeEntityType(entityType: LinkableEntityType): "driver" | "unit" | "equipment" {
  if (entityType === "asset") return "equipment";
  return entityType;
}

function qboApiBase() {
  const env = (process.env.QBO_ENV ?? "production").toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
    : "https://quickbooks.api.intuit.com/v3/company";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url: string, init: RequestInit, maxRetries = 4): Promise<Response> {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, init);
    if (response.ok) return response;
    if (attempt >= maxRetries || (response.status < 500 && response.status !== 429)) return response;
    await sleep(Math.min(10_000, 400 * 2 ** attempt));
    attempt += 1;
  }
}

function safeVendorName(value: string) {
  return value.trim().slice(0, 100) || "IH35 Vendor";
}

function tokenize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}

function similarityScore(source: string, candidate: string) {
  const a = tokenize(source);
  const b = tokenize(candidate);
  if (!a.length || !b.length) return 0;
  let common = 0;
  for (const token of a) {
    if (b.includes(token)) common += 1;
  }
  const jaccard = common / new Set([...a, ...b]).size;
  const containsBoost = candidate.toLowerCase().includes(source.toLowerCase()) ? 0.15 : 0;
  return Math.min(1, Number((jaccard + containsBoost).toFixed(4)));
}

async function appendLinkageEvent(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  operatingCompanyId: string,
  payload: {
    entityType: "driver" | "unit" | "equipment";
    entityId: string;
    qboVendorId?: string | null;
    qboClassId?: string | null;
    previousQboVendorId?: string | null;
    previousQboClassId?: string | null;
    action: "linked" | "unlinked" | "changed" | "auto_suggested";
    reason: string;
    userId: string;
  }
) {
  await client.query(
    `
      INSERT INTO integrations.qbo_vendor_linkage_events (
        operating_company_id,
        entity_type,
        entity_id,
        qbo_vendor_id,
        qbo_class_id,
        previous_qbo_vendor_id,
        previous_qbo_class_id,
        action,
        reason,
        user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [
      operatingCompanyId,
      payload.entityType,
      payload.entityId,
      payload.qboVendorId ?? null,
      payload.qboClassId ?? null,
      payload.previousQboVendorId ?? null,
      payload.previousQboClassId ?? null,
      payload.action,
      payload.reason,
      payload.userId,
    ]
  );
}

async function qboPostEntity(
  operatingCompanyId: string,
  path: string,
  payload: Record<string, unknown>
): Promise<RetryableResult<Record<string, unknown>>> {
  try {
    const token = await getValidAccessToken(operatingCompanyId);
    const url = `${qboApiBase()}/${token.realm_id}/${path}?minorversion=75`;
    const response = await requestWithRetry(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `qbo_post_failed_status_${response.status}:${text.slice(0, 240)}` };
    }
    return { ok: true, value: (JSON.parse(text) as Record<string, unknown>) ?? {} };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? "qbo_post_failed") };
  }
}

export async function createQboVendor(operatingCompanyId: string, displayName: string) {
  return qboPostEntity(operatingCompanyId, "vendor", {
    DisplayName: safeVendorName(displayName),
    CompanyName: safeVendorName(displayName),
    Active: true,
  });
}

export async function createQboClass(operatingCompanyId: string, className: string) {
  return qboPostEntity(operatingCompanyId, "class", {
    Name: className.trim().slice(0, 100) || "IH35 Class",
    Active: true,
  });
}

export async function listAvailableVendors(userId: string, operatingCompanyId: string, query = "", limit = 50) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const term = `%${query.trim()}%`;
    const res = await client.query<VendorRow>(
      `
        WITH ranked AS (
          SELECT
            es.qbo_entity_id AS qbo_vendor_id,
            COALESCE(es.raw_snapshot->>'DisplayName', es.raw_snapshot->>'Name', es.qbo_entity_id) AS display_name,
            COALESCE(es.raw_snapshot->>'CompanyName', es.raw_snapshot->>'DisplayName', es.raw_snapshot->>'Name') AS company_name,
            COALESCE((es.raw_snapshot->>'Active')::boolean, true) AS active,
            ROW_NUMBER() OVER (PARTITION BY es.qbo_entity_id ORDER BY es.snapshot_taken_at DESC, es.created_at DESC) AS rn
          FROM qbo_archive.entities_snapshot es
          WHERE es.operating_company_id = $1
            AND es.qbo_entity_type = 'Vendor'
        )
        SELECT qbo_vendor_id, display_name, company_name, active
        FROM ranked
        WHERE rn = 1
          AND ($2::text = '%%' OR display_name ILIKE $2 OR COALESCE(company_name, '') ILIKE $2)
        ORDER BY display_name ASC
        LIMIT $3
      `,
      [operatingCompanyId, term, limit]
    );
    return res.rows;
  });
}

export async function suggestMatches(
  userId: string,
  operatingCompanyId: string,
  entityType: LinkableEntityType,
  entityId: string
) {
  const normalizedType = normalizeEntityType(entityType);
  const [vendors, sourceLabel] = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    let source = "";
    if (normalizedType === "driver") {
      const row = await client.query<{ first_name: string; last_name: string }>(
        `SELECT first_name, last_name FROM mdata.drivers WHERE id = $1 LIMIT 1`,
        [entityId]
      );
      source = `${row.rows[0]?.first_name ?? ""} ${row.rows[0]?.last_name ?? ""}`.trim();
    } else if (normalizedType === "unit") {
      const row = await client.query<{ unit_number: string; make: string | null; model: string | null }>(
        `SELECT unit_number, make, model FROM mdata.units WHERE id = $1 LIMIT 1`,
        [entityId]
      );
      source = `${row.rows[0]?.unit_number ?? ""} ${row.rows[0]?.make ?? ""} ${row.rows[0]?.model ?? ""}`.trim();
    } else {
      const row = await client.query<{ equipment_number: string; equipment_type: string }>(
        `SELECT equipment_number, equipment_type FROM mdata.equipment WHERE id = $1 LIMIT 1`,
        [entityId]
      );
      source = `${row.rows[0]?.equipment_number ?? ""} ${row.rows[0]?.equipment_type ?? ""}`.trim();
    }
    const vendorRows = await listAvailableVendors(userId, operatingCompanyId, "", 120);
    return [vendorRows, source] as const;
  });

  return vendors
    .map((vendor) => ({
      ...vendor,
      score: similarityScore(sourceLabel, `${vendor.display_name} ${vendor.company_name ?? ""}`),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

async function ensureVendorExists(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string,
  qboVendorId: string
) {
  const res = await client.query<{ id: string }>(
    `
      SELECT es.qbo_entity_id AS id
      FROM qbo_archive.entities_snapshot es
      WHERE es.operating_company_id = $1
        AND es.qbo_entity_type = 'Vendor'
        AND es.qbo_entity_id = $2
      LIMIT 1
    `,
    [operatingCompanyId, qboVendorId]
  );
  return Boolean(res.rows[0]?.id);
}

export async function linkVendor(
  userId: string,
  input: {
    operatingCompanyId: string;
    entityType: LinkableEntityType;
    entityId: string;
    qboVendorId: string;
    reason: string;
    force?: boolean;
  }
) {
  const entityType = normalizeEntityType(input.entityType);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    if (!(await ensureVendorExists(client, input.operatingCompanyId, input.qboVendorId))) {
      throw new Error("qbo_vendor_not_found");
    }

    const table = entityType === "driver" ? "mdata.drivers" : entityType === "unit" ? "mdata.units" : "mdata.equipment";
    const column = "qbo_vendor_id";
    const current = await client.query<{ current_id: string | null }>(
      `SELECT ${column} AS current_id FROM ${table} WHERE id = $1 LIMIT 1`,
      [input.entityId]
    );
    const previous = current.rows[0]?.current_id ?? null;
    if (!current.rows[0]) throw new Error("entity_not_found");
    if (previous && previous !== input.qboVendorId && !input.force) {
      throw new Error("qbo_vendor_already_linked_use_force");
    }
    if (previous === input.qboVendorId) {
      return { ok: true, idempotent: true };
    }

    await client.query(
      `
        UPDATE ${table}
        SET qbo_vendor_id = $2,
            qbo_vendor_linked_at = now(),
            qbo_vendor_linked_by_user_id = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [input.entityId, input.qboVendorId, userId]
    );

    await appendLinkageEvent(client, input.operatingCompanyId, {
      entityType,
      entityId: input.entityId,
      qboVendorId: input.qboVendorId,
      previousQboVendorId: previous,
      action: previous ? "changed" : "linked",
      reason: input.reason,
      userId,
    });

    await appendCrudAudit(
      client,
      userId,
      previous ? "driver.qbo_vendor.linked" : "driver.qbo_vendor.linked",
      {
        resource_type: table,
        resource_id: input.entityId,
        operating_company_id: input.operatingCompanyId,
        qbo_vendor_id: input.qboVendorId,
        previous_qbo_vendor_id: previous,
        reason: input.reason,
      },
      "info",
      "P5-D3-QBO-LINKAGE"
    );

    return { ok: true, idempotent: false };
  });
}

export async function unlinkVendor(
  userId: string,
  input: {
    operatingCompanyId: string;
    entityType: LinkableEntityType;
    entityId: string;
    reason: string;
  }
) {
  const entityType = normalizeEntityType(input.entityType);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const table = entityType === "driver" ? "mdata.drivers" : entityType === "unit" ? "mdata.units" : "mdata.equipment";
    const row = await client.query<{ current_id: string | null }>(
      `SELECT qbo_vendor_id AS current_id FROM ${table} WHERE id = $1 LIMIT 1`,
      [input.entityId]
    );
    if (!row.rows[0]) throw new Error("entity_not_found");
    const previous = row.rows[0].current_id;
    if (!previous) return { ok: true, idempotent: true };

    await client.query(
      `
        UPDATE ${table}
        SET qbo_vendor_id = NULL,
            qbo_vendor_linked_at = NULL,
            qbo_vendor_linked_by_user_id = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [input.entityId]
    );
    await appendLinkageEvent(client, input.operatingCompanyId, {
      entityType,
      entityId: input.entityId,
      previousQboVendorId: previous,
      action: "unlinked",
      reason: input.reason,
      userId,
    });
    await appendCrudAudit(
      client,
      userId,
      "driver.qbo_vendor.unlinked",
      {
        resource_type: table,
        resource_id: input.entityId,
        operating_company_id: input.operatingCompanyId,
        previous_qbo_vendor_id: previous,
        reason: input.reason,
      },
      "warning",
      "P5-D3-QBO-LINKAGE"
    );
    return { ok: true, idempotent: false };
  });
}

export async function linkClass(
  userId: string,
  input: {
    operatingCompanyId: string;
    entityType: QboClassEntityType;
    entityId: string;
    qboClassId: string;
    reason: string;
    force?: boolean;
  }
) {
  const isUnit = input.entityType === "unit";
  const table = isUnit ? "mdata.units" : "mdata.equipment";
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const current = await client.query<{ current_id: string | null }>(
      `SELECT qbo_class_id AS current_id FROM ${table} WHERE id = $1 LIMIT 1`,
      [input.entityId]
    );
    if (!current.rows[0]) throw new Error("entity_not_found");
    const previous = current.rows[0].current_id;
    if (previous && previous !== input.qboClassId && !input.force) {
      throw new Error("qbo_class_already_linked_use_force");
    }
    if (previous === input.qboClassId) return { ok: true, idempotent: true };

    await client.query(
      `UPDATE ${table} SET qbo_class_id = $2, updated_at = now() WHERE id = $1`,
      [input.entityId, input.qboClassId]
    );
    await appendLinkageEvent(client, input.operatingCompanyId, {
      entityType: isUnit ? "unit" : "equipment",
      entityId: input.entityId,
      qboClassId: input.qboClassId,
      previousQboClassId: previous,
      action: previous ? "changed" : "linked",
      reason: input.reason,
      userId,
    });
    await appendCrudAudit(
      client,
      userId,
      "asset.qbo_class.linked",
      {
        resource_type: table,
        resource_id: input.entityId,
        operating_company_id: input.operatingCompanyId,
        qbo_class_id: input.qboClassId,
        previous_qbo_class_id: previous,
        reason: input.reason,
      },
      "info",
      "P5-D3-QBO-LINKAGE"
    );
    return { ok: true, idempotent: false };
  });
}

export async function unlinkClass(
  userId: string,
  input: {
    operatingCompanyId: string;
    entityType: QboClassEntityType;
    entityId: string;
    reason: string;
  }
) {
  const table = input.entityType === "unit" ? "mdata.units" : "mdata.equipment";
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const row = await client.query<{ current_id: string | null }>(
      `SELECT qbo_class_id AS current_id FROM ${table} WHERE id = $1 LIMIT 1`,
      [input.entityId]
    );
    if (!row.rows[0]) throw new Error("entity_not_found");
    const previous = row.rows[0].current_id;
    if (!previous) return { ok: true, idempotent: true };
    await client.query(`UPDATE ${table} SET qbo_class_id = NULL, updated_at = now() WHERE id = $1`, [input.entityId]);
    await appendLinkageEvent(client, input.operatingCompanyId, {
      entityType: input.entityType === "unit" ? "unit" : "equipment",
      entityId: input.entityId,
      previousQboClassId: previous,
      action: "unlinked",
      reason: input.reason,
      userId,
    });
    await appendCrudAudit(
      client,
      userId,
      "asset.qbo_class.unlinked",
      {
        resource_type: table,
        resource_id: input.entityId,
        operating_company_id: input.operatingCompanyId,
        previous_qbo_class_id: previous,
        reason: input.reason,
      },
      "warning",
      "P5-D3-QBO-LINKAGE"
    );
    return { ok: true, idempotent: false };
  });
}

export async function listDriverMappingStatus(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const drivers = await client.query<{
      id: string;
      first_name: string;
      last_name: string;
      qbo_vendor_id: string | null;
      qbo_vendor_linked_at: string | null;
    }>(
      `
        SELECT id, first_name, last_name, qbo_vendor_id, qbo_vendor_linked_at::text
        FROM mdata.drivers
        WHERE operating_company_id = $1
          AND deactivated_at IS NULL
        ORDER BY last_name, first_name
      `,
      [operatingCompanyId]
    );
    return drivers.rows.map((row) => ({
      ...row,
      linked: Boolean(row.qbo_vendor_id),
    }));
  });
}

export async function listLinkageHistory(
  userId: string,
  operatingCompanyId: string,
  entityType?: LinkableEntityType,
  entityId?: string
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const where: string[] = ["operating_company_id = $1"];
    const values: unknown[] = [operatingCompanyId];
    if (entityType) {
      values.push(normalizeEntityType(entityType));
      where.push(`entity_type = $${values.length}`);
    }
    if (entityId) {
      values.push(entityId);
      where.push(`entity_id = $${values.length}::uuid`);
    }
    const res = await client.query(
      `
        SELECT *
        FROM integrations.qbo_vendor_linkage_events
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 500
      `,
      values
    );
    return res.rows;
  });
}

export async function createDriverWithQboVendor(userId: string, input: DriverCreateInput) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const driverRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.drivers (
          operating_company_id,
          first_name,
          last_name,
          phone,
          email,
          status,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,'Active',$6,$6)
        RETURNING id
      `,
      [input.operatingCompanyId, input.firstName, input.lastName, input.phone, input.email ?? null, userId]
    );
    const driverId = String(driverRes.rows[0]?.id ?? "");
    if (!driverId) throw new Error("driver_create_failed");

    const vendorResult = await createQboVendor(input.operatingCompanyId, input.qboVendorName);
    if (!vendorResult.ok) {
      await appendLinkageEvent(client, input.operatingCompanyId, {
        entityType: "driver",
        entityId: driverId,
        action: "auto_suggested",
        reason: `outbox_retry_required:${vendorResult.error}`,
        userId,
      });
      throw new Error(vendorResult.error);
    }
    const qboVendorId = String(((vendorResult.value?.Vendor as { Id?: string } | undefined)?.Id ?? ""));
    if (!qboVendorId) throw new Error("qbo_vendor_create_missing_id");

    await client.query(
      `
        UPDATE mdata.drivers
        SET qbo_vendor_id = $2,
            qbo_vendor_linked_at = now(),
            qbo_vendor_linked_by_user_id = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [driverId, qboVendorId, userId]
    );
    await appendLinkageEvent(client, input.operatingCompanyId, {
      entityType: "driver",
      entityId: driverId,
      qboVendorId,
      action: "linked",
      reason: "driver_created_with_qbo_vendor",
      userId,
    });
    await appendCrudAudit(
      client,
      userId,
      "driver.qbo_vendor.linked",
      {
        resource_type: "mdata.drivers",
        resource_id: driverId,
        operating_company_id: input.operatingCompanyId,
        qbo_vendor_id: qboVendorId,
      },
      "info",
      "P5-D3-QBO-LINKAGE"
    );
    return { driver_id: driverId, qbo_vendor_id: qboVendorId };
  });
}

export async function createUnitWithQboClass(userId: string, input: UnitCreateInput & { operatingCompanyId: string }) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const unitRes = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.units (
          unit_number,
          vin,
          status,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES ($1,$2,'InService',$3,$3)
        RETURNING id
      `,
      [input.unitNumber, input.vin, userId]
    );
    const unitId = String(unitRes.rows[0]?.id ?? "");
    if (!unitId) throw new Error("unit_create_failed");

    const classResult = await createQboClass(input.operatingCompanyId, input.qboClassName);
    if (!classResult.ok) {
      await appendLinkageEvent(client, input.operatingCompanyId, {
        entityType: "unit",
        entityId: unitId,
        action: "auto_suggested",
        reason: `outbox_retry_required:${classResult.error}`,
        userId,
      });
      throw new Error(classResult.error);
    }
    const qboClassId = String(((classResult.value?.Class as { Id?: string } | undefined)?.Id ?? ""));
    if (!qboClassId) throw new Error("qbo_class_create_missing_id");

    await client.query(`UPDATE mdata.units SET qbo_class_id = $2, updated_at = now() WHERE id = $1`, [unitId, qboClassId]);
    await appendLinkageEvent(client, input.operatingCompanyId, {
      entityType: "unit",
      entityId: unitId,
      qboClassId,
      action: "linked",
      reason: "unit_created_with_qbo_class",
      userId,
    });
    await appendCrudAudit(
      client,
      userId,
      "asset.qbo_class.linked",
      {
        resource_type: "mdata.units",
        resource_id: unitId,
        operating_company_id: input.operatingCompanyId,
        qbo_class_id: qboClassId,
      },
      "info",
      "P5-D3-QBO-LINKAGE"
    );
    return { unit_id: unitId, qbo_class_id: qboClassId };
  });
}

export async function linkExistingDriverToQboVendor(
  userId: string,
  input: {
    operatingCompanyId: string;
    driverId: string;
    qboVendorId: string;
    reason: string;
    force?: boolean;
  }
) {
  return linkVendor(userId, {
    operatingCompanyId: input.operatingCompanyId,
    entityType: "driver",
    entityId: input.driverId,
    qboVendorId: input.qboVendorId,
    reason: input.reason,
    force: input.force,
  });
}

export async function linkExistingUnitToQboClass(
  userId: string,
  input: {
    operatingCompanyId: string;
    unitId: string;
    qboClassId: string;
    reason: string;
    force?: boolean;
  }
) {
  return linkClass(userId, {
    operatingCompanyId: input.operatingCompanyId,
    entityType: "unit",
    entityId: input.unitId,
    qboClassId: input.qboClassId,
    reason: input.reason,
    force: input.force,
  });
}
