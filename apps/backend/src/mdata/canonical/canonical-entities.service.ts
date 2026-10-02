/**
 * ROUND 326 items 1-2 — the canonical-entity engine for CUSTOMERS and VENDORS: one record per real party.
 *
 *   key        upper(regexp_replace(name,'[^A-Za-z0-9]','','g')) within ONE operating company (entities keep their
 *              own lists by design -- a TRANSPORTATION customer is never merged into a USMCA one);
 *   survivor   most referencing rows, then active, then most filled-in columns, then oldest;
 *   targets    EVERY column with a live FK to the entity's id (pg_constraint, re-read at run time, never a hand
 *              list) plus the verified loose (non-FK) columns from vendor-customer-merge.service.ts;
 *   merge      repoint every reference -> write the alias (old name, snapshot of the row, exact repoint log) ->
 *              DELETE the duplicate (owner law 2026-10-02: no cancelled shells) -> audit row;
 *   reverse    recreate the row from the snapshot (same id) and move exactly the logged rows back.
 * A reference that would collide with a unique key the survivor already holds (derived rows) is snapshotted into
 * the log and removed, so the merge never fails half-way and reversal can restore it.
 */
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { CUSTOMER_LOOSE_REPOINT_COLUMNS, VENDOR_LOOSE_REPOINT_COLUMNS } from "../vendor-customer-merge.service.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };
export type CanonicalKind = "customer" | "vendor";

const CFG = {
  customer: { table: "mdata.customers", regclass: "mdata.customers", name: "customer_name", aliasTable: "mdata.customer_aliases", canonicalCol: "canonical_customer_id", mergedCol: "merged_customer_id", loose: CUSTOMER_LOOSE_REPOINT_COLUMNS },
  vendor: { table: "mdata.vendors", regclass: "mdata.vendors", name: "vendor_name", aliasTable: "mdata.vendor_aliases", canonicalCol: "canonical_vendor_id", mergedCol: "merged_vendor_id", loose: VENDOR_LOOSE_REPOINT_COLUMNS },
} as const;

export const normalizedKeySql = (col: string) => `upper(regexp_replace(${col}, '[^A-Za-z0-9]', '', 'g'))`;

/**
 * Named OWNER exceptions: names that do not normalize equal but the owner ruled are ONE real party. Each maps a
 * normalized key onto the group key it joins. Never a looser normalizer -- only pairs the owner named.
 */
export const OWNER_SAME_PARTY_EXCEPTIONS: Record<CanonicalKind, Array<{ key: string; joins: string; ruling: string }>> = {
  customer: [],
  vendor: [
    // docs/bus/00-OWNER-DECISION-2026-10-02-LOVES-IS-ONE-VENDOR.md -- owner: "YES THEY ARE."
    { key: "LOVESTRAVELSTOPS", joins: "LOVES", ruling: "00-OWNER-DECISION-2026-10-02-LOVES-IS-ONE-VENDOR" },
  ],
};

