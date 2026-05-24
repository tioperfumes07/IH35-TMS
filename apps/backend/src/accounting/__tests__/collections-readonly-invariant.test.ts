import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const servicePath = path.resolve(__dirname, "..", "collections.service.ts");

describe("collections readonly invariant", () => {
  it("does not import posting engine or QBO writer modules", () => {
    const source = fs.readFileSync(servicePath, "utf8");
    expect(source).not.toMatch(/posting-engine/i);
    expect(source).not.toMatch(/journal-entry-qbo-push/i);
    expect(source).not.toMatch(/qbo-writer/i);
    expect(source).not.toMatch(/journal_entries/i);
  });
});
