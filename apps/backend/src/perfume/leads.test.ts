/**
 * PERFUME-LEADS (owner 2026-11-26 17:38 CT: "filter and categorize in an excel and then upload, and then see what is not
 * necessary … include data from the research … the source we got the data from"). Pure rules, then real Postgres rolled back:
 * download → edit → upload → preview → apply, a leaked row keeping its sender, the source kind of every lead, catalogs.
 */
import pg from "pg";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { importRecords, importRecordSchema } from "./contacts.import.js";
import { listContacts } from "./contacts.service.js";
import {
  actionIn, addCatalogValue, applyPlan, getUpload, listUploads, saveUpload, applySchema, EXPORT_COLUMNS, exportRows, exportWorkbook, fileCategory, listCatalogs, parseSheets,
  previewUpload, renameCatalogValue, roleIn, sheetKind,
} from "./leads.service.js";

describe("lead rules", () => {
  it("reads the Action, Role and file Category columns the way the owner writes them", () => {
    expect(["Keep", "", "Remove company", "remove", "Remove person", "No"].map(actionIn)).toEqual(["keep", "keep", "remove_company", "remove_company", "remove_person", "remove_company"]);
    expect(["Vendor", "customer", "Vendor + customer", "", "x"].map(roleIn)).toEqual(["vendor", "customer", "both", null, undefined]);
    expect(fileCategory("1 Perfume vendor - sent offers/lists")).toEqual({ label: "Perfume vendor - sent offers/lists", vendor: true });
    expect(fileCategory("5 Unclassified - review")).toEqual({ label: "Unclassified - review", vendor: false });
  });
  it("finds the header row and the kind of each sheet of the organized contacts file; section rows and Summary are skipped", () => {
    const { rows, sheets } = parseSheets({ file_name: "x.xlsx", sheets: [
      { name: "Summary", rows: [["TIO PERFUMES"], ["", "Emails tab", "980 rows"]] },
      { name: "Leaked emails", rows: [["Leak #", "Leaked list (email subject)", "Leaked FROM (sender address)", "Sender company", "Date sent", "Exposed email (To/CC)", "Name in the email", "Country"],
        [1, "NEW ARRIVAL", "sushmaaintl@gmail.com", "Sushmaa International", "2026-11-24", "buyer@shop.mx", "Ana", "Mexico"]] },
      { name: "Phone contacts", rows: [["Country (from phone code)", "Phone", "Company", "Contact name", "Category"], ["USA  -  2 phone rows", null, null, null, null],
        ["USA", "+1 (305) 772-4076", null, "Raul Miami", "2 Linked to a perfume vendor"]] },
    ] });
    expect(sheets.map((s) => [s.name, s.kind, s.used])).toEqual([["Summary", "skipped", 0], ["Leaked emails", "leaked", 1], ["Phone contacts", "phone", 1]]);
    expect(rows[0]!.f).toMatchObject({ leak_no: "1", leak_sender: "sushmaaintl@gmail.com", leak_sender_company: "Sushmaa International", email: "buyer@shop.mx" });
    expect(sheetKind("Leads", new Set(["company_id"]))).toBe("export");
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("leads Excel round trip (real Postgres, rolled back)", () => {
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
  const rec = (r: Record<string, unknown>) => importRecordSchema.parse({ people: [], origins: [], ...r });

  it("download → edit → upload → preview → apply: a change, a removal, a new leaked lead with its sender, a new type", async () => {
    await importRecords(db as never, [
      rec({ company: { name: "LDTEST Fragrance Hub", country: "US", city: "LDTEST City", role: "customer", source: "BBB research (US)" },
        people: [{ name: "Ana", email: "ana@ldtest-hub.com" }, { name: "Old", email: "old@ldtest-hub.com" }], origins: [{ how: "BBB", source: "BBB research (US)" }] }),
      rec({ company: { name: "LDTEST Trucking Co", city: "LDTEST City", source: "Master Database" }, people: [{ name: "Driver", phones: ["9565550101"] }] }),
    ], TEST_OWNER_USER_ID);

    const rows = await exportRows(db as never, { q: "ldtest" });
    expect(rows.map((r) => [r.company, r.person, r.source_kinds])).toEqual([
      ["LDTEST Fragrance Hub", "Ana", "Research · BBB (US)"], ["LDTEST Fragrance Hub", "Old", "Research · BBB (US)"],
      ["LDTEST Trucking Co", "Driver", "Email & phone (Master Database)"]]);

    // The owner's edits in Excel.
    const head = EXPORT_COLUMNS.map((c) => c.header);
    const line = (r: Record<string, string | null>) => EXPORT_COLUMNS.map((c) => r[c.key] ?? null);
    const edited = rows.map((r) => ({ ...r }));
    edited[0]!.customer_type = "Formal wholesale";
    edited[0]!.category = "LDTEST niche";
    edited[1]!.action = "Remove person";
    edited[2]!.action = "Remove company";
    const sheets = [
      { name: "Leads", rows: [head, ...edited.map(line)] },
      { name: "Leaked emails", rows: [["Leak #", "Leaked list (email subject)", "Leaked FROM (sender address)", "Sender company", "Date sent", "Exposed email (To/CC)", "Name in the email", "Country"],
        [7, "LDTEST NEW ARRIVALS", "offers@ldtest-vendor.com", "LDTEST Vendor Inc", "2026-11-20", "buyer@ldtest-shop.mx", "Luis", "Mexico"]] },
    ];
    const { summary, plan } = await previewUpload(db as never, { file_name: "edited.xlsx", sheets });
    expect(summary.existing).toMatchObject({ companies_changed: 1, remove_companies: 1, remove_people: 1, not_found: 0 });
    expect(summary.changes.map((x) => [x.field, x.to])).toEqual(expect.arrayContaining([["customer_type", "Formal wholesale"], ["category", "LDTEST niche"]]));
    expect(summary.new).toMatchObject({ records: 1, would_insert: 1 });
    expect(summary.new.samples[0]).toMatchObject({ kind: "leaked", email: "buyer@ldtest-shop.mx", leaked_from: "LDTEST Vendor Inc", country: "Mexico" });
    expect(summary.unknown.category).toEqual(["LDTEST niche"]);

    // The upload is kept with its preview, and the Uploads list reads it back (prod 2026-11-27 00:06Z: the list query 500'd).
    const saved = await saveUpload(db as never, TEST_OWNER_USER_ID, { file_name: "edited.xlsx", sheets });
    const listed = (await listUploads(db as never)).find((u: { id: string }) => u.id === saved.id);
    expect(listed).toMatchObject({ file_name: "edited.xlsx", status: "previewed", new: { records: 1, would_insert: 1 } });
    expect(listed.new.samples).toBeUndefined();
    expect((await getUpload(db as never, saved.id)).summary.existing.companies_changed).toBe(1);

    const res = await applyPlan(db as never, TEST_OWNER_USER_ID, plan, applySchema.parse({}));
    expect(res).toMatchObject({ companies_changed: 1, companies_removed: 1, people_removed: 1, inserted: 1, catalog_added: 1, errors: [] });

    const hub = (await db.query(`SELECT customer_type, main_category FROM perfume.contact_companies WHERE name = 'LDTEST Fragrance Hub'`)).rows[0];
    expect(hub).toEqual({ customer_type: "Formal wholesale", main_category: "LDTEST niche" });
    expect((await db.query(`SELECT archived_at IS NOT NULL AS gone FROM perfume.contact_people WHERE email = 'old@ldtest-hub.com'`)).rows[0].gone).toBe(true);
    expect((await db.query(`SELECT archived_at IS NOT NULL AS gone FROM perfume.contact_companies WHERE name = 'LDTEST Trucking Co'`)).rows[0].gone).toBe(true);
    const leak = (await db.query(
      `SELECT o.source_kind, o.sender_email, o.leak_no, o.source, o.detail, co.role FROM perfume.contact_origins o JOIN perfume.contact_people p ON p.id = o.person_id
         JOIN perfume.contact_companies co ON co.id = o.company_id WHERE p.email = 'buyer@ldtest-shop.mx'`)).rows[0];
    expect(leak).toEqual({ source_kind: "Leaked email", sender_email: "offers@ldtest-vendor.com", leak_no: 7, source: "Copied by LDTEST Vendor Inc", detail: "LDTEST NEW ARRIVALS", role: "customer" });
    // The Leads list filters by source kind.
    const leaked = await listContacts(db as never, { q: "ldtest", kinds: ["Leaked email"] });
    expect(leaked.rows.map((r: { name: string }) => r.name)).toEqual(["Ldtest-shop"]); // a company domain names the company; the person stays Luis
  });

  it("the download carries drop-downs from the catalogs; renaming a type moves the contacts with it", async () => {
    await importRecords(db as never, [rec({ company: { name: "LDTEST Shop Two", city: "LDTEST City", vendor_type: "LDTEST trader kind", source: "Market Directory" } })], TEST_OWNER_USER_ID);
    const v = await addCatalogValue(db as never, TEST_OWNER_USER_ID, { kind: "vendor_type", value: "LDTEST trader kind" });
    const moved = await renameCatalogValue(db as never, v.id, "LDTEST Trader");
    expect(moved.moved).toBe(1);
    expect((await db.query(`SELECT vendor_type FROM perfume.contact_companies WHERE name = 'LDTEST Shop Two'`)).rows[0].vendor_type).toBe("LDTEST Trader");
    const cats = await listCatalogs(db as never);
    expect(cats.kinds.find((k) => k.kind === "vendor_type")!.values.find((x) => x.value === "LDTEST Trader")!.contacts).toBe(1);
    expect(cats.kinds.find((k) => k.kind === "product_type")!.values.map((x) => x.value)).toEqual(
      ["Tester", "Tester Man", "Tester Woman", "Man", "Woman", "Man Set", "Woman Set", "Body Mist"]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportWorkbook(db as never, { q: "ldtest shop two" })).buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Leads", "Lists", "How to use"]);
    const leads = wb.getWorksheet("Leads")!;
    expect(leads.getRow(1).getCell(1).value).toBe("Company ID");
    expect(leads.getRow(2).getCell(4).value).toBe("LDTEST Shop Two");
    expect(leads.getRow(2).getCell(3).value).toBe("Keep");
    const lists = wb.getWorksheet("Lists")!;
    expect(lists.getRow(1).values).toEqual(expect.arrayContaining(["action", "role", "status", "vendor_type", "customer_type", "category", "segment"]));
  });
});
