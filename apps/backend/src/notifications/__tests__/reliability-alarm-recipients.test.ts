import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// LST-F443363 — identity.users.role is identity.role_enum. Postgres has no `role_enum = text` operator, so
// `u.role = ANY($2::text[])` threw "operator does not exist" on every reliability-alarm run in prod (Render logs
// 10-25-2026 20:49Z) — recipients never loaded, so no on-screen or email alarm ever reached an owner/admin/manager.
const SRC = readFileSync(path.join(__dirname, "..", "reliability-alarm.ts"), "utf8");

describe("reliability-alarm recipients query", () => {
  it("compares the enum role as text against the text[] parameter", () => {
    expect(SRC).toMatch(/u\.role::text\s*=\s*ANY\(\$2::text\[\]\)/);
  });
  it("never compares the bare enum to a text array", () => {
    expect(SRC).not.toMatch(/u\.role\s*=\s*ANY\(\$2::text\[\]\)/);
  });
});

// LST-F443367 — one alarm per source per 24h; test / undeliverable domains never emailed.
import { alarmTitleStem, isDeliverableAlarmAddress, ALARM_REPEAT_WINDOW_HOURS } from "../reliability-alarm.js";

describe("reliability-alarm repeat + address filters", () => {
  it("strips the live count so (1) and (6) are the same alarm", () => {
    expect(alarmTitleStem("Evidence objects MISSING in R2 (6)")).toBe("Evidence objects MISSING in R2");
    expect(alarmTitleStem("Evidence objects MISSING in R2 (1)")).toBe(alarmTitleStem("Evidence objects MISSING in R2 (6)"));
  });
  it("never emails the test / fake addresses that bounced on 10-25", () => {
    for (const bad of ["cc3-test-user-20260822@example.invalid", "devin@ih35.local", "feed@ih35dispatch.com", "x@example.com", "nope"]) {
      expect(isDeliverableAlarmAddress(bad)).toBe(false);
    }
    for (const good of ["tioperfumes07@gmail.com", "dispatch@ih35trucking.net", "mcastillo@tioperfumes.com"]) {
      expect(isDeliverableAlarmAddress(good)).toBe(true);
    }
  });
  it("repeats are suppressed for a full day and the email/SMS/on-screen paths all honour it", () => {
    expect(ALARM_REPEAT_WINDOW_HOURS).toBe(24);
    expect(SRC).toMatch(/if \(wantEmail && repeat\)/);
    expect(SRC).toMatch(/if \(wantSms && repeat\)/);
    expect(SRC).toMatch(/if \(repeat\) \{\s*result\.onScreen/);
  });
});
