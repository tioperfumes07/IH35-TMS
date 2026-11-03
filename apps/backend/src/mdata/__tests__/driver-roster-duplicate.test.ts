/**
 * ROSTER DUPLICATE DETECTION — every case here is a real pair measured on prod.
 *
 * TRANSP 2026-08-03 (the original three) and USMCA 2026-11-03 (LEAD, owner 9:38 AM CT: "when a driver appears as
 * near duplicate we should be asked, instead of creating a new one"): 165 USMCA driver rows = 93 people because the
 * 07-04 and 08-21 roster imports re-created 65 people; most copies are INACTIVE, which the old active-only check
 * could not see, and the near copies were shorter / reordered names.
 */
import { describe, expect, it, vi } from "vitest";

import {
  editDistance,
  findRosterDuplicates,
  normalizePersonName,
  rankRosterDuplicates,
  scoreRosterCandidate,
  type RosterRow,
} from "../driver-roster-duplicate.service.js";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";

function row(over: Partial<RosterRow> & Pick<RosterRow, "driver_id" | "first_name" | "last_name">): RosterRow {
  return {
    cdl_number: null,
    cdl_state: null,
    curp: null,
    passport_number: null,
    phone: null,
    status: "Active",
    deactivated_at: null,
    archived_at: null,
    created_at: "2026-07-04 00:00:00+00",
    ...over,
  };
}

describe("findRosterDuplicates — query", () => {
  it("reads ONE company's roster (a driver may hold a row in another entity) and every state", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await findRosterDuplicates({ query } as never, { operating_company_id: COMPANY, first_name: "Hugo", last_name: "Gaytan" });
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("d.operating_company_id = $1::uuid");
    expect(values).toEqual([COMPANY]);
    // Inactive / deactivated / archived rows are candidates now — the copies the imports made are inactive.
    expect(sql).not.toContain("d.deactivated_at IS NULL");
    expect(sql).not.toContain("d.archived_at IS NULL");
  });

  it("issues NO query when there is nothing to match on", async () => {
    const query = vi.fn();
    expect(await findRosterDuplicates({ query } as never, { operating_company_id: COMPANY })).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns an INACTIVE copy as a match to reopen, never hidden", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [row({ driver_id: "d-old", first_name: "HUGO", last_name: "GAYTAN", status: "Inactive", deactivated_at: "2026-08-21" })],
    });
    const found = await findRosterDuplicates({ query } as never, { operating_company_id: COMPANY, first_name: "Hugo", last_name: "Gaytan" });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ driver_id: "d-old", matched_on: "name_exact", strength: "strong", state: "deactivated" });
  });
});

