import { describe, expect, it } from "vitest";
import { createMatter } from "../matters.service";

const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const LAWSUIT_MATTER_ID = "22222222-2222-4222-8222-222222222222";
const CHILD_MATTER_ID = "33333333-3333-4333-8333-333333333333";

/**
 * ENG-60 / Codex batch50 — picker emits legal.matters (type=lawsuit) IDs.
 * Writer must validate that domain (not insurance.lawsuit) and persist the FK.
 */
function mockClient(opts: { lawsuitFound: boolean }) {
  const sqlLog: string[] = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      sqlLog.push(sql);
      if (/set_config\('app\.operating_company_id'/.test(sql)) return { rows: [] };
      if (/FROM legal\.matters[\s\S]*type = 'lawsuit'/.test(sql)) {
        expect(values?.[0]).toBe(LAWSUIT_MATTER_ID);
        expect(values?.[1]).toBe(COMPANY);
        return { rows: opts.lawsuitFound ? [{ id: LAWSUIT_MATTER_ID }] : [] };
      }
      if (/INSERT INTO legal\.matters/.test(sql)) {
        expect(values).toContain(LAWSUIT_MATTER_ID);
        return {
          rows: [
            {
              id: CHILD_MATTER_ID,
              operating_company_id: COMPANY,
              matter_number: "MAT-ENG60-1",
              type: "claim",
              insurance_lawsuit_id: LAWSUIT_MATTER_ID,
            },
          ],
        };
      }
      if (/INSERT INTO legal\.matter_events/.test(sql) || /audit/i.test(sql) || /INSERT INTO/.test(sql)) {
        return { rows: [{ id: "evt-1" }] };
      }
      // Fail closed on unexpected retired table access
      if (/insurance\.lawsuit/.test(sql)) {
        throw new Error(`unexpected insurance.lawsuit access: ${sql.slice(0, 120)}`);
      }
      return { rows: [] };
    },
  };
  return { client, sqlLog };
}

describe("ENG-60 lawsuit picker → writer", () => {
  it("accepts a legal.matters type=lawsuit id from the picker domain", async () => {
    const { client, sqlLog } = mockClient({ lawsuitFound: true });
    const row = await createMatter(client, {
      operatingCompanyId: COMPANY,
      actorUserId: ACTOR,
      body: {
        matter_number: "MAT-ENG60-1",
        type: "claim",
        insurance_lawsuit_id: LAWSUIT_MATTER_ID,
      },
    });
    expect(row.insurance_lawsuit_id).toBe(LAWSUIT_MATTER_ID);
    expect(sqlLog.some((s) => /FROM legal\.matters/.test(s) && /type = 'lawsuit'/.test(s))).toBe(true);
    expect(sqlLog.some((s) => /insurance\.lawsuit/.test(s))).toBe(false);
  });

  it("rejects when the picker id is not a company-scoped lawsuit matter", async () => {
    const { client, sqlLog } = mockClient({ lawsuitFound: false });
    await expect(
      createMatter(client, {
        operatingCompanyId: COMPANY,
        actorUserId: ACTOR,
        body: {
          matter_number: "MAT-ENG60-2",
          type: "claim",
          insurance_lawsuit_id: LAWSUIT_MATTER_ID,
        },
      }),
    ).rejects.toMatchObject({ code: "linked_entity_not_in_operating_company" });
    expect(sqlLog.some((s) => /FROM legal\.matters/.test(s))).toBe(true);
    expect(sqlLog.some((s) => /insurance\.lawsuit/.test(s))).toBe(false);
  });
});
