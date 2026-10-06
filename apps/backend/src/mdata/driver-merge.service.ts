// DRIVER MERGE ENGINE (owner 2026-10-06): "what we do need to merge are the drivers that have multiple profiles in the
// app. Only one driver-vendor profile, can have many Samsara usernames and accounts."
//
// ROOT CAUSE this replaces: duplicate drivers were merged by one-shot ops scripts with a HAND-WRITTEN list of tables
// (scripts/ops/2026-09-28-cc1-round148-merge-driver-v5.ts: ~70 columns). Measured 2026-10-06: 198 columns reference a
// driver (foreign keys + *_driver_id / *_driver_uuid columns), plus polymorphic links (documents, escrow accounts,
// contracts). Anything off the list stayed on the merged-away record — ANGEL ALFONSO SOSA's 10 documents did.
//
// THE ENGINE (one transaction, run by a person in the app, never by a script):
//   1. DISCOVER every driver reference from the catalog (pg_constraint FKs to mdata.drivers + uuid columns named
//      *_driver_id / *_driver_uuid), then the polymorphic ones (docs.file_links 'driver', escrow accounts,
//      legal contract signer / links). No hand list to go stale.
//   2. GUARDS: same company; neither side already merged; the survivor holds at least as many loads as the merged
//      record unless a written reason is given (merge-driver-v4 reversed survivor/loser on 3 of 4 pairs); both sides
//      with an OPEN settlement is refused.
//   3. ESCROW through the ledger: a merged record's escrow balance moves by a balanced journal entry (Dr its escrow
//      sub-account / Cr the survivor's) with release + deposit escrow postings; its account closes. If the survivor
//      has no escrow account, the account itself passes to the survivor (no money moves).
//   4. REPOINT every reference to the survivor. A 1:1 per-driver row the survivor already has (a config mapping) is
//      kept on the survivor and the merged record's copy is left as superseded — reported, never forced.
//   5. The merged record: merged_into_driver_id -> survivor, Inactive, locked manual_deactivate. Nothing deleted.
//      Samsara accounts follow the driver (one driver, many Samsara users); Samsara itself is never written.
//   6. PROVE: zero references to the merged record remain (except the superseded 1:1 rows); otherwise the whole
//      transaction is refused.
type Db = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export type DriverRef = { table: string; column: string };

const LOAD_SQL = `SELECT count(*)::int AS n FROM mdata.loads
  WHERE (assigned_primary_driver_id = $1::uuid OR assigned_secondary_driver_id = $1::uuid OR accepted_by_driver_id = $1::uuid)
    AND soft_deleted_at IS NULL`;

/**
 * Every column that references a row of `target` (mdata.drivers / mdata.vendors), discovered from the catalog — FKs to
 * the table plus uuid columns following the naming convention — never a hand list.
 */
export async function discoverReferences(client: Db, target: "mdata.drivers" | "mdata.vendors"): Promise<DriverRef[]> {
  const nameRe = target === "mdata.drivers" ? "driver_(id|uuid)$" : "vendor_(id|uuid)$";
  const r = await client.query(
    `SELECT DISTINCT tbl, col FROM (
       SELECT n.nspname || '.' || c.relname AS tbl, a.attname AS col
         FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid AND c.relkind = 'r'
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
        WHERE k.contype = 'f' AND k.confrelid = $1::text::regclass AND array_length(k.conkey, 1) = 1
       UNION
       SELECT c.table_schema || '.' || c.table_name, c.column_name
         FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.data_type = 'uuid' AND c.column_name ~ $2
     ) x
     WHERE tbl NOT LIKE 'audit.%' AND tbl NOT LIKE 'archive.%' AND tbl NOT LIKE 'pg_%' AND tbl <> $1::text
     ORDER BY 1, 2`,
    [target, nameRe]
  );
  return r.rows.map((x) => ({ table: String(x.tbl), column: String(x.col) }));
}
/** Back-compat name used by the guard and tests. */
export const discoverDriverReferences = (client: Db) => discoverReferences(client, "mdata.drivers");

export type RepointOutcome = { ref: string; rows: number; status: "moved" | "kept_on_survivor" | "history_kept"; reason?: string };

/**
 * Repoint every reference of `from` to `to`, MEASURED per column inside a savepoint:
 *   moved            — the rows now point at the survivor
 *   kept_on_survivor — unique conflict: the survivor already has its own 1:1 row; the merged copy stays, superseded
 *   history_kept     — the database refused (no UPDATE privilege, or an immutability trigger: HOS ledger, posted
 *                      settlements, closed periods …). Immutable records are never rewritten; they resolve to the
 *                      survivor through merged_into. The reason is the database's own message.
 * Any other error refuses the whole merge. dryRun rolls every attempt back (the preview shows exactly what will happen).
 */
