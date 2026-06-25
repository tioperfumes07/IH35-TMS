import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const GUARD = join(ROOT, "scripts", "verify-phantom-relations.mjs");

function runGuard(scanDir) {
  try {
    const out = execFileSync("node", [GUARD], {
      cwd: ROOT,
      env: { ...process.env, PHANTOM_SCAN_DIR: relative(ROOT, scanDir) },
      encoding: "utf8",
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "phantom-guard-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

test("FAILS on a new phantom relation in a real schema", () => {
  // mdata is a real schema; mdata.totally_made_up_table_xyz is not in the canonical snapshot.
  const dir = fixture({ "bad.ts": "const sql = `SELECT * FROM mdata.totally_made_up_table_xyz WHERE id = $1`;" });
  const { code, out } = runGuard(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 1, "guard should exit 1 on a new phantom");
  assert.match(out, /mdata\.totally_made_up_table_xyz/);
});

test("PASSES on a real relation, an alias deref, and a guarded reference", () => {
  const dir = fixture({
    "ok.ts": [
      "const a = `SELECT id FROM mdata.loads l JOIN mdata.customers c ON c.id = l.customer_id`;",
      "const b = `SELECT qa.name FROM mdata.qbo_accounts qa`;", // qa.name is an alias deref, not a relation
      "async function f(client){ if(!(await to_regclass('made_up.guarded_table'))) return; ",
      "  return client.query(`SELECT 1 FROM made_up.guarded_table`); }",
    ].join("\n"),
  });
  const { code, out } = runGuard(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(code, 0, `guard should pass; got:\n${out}`);
});

test("the real backend tree passes (ratchet is green)", () => {
  const { code } = runGuard(join(ROOT, "apps", "backend", "src"));
  assert.equal(code, 0, "backend must have no un-allowlisted phantoms");
});
