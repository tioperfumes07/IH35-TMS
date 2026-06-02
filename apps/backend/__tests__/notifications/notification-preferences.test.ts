import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const prefs = fs.readFileSync(path.join(here, "../../src/notifications/notification-preferences.routes.ts"), "utf8");

describe("notification preferences routes", () => {
  it("supports get and patch preferences", () => {
    assert.match(prefs, /GET.*\/api\/v1\/notifications\/preferences/);
    assert.match(prefs, /PATCH.*\/api\/v1\/notifications\/preferences/);
    assert.match(prefs, /email_digest_enabled/);
    assert.match(prefs, /channels_per_type/);
  });
});
