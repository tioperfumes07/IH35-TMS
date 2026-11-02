/**
 * ENG-22 (ROUND 7.2-C): Book/Edit Load refuse a company trailer whose body type ≠ the booked
 * load_trailer_equipment code (historical silent DRY_VAN default on Reefer). Pure resolver cases
 * against a stub client — no live DB.
 */
import { describe, expect, it } from "vitest";
import { resolveLoadTrailerEquipmentIdForInsert } from "../book-load.service.js";

type Row = Record<string, unknown>;
function stubClient(handlers: Array<{ match: RegExp; rows: Row[] }>) {
  return {
    async query<T = Row>(sql: string, _values?: unknown[]) {
      for (const h of handlers) {
        if (h.match.test(sql)) return { rows: h.rows as T[] };
      }
      throw new Error(`unexpected SQL: ${sql.slice(0, 120)}`);
    },
  };
}

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRY_ID = "11111111-1111-1111-1111-111111111111";
const REEFER_ID = "22222222-2222-2222-2222-222222222222";
const TRAILER_ID = "33333333-3333-3333-3333-333333333333";

describe("ENG-22 resolveLoadTrailerEquipmentIdForInsert company trailer mismatch", () => {
  it("refuses DRY_VAN explicit pick when company trailer is Reefer", async () => {
    const client = stubClient([
      { match: /FROM mdata\.equipment/, rows: [{ equipment_type: "Reefer", equipment_number: "10219" }] },
      { match: /SELECT id::text AS id, code/, rows: [{ id: DRY_ID, code: "DRY_VAN" }] },
    ]);
    await expect(
      resolveLoadTrailerEquipmentIdForInsert(client, CO, DRY_ID, {
        companyTrailerId: TRAILER_ID,
        choiceKind: "company",
      })
    ).rejects.toMatchObject({
      message: "trailer_equipment_type_mismatch",
      booked_code: "DRY_VAN",
      trailer_code: "REFRIGERATED_VAN",
      equipment_number: "10219",
    });
  });

  it("re-derives REFRIGERATED_VAN when company trailer is Reefer and no explicit pick", async () => {
    const client = stubClient([
      { match: /FROM mdata\.equipment/, rows: [{ equipment_type: "Reefer", equipment_number: "10219" }] },
      {
        match: /SELECT id::text AS id FROM catalogs\.load_trailer_equipment/,
        rows: [{ id: REEFER_ID }],
      },
    ]);
    const id = await resolveLoadTrailerEquipmentIdForInsert(client, CO, null, {
      companyTrailerId: TRAILER_ID,
      choiceKind: "company",
    });
    expect(id).toBe(REEFER_ID);
  });

  it("keeps matching DRY_VAN when company trailer is DryVan", async () => {
    const client = stubClient([
      { match: /FROM mdata\.equipment/, rows: [{ equipment_type: "DryVan", equipment_number: "10001" }] },
      { match: /SELECT id::text AS id, code/, rows: [{ id: DRY_ID, code: "DRY_VAN" }] },
      {
        match: /SELECT id::text AS id FROM catalogs\.load_trailer_equipment/,
        rows: [{ id: DRY_ID }],
      },
    ]);
    const id = await resolveLoadTrailerEquipmentIdForInsert(client, CO, DRY_ID, {
      companyTrailerId: TRAILER_ID,
      choiceKind: "company",
    });
    expect(id).toBe(DRY_ID);
  });
});
