import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("compliance reminder job", () => {
  it("schedules daily cron and logs notifications", () => {
    const src = fs.readFileSync(path.join(here, "../../src/compliance/compliance-reminder.job.ts"), "utf8");
    assert.match(src, /0 6 \* \* \*/);
    assert.match(src, /compliance\.notification_log/);
    assert.match(src, /sendEmail/);
  });
});