export async function repointAll(
  client: Db,
  target: "mdata.drivers" | "mdata.vendors",
  from: string,
  to: string,
  opts: { dryRun: boolean }
): Promise<RepointOutcome[]> {
  const out: RepointOutcome[] = [];
  for (const r of await discoverReferences(client, target)) {
    const ref = `${r.table}.${r.column}`;
    const has = Number((await client.query(`SELECT count(*)::int AS n FROM ${qi(r.table)} WHERE ${qi(r.column)} = $1::uuid`, [from])).rows[0]?.n ?? 0);
    if (has === 0) continue;
    await client.query("SAVEPOINT merge_ref");
    try {
      const res = await client.query(`UPDATE ${qi(r.table)} SET ${qi(r.column)} = $2::uuid WHERE ${qi(r.column)} = $1::uuid`, [from, to]);
      await client.query(opts.dryRun ? "ROLLBACK TO SAVEPOINT merge_ref" : "RELEASE SAVEPOINT merge_ref");
      out.push({ ref, rows: res.rowCount ?? has, status: "moved" });
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT merge_ref");
      const code = String((e as { code?: string }).code ?? "");
      const msg = String((e as Error).message ?? "");
      if (code === "23505") out.push({ ref, rows: has, status: "kept_on_survivor", reason: "the survivor already has its own row" });
      else if (code === "42501" || code === "P0001" || code === "55000" || /immutable|append.?only|not allowed|cannot (update|modify)|block|locked|closed period|worm/i.test(msg))
        out.push({ ref, rows: has, status: "history_kept", reason: msg.slice(0, 200) });
      else throw Object.assign(new Error("driver_merge_repoint_refused"), { details: [`${ref}: ${msg}`] });
    }
  }
  return out;
}

const qi = (ident: string) => ident.split(".").map((p) => `"${p.replace(/"/g, '""')}"`).join(".");

/** Polymorphic references (entity_type / holder_type / signer_type columns), counted alongside the discovered ones. */
const POLYMORPHIC: Array<{ key: string; count: string; repoint: string | null }> = [
  {
    key: "docs.file_links(entity_type=driver)",
    count: `SELECT count(*)::int AS n FROM docs.file_links WHERE entity_type = 'driver' AND entity_id = $1::uuid AND deleted_at IS NULL`,
    repoint: null, // handled explicitly (duplicate links)
  },
  {
    key: "legal.contract_instances.signer_entity_id(driver)",
    count: `SELECT count(*)::int AS n FROM legal.contract_instances WHERE signer_type = 'driver' AND signer_entity_id = $1::uuid`,
    repoint: `UPDATE legal.contract_instances SET signer_entity_id = $2::uuid, updated_at = now() WHERE signer_type = 'driver' AND signer_entity_id = $1::uuid`,
  },
  {
    key: "legal.contract_instance_links(drivers)",
    count: `SELECT count(*)::int AS n FROM legal.contract_instance_links WHERE target_schema = 'mdata' AND target_table = 'drivers' AND target_id = $1::uuid`,
    repoint: `UPDATE legal.contract_instance_links SET target_id = $2::uuid WHERE target_schema = 'mdata' AND target_table = 'drivers' AND target_id = $1::uuid`,
  },
  {
    key: "accounting.escrow_accounts.holder_id(driver)",
    count: `SELECT count(*)::int AS n FROM accounting.escrow_accounts WHERE holder_type = 'driver' AND holder_id = $1::uuid AND status = 'active'`,
    repoint: null, // handled by the escrow step
  },
];

async function driverRow(client: Db, companyId: string, id: string) {
  return (
    await client.query(
      `SELECT id::text, first_name, last_name, status::text AS status, merged_into_driver_id::text AS merged_into, cdl_number
         FROM mdata.drivers WHERE operating_company_id = $1::uuid AND id = $2::uuid`,
      [companyId, id]
    )
  ).rows[0] as
    | { id: string; first_name: string | null; last_name: string | null; status: string; merged_into: string | null; cdl_number: string | null }
    | undefined;
}

