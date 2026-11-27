/**
 * SCENTSX B9b — OFAC list parsing, loading, screening, blocking; resale certificate + export proof. Real Postgres, rolled back.
 * The list here is a small synthetic CSV in OFAC's own layout (the loader refuses fewer than 1,000 names, so the fixture pads
 * with generated names); the live list is loaded from the OFAC URL by the Compliance desk.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createPayer } from "./cash-compliance.service.js";
import {
  addExportProof, assertNotSanctionsBlocked, clearScreening, entriesFromCsv, hasExportProof, loadSanctionsList, normalizeName, parseCsv, partyStatus, screenParty,
} from "./sanctions.service.js";

const SDN = [
  `36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- `,
  `9001,"CARTEL DEL NORESTE, S.A. DE C.V.","-0-","SDNTK; ILLICIT-DRUGS-EO14059",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Mexico."`,
  ...Array.from({ length: 1100 }, (_, i) => `${20000 + i},"ZZQX FILLER ${i} HOLDINGS",-0- ,"TEST",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- `),
].join("\r\n");
const ALT = `9001,1,"aka","CDN PERFUMES Y FRAGANCIAS",-0- \r\n36,12,"aka","AERO-CARIBBEAN",-0- `;

describe("OFAC parsing (pure)", () => {
  it("reads OFAC CSV with quoted commas and -0- empties; aliases inherit the program", () => {
    expect(parseCsv(`1,"A, B",-0- ,"X"`)).toEqual([["1", "A, B", "", "X"]]);
    const e = entriesFromCsv(SDN, ALT);
    expect(e.find((x) => x.ent_num === 9001 && x.alt_num === 1)).toMatchObject({ name: "CDN PERFUMES Y FRAGANCIAS", program: "SDNTK; ILLICIT-DRUGS-EO14059" });
    expect(normalizeName("Cártel del Noreste, S.A. de C.V.")).toBe("CARTEL DEL NORESTE");
    expect(normalizeName("ScentsX LLC")).toBe("SCENTSX");
  });
});

describe("OFAC screening (real Postgres, rolled back)", () => {
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

  it("loads once per content, flags a near match, blocks until cleared, and re-blocks when the list changes", async () => {
    const u = TEST_OWNER_USER_ID;
    const fetchA = async (url: string) => (url.endsWith("SDN.CSV") ? SDN : ALT);
    const l1 = await loadSanctionsList(db, u, fetchA);
    expect(l1).toMatchObject({ new_load: true });
    expect(l1.names).toBe(1104);
    expect(await loadSanctionsList(db, u, fetchA)).toMatchObject({ new_load: false, load_id: l1.load_id });

    const bad = await createPayer(db, u, { payer_kind: "business", legal_name: "Cartel del Noreste SA de CV" });
    const good = await createPayer(db, u, { payer_kind: "business", legal_name: "Laredo Beauty Supply" });
    expect(await partyStatus(db, { kind: "cash_payer", id: good.id })).toMatchObject({ blocked: true, reason: "never_screened" });

    const g = await screenParty(db, u, { kind: "cash_payer", id: good.id });
    expect(g.result).toBe("clear");
    expect(await partyStatus(db, { kind: "cash_payer", id: good.id })).toMatchObject({ blocked: false });

    const b = await screenParty(db, u, { kind: "cash_payer", id: bad.id });
    expect(b.result).toBe("possible_match");
    expect(b.best_score).toBeGreaterThanOrEqual(0.9);
    await db.query("SAVEPOINT s1");
    await expect(assertNotSanctionsBlocked(db, { kind: "cash_payer", id: bad.id }, "Sale refused")).rejects.toThrow(/possible OFAC match/);
    await db.query("ROLLBACK TO SAVEPOINT s1");
    await db.query("SAVEPOINT s2");
    await expect(clearScreening(db, u, b.screening_id, "short")).rejects.toThrow(/say why/);
    await db.query("ROLLBACK TO SAVEPOINT s2");
    await clearScreening(db, u, b.screening_id, "Different company: test fixture, checked the RFC and address against the listing.");
    expect(await partyStatus(db, { kind: "cash_payer", id: bad.id })).toMatchObject({ blocked: false });

    const fetchB = async (url: string) => (url.endsWith("SDN.CSV") ? SDN + `\r\n99999,"NEW LISTING",-0- ,"X",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ` : ALT);
    expect(await loadSanctionsList(db, u, fetchB)).toMatchObject({ new_load: true });
    expect(await partyStatus(db, { kind: "cash_payer", id: good.id })).toMatchObject({ blocked: true, reason: "list_changed" });
  });

  it("a truncated download is refused; export proof is recorded against the sales order", async () => {
    await db.query("SAVEPOINT t");
    await expect(loadSanctionsList(db, TEST_OWNER_USER_ID, async () => `1,"ONLY ONE",-0- ,"X"`)).rejects.toThrow(/truncated/);
    await db.query("ROLLBACK TO SAVEPOINT t");

    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Export test buyer', 'test') RETURNING id::text`);
    const so = await db.query<{ id: string }>(`INSERT INTO perfume.sales_orders (company_id, customer_name) VALUES ($1::uuid, 'Export test buyer') RETURNING id::text`, [co.rows[0]!.id]);
    expect(await hasExportProof(db, so.rows[0]!.id)).toBe(false);
    const f = await db.query<{ id: string }>(
      `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, r2_key, uploader_user_id)
       VALUES (scentsx.company_id(), 'pedimento-test.pdf', 'application/pdf', 1, 'test/pedimento-test.pdf', $1::uuid) RETURNING id::text`, [TEST_OWNER_USER_ID]
    );
    await addExportProof(db, TEST_OWNER_USER_ID, { sales_order_id: so.rows[0]!.id, proof_kind: "foreign_import_papers", document_number: "26 24 3999 6001234", file_id: f.rows[0]!.id });
    expect(await hasExportProof(db, so.rows[0]!.id)).toBe(true);
  });
});