/** The grouping key: the normalized name, with the owner's named exceptions folded onto the key they join. */
export const groupKeySql = (kind: CanonicalKind, col: string) => {
  const ex = OWNER_SAME_PARTY_EXCEPTIONS[kind];
  const norm = normalizedKeySql(col);
  if (!ex.length) return norm;
  return `CASE ${norm} ${ex.map((e) => `WHEN '${e.key.replace(/'/g, "''")}' THEN '${e.joins.replace(/'/g, "''")}'`).join(" ")} ELSE ${norm} END`;
};

export type RepointTarget = { table: string; column: string; pk: string[]; isUuid: boolean };
export type RepointLogEntry = { table: string; column: string; keys: Record<string, unknown>[]; removed_on_conflict: Record<string, unknown>[] };

/** Targets are read once per connection + kind (the catalog cannot change inside one merge run). */
const targetCache = new WeakMap<object, Map<CanonicalKind, Promise<RepointTarget[]>>>();

/** Every column that references the entity id: live FKs + the verified loose columns; with each table's PK. */
export function repointTargets(client: Db, kind: CanonicalKind): Promise<RepointTarget[]> {
  let byKind = targetCache.get(client);
  if (!byKind) targetCache.set(client, (byKind = new Map()));
  let hit = byKind.get(kind);
  if (!hit) {
    hit = readRepointTargets(client, kind);
    hit.catch(() => byKind!.delete(kind));
    byKind.set(kind, hit);
  }
  return hit;
}

async function readRepointTargets(client: Db, kind: CanonicalKind): Promise<RepointTarget[]> {
  const cfg = CFG[kind];
  const fk = await client.query<{ t: string; c: string }>(
    `SELECT DISTINCT n.nspname || '.' || cl.relname AS t, a.attname AS c
       FROM pg_constraint k JOIN pg_class cl ON cl.oid = k.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
       CROSS JOIN LATERAL unnest(k.conkey, k.confkey) AS u(ck, fk)
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.ck
       JOIN pg_attribute fa ON fa.attrelid = k.confrelid AND fa.attnum = u.fk
      WHERE k.contype = 'f' AND k.confrelid = $1::regclass AND fa.attname = 'id' AND cl.relkind = 'r'`,
    [cfg.regclass]
  );
  // Loose (non-FK) id columns, discovered by name at run time (customer_id / customer_uuid / *_vendor_id ...):
  // a hand list went stale (bills.vendor_id, bill_payments.vendor_id, lease_contract.lessor_vendor_id ... were
  // missing). Only rows whose value EQUALS the duplicate's uuid move, so a name match can never touch another
  // entity. QBO mirror tables (qbo_*) are never written; the alias table is the engine's own.
  const loose = await client.query<{ t: string; c: string }>(
    `SELECT c.table_schema || '.' || c.table_name AS t, c.column_name AS c
       FROM information_schema.columns c
       JOIN pg_class cl ON cl.relname = c.table_name
       JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = c.table_schema
      WHERE cl.relkind = 'r' AND c.data_type IN ('uuid', 'text', 'character varying')
        AND c.column_name ~ $1 AND c.column_name !~ 'qbo' AND c.table_name !~ '^qbo_'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema', 'audit')
        AND c.table_schema || '.' || c.table_name <> $2`,
    [kind === "customer" ? "(^|_)customer_(id|uuid)$" : "(^|_)vendor_(id|uuid)$", cfg.aliasTable]
  );
  const all = new Map<string, { table: string; column: string }>();
  for (const r of fk.rows) all.set(`${r.t}.${r.c}`, { table: r.t, column: r.c });
  for (const r of loose.rows) all.set(`${r.t}.${r.c}`, { table: r.t, column: r.c });
  for (const l of cfg.loose) all.set(`${l.table}.${l.column}`, l);
  const out: RepointTarget[] = [];
  for (const t of all.values()) {
    const col = await client.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns WHERE table_schema || '.' || table_name = $1 AND column_name = $2`,
      [t.table, t.column]
    );
    if (!col.rows[0]) continue;
    const pk = await client.query<{ a: string }>(
      `SELECT a.attname AS a FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary ORDER BY a.attnum`,
      [t.table]
    );
    out.push({ ...t, pk: pk.rows.map((r) => r.a), isUuid: col.rows[0].data_type === "uuid" });
  }
  return out.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

/** Native-type equality so the column's index is used (a ::text cast forces a full scan per target). */
const matchSql = (t: RepointTarget, param: string) => (t.isUuid ? `${q(t.column)} = ${param}::uuid` : `${q(t.column)} = ${param}`);

const q = (ident: string) => ident.split(".").map((p) => `"${p.replace(/"/g, '""')}"`).join(".");

export type CanonicalMember = { id: string; name: string; refs: number; active: boolean; filled: number; created_at: string };
export type CanonicalGroup = { key: string; survivor: CanonicalMember; duplicates: CanonicalMember[] };

/** Duplicate groups (same normalized name, same company) with the survivor chosen. Read-only. */
export async function planCanonical(client: Db, oc: string, kind: CanonicalKind): Promise<{ groups: CanonicalGroup[]; targets: number }> {
  const cfg = CFG[kind];
  const targets = await repointTargets(client, kind);
  const members = await client.query<{ key: string; id: string; name: string; active: boolean; filled: number; created_at: string }>(
    `WITH k AS (SELECT ${groupKeySql(kind, `e.${cfg.name}`)} AS key, e.* FROM ${q(cfg.table)} e WHERE e.operating_company_id = $1::uuid)
     SELECT k.key, k.id::text, k.${cfg.name} AS name, (k.deactivated_at IS NULL) AS active,
            (SELECT count(*)::int FROM jsonb_each(to_jsonb(k)) j WHERE j.value <> 'null'::jsonb AND j.value <> '""'::jsonb) AS filled,
            k.created_at::text
       FROM k WHERE k.key IN (SELECT key FROM k GROUP BY key HAVING count(*) > 1) AND k.key <> ''
      ORDER BY k.key, k.created_at`,
    [oc]
  );
  const refs = new Map<string, number>();
  const ids = members.rows.map((m) => m.id);
  for (const t of targets) {
    if (!ids.length) break;
    const r = await client.query<{ v: string; n: number }>(
      `SELECT ${q(t.column)}::text AS v, count(*)::int AS n FROM ${q(t.table)} WHERE ${q(t.column)}::text = ANY($1::text[]) GROUP BY 1`,
      [ids]
    );
    for (const x of r.rows) refs.set(x.v, (refs.get(x.v) ?? 0) + x.n);
  }
  const byKey = new Map<string, CanonicalMember[]>();
  for (const m of members.rows) {
    const list = byKey.get(m.key) ?? [];
    list.push({ id: m.id, name: m.name, refs: refs.get(m.id) ?? 0, active: m.active, filled: m.filled, created_at: m.created_at });
    byKey.set(m.key, list);
  }
  const groups: CanonicalGroup[] = [];
  for (const [key, list] of byKey) {
    const ranked = [...list].sort((a, b) => b.refs - a.refs || Number(b.active) - Number(a.active) || b.filled - a.filled || a.created_at.localeCompare(b.created_at));
    groups.push({ key, survivor: ranked[0]!, duplicates: ranked.slice(1) });
  }
  return { groups, targets: targets.length };
}

/** Merge one duplicate into its canonical survivor (same company, same normalized name -- refused otherwise). */
export async function mergeIntoCanonical(
  client: Db, oc: string, kind: CanonicalKind,
  input: {
    survivorId: string; duplicateId: string; actorUserId: string; authId: string | null; reason: string;
    /** Evidence the caller already verified (assertConfirmedDuplicate) for a pair whose names do not normalize equal. */
    evidence?: "identical_tax_id" | "identical_legal_name_and_registered_address" | "owner_approved_variant";
  }
) {
  const cfg = CFG[kind];
  if (input.survivorId === input.duplicateId) throw new Error("canonical_survivor_equals_duplicate");
  const rows = await client.query<{ id: string; key: string; name: string; snapshot: Record<string, unknown> }>(
    `SELECT e.id::text, ${groupKeySql(kind, `e.${cfg.name}`)} AS key, e.${cfg.name} AS name, to_jsonb(e) AS snapshot
       FROM ${q(cfg.table)} e WHERE e.id = ANY($1::uuid[]) AND e.operating_company_id = $2::uuid FOR UPDATE`,
    [[input.survivorId, input.duplicateId], oc]
  );
  const s = rows.rows.find((r) => r.id === input.survivorId);
  const d = rows.rows.find((r) => r.id === input.duplicateId);
  if (!s || !d) throw new Error("canonical_rows_not_found_in_company");
  // ROUND 297: a name VARIANT ("S E Mares ..." / "Semares ...") never normalises equal -- it merges only on the owner's
  // own approval of that exact pair (owner-only route), never on a score.
  if ((s.key !== d.key || !s.key) && input.evidence !== "identical_tax_id" && input.evidence !== "owner_approved_variant") {
    throw new Error("canonical_names_do_not_normalize_equal");
  }
  // Money is asserted IN the engine: every document of both parties lands on the survivor, to the cent.
  const before = await partyMoney(client, kind, [input.survivorId, input.duplicateId]);
  const companyBefore = await companyOpenCents(client, kind, oc);

  const log: RepointLogEntry[] = [];
  for (const t of await repointTargets(client, kind)) {
    const keyExpr = t.pk.length ? `jsonb_build_object(${t.pk.map((c) => `'${c}', ${q(c)}`).join(", ")})` : `to_jsonb(x)` /* no PK: the whole row is the key */;
    const entry: RepointLogEntry = { table: t.table, column: t.column, keys: [], removed_on_conflict: [] };
    const candidates = await client.query<{ k: Record<string, unknown>; row: Record<string, unknown> }>(
      `SELECT ${keyExpr} AS k, to_jsonb(x) AS row FROM ${q(t.table)} x WHERE ${matchSql(t, "$1")}`, [input.duplicateId]
    );
    for (const c of candidates.rows) {
      await client.query("SAVEPOINT canonical_repoint");
      try {
        await client.query(`UPDATE ${q(t.table)} x SET ${q(t.column)} = $1 WHERE ${matchSql(t, "$3")} AND to_jsonb(x) @> $2::jsonb`,
          [input.survivorId, JSON.stringify(c.k), input.duplicateId]);
        await client.query("RELEASE SAVEPOINT canonical_repoint");
        entry.keys.push(c.k);
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT canonical_repoint");
        if (String((e as { code?: string }).code) !== "23505") throw e;
        // the survivor already holds this unique key (derived row): keep the survivor's, log + remove the duplicate's
        await client.query(`DELETE FROM ${q(t.table)} x WHERE ${matchSql(t, "$2")} AND to_jsonb(x) @> $1::jsonb`, [JSON.stringify(c.k), input.duplicateId]);
        entry.removed_on_conflict.push(c.row);
      }
    }
    if (entry.keys.length || entry.removed_on_conflict.length) log.push(entry);
  }
  const alias = await client.query<{ id: string }>(
    `INSERT INTO ${q(cfg.aliasTable)} (operating_company_id, ${cfg.canonicalCol}, alias_name, alias_normalized, ${cfg.mergedCol}, snapshot, repoint_log, merged_by_user_id, auth_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::jsonb, $7::jsonb, $8::uuid, $9) RETURNING id::text`,
    [oc, input.survivorId, d.name, d.key, input.duplicateId, JSON.stringify(d.snapshot), JSON.stringify(log), input.actorUserId, input.authId]
  );
  // The delete must remove exactly the duplicate. Under the app role, RLS has no DELETE policy on master data and the
  // statement silently affects 0 rows — a merge that "succeeds" while leaving the duplicate in place. Refuse instead.
  const del = await client.query(`DELETE FROM ${q(cfg.table)} WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [input.duplicateId, oc]);
  if (del.rowCount !== 1) throw new Error(`canonical_delete_blocked: ${cfg.table} ${input.duplicateId} delete affected ${del.rowCount ?? 0} rows (RLS / role)`);
  const after = await partyMoney(client, kind, [input.survivorId]);
  const companyAfter = await companyOpenCents(client, kind, oc);
  if (after.count !== before.count || after.total !== before.total || after.open !== before.open || companyAfter !== companyBefore) {
    throw new Error(
      `canonical_money_changed: ${kind} docs ${before.count}->${after.count}, total ${before.total}->${after.total}c, ` +
        `open ${before.open}->${after.open}c, company open ${companyBefore}->${companyAfter}c`
    );
  }
  const moved = log.reduce((n, e) => n + e.keys.length, 0);
  await appendCrudAudit(client as never, input.actorUserId, `mdata.${kind}.canonical_merged`, {
    resource_type: cfg.table, resource_id: input.duplicateId, operating_company_id: oc, survivor_id: input.survivorId,
    alias_id: alias.rows[0]!.id, alias_name: d.name, rows_repointed: moved, auth_id: input.authId, reason: input.reason, evidence: input.evidence ?? "normalized_name",
    money_unchanged: { docs: after.count, total_cents: after.total, open_cents: after.open, company_open_cents: companyAfter },
  }, "info", "ROUND-326-CANONICAL");
  return { alias_id: alias.rows[0]!.id, survivor_id: input.survivorId, duplicate_id: input.duplicateId, rows_repointed: moved, tables: log.length };
}

/** Undo one merge exactly: recreate the deleted row (same id) and move every logged row back. */
export async function reverseCanonicalMerge(client: Db, oc: string, kind: CanonicalKind, aliasId: string, actorUserId: string) {
  const cfg = CFG[kind];
  const a = (await client.query<{ merged: string; canonical: string; snapshot: Record<string, unknown>; log: RepointLogEntry[] }>(
    `SELECT ${cfg.mergedCol}::text AS merged, ${cfg.canonicalCol}::text AS canonical, snapshot, repoint_log AS log
       FROM ${q(cfg.aliasTable)} WHERE id = $1::uuid AND operating_company_id = $2::uuid AND reversed_at IS NULL FOR UPDATE`,
    [aliasId, oc]
  )).rows[0];
  if (!a) throw new Error("canonical_alias_not_found_or_reversed");
  await client.query(`INSERT INTO ${q(cfg.table)} SELECT * FROM jsonb_populate_record(NULL::${cfg.table}, $1::jsonb)`, [JSON.stringify(a.snapshot)]);
  let restored = 0;
  for (const e of a.log) {
    for (const k of e.keys) {
      const r = await client.query(`UPDATE ${q(e.table)} x SET ${q(e.column)} = $1 WHERE to_jsonb(x) @> $2::jsonb`, [a.merged, JSON.stringify(k)]);
      restored += r.rowCount ?? 0;
    }
    for (const row of e.removed_on_conflict) {
      await client.query(`INSERT INTO ${q(e.table)} SELECT * FROM jsonb_populate_record(NULL::${e.table}, $1::jsonb)`, [JSON.stringify(row)]);
      restored += 1;
    }
  }
  await client.query(`UPDATE ${q(cfg.aliasTable)} SET reversed_at = now(), reversed_by_user_id = $2::uuid WHERE id = $1::uuid`, [aliasId, actorUserId]);
  await appendCrudAudit(client as never, actorUserId, `mdata.${kind}.canonical_merge_reversed`, {
    resource_type: cfg.table, resource_id: a.merged, operating_company_id: oc, alias_id: aliasId, rows_restored: restored,
  }, "warning", "ROUND-326-CANONICAL");
  return { restored_id: a.merged, rows_restored: restored };
}

/** Documents of a party set: invoices (customer) / bills (vendor) -- count, total and open, to the cent. */
async function partyMoney(client: Db, kind: CanonicalKind, ids: string[]): Promise<{ count: number; total: number; open: number }> {
  const r = kind === "customer"
    ? await client.query<{ n: string; t: string; o: string }>(
        `SELECT count(*)::text AS n, COALESCE(sum(total_cents), 0)::text AS t, COALESCE(sum(amount_open_cents), 0)::text AS o
           FROM accounting.invoices WHERE customer_id::text = ANY($1::text[]) AND voided_at IS NULL`, [ids])
    : await client.query<{ n: string; t: string; o: string }>(
        `SELECT count(*)::text AS n, COALESCE(sum(amount_cents), 0)::text AS t,
                COALESCE(sum(amount_cents - COALESCE(paid_cents, 0)) FILTER (WHERE status <> 'void'), 0)::text AS o
           FROM accounting.bills
          WHERE (vendor_uuid = ANY($1::text[]) OR mdata_vendor_id::text = ANY($1::text[]) OR vendor_id = ANY($1::text[]))
            AND voided_at IS NULL AND revoked_at IS NULL`, [ids]);
  const row = r.rows[0];
  return { count: Number(row?.n ?? 0), total: Number(row?.t ?? 0), open: Number(row?.o ?? 0) };
}

/** The company's whole open A/R (customers) or A/P (vendors) -- a merge may never move it. */
async function companyOpenCents(client: Db, kind: CanonicalKind, oc: string): Promise<number> {
  const r = kind === "customer"
    ? await client.query<{ c: string }>(`SELECT COALESCE(sum(amount_open_cents), 0)::text AS c FROM accounting.invoices WHERE operating_company_id = $1::uuid AND voided_at IS NULL`, [oc])
    : await client.query<{ c: string }>(`SELECT COALESCE(sum(amount_cents - COALESCE(paid_cents, 0)), 0)::text AS c FROM accounting.bills
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND revoked_at IS NULL AND status <> 'void'`, [oc]);
  return Number(r.rows[0]?.c ?? 0);
}

/** Money proof for a merge set: open AR (customers) / open AP (vendors) summed over the ids, to the cent. */
export async function openBalanceCents(client: Db, kind: CanonicalKind, ids: string[]): Promise<number> {
  const r = kind === "customer"
    ? await client.query<{ c: string }>(`SELECT COALESCE(sum(amount_open_cents), 0)::text AS c FROM accounting.invoices WHERE customer_id::text = ANY($1::text[]) AND voided_at IS NULL`, [ids])
    : await client.query<{ c: string }>(`SELECT COALESCE(sum(amount_cents - COALESCE(paid_cents, 0)), 0)::text AS c FROM accounting.bills
        WHERE (vendor_uuid = ANY($1::text[]) OR mdata_vendor_id::text = ANY($1::text[]) OR vendor_id = ANY($1::text[]))
          AND voided_at IS NULL AND status <> 'void'`, [ids]);
  return Number(r.rows[0]?.c ?? 0);
}
