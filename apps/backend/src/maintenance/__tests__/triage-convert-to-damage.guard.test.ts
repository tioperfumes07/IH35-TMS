import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard (QA-sweep): the maintenance "Convert to Damage" action used to hit a backend
// route that always returned 501 `damage_conversion_not_implemented`, so users got a generic
// failure toast. It now creates a real safety.incidents damage-report row (reusing the existing
// register, no GL). These static-source assertions keep it from silently reverting to a stub.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../triage.routes.ts"), "utf8");

describe("maintenance triage convert-to-damage", () => {
  it("no longer returns the not-implemented 501 stub", () => {
    expect(source).not.toContain("damage_conversion_not_implemented");
  });

  it("creates a formal damage report by inserting into safety.incidents", () => {
    expect(source).toContain("INSERT INTO safety.incidents");
    expect(source).toContain("promoted_to_damage_report_id = $2");
  });
});
