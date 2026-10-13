// ACCT-F4431381 (Lead 443.137 item 9e, part 2) — QuickBooks is a READ-ONLY ARCHIVE.
//
// This service READS the QuickBooks vendor snapshot (qbo_archive.entities_snapshot) and the linkage
// event history. It used to also WRITE native master tables from QuickBooks: it INSERTed mdata.drivers /
// mdata.units (createDriverWithQboVendor / createUnitWithQboClass) and UPDATEd qbo_vendor_id /
// qbo_class_id on mdata.drivers / mdata.units / mdata.equipment (link/unlink). No mdata.qbo_* link table
// exists to move that link into, so every one of those writers now REFUSES BY NAME
// (QBO_NATIVE_WRITE_REFUSED) with its SQL removed; the routes answer 409 with that code.
// Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs (R1 scope + R3 refusal sites).
import { withCurrentUser } from "../../auth/db.js";
import { QBO_WRITE_DISABLED_CODE } from "./qbo-write-disabled.js";
import { refuseQboNativeWrite } from "../../qbo-sync/qbo-native-write-refused.js";

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

function nativeTableFor(entityType: LinkableEntityType): string {
  const t = normalizeEntityType(entityType);
  return t === "driver" ? "mdata.drivers" : t === "unit" ? "mdata.units" : "mdata.equipment";
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


// QBO-WRITE-KILL — reconcile-only architecture lock. This helper POSTed a new Vendor / Class INTO
// QuickBooks (createQboVendor / createQboClass). Under the parallel-books, reconcile-only architecture
// TMS never writes to QBO, so the outbound write is permanently removed — the caller receives a graceful
// disabled result (ZERO HTTP) instead of creating a QBO object. Vendor/class LINKAGE (reading the QBO
// snapshot + linking an existing QBO id to a TMS row) is unaffected. Enforced by
// scripts/verify-no-qbo-write-path.mjs.
async function qboPostEntity(
  operatingCompanyId: string,
  path: string,
  payload: Record<string, unknown>
): Promise<RetryableResult<Record<string, unknown>>> {
  void operatingCompanyId;
  void payload;
  return { ok: false, error: `${QBO_WRITE_DISABLED_CODE}:${path}` };
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
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
          WHERE es.operating_company_id = $1::uuid
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
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    let source = "";
    if (normalizedType === "driver") {
      const row = await client.query<{ first_name: string; last_name: string }>(
        `SELECT first_name, last_name FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [entityId, operatingCompanyId]
      );
      source = `${row.rows[0]?.first_name ?? ""} ${row.rows[0]?.last_name ?? ""}`.trim();
    } else if (normalizedType === "unit") {
      const row = await client.query<{ unit_number: string; make: string | null; model: string | null }>(
        `SELECT unit_number, make, model FROM mdata.units WHERE id = $1 AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid LIMIT 1`,
        [entityId, operatingCompanyId]
      );
      source = `${row.rows[0]?.unit_number ?? ""} ${row.rows[0]?.make ?? ""} ${row.rows[0]?.model ?? ""}`.trim();
    } else {
      const row = await client.query<{ equipment_number: string; equipment_type: string }>(
        `SELECT equipment_number, equipment_type FROM mdata.equipment WHERE id = $1 AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid LIMIT 1`,
        [entityId, operatingCompanyId]
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
): Promise<{ ok: true; idempotent: boolean }> {
  void userId;
  return refuseQboNativeWrite(
    "integrations/qbo/qbo-vendor-linkage#linkVendor",
    [nativeTableFor(input.entityType)],
    input.operatingCompanyId
  );
}

export async function unlinkVendor(
  userId: string,
  input: {
    operatingCompanyId: string;
    entityType: LinkableEntityType;
    entityId: string;
    reason: string;
  }
): Promise<{ ok: true; idempotent: boolean }> {
  void userId;
  return refuseQboNativeWrite(
    "integrations/qbo/qbo-vendor-linkage#unlinkVendor",
    [nativeTableFor(input.entityType)],
    input.operatingCompanyId
  );
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
): Promise<{ ok: true; idempotent: boolean }> {
  void userId;
  return refuseQboNativeWrite(
    "integrations/qbo/qbo-vendor-linkage#linkClass",
    [input.entityType === "unit" ? "mdata.units" : "mdata.equipment"],
    input.operatingCompanyId
  );
}

export async function unlinkClass(
  userId: string,
  input: {
    operatingCompanyId: string;
    entityType: QboClassEntityType;
    entityId: string;
    reason: string;
  }
): Promise<{ ok: true; idempotent: boolean }> {
  void userId;
  return refuseQboNativeWrite(
    "integrations/qbo/qbo-vendor-linkage#unlinkClass",
    [input.entityType === "unit" ? "mdata.units" : "mdata.equipment"],
    input.operatingCompanyId
  );
}

export async function listDriverMappingStatus(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
        WHERE operating_company_id = $1::uuid
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
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const where: string[] = ["operating_company_id = $1::uuid"];
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

export async function createDriverWithQboVendor(
  userId: string,
  input: DriverCreateInput
): Promise<{ driver_id: string; qbo_vendor_id: string | null }> {
  void userId;
  // Drivers are created through the canonical driver create path (createDriverCanonical), which also
  // mints the driver's A/P payee. A QuickBooks vendor never creates a native driver.
  return refuseQboNativeWrite(
    "integrations/qbo/qbo-vendor-linkage#createDriverWithQboVendor",
    ["mdata.drivers"],
    input.operatingCompanyId
  );
}

export async function createUnitWithQboClass(
  userId: string,
  input: UnitCreateInput & { operatingCompanyId: string }
): Promise<{ unit_id: string; qbo_class_id: string }> {
  void userId;
  // Units are created through the canonical unit create path (mdata/units.routes.ts), which also mints
  // the unit's asset row. A QuickBooks class never creates a native unit.
  return refuseQboNativeWrite(
    "integrations/qbo/qbo-vendor-linkage#createUnitWithQboClass",
    ["mdata.units"],
    input.operatingCompanyId
  );
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
