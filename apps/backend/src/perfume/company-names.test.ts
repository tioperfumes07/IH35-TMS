/** ROUND P1.31 L2 (owner 2026-11-27 15:47 CT): full company name, proper format, "IPBGROUP IS IPB Group". Pure rule. */
import { describe, expect, it } from "vitest";
import { properCompanyName } from "./company-names.service.js";

describe("properCompanyName", () => {
  it.each([
    ["Ipbgroup", "IPB Group"],
    ["B&S FRAGRANCES", "B&S Fragrances"],
    ["Dlginternationaltrading", "DLG International Trading"],
    ["Kmfragrancesandbeauty", "KM Fragrances and Beauty"],
    ["Alhusseinperfumes", "Alhussein Perfumes"],
    ["Dfiretailgroup", "DFI Retail Group"],
    ["Thegroup", "The Group"],
    ["Ipb Anays", "IPB Anays"],
    ["Bp Mc", "BP MC"],
    ["Cereales Y Dulces Brenda S De Rl De Cv", "Cereales Y Dulces Brenda S de RL de CV"],
    ["skin and wigs etc", "Skin and Wigs Etc"],
    ["FRAGRANCE DEPOT CORPORATION", "Fragrance Depot Corporation"],
  ])("%s → %s", (from, to) => expect(properCompanyName(from)).toBe(to));
  it.each(["OXXO", "BSW", "skheti@aol.com", "perfumekaos.com", "1206452", "Exotic Fragrances, Inc.", "The Vitamin Shoppe", "B2 DYO LLC", "Forma Italiana SpA"])(
    "leaves %s alone", (n) => expect(properCompanyName(n)).toBeNull());
});

import pg from "pg";
import { afterAll, beforeAll } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { applyNameFixes, previewNameFixes } from "./company-names.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("name format apply (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("Ipbgroup → IPB Group with one history row; the browser cannot send its own name", async () => {
    const id = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Ipbgroup', 'test') RETURNING id::text`)).rows[0]!.id;
    expect((await previewNameFixes(db)).find((f) => f.id === id)).toMatchObject({ from: "Ipbgroup", to: "IPB Group" });
    expect(await applyNameFixes(db as never, TEST_OWNER_USER_ID, [id])).toMatchObject({ renamed: 1 });
    expect((await db.query(`SELECT name FROM perfume.contact_companies WHERE id = $1`, [id])).rows[0]!.name).toBe("IPB Group");
    const h = (await db.query(`SELECT action, detail FROM perfume.lead_events WHERE entity = 'company' AND entity_id = $1`, [id])).rows;
    expect(h).toEqual([{ action: "name_formatted", detail: { from: "Ipbgroup", to: "IPB Group" } }]);
    expect(await applyNameFixes(db as never, TEST_OWNER_USER_ID, [id])).toMatchObject({ renamed: 0, skipped: 1 }); // already right
  });
});
