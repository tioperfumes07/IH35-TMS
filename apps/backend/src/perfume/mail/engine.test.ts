/**
 * PERFUME mail engine (owner 2026-11-25 17:29 CT): which rule a file belongs to, the list date, the Gmail search, what a
 * file is HELD for, and — on real Postgres, rolled back — a mailed CSV saved as the vendor's list through the Lists tab's
 * own import (to-the-cent total), replacing the vendor's old list; a half-size list held; the same file not imported twice.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { importList, upsertVendor } from "../desk.service.js";
import { importMailFile, listDateOf, MIN_SHARE_OF_CURRENT, ruleFor, searchQuery, type MailRule } from "./engine.js";
import { attachmentsOf, header, senderAddress, type GmailMessage } from "./gmail.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const rule = (p: Partial<MailRule>): MailRule => ({ id: p.id ?? "r", from_address: "", file_text: null, vendor_id: "v", special: false, ignore: false, ...p });

describe("which rule a mailed file belongs to", () => {
  const rules = [
    rule({ id: "dom", from_address: "@elegance.com", vendor_id: "eleg" }),
    rule({ id: "arabic", from_address: "@elegance.com", file_text: "ARABIC", vendor_id: "eleg-ar" }),
    rule({ id: "exact", from_address: "kanak@pcaperfume.com", vendor_id: "pca" }),
    rule({ id: "pca-dom", from_address: "@pcaperfume.com", vendor_id: "pca-other" }),
  ];
  it("an exact address beats its @domain; a file-name text beats a rule without one", () => {
    expect(ruleFor(rules, "kanak@pcaperfume.com", "PCA 11-24.xlsx")?.id).toBe("exact");
    expect(ruleFor(rules, "sales@pcaperfume.com", "PCA 11-24.xlsx")?.id).toBe("pca-dom");
    expect(ruleFor(rules, "ana@elegance.com", "ELEGANCE arabic 11-20.xlsx")?.id).toBe("arabic");
    expect(ruleFor(rules, "ana@elegance.com", "ELEGANCE 11-20.xlsx")?.id).toBe("dom");
    expect(ruleFor(rules, "someone@broker.com", "rate.pdf")).toBeNull();
  });
  it("the list date is the day in Laredo; the search covers the window and never the owner's sent mail", () => {
    expect(listDateOf(new Date("2026-11-25T03:30:00Z"))).toBe("2026-11-24");
    expect(listDateOf(new Date("2026-11-25T12:00:00Z"))).toBe("2026-11-25");
    expect(searchQuery(3)).toBe("has:attachment newer_than:3d -in:sent -in:drafts {filename:xlsx filename:xls filename:csv filename:pdf filename:xlsm}");
    expect(searchQuery(0)).toContain("newer_than:1d");
    expect(searchQuery(400)).toContain("newer_than:60d");
  });
  it("Gmail message parts: the sender address and every attached file (nested multiparts included)", () => {
    const m: GmailMessage = { id: "m1", internalDate: "1795640000000", payload: {
      headers: [{ name: "From", value: "PCA Sales <Kanak@PCAperfume.com>" }, { name: "Subject", value: "Price list" }],
      parts: [{ mimeType: "text/plain", body: { data: "aGk" } }, { mimeType: "multipart/mixed", parts: [
        { filename: "PCA 11-24.xlsx", mimeType: "application/vnd.ms-excel", body: { attachmentId: "att1", size: 2048 } },
        { filename: "terms.csv", mimeType: "text/csv", body: { data: "YSxi", size: 3 } },
      ] }] } };
    expect(senderAddress(header(m, "from"))).toBe("kanak@pcaperfume.com");
    expect(attachmentsOf(m)).toEqual([
      { fileName: "PCA 11-24.xlsx", attachmentId: "att1", inlineData: null, size: 2048, mimeType: "application/vnd.ms-excel" },
      { fileName: "terms.csv", attachmentId: null, inlineData: "YSxi", size: 3, mimeType: "text/csv" },
    ]);
  });
});

describeIntegration("a mailed list saved through the Lists tab's import (real Postgres, rolled back)", () => {
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

  const csv = (n: number, cents = 1000) => Buffer.from(["UPC,Description,Price",
    ...Array.from({ length: n }, (_, i) => `81000009${String(i).padStart(5, "0")},MAILTEST ITEM ${i} EDT 100ML,${(cents / 100).toFixed(2)}`)].join("\n"));
  const meta = (fileName: string, messageId: string) => ({ messageId, fileName, sender: "list@mailtest.com", subject: "Price list", receivedAt: new Date("2026-11-25T13:00:00Z") });

  it("imports, replaces the old list, holds a half-size list, skips the same file twice", async () => {
    const v = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "MAILTEST VENDOR", kind: "buy", short_name: "MTV" });
    await db.query(`INSERT INTO perfume.mail_accounts (email, refresh_token_enc, status) VALUES ('mailtest@tioperfumes.com', '\\x00'::bytea, 'connected')`);
    const ruleRow = (await db.query<{ id: string }>(`INSERT INTO perfume.mail_rules (from_address, vendor_id) VALUES ('list@mailtest.com', $1) RETURNING id`, [v.id])).rows[0];
    const old = await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: v.id, list_date: "2026-11-20", file_name: "old.csv", source_kind: "csv",
      rows_read: 1, file_price_total_cents: 900, rows: [{ row_no: 1, description: "MAILTEST OLD EDT 100ML", price: "9.00" }] } as never);
    const ctx = { ownerUid: TEST_OWNER_USER_ID, runId: null, account: "mailtest@tioperfumes.com" };
    const r = { id: ruleRow.id, vendor_id: v.id, special: false };

    const a = await importMailFile(db as never, ctx, meta("MAILTEST 11-25.csv", "msg-1"), csv(10), r);
    expect(a.status).toBe("imported");
    expect([a.rowsRead, a.rowsSaved, a.totalCents]).toEqual([10, 10, 10_000]);
    expect(a.check?.totals_match).toBe(true);
    const lists = (await db.query<{ id: string; voided_at: string | null; list_date: string; file_name: string }>(
      `SELECT id, voided_at, list_date::text, file_name FROM perfume.price_lists WHERE vendor_id = $1 ORDER BY imported_at`, [v.id])).rows;
    expect(lists.find((l) => l.id === old.list_id)?.voided_at).not.toBeNull();
    const fresh = lists.find((l) => l.id === a.listId)!;
    expect([fresh.voided_at, fresh.list_date, fresh.file_name]).toEqual([null, "2026-11-25", "MAILTEST 11-25.csv · mail list@mailtest.com"]);

    // Recorded once; the same file again (another email) is a duplicate, nothing saved.
    await db.query(`INSERT INTO perfume.mail_files (account_email, external_gmail_message_id, file_name, sender, received_at, sha256, status, rule_id, vendor_id, list_id)
                    VALUES ($1, 'msg-1', 'MAILTEST 11-25.csv', 'list@mailtest.com', now(), $2, 'imported', $3, $4, $5)`, [ctx.account, a.sha, ruleRow.id, v.id, a.listId]);
    const again = await importMailFile(db as never, ctx, meta("MAILTEST 11-25 (1).csv", "msg-2"), csv(10), r);
    expect([again.status, again.listId]).toEqual(["duplicate", a.listId]);

    // Under half the lines of the list in use → held, the list in use stays.
    const small = await importMailFile(db as never, ctx, meta("MAILTEST partial.csv", "msg-3"), csv(Math.floor(10 * MIN_SHARE_OF_CURRENT) - 1, 1100), r);
    expect(small.status).toBe("held");
    expect(small.reason).toMatch(/Less than half the lines/);
    expect((await db.query(`SELECT voided_at FROM perfume.price_lists WHERE id = $1`, [a.listId])).rows[0].voided_at).toBeNull();
    // "Import anyway" saves it.
    const forced = await importMailFile(db as never, ctx, meta("MAILTEST partial.csv", "msg-3"), csv(4, 1100), r, { force: true });
    expect(forced.status).toBe("imported");

    // A special list (Black Friday) is kept next to the list in use.
    const bf = await importMailFile(db as never, ctx, meta("MAILTEST BLACK FRIDAY.csv", "msg-4"), csv(2, 500), r);
    expect(bf.status).toBe("imported");
    expect((await db.query(`SELECT voided_at FROM perfume.price_lists WHERE id = $1`, [forced.listId])).rows[0].voided_at).toBeNull();
    expect((await db.query(`SELECT label FROM perfume.price_lists WHERE id = $1`, [bf.listId])).rows[0].label).toBe("Price list");

    // Held for the right reason, nothing saved: no columns; a ".xls" that is not an Excel file (no OLE2 signature).
    expect((await importMailFile(db as never, ctx, meta("terms.csv", "msg-5"), Buffer.from("Terms,Notes,Contact\nNet 30,FOB,Ana\n"), r)).reason).toMatch(/No description and price columns/);
    expect((await importMailFile(db as never, ctx, meta("old.xls", "msg-6"), Buffer.from("x"), r)).reason).toMatch(/could not be opened/);
  });
});
