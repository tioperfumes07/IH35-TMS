import { describe, expect, it, vi } from "vitest";
import { emitMasterDataCreatedSpineEvent, type MasterDataSpineSubject } from "./master-data-spine-emit.js";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SUBJECT = "473d1f1a-1f57-4d39-b501-642b18f6b6e6";

describe("emitMasterDataCreatedSpineEvent", () => {
  for (const [subjectType, sourceTable] of [
    ["customer", "mdata.customers"],
    ["vendor", "mdata.vendors"],
    ["driver", "mdata.drivers"],
    ["unit", "mdata.units"],
  ] as const) {
    it(`emits canonical ${subjectType}.created lineage`, async () => {
      const query = vi.fn(async () => ({ rows: [] }));

      await emitMasterDataCreatedSpineEvent({ query }, {
        operating_company_id: COMPANY,
        actor_user_id: ACTOR,
        subject_type: subjectType as MasterDataSpineSubject,
        subject_id: SUBJECT,
        payload: { label: "USMCA smoke" },
      });

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, values] = query.mock.calls[0]!;
      expect(sql).toContain("events.log_event(");
      expect(values.slice(0, 6)).toEqual([
        COMPANY,
        `${subjectType}.created`,
        ACTOR,
        subjectType,
        SUBJECT,
        JSON.stringify({ label: "USMCA smoke" }),
      ]);
      expect(values[6]).toBe(sourceTable);
      expect(values[7]).toBe(SUBJECT);
      expect(values[8]).toBe(ACTOR);
      expect(values[9]).toEqual(expect.any(String));
    });
  }

  it("fails the caller transaction when the immutable spine write fails", async () => {
    const failure = new Error("valid_subject_type");
    const query = vi.fn(async () => { throw failure; });

    await expect(emitMasterDataCreatedSpineEvent({ query }, {
      operating_company_id: COMPANY,
      actor_user_id: ACTOR,
      subject_type: "customer",
      subject_id: SUBJECT,
    })).rejects.toBe(failure);
  });
});
