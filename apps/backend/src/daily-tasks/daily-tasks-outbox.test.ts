import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("daily tasks service outbox emissions", () => {
  it("does not emit email.queued from service-level alerts", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const filePath = path.resolve(here, "./daily-tasks.service.ts");
    const source = readFileSync(filePath, "utf8");
    expect(source).not.toContain('"email.queued"');
  });
});