describe("scoreRosterCandidate — the measured shapes", () => {
  it("CARLOS GALAVIZ: identical CDL → cdl_exact (hard)", () => {
    const r = scoreRosterCandidate(
      { operating_company_id: COMPANY, first_name: "Carlos", last_name: "Galaviz", cdl_number: "LFD01237194" },
      row({ driver_id: "x", first_name: "CARLOS", last_name: "GALAVIZ", cdl_number: "LFD01237194" })
    );
    expect(r[0]).toBe("cdl_exact");
    expect(r).toContain("name_exact");
  });

  it("JUAN PABLO HERNANDEZ ESTRADA: CDL one digit apart (…0697 vs …0637) → name_exact + cdl_one_char", () => {
    const r = scoreRosterCandidate(
      { operating_company_id: COMPANY, first_name: "Juan Pablo", last_name: "Hernandez Estrada", cdl_number: "TAMP310637" },
      row({ driver_id: "x", first_name: "JUAN PABLO", last_name: "HERNANDEZ ESTRADA", cdl_number: "TAMP310697" })
    );
    expect(r).toEqual(["name_exact", "cdl_one_char"]);
  });

  it("shorter form of the same name → name_contains (angel alfonso sosa ↔ angel alfonso sosa perez)", () => {
    const r = scoreRosterCandidate(
      { operating_company_id: COMPANY, first_name: "Angel Alfonso", last_name: "Sosa" },
      row({ driver_id: "x", first_name: "Angel Alfonso", last_name: "Sosa Perez" })
    );
    expect(r).toEqual(["name_contains"]);
  });

  it("reordered surnames → name_reordered (neftali urbano coronado ↔ neftali coronado urbano)", () => {
    const r = scoreRosterCandidate(
      { operating_company_id: COMPANY, first_name: "Neftali", last_name: "Urbano Coronado" },
      row({ driver_id: "x", first_name: "Neftali", last_name: "Coronado Urbano" })
    );
    expect(r).toEqual(["name_reordered"]);
  });

  it("accents compare equal; a one-letter typo → name_typo", () => {
    expect(
      scoreRosterCandidate(
        { operating_company_id: COMPANY, first_name: "Juan Jorge", last_name: "Castor Castañeda" },
        row({ driver_id: "x", first_name: "Juan Jorge", last_name: "Castor Castaneda" })
      )
    ).toEqual(["name_exact"]);
    expect(
      scoreRosterCandidate(
        { operating_company_id: COMPANY, first_name: "Faustino", last_name: "Guevara Martinez" },
        row({ driver_id: "x", first_name: "Faustino", last_name: "Guevera Martinez" })
      )
    ).toEqual(["name_typo"]);
  });

  it("same phone (last 10 digits) → phone_exact", () => {
    const r = scoreRosterCandidate(
      { operating_company_id: COMPANY, first_name: "Pedro", last_name: "Lopez", phone: "+1 (956) 555-0101" },
      row({ driver_id: "x", first_name: "Pedro Abraham", last_name: "Lopez Collado", phone: "9565550101" })
    );
    expect(r[0]).toBe("phone_exact");
  });

  it("different people do NOT match: different first name, or a lone first name", () => {
    expect(
      scoreRosterCandidate(
        { operating_company_id: COMPANY, first_name: "Luis Armando", last_name: "Sosa Perez" },
        row({ driver_id: "x", first_name: "Angel Alfonso", last_name: "Sosa Perez" })
      )
    ).toEqual([]);
    expect(
      scoreRosterCandidate({ operating_company_id: COMPANY, first_name: "Hugo", last_name: "" }, row({ driver_id: "x", first_name: "Hugo", last_name: "Gaytan" }))
    ).toEqual([]);
  });
});

describe("rankRosterDuplicates", () => {
  it("orders hard before strong before possible, active before inactive", () => {
    const ranked = rankRosterDuplicates(
      { operating_company_id: COMPANY, first_name: "Carlos", last_name: "Mauricio Carvallo", cdl_number: "MX123456" },
      [
        row({ driver_id: "contains", first_name: "Carlos Mauricio", last_name: "Pena Carvallo" }),
        row({ driver_id: "exact-inactive", first_name: "Carlos Mauricio", last_name: "Carvallo", status: "Inactive", deactivated_at: "2026-08-21" }),
        row({ driver_id: "cdl", first_name: "C", last_name: "M", cdl_number: "MX123456" }),
        row({ driver_id: "other", first_name: "Ruben Pedro", last_name: "Perez Garcia" }),
      ]
    );
    expect(ranked.map((m) => m.driver_id)).toEqual(["cdl", "exact-inactive", "contains"]);
    expect(ranked.map((m) => m.strength)).toEqual(["hard", "strong", "possible"]);
  });
});

describe("helpers", () => {
  it("normalizePersonName strips accents and punctuation, collapses spaces", () => {
    expect(normalizePersonName("  José  Juan ", "Castor-Castañeda")).toBe("JOSE JUAN CASTOR CASTANEDA");
  });
  it("editDistance", () => {
    expect(editDistance("GUEVARA", "GUEVERA")).toBe(1);
    expect(editDistance("ABC", "ABC")).toBe(0);
  });
});
