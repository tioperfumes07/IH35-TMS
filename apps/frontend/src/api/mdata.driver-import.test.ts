import { describe, expect, it } from "vitest";
import { validateDriverImportResponse } from "./mdata";

const companyId = "5c854333-6ea5-4faa-af31-67cb272fef80";
const summary = { total: 3, will_create: 2, dup_existing: 1, dup_in_file: 0, invalid: 0, will_create_no_phone: 0 };

describe("validateDriverImportResponse", () => {
  it("accepts a complete commit result", () => {
    expect(validateDriverImportResponse({ mode: "commit", operating_company_id: companyId, summary, created: 2, row_errors: 0 }, "commit", companyId)).toMatchObject({ created: 2, row_errors: 0 });
  });

  it.each([
    ["missing counts", { mode: "commit", operating_company_id: companyId, summary }],
    ["wrong company", { mode: "commit", operating_company_id: "wrong", summary, created: 2, row_errors: 0 }],
    ["wrong mode", { mode: "preview", operating_company_id: companyId, summary, sample: [] }],
    ["impossible counts", { mode: "commit", operating_company_id: companyId, summary, created: 2, row_errors: 1 }],
  ])("rejects %s instead of manufacturing a zero-result success", (_label, payload) => {
    expect(() => validateDriverImportResponse(payload, "commit", companyId)).toThrow();
  });
});
