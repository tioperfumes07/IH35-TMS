/**
 * OB-01 — the commit gate, proven against a REAL migrated Postgres (not mocks). Proves:
 *   (a) unbalanced register           -> REFUSED (unbalanced), catalogs.accounts untouched — with NO
 *       finality row ever set, proving the 2026-07-29 owner ruling (no finality gate) actually holds
 *   (b) balanced, checker == maker    -> REFUSED (maker_is_checker), still untouched
 *   (c) balanced + a real checker     -> COMMITTED, opening_balance_cents / _as_of / _qbo_snapshot /
 *       _adjustment written, still with no finality row ever set
 *   (d) every refusal and the commit leave a WORM audit row, and that table rejects UPDATE + DELETE
 *   (e) the staged rows are INVISIBLE from another entity's RLS context (no cross-entity read)
 *   (f) setObSourceFinality is advisory only — flipping it does not change commit_blockers
 *
 * The service runs on the caller's client exactly as the routes drive it. Runs only in CI
 * (GITHUB_ACTIONS=true) where a migrated Postgres exists.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, withCompanyRls } from "../../../../test-helpers/db-fixture.js";
import {
  commitObRegister,
  setObSourceFinality,
  upsertObRegisterLine,
  type ObCommitRefuseReason,
} from "../opening-balance-register.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

/** TRANSP's locked opening-balance period — the same constant the service resolves by company code. */
const AS_OF = "2026-03-31";

