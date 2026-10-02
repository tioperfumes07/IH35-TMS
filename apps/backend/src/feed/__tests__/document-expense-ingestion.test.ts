import { describe, expect, it, vi } from "vitest";
import { ingestDocumentExpenses, planDocumentExpenses } from "../document-expense-ingestion.service.js";
import { USMCA_COMPANY_ID } from "../../catalogs/settlement-pdf-item-map.js";
import type { TruthCompanyDoc } from "../seed-settlement-document.service.js";

const line = (o: Partial<TruthCompanyDoc["expenses"][number]>) => ({ date: "2026-09-02", vendor: "LOVES", description: "Fuel-Reefer Diesel", invoice: "1", reimb: "", comp: "Y", amount: 45.47, raw: "", ...o });
const doc = (expenses: TruthCompanyDoc["expenses"], loads = ["13601", "13602"]) =>
  ({ settlement_no: "5790", loads, fuel_purchases: [], expenses } as unknown as TruthCompanyDoc);

describe("queue item 9 (G-01) — document-expense ingestion", () => {
  it("plans each printed cost once, attributes the load exactly, and matches the item map", () => {
    const plan = planDocumentExpenses(USMCA_COMPANY_ID, doc([
      line({ load: "13601" }),
      line({ load: "13601" }), // byte-identical parser duplicate
      line({ load: "13602", description: "OTR-Mexico Tolls & Intl Bridge Expense", amount: 12 }),
      line({ description: "TRACTOR-Washout Expense", amount: 55.21 }), // no load, two-load document
      line({ load: "13602", description: "Mystery Item", amount: 3 }),
    ]));
    expect(plan).toHaveLength(4);
    expect(plan[0]).toMatchObject({ loadNumber: "13601", itemCategory: "Fuel-Reefer Diesel" });
    expect(plan[1].itemCategory).toBe("OTR-Mexico Tolls & Intl Bridge Expense");
    expect(plan[2].loadNumber).toBeNull();
    expect(plan[3].itemCategory).toBeNull();
  });

  it("dry run writes nothing and refuses unattributed / unmapped / unknown-load lines by name", async () => {
    const client = { query: vi.fn(async (sql: string, p?: unknown[]) => (sql.includes("FROM mdata.loads") ? { rows: p?.[1] === "13601" ? [{ id: "L1" }] : [] } : { rows: [] })) };
    const r = await ingestDocumentExpenses(client as never, {
      operatingCompanyId: USMCA_COMPANY_ID, actorUserId: "u", dryRun: true,
      doc: doc([line({ load: "13601" }), line({ load: "13999", amount: 9 }), line({ description: "TRACTOR-Washout Expense", amount: 1 }), line({ load: "13601", description: "Mystery", amount: 2 })]),
    });
    expect(r.lines.map((l) => l.outcome)).toEqual(["planned", "refused_load_not_found", "refused_unattributed_load", "refused_item_not_on_map"]);
    expect(client.query.mock.calls.every(([sql]) => !/INSERT|UPDATE|SAVEPOINT/.test(String(sql)))).toBe(true);
  });
});