/** The two drivers' own driver-vendor rows (active), if any. */
async function driverVendorPlan(client: Db, companyId: string, survivorId: string, mergedId: string) {
  const v = async (id: string) =>
    (
      await client.query(
        `SELECT id::text FROM mdata.vendors WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND deactivated_at IS NULL ORDER BY created_at LIMIT 1`,
        [companyId, id]
      )
    ).rows[0]?.id as string | undefined;
  return { survivorVendorId: (await v(survivorId)) ?? null, mergedVendorId: (await v(mergedId)) ?? null };
}

export type MergePreview = {
  survivor: { id: string; name: string; status: string; loads: number };
  merged: { id: string; name: string; status: string; loads: number };
  references: Array<{ ref: string; rows: number; status?: string; reason?: string }>;
  escrow: { merged_balance_cents: number; survivor_has_account: boolean; merged_has_account: boolean };
  blockers: string[];
  needs_override_reason: boolean;
};

export async function previewDriverMerge(client: Db, args: { companyId: string; survivorId: string; mergedId: string }): Promise<MergePreview> {
  const blockers: string[] = [];
  if (args.survivorId === args.mergedId) blockers.push("A driver cannot be merged into itself.");
  const s = await driverRow(client, args.companyId, args.survivorId);
  const m = await driverRow(client, args.companyId, args.mergedId);
  if (!s || !m) throw new Error("driver_merge_driver_not_found");
  if (s.merged_into) blockers.push("The surviving profile was itself merged into another driver — merge into that one instead.");
  if (m.merged_into) blockers.push("This profile is already merged.");
  const loads = async (id: string) => Number((await client.query(LOAD_SQL, [id])).rows[0]?.n ?? 0);
  const sLoads = await loads(s.id);
  const mLoads = await loads(m.id);
  const open = async (id: string) =>
    Number(
      (
        await client.query(
          `SELECT count(*)::int AS n FROM driver_finance.driver_settlements
            WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND status = 'open' AND voided_at IS NULL`,
          [args.companyId, id]
        )
      ).rows[0]?.n ?? 0
    );
  if ((await open(s.id)) > 0 && (await open(m.id)) > 0)
    blockers.push("Both profiles have an OPEN settlement — close the merged profile's settlement first.");

  const outcomes = await repointAll(client, "mdata.drivers", m.id, s.id, { dryRun: true });
  const references: Array<{ ref: string; rows: number; status?: string; reason?: string }> = outcomes.map((o) => ({ ...o }));
  for (const p of POLYMORPHIC) {
    const n = Number((await client.query(p.count, [m.id])).rows[0]?.n ?? 0);
    if (n > 0) references.push({ ref: p.key, rows: n, status: "moved" });
  }
  const vendorPlan = await driverVendorPlan(client, args.companyId, s.id, m.id);
  if (vendorPlan.mergedVendorId && vendorPlan.survivorVendorId) {
    for (const o of await repointAll(client, "mdata.vendors", vendorPlan.mergedVendorId, vendorPlan.survivorVendorId, { dryRun: true }))
      references.push({ ...o, ref: `vendor: ${o.ref}` });
  }
  const esc = async (id: string) =>
    (
      await client.query(
        `SELECT escrow_account_id::text AS id, coa_account_id::text AS coa, account_number, balance_cents::bigint AS bal
           FROM accounting.v_escrow_account_balance
          WHERE operating_company_id = $1::uuid AND holder_type = 'driver' AND holder_id = $2::uuid AND status = 'active'`,
        [args.companyId, id]
      )
    ).rows;
  const sEsc = await esc(s.id);
  const mEsc = await esc(m.id);
  return {
    survivor: { id: s.id, name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(), status: s.status, loads: sLoads },
    merged: { id: m.id, name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(), status: m.status, loads: mLoads },
    references,
    escrow: {
      merged_balance_cents: mEsc.reduce((t, r) => t + Number(r.bal ?? 0), 0),
      survivor_has_account: sEsc.length > 0,
      merged_has_account: mEsc.length > 0,
    },
    blockers,
    needs_override_reason: sLoads < mLoads,
  };
}

export type MergeResult = {
  repointed: Array<{ ref: string; rows: number }>;
  kept_on_survivor: string[];
  history_kept: Array<{ ref: string; rows: number; reason?: string }>;
  vendor: Array<{ ref: string; rows: number; status: string }>;
  escrow_je_id: string | null;
};

