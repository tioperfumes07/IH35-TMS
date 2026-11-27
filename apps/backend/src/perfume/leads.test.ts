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
import { companyHistory, historyOf } from "./leads.events.js";
import {
  actionIn, addCatalogValue, applyPlan, getUpload, listUploads, saveUpload, applySchema, EXPORT_COLUMNS, exportRows, exportWorkbook, fileCategory, listCatalogs, parseSheets,
  previewUpload, renameCatalogValue, researchSources, roleIn, sheetKind,
} from "./leads.service.js";

describe("lead rules", () => {
  it("reads the Action, Role and file Category columns the way the owner writes them", () => {
    expect(["Keep", "", "Remove company", "remove", "Remove person", "No"].map(actionIn)).toEqual(["keep", "keep", "remove_company", "remove_company", "remove_person", "remove_company"]);
    expect(["Vendor", "customer", "Vendor + customer", "", "x"].map(roleIn)).toEqual(["vendor", "customer", "both", null, undefined]);
    expect(fileCategory("1 Perfume vendor / supplier")).toEqual({ label: "Perfume vendor / supplier", role: "vendor" });
    expect(fileCategory("2 Perfume customer")).toEqual({ label: "Perfume customer", role: "customer" });
    expect(fileCategory("6 Buyer from leaked perfume list (new)")).toEqual({ label: "Buyer from leaked perfume list (new)", role: "customer" });
    expect(fileCategory("7 Other contact - review")).toEqual({ label: "Other contact - review", role: null });
    expect(researchSources("INEGI DENUE + Sección Amarilla")).toEqual(["Sección Amarilla"]);
    expect(researchSources("INEGI DENUE")).toEqual([]);
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
    // History: who / when for every change the Apply made (fully-wired item g).
    const hubId = (await db.query(`SELECT id FROM perfume.contact_companies WHERE name = 'LDTEST Fragrance Hub'`)).rows[0].id;
    const hist = await companyHistory(db as never, hubId);
    expect(hist.map((e: { action: string }) => e.action).sort()).toEqual(["archived_in_excel", "edited_in_excel"]);
    expect(hist.find((e: { action: string }) => e.action === "edited_in_excel").detail).toMatchObject({ customer_type: "Formal wholesale", category: "LDTEST niche" });
    // The Leads list filters by source kind.
    const leaked = await listContacts(db as never, { q: "ldtest", kinds: ["Leaked email"] });
    expect(leaked.rows.map((r: { name: string }) => r.name)).toEqual(["Ldtest-shop"]); // a company domain names the company; the person stays Luis
  });

  it("the download carries drop-downs from the catalogs; renaming a type moves the contacts with it", async () => {
    await importRecords(db as never, [rec({ company: { name: "LDTEST Shop Two", city: "LDTEST City", vendor_type: "LDTEST trader kind", source: "Market Directory" } })], TEST_OWNER_USER_ID);
    const v = await addCatalogValue(db as never, TEST_OWNER_USER_ID, { kind: "vendor_type", value: "LDTEST trader kind" });
    const moved = await renameCatalogValue(db as never, v.id, "LDTEST Trader");
    expect(moved.moved).toBe(1);
    expect((await historyOf(db as never, "catalog_value", v.id)).map((e: { action: string }) => e.action)).toEqual(["renamed", "added"]);
    expect((await db.query(`SELECT vendor_type FROM perfume.contact_companies WHERE name = 'LDTEST Shop Two'`)).rows[0].vendor_type).toBe("LDTEST Trader");
    const cats = await listCatalogs(db as never);
    expect(cats.kinds.find((k) => k.kind === "vendor_type")!.values.find((x) => x.value === "LDTEST Trader")!.contacts).toBe(1);
    // Product types: the original eight plus every kind the item file holds (migration 202617070100, owner 2026-11-27 12:04 CT).
    expect(cats.kinds.find((k) => k.kind === "product_type")!.values.map((x) => x.value)).toEqual(expect.arrayContaining(
      ["Tester", "Tester Man", "Tester Woman", "Man", "Woman", "Man Set", "Woman Set", "Body Mist", "Unisex", "Perfume", "Set", "Mini", "Sample / Vial",
        "Gift with purchase", "Bag", "Box / Packaging", "Display", "Accessory", "Blotter", "Deodorant", "Body care", "Hair care", "Cosmetics", "Home fragrance"]));

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

  it("the one final contacts file: Emails-Full / Contacts-Full / Leaked-Emails / Prospects-Research / Removed-Check (owner 2026-11-26 18:55 CT)", async () => {
    await importRecords(db as never, [rec({ company: { name: "FFTEST Junk Funding LLC", city: "FFTEST City", source: "Master Database" }, people: [{ name: "Loan Guy", email: "loans@fftest-funding.com" }] })], TEST_OWNER_USER_ID);
    const sheets = [
      { name: "Emails-Full", rows: [["Group ID", "Category", "Company", "Full name", "Email", "Phone(s)", "Address", "City", "State", "ZIP", "Country", "Role", "First email", "Sources (where found)"],
        ["1 PERFUME VENDOR / SUPPLIER  -  1 emails"],
        ["G1", "2 Perfume customer", "FFTEST Specialty Brands Inc", "Ana Pérez", "ana@fftest-sb.com", "+1 (305) 555-0100", "100 Main St", "Miami", "FL", "33101", "USA", "Customer", "2024-07-31", "My contacts"]] },
      { name: "Contacts-Full", rows: [["Group ID", "Section", "Country (from phone)", "Phone", "Valid number?", "Full name", "Company", "Category"],
        ["USA  -  2 phone numbers"],
        ["G1", "USA", "USA", "+1 (305) 555-0101", "Yes", "Ana Pérez", "FFTEST Specialty Brands Inc", "2 Perfume customer"],
        ["G1", "Not a valid number", "Mexico", "+52 305 555 0101", "No", "Ana Pérez", "FFTEST Specialty Brands Inc", "2 Perfume customer"]] },
      { name: "Prospects-Research", rows: [["Source", "Type", "Company", "Contact name", "Email", "Phone", "City", "Country", "Segment", "Note"],
        ["INEGI DENUE", "Potential customer", "FFTEST Abarrotes INEGI", "FFTEST Abarrotes INEGI", null, "8671112222", "Nuevo Laredo", "MX", "abarrotes", null],
        ["INEGI DENUE + Sección Amarilla", "Potential customer", "FFTEST Perfumeria SA", "FFTEST Perfumeria SA", null, "8671113333", "Nuevo Laredo", "MX", "perfumerias", null],
        ["Customs (ImportKey/ImportGenius/Panjiva) + Customs / key importer", "Potential vendor - exporter behind your vendors", "FFTEST Exporter Ltd", "FFTEST Exporter Ltd", null, null, null, "Cyprus", null, "PCA"]] },
      { name: "Removed-Check", rows: [["Group ID", "Why removed", "Name", "Company", "Email(s)", "Phone(s)", "Sources"], ["G9", "Funding / loans", "Loan Guy", "FFTEST Junk Funding LLC", "loans@fftest-funding.com", null, "x"]] },
      { name: "Summary", rows: [["TIO PERFUMES - ALL CONTACTS"]] },
    ];
    const { summary, plan } = await previewUpload(db as never, { file_name: "final.xlsx", sheets });
    expect(summary.sheets.map((x) => [x.name, x.kind, x.used])).toEqual([["Emails-Full", "email", 1], ["Contacts-Full", "phone", 1], ["Prospects-Research", "research", 2],
      ["Removed-Check", "removed", 1], ["Summary", "skipped", 0]]);
    expect(summary.removed_check).toMatchObject({ companies: 1, people: 0 });
    expect(summary.new.records).toBe(3); // Ana (email + phone tabs, one Group ID) + the Sección Amarilla perfumería + the exporter; the INEGI-only row never comes in

    expect(applySchema.parse({}).apply_removed_check).toBe(false); // the Removed-Check list is archived only when the owner ticks it
    const res = await applyPlan(db as never, TEST_OWNER_USER_ID, plan, applySchema.parse({ apply_removed_check: true }));
    expect(res).toMatchObject({ inserted: 3, companies_removed: 1, errors: [] });
    const ana = (await db.query(`SELECT co.role, co.zip, co.city, co.address, p.phones, co.categories FROM perfume.contact_companies co JOIN perfume.contact_people p ON p.company_id = co.id
      WHERE p.email = 'ana@fftest-sb.com'`)).rows[0];
    expect(ana).toMatchObject({ role: "customer", zip: "33101", city: "Miami", address: "100 Main St", phones: ["+1 (305) 555-0100", "+1 (305) 555-0101"], categories: ["Perfume customer"] });
    const kinds = (await db.query(`SELECT co.name, o.source_kind FROM perfume.contact_origins o JOIN perfume.contact_companies co ON co.id = o.company_id
      WHERE co.name LIKE 'FFTEST%' AND co.archived_at IS NULL ORDER BY 1, 2`)).rows.map((x: { name: string; source_kind: string }) => `${x.name}: ${x.source_kind}`);
    expect(kinds).toEqual(["FFTEST Exporter Ltd: Research · customs exports / imports", "FFTEST Exporter Ltd: Research · customs exports / imports",
      "FFTEST Perfumeria SA: Research · Sección Amarilla (border towns)", "FFTEST Specialty Brands Inc: Email", "FFTEST Specialty Brands Inc: Phone contact"]);
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.contact_companies WHERE name = 'FFTEST Abarrotes INEGI'`)).rows[0].n).toBe(0);
    expect((await db.query(`SELECT archived_at IS NOT NULL AS gone FROM perfume.contact_companies WHERE name = 'FFTEST Junk Funding LLC'`)).rows[0].gone).toBe(true);
  });
});
