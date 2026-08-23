import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "equipment-aggregate.service.ts"), "utf8");

describe("equipment aggregate trailer load history", () => {
  it("reads reverse loads from the canonical entity-scoped trailer assignment FK", () => {
    expect(source).toContain("dispatch.load_assignment_history lah");
    expect(source).toContain("lah.new_trailer_id = $1::uuid");
    expect(source).toContain("lah.operating_company_id = $2::uuid");
    expect(source).toContain("l.operating_company_id = lah.operating_company_id");
    expect(source).toContain("loads: loadsRes.rows");
  });

  it("resolves current load from the latest canonical trailer assignment, not the attached power unit", () => {
    expect(source).toContain("JOIN LATERAL (\n        SELECT lah.new_trailer_id");
    expect(source).toContain("lah.operating_company_id = l.operating_company_id");
    expect(source).toContain("latest_trailer.new_trailer_id = $1::uuid");
    expect(source).not.toContain("WHERE l.assigned_unit_id = $1::uuid");
  });
});