export async function executeDriverMerge(
  client: Db,
  args: { companyId: string; survivorId: string; mergedId: string; actorUserId: string; actorRole: string; overrideReason?: string | null },
  deps: {
    createJournalEntryOnClient: (c: Db, input: Record<string, unknown>, actor: { userId: string; role: string }) => Promise<{ id: string }>;
    recordEscrowPostingOnly: (c: Db, input: Record<string, unknown>) => Promise<unknown>;
  }
): Promise<MergeResult> {
  const pv = await previewDriverMerge(client, args);
  if (pv.blockers.length) throw Object.assign(new Error("driver_merge_blocked"), { details: pv.blockers });
  if (pv.needs_override_reason && !(args.overrideReason && args.overrideReason.trim().length >= 15))
    throw Object.assign(new Error("driver_merge_needs_reason"), {
      details: [`The surviving profile has ${pv.survivor.loads} loads and the merged one ${pv.merged.loads}. Give the reason this direction is right (at least 15 characters).`],
    });
  const S = pv.survivor.id;
  const M = pv.merged.id;

  // 3. ESCROW through the ledger.
  let escrowJe: string | null = null;
  const escRows = async (id: string) =>
    (
      await client.query(
        `SELECT escrow_account_id::text AS id, coa_account_id::text AS coa, account_number, balance_cents::bigint AS bal
           FROM accounting.v_escrow_account_balance
          WHERE operating_company_id = $1::uuid AND holder_type = 'driver' AND holder_id = $2::uuid AND status = 'active'`,
        [args.companyId, id]
      )
    ).rows;
  const mEsc = await escRows(M);
  const sEsc = await escRows(S);
  if (mEsc.length && !sEsc.length) {
    // The survivor has no escrow account: the account (and its history) passes to the survivor. No money moves.
    await client.query(`UPDATE accounting.escrow_accounts SET holder_id = $2::uuid, updated_at = now() WHERE holder_type = 'driver' AND holder_id = $1::uuid AND status = 'active'`, [M, S]);
  } else if (mEsc.length && sEsc.length) {
    for (const acct of mEsc) {
      const bal = Number(acct.bal ?? 0);
      if (bal !== 0 && acct.coa !== sEsc[0].coa) {
        const amount = Math.abs(bal);
        const fromIsDebit = bal > 0; // a liability holding a credit balance shows positive held: Dr merged / Cr survivor
        const je = await deps.createJournalEntryOnClient(
          client,
          {
            operating_company_id: args.companyId,
            entry_date: new Date().toISOString().slice(0, 10),
            memo: `Driver merge escrow transfer: ${pv.merged.name} (${M.slice(0, 8)}) -> ${pv.survivor.name} (${S.slice(0, 8)})`,
            source: "manual",
            postings: [
              { account_id: acct.coa, debit_or_credit: fromIsDebit ? "debit" : "credit", amount_cents: amount, description: `Escrow transfer out — merged into ${pv.survivor.name}` },
              { account_id: sEsc[0].coa, debit_or_credit: fromIsDebit ? "credit" : "debit", amount_cents: amount, description: `Escrow transfer in — from merged profile ${pv.merged.name}` },
            ],
          },
          { userId: args.actorUserId, role: args.actorRole }
        );
        escrowJe = je.id;
        await deps.recordEscrowPostingOnly(client, {
          operating_company_id: args.companyId, driver_id: M, posting_type: "release", amount_cents: amount, source_type: "manual",
          source_id: S, note: `Driver merge: escrow transferred to ${pv.survivor.name}`, posted_by_user_id: args.actorUserId, linked_journal_entry_id: je.id,
        });
        await deps.recordEscrowPostingOnly(client, {
          operating_company_id: args.companyId, driver_id: S, posting_type: "deposit", amount_cents: amount, source_type: "manual",
          source_id: M, note: `Driver merge: escrow transferred from ${pv.merged.name}`, posted_by_user_id: args.actorUserId, linked_journal_entry_id: je.id,
        });
      }
      await client.query(`UPDATE accounting.escrow_accounts SET status = 'closed', updated_at = now() WHERE id = $1::uuid`, [acct.id]);
    }
  }

  // 4. THE DRIVER'S VENDOR: one person, one driver-vendor profile. The merged profile's vendor folds into the
  //    survivor's vendor (its references repointed the same measured way, then retired); a survivor with no vendor of
  //    its own takes the merged one over.
  const vplan = await driverVendorPlan(client, args.companyId, S, M);
  const vendorOutcomes: RepointOutcome[] = [];
  if (vplan.mergedVendorId && vplan.survivorVendorId) {
    vendorOutcomes.push(...(await repointAll(client, "mdata.vendors", vplan.mergedVendorId, vplan.survivorVendorId, { dryRun: false })));
    await client.query(`UPDATE mdata.vendors SET deactivated_at = COALESCE(deactivated_at, now()), updated_at = now() WHERE id = $1::uuid`, [vplan.mergedVendorId]);
  }

  // 5. REPOINT every discovered driver reference (measured; see repointAll).
  const outcomes = await repointAll(client, "mdata.drivers", M, S, { dryRun: false });
  const repointed = outcomes.filter((o) => o.status === "moved").map((o) => ({ ref: o.ref, rows: o.rows }));
  const kept = outcomes.filter((o) => o.status !== "moved").map((o) => o.ref);
  for (const p of POLYMORPHIC) {
    if (!p.repoint) continue;
    const res = await client.query(p.repoint, [M, S]);
    if ((res.rowCount ?? 0) > 0) repointed.push({ ref: p.key, rows: res.rowCount ?? 0 });
  }
  // Documents: move each link; a file already linked to the survivor keeps the survivor's link (the duplicate retires).
  const dup = await client.query(
    `UPDATE docs.file_links fl SET deleted_at = now(), deleted_by_user_id = $3::uuid
      WHERE fl.entity_type = 'driver' AND fl.entity_id = $1::uuid AND fl.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM docs.file_links s WHERE s.file_id = fl.file_id AND s.entity_type = 'driver' AND s.entity_id = $2::uuid AND s.deleted_at IS NULL)`,
    [M, S, args.actorUserId]
  );
  const moved = await client.query(
    `UPDATE docs.file_links SET entity_id = $2::uuid WHERE entity_type = 'driver' AND entity_id = $1::uuid AND deleted_at IS NULL`,
    [M, S]
  );
  if ((moved.rowCount ?? 0) + (dup.rowCount ?? 0) > 0) repointed.push({ ref: "docs.file_links(entity_type=driver)", rows: (moved.rowCount ?? 0) + (dup.rowCount ?? 0) });

  // 5. The merged record retires into the survivor. A survivor stays Active if either side was working.
  if (["Active", "Probation"].includes(pv.merged.status) && !["Active", "Probation"].includes(pv.survivor.status)) {
    await client.query(
      `UPDATE mdata.drivers SET status = 'Active'::mdata.driver_status, deactivated_at = NULL, status_locked_at = NULL, status_locked_reason = NULL, updated_at = now() WHERE id = $1::uuid`,
      [S]
    );
  }
  await client.query(
    `UPDATE mdata.drivers
        SET merged_into_driver_id = $2::uuid,
            status = CASE WHEN status = 'Terminated' THEN status ELSE 'Inactive'::mdata.driver_status END,
            deactivated_at = COALESCE(deactivated_at, now()), status_locked_at = now(), status_locked_reason = 'manual_deactivate', updated_at = now()
      WHERE id = $1::uuid`,
    [M, S]
  );

  // 6. PROVE nothing writable still points at the merged record (history kept by the database is listed, not hidden).
  const remaining: string[] = [];
  for (const r of await discoverDriverReferences(client)) {
    const key = `${r.table}.${r.column}`;
    if (kept.includes(key)) continue;
    const n = Number((await client.query(`SELECT count(*)::int AS n FROM ${qi(r.table)} WHERE ${qi(r.column)} = $1::uuid`, [M])).rows[0]?.n ?? 0);
    if (n > 0) remaining.push(`${key}: ${n}`);
  }
  for (const p of POLYMORPHIC) {
    const n = Number((await client.query(p.count, [M])).rows[0]?.n ?? 0);
    if (n > 0) remaining.push(`${p.key}: ${n}`);
  }
  if (remaining.length) throw Object.assign(new Error("driver_merge_incomplete"), { details: remaining });

  await client.query("SELECT audit.append_event($1, 'info', $2::jsonb, $3::uuid, $4)", [
    "driver_merge",
    JSON.stringify({ survivor_id: S, merged_id: M, survivor_name: pv.survivor.name, merged_name: pv.merged.name, repointed, outcomes, vendor: vendorOutcomes, escrow_je_id: escrowJe, override_reason: args.overrideReason ?? null }),
    args.actorUserId,
    "DRIVER-MERGE-ENGINE",
  ]);
  return {
    repointed,
    kept_on_survivor: outcomes.filter((o) => o.status === "kept_on_survivor").map((o) => o.ref),
    history_kept: outcomes.filter((o) => o.status === "history_kept").map((o) => ({ ref: o.ref, rows: o.rows, reason: o.reason })),
    vendor: vendorOutcomes.map((o) => ({ ref: o.ref, rows: o.rows, status: o.status })),
    escrow_je_id: escrowJe,
  };
}

