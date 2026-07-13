import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";

// Owner-editable payment-method CATALOG (catalogs.payment_methods, migration 202607380000). The list of
// methods a company can pay by (ACH/Wire/Check/Cash/…), each pinned to the cash/bank GL account it draws
// from. Master data only — NO GL/posting, NO money movement. DISTINCT from the per-driver method table
// (which FKs into this catalog). void-not-delete (is_active + voided_at).

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type PaymentMethod = {
  id: string;
  operating_company_id: string;
  name: string;
  gl_account_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// The canonical 0152 table is code-keyed (UNIQUE(operating_company_id, code)) with a display_name. The API
// contract keeps a friendly `name` field → it maps to display_name; `code` is a deterministic, collision-safe
// derivation kept internal (two distinct names can never collapse to one code — see deriveUniqueCode).
const SELECT_COLS = `
  id,
  operating_company_id::text AS operating_company_id,
  display_name AS name,
  gl_account_id::text AS gl_account_id,
  is_active,
  sort_order,
  created_at::text AS created_at,
  updated_at::text AS updated_at
`;

/** Deterministic base code from a display name (uppercase, non-alphanumerics → underscore). */
function baseCode(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "METHOD";
}

/** Pick a code unique within the entity so two DIFFERENT display names can NEVER collapse to one code
 *  (lock #2). The DB UNIQUE(operating_company_id, code) is the hard guarantee; this avoids the collision. */
async function deriveUniqueCode(client: QueryableClient, operatingCompanyId: string, name: string): Promise<string> {
  const base = baseCode(name);
  const { rows } = await client.query<{ code: string }>(
    `SELECT code FROM catalogs.payment_methods WHERE operating_company_id = $1 AND (code = $2 OR code LIKE $3)`,
    [operatingCompanyId, base, `${base}\\_%`]
  );
  const taken = new Set(rows.map((r) => r.code));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

async function setScope(client: QueryableClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
}

/** List the catalog for an entity. Active-only by default (void-not-delete → voided rows excluded). */
export async function listPaymentMethods(
  userId: string,
  operatingCompanyId: string,
  opts: { includeInactive?: boolean } = {}
): Promise<PaymentMethod[]> {
  return withCurrentUser(userId, async (client) => {
    await setScope(client, operatingCompanyId);
    const where = opts.includeInactive
      ? `operating_company_id = $1`
      : `operating_company_id = $1 AND is_active AND voided_at IS NULL`;
    const { rows } = await client.query<PaymentMethod>(
      `SELECT ${SELECT_COLS} FROM catalogs.payment_methods WHERE ${where} ORDER BY sort_order ASC, lower(display_name) ASC`,
      [operatingCompanyId]
    );
    return rows;
  });
}

/** Create a catalog method (Owner/Admin). Inline "+ Add new method" uses this. Case-insensitive unique name. */
export async function createPaymentMethod(
  userId: string,
  operatingCompanyId: string,
  input: { name: string; gl_account_id?: string | null; sort_order?: number }
): Promise<PaymentMethod> {
  return withCurrentUser(userId, async (client) => {
    await setScope(client, operatingCompanyId);
    const displayName = input.name.trim();
    const code = await deriveUniqueCode(client, operatingCompanyId, displayName);
    const { rows } = await client.query<PaymentMethod>(
      `INSERT INTO catalogs.payment_methods
         (operating_company_id, code, display_name, gl_account_id, sort_order, created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0), $6, $6)
       RETURNING ${SELECT_COLS}`,
      [operatingCompanyId, code, displayName, input.gl_account_id ?? null, input.sort_order ?? null, userId]
    );
    const created = rows[0]!;
    await appendCrudAudit(
      client,
      userId,
      "catalogs.payment_method.created",
      { resource_type: "catalogs.payment_methods", resource_id: created.id, operating_company_id: operatingCompanyId, name: created.name },
      "info",
      "SETTLE-PAYRUN-CATALOG"
    );
    return created;
  });
}

/** Edit a catalog method (name / gl_account_id / sort_order / is_active). Owner/Admin. */
export async function updatePaymentMethod(
  userId: string,
  operatingCompanyId: string,
  id: string,
  patch: { name?: string; gl_account_id?: string | null; sort_order?: number; is_active?: boolean }
): Promise<PaymentMethod | null> {
  return withCurrentUser(userId, async (client) => {
    await setScope(client, operatingCompanyId);
    const { rows } = await client.query<PaymentMethod>(
      `UPDATE catalogs.payment_methods
          SET display_name  = COALESCE($3, display_name),
              gl_account_id  = COALESCE($4, gl_account_id),
              sort_order     = COALESCE($5, sort_order),
              is_active      = COALESCE($6, is_active),
              updated_by_user_id = $7
        WHERE id = $1 AND operating_company_id = $2 AND voided_at IS NULL
        RETURNING ${SELECT_COLS}`,
      [id, operatingCompanyId, patch.name?.trim() ?? null, patch.gl_account_id ?? null, patch.sort_order ?? null, patch.is_active ?? null, userId]
    );
    const updated = rows[0] ?? null;
    if (updated) {
      await appendCrudAudit(
        client,
        userId,
        "catalogs.payment_method.updated",
        { resource_type: "catalogs.payment_methods", resource_id: id, operating_company_id: operatingCompanyId },
        "info",
        "SETTLE-PAYRUN-CATALOG"
      );
    }
    return updated;
  });
}

/** Void a catalog method (void-not-delete). Owner/Admin. Reason required. */
export async function voidPaymentMethod(
  userId: string,
  operatingCompanyId: string,
  id: string,
  reason: string
): Promise<PaymentMethod | null> {
  return withCurrentUser(userId, async (client) => {
    await setScope(client, operatingCompanyId);
    const { rows } = await client.query<PaymentMethod>(
      `UPDATE catalogs.payment_methods
          SET is_active = false, voided_at = now(), voided_by_user_id = $4, void_reason = $5, updated_by_user_id = $4
        WHERE id = $1 AND operating_company_id = $2 AND voided_at IS NULL
        RETURNING ${SELECT_COLS}`,
      [id, operatingCompanyId, null, userId, reason]
    );
    const voided = rows[0] ?? null;
    if (voided) {
      await appendCrudAudit(
        client,
        userId,
        "catalogs.payment_method.voided",
        { resource_type: "catalogs.payment_methods", resource_id: id, operating_company_id: operatingCompanyId, reason },
        "warning",
        "SETTLE-PAYRUN-CATALOG"
      );
    }
    return voided;
  });
}
