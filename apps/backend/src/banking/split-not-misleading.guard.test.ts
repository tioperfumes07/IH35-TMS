import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard (QA-sweep): the banking "/split" route used to silently set
// category='split_transaction' + status='categorized' with NO real line allocation, so a user
// "splitting" a bank transaction got it mis-categorized as a single full-amount placeholder.
// Until a true balanced multi-line split (with a persisted split-lines model) is built, the route
// must perform NO write and must not mis-categorize. These static-source assertions hold that line.
const here = dirname(fileURLToPath(import.meta.url));
const routes = readFileSync(resolve(here, "./banking.routes.ts"), "utf8");

describe("banking split route honesty", () => {
  it("does not silently write the misleading split_transaction category", () => {
    expect(routes).not.toContain("category = 'split_transaction'");
  });

  it("returns an explicit not-implemented response instead", () => {
    expect(routes).toContain("split_not_implemented");
  });
});
