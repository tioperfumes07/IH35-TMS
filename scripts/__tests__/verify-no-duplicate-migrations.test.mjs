import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findDuplicateMigrationSlugs,
  validateDuplicateMigrationSlugs,
} from "../verify-no-duplicate-migrations.mjs";

test("allows only the historical 0237/0238 duplicate slug pair", () => {
  const duplicates = findDuplicateMigrationSlugs([
    "0237_accounting_ar_collection_tasks.sql",
    "0238_accounting_ar_collection_tasks.sql",
    "0240_seed_cleanup.sql",
  ]);
  const disallowed = validateDuplicateMigrationSlugs(duplicates);
  assert.equal(disallowed.length, 0);
});

test("fails duplicate slugs outside the explicit allowlist", () => {
  const duplicates = findDuplicateMigrationSlugs([
    "0300_example_guard.sql",
    "0301_example_guard.sql",
    "0302_unrelated.sql",
  ]);
  const disallowed = validateDuplicateMigrationSlugs(duplicates);
  assert.equal(disallowed.length, 1);
  assert.equal(disallowed[0].slug, "example_guard.sql");
});

test("fails when a duplicate slug appears more than twice", () => {
  const duplicates = findDuplicateMigrationSlugs([
    "0237_accounting_ar_collection_tasks.sql",
    "0238_accounting_ar_collection_tasks.sql",
    "0239_accounting_ar_collection_tasks.sql",
  ]);
  const disallowed = validateDuplicateMigrationSlugs(duplicates);
  assert.equal(disallowed.length, 1);
  assert.equal(disallowed[0].files.length, 3);
});