describeIntegration("OB-01 opening balance commit gate (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  // Dedicated maker/checker so a sibling suite cannot make this file's maker≠checker arm flap.
  // Fresh actors per run. The audit table is genuinely WORM — this suite cannot delete its own rows
  // afterwards — so the only way to count "the events THIS run wrote" is to own unique actor ids.
  const maker = randomUUID();
  const checker = randomUUID();
  const cash = randomUUID();
  const capital = randomUUID();
  const extra = randomUUID();

  async function bypass<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) {
      await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
      await db.query("SELECT set_config('app.current_operating_company_id', $1, true)", [companyId]);
    }
    try {
      const out = await fn(db);
      await db.query("COMMIT");
      return out;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  /** Opening balances actually written on THIS test's accounts — the thing a bad gate would leak. */
  async function writtenCount(): Promise<number> {
    return bypass(async () => {
      const r = await db.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM catalogs.accounts
          WHERE id = ANY($1::uuid[]) AND opening_balance_as_of IS NOT NULL`,
        [[cash, capital, extra]]
      );
      return Number(r.rows[0]!.c);
    });
  }

  async function auditCount(eventType: string): Promise<number> {
    return bypass(async () => {
      const r = await db.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM accounting.ob_register_audit_events
          WHERE operating_company_id = $1::uuid AND as_of_date = $2::date AND event_type = $3
            AND (actor_user_id = ANY($4::uuid[]))`,
        [companyId, AS_OF, eventType, [maker, checker]]
      );
      return Number(r.rows[0]!.c);
    });
  }

  /** Run the service, assert it refused, and hand back the blockers it named. */
  async function expectRefusal(actor: string): Promise<ObCommitRefuseReason[]> {
    const res = await bypass((client) => commitObRegister(client, companyId, actor));
    expect(res.committed).toBe(false);
    expect(res.accounts_written).toBe(0);
    return res.blockers;
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      const mkUser = (id: string, email: string) =>
        db.query(
          `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en')
           ON CONFLICT (id) DO NOTHING`,
          [id, email]
        );
      await mkUser(maker, `ob01-maker-${suffix}@test.local`);
      await mkUser(checker, `ob01-checker-${suffix}@test.local`);
      // Names deliberately avoid "Opening Balance Equity" / "Retained Earnings": those labels carry
      // reclass meaning in the totals, and this file is testing the GATE, not the OBE arithmetic
      // (that is covered exhaustively in the pure computeObTotals unit tests).
      const mkAcct = (id: string, n: string, name: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${n}${suffix}`, `${name} ${suffix}`, type]
        );
      await mkAcct(cash, "OB01C", "OB01 Cash", "Asset");
      await mkAcct(capital, "OB01E", "OB01 Owner Capital", "Equity");
      await mkAcct(extra, "OB01X", "OB01 Other Asset", "Asset");
    });
  });

  // Teardown obeys the product's own rules instead of fighting them: ih35_app holds no DELETE on any
  // ob_* table (void-not-delete) and the audit trail is WORM, so this suite cannot erase what it
  // wrote and does not try. It RETIRES it — supersede the staged lines, put the finality flag back
  // down, deactivate the accounts — leaving the shared TRANSP/2026-03-31 period as it found it.
  // Each statement stands alone so one refusal cannot abort the rest.
  afterAll(async () => {
    if (!db) return;
    const best = async (sql: string, values: unknown[]) => {
      try {
        await bypass(() => db.query(sql, values));
      } catch {
        /* teardown is best-effort */
      }
    };
    await best(
      `UPDATE accounting.ob_register_staging_lines SET status = 'superseded', updated_at = now()
        WHERE account_id = ANY($1::uuid[]) AND status = 'staged'`,
      [[cash, capital, extra]]
    );
    await best(
      `UPDATE accounting.ob_source_finality SET is_final = false, updated_at = now()
        WHERE operating_company_id = $1::uuid AND as_of_date = $2::date`,
      [companyId, AS_OF]
    );
    await best(
      `UPDATE catalogs.accounts SET deactivated_at = now() WHERE id = ANY($1::uuid[]) AND deactivated_at IS NULL`,
      [[cash, capital, extra]]
    );
    await db.end();
  });

  it("(a) unbalanced register -> commit REFUSED unbalanced, nothing written — NO finality row exists", async () => {
    await bypass((client) =>
      upsertObRegisterLine(client, companyId, maker, { account_id: cash, adjustment_cents: 10_000 })
    );

    // No accounting.ob_source_finality row has ever been inserted for this period at this point in the
    // suite. Owner ruling 2026-07-29: that must NOT be what blocks the commit — only the register's own
    // unbalanced contents should.
    const blockers = await expectRefusal(checker);
    expect(blockers).not.toContain("source_not_final" as never);
    expect(blockers).toContain("unbalanced");
    expect(await writtenCount()).toBe(0);
    // The refusal SURVIVES as a WORM row — the point of returning rather than throwing.
    expect(await auditCount("commit_refused")).toBe(1);
  });

  it("(b) balanced but checker IS the maker -> REFUSED maker_is_checker, still no finality row", async () => {
    await bypass((client) =>
      upsertObRegisterLine(client, companyId, maker, { account_id: capital, adjustment_cents: 10_000 })
    );

    const blockers = await expectRefusal(maker);
    expect(blockers).toEqual(["maker_is_checker"]);
    expect(await writtenCount()).toBe(0);
  });

  it("(c) balanced + independent checker -> COMMITTED, no finality row was ever set", async () => {
    const res = await bypass((client) => commitObRegister(client, companyId, checker));
    expect(res.committed).toBe(true);
    expect(res.accounts_written).toBe(2);
    expect(res.totals.total_debits_cents).toBe(res.totals.total_credits_cents);

    const rows = await bypass(async () =>
      (
        await db.query<{
          id: string;
          opening_balance_cents: string;
          opening_balance_as_of: string;
          opening_balance_adjustment_cents: string;
        }>(
          `SELECT id::text, opening_balance_cents::text, to_char(opening_balance_as_of,'YYYY-MM-DD') AS opening_balance_as_of,
                  opening_balance_adjustment_cents::text
             FROM catalogs.accounts WHERE id = ANY($1::uuid[]) ORDER BY account_number`,
          [[cash, capital]]
        )
      ).rows
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.opening_balance_cents).toBe("10000");
      expect(r.opening_balance_as_of).toBe(AS_OF);
      // These lines were entered manually (never imported), so the Snapshot column stays NULL and the
      // Adjustment IS the full committed amount — Adjusted Opening = coalesce(NULL,0) + adjustment.
      expect(r.opening_balance_adjustment_cents).toBe("10000");
    }

    const staged = await bypass(async () =>
      (
        await db.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM accounting.ob_register_staging_lines
            WHERE account_id = ANY($1::uuid[]) AND status = 'committed' AND committed_by_user_id = $2::uuid`,
          [[cash, capital], checker]
        )
      ).rows[0]!.c
    );
    expect(Number(staged)).toBe(2);
    expect(await auditCount("committed")).toBe(2);

    // Confirms no finality row exists for this period from THIS suite's actors — the commit above did
    // not need one, and setObSourceFinality was never called before it.
    const finalityRows = await bypass(async () =>
      (
        await db.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM accounting.ob_source_finality
            WHERE operating_company_id = $1::uuid AND as_of_date = $2::date AND set_by = ANY($3::uuid[])`,
          [companyId, AS_OF, [maker, checker]]
        )
      ).rows[0]!.c
    );
    expect(Number(finalityRows)).toBe(0);
  });

  it("(d) the audit trail is WORM — UPDATE and DELETE are rejected by the database", async () => {
    const id = await bypass(async () =>
      (
        await db.query<{ id: string }>(
          `SELECT id::text FROM accounting.ob_register_audit_events
            WHERE operating_company_id = $1::uuid AND actor_user_id = $2::uuid LIMIT 1`,
          [companyId, checker]
        )
      ).rows[0]!.id
    );

    // Layer 1 — the application role was never granted UPDATE/DELETE, so tampering dies at the grant.
    await expect(
      bypass(() =>
        db.query(`UPDATE accounting.ob_register_audit_events SET detail = 'tampered' WHERE id = $1::uuid`, [id])
      )
    ).rejects.toThrow(/permission denied/i);
    await expect(
      bypass(() => db.query(`DELETE FROM accounting.ob_register_audit_events WHERE id = $1::uuid`, [id]))
    ).rejects.toThrow(/permission denied/i);

    // Layer 2 — the trigger, which is what stops a role that DOES hold the grant (a migration/DBA
    // session). Only meaningful if this connection's login role actually has UPDATE; when it does
    // not, layer 1 is already the whole answer and re-asserting it would prove nothing new.
    await db.query("RESET ROLE");
    try {
      const privileged = (
        await db.query<{ ok: boolean }>(
          `SELECT has_table_privilege(current_user, 'accounting.ob_register_audit_events', 'UPDATE') AS ok`
        )
      ).rows[0]!.ok;
      // Each attempt gets its own transaction: the first failure aborts the one it runs in.
      const attempt = async (sql: string) => {
        await db.query("BEGIN");
        await db.query("SET LOCAL app.bypass_rls = 'lucia'");
        try {
          await db.query(sql, [id]);
        } finally {
          await db.query("ROLLBACK").catch(() => {});
        }
      };
      if (privileged) {
        await expect(
          attempt(`UPDATE accounting.ob_register_audit_events SET detail = 'tampered' WHERE id = $1::uuid`)
        ).rejects.toThrow(/append-only/i);
        await expect(
          attempt(`DELETE FROM accounting.ob_register_audit_events WHERE id = $1::uuid`)
        ).rejects.toThrow(/append-only/i);
      }
    } finally {
      await db.query("SET ROLE ih35_app");
    }
  });

  it("(e) staged rows are invisible from another entity's RLS context", async () => {
    const other = await bypass(async () =>
      (
        await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'USMCA' LIMIT 1`)
      ).rows[0]!.id
    );

    await db.query("BEGIN");
    try {
      const visible = await withCompanyRls(db, other, async () => {
        const r = await db.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM accounting.ob_register_staging_lines WHERE account_id = ANY($1::uuid[])`,
          [[cash, capital, extra]]
        );
        return Number(r.rows[0]!.c);
      });
      expect(visible).toBe(0);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
    }
  });

  it("(f) setObSourceFinality is advisory only — flipping it does not change commit_blockers", async () => {
    // The period is already committed with a balanced, non-maker-checker-conflicted register from (c),
    // so commit_blockers is currently empty. Flip finality both ways and prove the blocker set is
    // unaffected either way — the only thing setObSourceFinality changes is its own audited table.
    await bypass((client) => setObSourceFinality(client, companyId, maker, { is_final: true, note: `ob01 db test ${suffix}` }));
    const afterFinal = await bypass((client) => commitObRegister(client, companyId, checker));
    // Nothing is staged anymore (the prior test committed everything), so this attempt is refused for
    // no_staged_lines — the SAME reason regardless of the finality flip below.
    expect(afterFinal.blockers).toEqual(["no_staged_lines"]);

    await bypass((client) => setObSourceFinality(client, companyId, maker, { is_final: false, note: null }));
    const afterNotFinal = await bypass((client) => commitObRegister(client, companyId, checker));
    expect(afterNotFinal.blockers).toEqual(afterFinal.blockers);
    expect(await auditCount("finality_set")).toBe(2);
  });
});