/** Pairs of driver profiles that look like the same person: same normalized name, or a CDL that differs by one digit. */
export function normalizeName(first: string | null | undefined, last: string | null | undefined): string {
  return `${first ?? ""} ${last ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}
export function cdlNearMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const y = String(b ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (x.length < 6 || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) diff += 1;
  return diff <= 1 || [...x].sort().join("") === [...y].sort().join(""); // one typo, or two digits swapped
}
export function nameTokensOverlap(a: string, b: string): boolean {
  const A = new Set(a.split(" ").filter((t) => t.length > 2));
  const B = new Set(b.split(" ").filter((t) => t.length > 2));
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared >= 2 || (shared >= 1 && Math.min(A.size, B.size) === 1);
}

export async function listDuplicateDriverCandidates(client: Db, companyId: string) {
  const rows = (
    await client.query(
      `SELECT d.id::text, d.first_name, d.last_name, d.status::text AS status, d.cdl_number,
              (SELECT count(*)::int FROM mdata.loads l WHERE (l.assigned_primary_driver_id = d.id OR l.assigned_secondary_driver_id = d.id) AND l.soft_deleted_at IS NULL) AS loads
         FROM mdata.drivers d WHERE d.operating_company_id = $1::uuid AND d.merged_into_driver_id IS NULL`,
      [companyId]
    )
  ).rows as Array<{ id: string; first_name: string | null; last_name: string | null; status: string; cdl_number: string | null; loads: number }>;
  const out: Array<{ a: (typeof rows)[number]; b: (typeof rows)[number]; why: string[] }> = [];
  for (let i = 0; i < rows.length; i += 1)
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      const na = normalizeName(a.first_name, a.last_name);
      const nb = normalizeName(b.first_name, b.last_name);
      const why: string[] = [];
      if (na && na === nb) why.push("same name");
      else if (nameTokensOverlap(na, nb)) why.push("name overlaps");
      if (cdlNearMatch(a.cdl_number, b.cdl_number)) why.push("CDL matches (or differs by one character)");
      if (why.length && (why.includes("same name") || why.some((w) => w.startsWith("CDL")) )) out.push({ a, b, why });
    }
  const pairs = out.map(({ a, b, why }) => {
    // Suggested survivor: more loads; then Active over inactive; then the longer name.
    const score = (x: typeof a) => x.loads * 1000 + (["Active", "Probation"].includes(x.status) ? 100 : 0) + `${x.first_name ?? ""} ${x.last_name ?? ""}`.length;
    const [survivor, merged] = score(a) >= score(b) ? [a, b] : [b, a];
    return { survivor, merged, why };
  });
  // CLUSTERS: one person may have several profiles (CARLOS GALAVIZ had 5 pairs). Join pairs that share a profile, then
  // suggest ONE survivor per cluster (most loads, then working status, then the fuller name) and list the rest.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const byId = new Map<string, (typeof rows)[number]>();
  const reasons = new Map<string, Set<string>>();
  for (const p of pairs) {
    byId.set(p.survivor.id, p.survivor);
    byId.set(p.merged.id, p.merged);
    const ra = find(p.survivor.id);
    const rb = find(p.merged.id);
    if (ra !== rb) parent.set(rb, ra);
  }
  for (const p of pairs) {
    const root = find(p.survivor.id);
    const set = reasons.get(root) ?? new Set<string>();
    p.why.forEach((w) => set.add(w));
    reasons.set(root, set);
  }
  const clusters = new Map<string, Array<(typeof rows)[number]>>();
  for (const id of byId.keys()) {
    const root = find(id);
    clusters.set(root, [...(clusters.get(root) ?? []), byId.get(id)!]);
  }
  const score = (x: (typeof rows)[number]) => x.loads * 1000 + (["Active", "Probation"].includes(x.status) ? 100 : 0) + `${x.first_name ?? ""} ${x.last_name ?? ""}`.length;
  return Array.from(clusters.entries())
    .map(([root, members]) => {
      const sorted = [...members].sort((x, y) => score(y) - score(x));
      return { survivor: sorted[0], merged: sorted.slice(1), why: Array.from(reasons.get(root) ?? []) };
    })
    .sort((x, y) => y.merged.length - x.merged.length);
}
