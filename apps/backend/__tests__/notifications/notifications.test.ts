import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(here, "../../../../db/migrations/0309_notification_center.sql"), "utf8");
const routes = fs.readFileSync(path.join(here, "../../src/notifications/notifications.routes.ts"), "utf8");
const reminder = fs.readFileSync(path.join(here, "../../src/compliance/compliance-reminder.job.ts"), "utf8");

describe("notification center backend", () => {
  it("migration defines per-user RLS on user_notifications", () => {
    assert.match(migration, /user_notif_isolation/);
    assert.match(migration, /user_id = current_setting\('app\.current_user_id'/);
    assert.doesNotMatch(migration, /user_notif_isolation[\s\S]*operating_company_id = current_setting\('app\.operating_company_id'/);
  });

  it("routes expose CRUD endpoints", () => {
    assert.match(routes, /\/api\/v1\/notifications\/unread-count/);
    assert.match(routes, /mark-all-read/);
    assert.match(routes, /\/read/);
    assert.match(routes, /\/dismiss/);
  });

  it("compliance reminder creates in_app notifications", () => {
    assert.match(reminder, /createNotification/);
    assert.match(reminder, /in_app/);
  });
});
