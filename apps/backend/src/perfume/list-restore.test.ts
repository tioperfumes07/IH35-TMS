/**
 * PERFUME LIST RESTORE (owner 2026-11-27 08:51 CT): "A. Do whatever necessary get it done now. Add void buttons etc restore buttons".
 * Measured case: a misread PDF list voided a vendor's good 312-line list on import. Restoring the good one with "replace"
 * voids the bad one, makes the good one the list in use, and writes every void / restore to perfume.price_list_events —
 * an import that replaces a list records that void too. Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { listVoidedLists, ListRestoreError, restoreList, voidList } from "./desk.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("list void / restore (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });
  const list = async (vendorId: string, file: string, date: string, label: string | null, current: boolean) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.price_lists (vendor_id, list_date, label, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
     VALUES ($1, $2, $3, $4, 'xlsx', 1, 1, 0, 0, 0, $5) RETURNING id`, [vendorId, date, label, file, current])).rows[0].id;
  const state = async (id: string) => (await db.query<{ is_current: boolean; voided: boolean; void_reason: string | null }>(
    `SELECT is_current, voided_at IS NOT NULL AS voided, void_reason FROM perfume.price_lists WHERE id = $1`, [id])).rows[0];
  const events = async (id: string) => (await db.query<{ kind: string; reason: string }>(
    `SELECT kind, reason FROM perfume.price_list_events WHERE list_id = $1 ORDER BY created_at`, [id])).rows;

  it("restores a voided full list in place of the list in use, keeps a special list, and writes the history", async () => {
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZR Supplier', 'buy') RETURNING id`)).rows[0].id;
    const good = await list(v, "order_form_11-03.xlsx", "2026-11-03", null, false);
    const bad = await list(v, "catalog_11-16.pdf", "2026-11-16", null, true);
    const fc = await list(v, "fc_11-26.xlsx", "2026-11-26", "FC specials", true);
    await db.query(`UPDATE perfume.price_lists SET voided_at = now(), void_reason = 'Replaced by catalog_11-16.pdf' WHERE id = $1`, [good]);

    expect((await listVoidedLists(db)).some((l) => l.id === good && l.vendor_has_current)).toBe(true);

    const out = await restoreList(db, good, "PDF was misread; 11-03 is the full list", TEST_OWNER_USER_ID, true);
    expect(out).toEqual({ voided_now: [bad], is_current: true });
    expect(await state(good)).toEqual({ is_current: true, voided: false, void_reason: null });
    expect(await state(bad)).toMatchObject({ is_current: false, voided: true });
    expect((await state(bad)).void_reason).toMatch(/^Replaced by restoring order_form_11-03\.xlsx \(2026-11-03\)$/);
    expect(await state(fc)).toEqual({ is_current: true, voided: false, void_reason: null }); // a labelled special is never voided by a restore
    expect(await events(good)).toEqual([{ kind: "restored", reason: "PDF was misread; 11-03 is the full list" }]);
    expect(await events(bad)).toEqual([{ kind: "voided", reason: "Replaced by restoring order_form_11-03.xlsx (2026-11-03)" }]);

    // A list that is not voided cannot be restored.
    await expect(restoreList(db, good, "again", TEST_OWNER_USER_ID, true)).rejects.toBeInstanceOf(ListRestoreError);

    // Void from the Lists tab: history row with who; the vendor's newest remaining list is in use.
    await voidList(db, good, "test void", TEST_OWNER_USER_ID);
    expect(await events(good)).toEqual([{ kind: "restored", reason: "PDF was misread; 11-03 is the full list" }, { kind: "voided", reason: "test void" }]);
    expect((await state(fc)).is_current).toBe(true);

    // Restore WITHOUT replace: back next to the list in use, not counted in the grid (the vendor already has one).
    const beside = await restoreList(db, bad, "keep it next to the specials", TEST_OWNER_USER_ID, false);
    expect(beside).toEqual({ voided_now: [], is_current: false });
    expect(await state(bad)).toEqual({ is_current: false, voided: false, void_reason: null });
  });
});
