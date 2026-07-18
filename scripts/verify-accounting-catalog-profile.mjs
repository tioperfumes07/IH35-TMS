#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-catalog-profile";

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : null;
}

export function profileErrors({ profile, list, test }) {
  const errors = [];

  if (!profile) {
    errors.push("AccountingCatalogProfileDrawer.tsx missing");
  } else {
    if (!/import \{ ParityDrawer \}/.test(profile) || !/<ParityDrawer\b/.test(profile)) {
      errors.push("profile must use the shared ParityDrawer");
    }
    for (const field of [
      "row.code",
      "row.display_name",
      "row.description",
      "row.is_active",
      "row.sort_order",
      "row.created_at",
      "row.updated_at",
      "row.metadata",
    ]) {
      if (!profile.includes(field)) errors.push(`profile must render ${field}`);
    }
    if (!/\{canEdit \? \([\s\S]*?<Button[^>]*onClick=\{onEdit\}[\s\S]*?>\s*Edit\s*<\/Button>/.test(profile)) {
      errors.push("profile Edit action must be conditional on canEdit");
    }
  }

  if (!list) {
    errors.push("AccountingCatalogListPage.tsx missing");
  } else {
    if (!/setSelectedRow\(row\);\s*setProfileOpen\(true\);/.test(list)) {
      errors.push("row click must select the row and open its profile");
    }
    if (/setSelectedRow\(row\);\s*setModalOpen\(true\);/.test(list)) {
      errors.push("row click must never open the edit modal directly");
    }
    if (!/<AccountingCatalogProfileDrawer[\s\S]*?canEdit=\{!readOnly\}/.test(list)) {
      errors.push("list must mount the profile drawer and suppress Edit for read-only catalogs");
    }
    if (!/onEdit=\{\(\) => \{\s*setProfileOpen\(false\);\s*setModalMode\("edit"\);\s*setModalOpen\(true\);/.test(list)) {
      errors.push("profile Edit must close the profile before opening modal edit mode");
    }
    if (!/!readOnly \? \([\s\S]*?>\s*\+ Create\s*<\/Button>/.test(list)) {
      errors.push("writable catalogs must retain + Create");
    }
  }

  if (!test) {
    errors.push("AccountingCatalogListPage.test.tsx missing");
  } else {
    for (const required of [
      "instead of the edit modal",
      "existing edit modal only through Edit",
      "no Edit or Create action",
      "existing creator for writable catalogs",
      "malformed optional fields safely",
    ]) {
      if (!test.includes(required)) errors.push(`focused test missing: ${required}`);
    }
  }

  return errors;
}

function selftest() {
  const good = {
    profile: `
      import { ParityDrawer } from "x";
      <ParityDrawer>
        {row.code}{row.display_name}{row.description}{row.is_active}
        {row.sort_order}{row.created_at}{row.updated_at}{row.metadata}
        {canEdit ? (<Button onClick={onEdit}>Edit</Button>) : null}
      </ParityDrawer>
    `,
    list: `
      !readOnly ? (<Button>+ Create</Button>) : undefined
      setSelectedRow(row);
      setProfileOpen(true);
      <AccountingCatalogProfileDrawer canEdit={!readOnly}
        onEdit={() => {
          setProfileOpen(false);
          setModalMode("edit");
          setModalOpen(true);
        }}
      />
    `,
    test: `
      instead of the edit modal
      existing edit modal only through Edit
      no Edit or Create action
      existing creator for writable catalogs
      malformed optional fields safely
    `,
  };
  const planted = [
    ["direct-edit row regression", { ...good, list: good.list.replace("setProfileOpen(true);", "setModalOpen(true);") }, "row click"],
    ["read-only Edit regression", { ...good, profile: good.profile.replace("{canEdit ? (", "{true ? (") }, "conditional on canEdit"],
    ["missing timestamp", { ...good, profile: good.profile.replace("{row.updated_at}", "") }, "row.updated_at"],
    ["creator removed", { ...good, list: good.list.replace("!readOnly ? (<Button>+ Create</Button>) : undefined", "") }, "retain + Create"],
    ["missing behavior test", { ...good, test: good.test.replace("no Edit or Create action", "") }, "focused test missing"],
  ];

  const goodErrors = profileErrors(good);
  const missed = planted.filter(([, fixture, expected]) => !profileErrors(fixture).some((error) => error.includes(expected)));
  if (goodErrors.length || missed.length) {
    console.error(`${LABEL} SELFTEST FAILED`);
    for (const error of goodErrors) console.error(`  good fixture rejected: ${error}`);
    for (const [name] of missed) console.error(`  planted regression not caught: ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${planted.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = profileErrors({
  profile: read("apps/frontend/src/pages/lists/accounting/AccountingCatalogProfileDrawer.tsx"),
  list: read("apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx"),
  test: read("apps/frontend/src/pages/lists/accounting/__tests__/AccountingCatalogListPage.test.tsx"),
});

if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — rows open profiles; writable Edit is explicit; read-only catalogs stay read-only`);
