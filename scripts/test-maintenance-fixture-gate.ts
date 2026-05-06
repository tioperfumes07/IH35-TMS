import assert from "node:assert/strict";
import { shouldUseDevFixturesForMaintenance } from "../apps/backend/src/maintenance/dev-fixtures.js";

function run() {
  assert.equal(
    shouldUseDevFixturesForMaintenance("production", "1"),
    false,
    "fixture path must be disabled in production"
  );
  assert.equal(
    shouldUseDevFixturesForMaintenance("production", undefined),
    false,
    "fixture path must stay disabled in production when flag missing"
  );
  assert.equal(
    shouldUseDevFixturesForMaintenance("development", "1"),
    true,
    "fixture path should be enabled only in non-production with explicit flag"
  );
  assert.equal(
    shouldUseDevFixturesForMaintenance("development", undefined),
    false,
    "fixture path should not be enabled without explicit flag"
  );
  console.log("PASS: maintenance fixture gate blocks production fixtures.");
}

run();
