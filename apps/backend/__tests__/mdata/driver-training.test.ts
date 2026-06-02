import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "../../src/mdata/driver-training.routes.ts"), "utf8");

describe("driver training routes", () => {
  it("exposes CRUD endpoints under mdata drivers", () => {
    assert.match(routes, /\/training/);
    assert.match(routes, /archive/);
    assert.match(routes, /safety\.training_records/);
  });
});
