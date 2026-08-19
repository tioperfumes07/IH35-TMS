#!/usr/bin/env node
/**
 * QuickAssignModal must EntityLink load + selected driver/unit/trailer
 * (Exact Leaves dispatch.modal.quick_assign:load|driver|unit|trailer).
 *
 * FAIL: pickers/title only — no EntityLink strip / no loadId prop.
 * PASS: load EntityLink + data-testid=quick-assign-modal-entitylinks; DispatchBoard passes loadId.
 *
 * Self-test: node scripts/verify-quick-assign-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-quick-assign-modal-entitylinks";
const MODAL = path.join(ROOT, "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx");
const BOARD = path.join(ROOT, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkSource(modal) {
  assert(
    /import\s*\{\s*EntityLinkOrTombstone\s*\}\s*from\s*["'][^"']*\/EntityLinkOrTombstone["']/.test(modal),
    "EntityLinkOrTombstone must come from its real module",
  );
  assert(
    !/import\s*\{[^}]*EntityLinkOrTombstone[^}]*\}\s*from\s*["'][^"']*\/EntityLink["']/.test(modal),
    "must not import EntityLinkOrTombstone from EntityLink",
  );
  assert(/EntityLinkOrTombstone/.test(modal), "selected identities must use label-aware tombstones");
  assert(/kind=["']driver["'] id=\{driverId\} name=\{null\} noun=["']Driver["']/.test(modal), "driver must not derive a label from its UUID");
  assert(/kind=["']unit["'] id=\{unitId\} name=\{null\} noun=["']Unit["']/.test(modal), "unit must not derive a label from its UUID");
  assert(/kind=["']trailer["'] id=\{trailerId\} name=\{null\} noun=["']Trailer["']/.test(modal), "trailer must not derive a label from its UUID");
  const board = fs.readFileSync(BOARD, "utf8");
  assert(/EntityLink/.test(modal), "modal must use EntityLink");
  assert(/data-testid=["']quick-assign-load-entitylink["']/.test(modal), "must link load");
  assert(
    /data-testid=["']quick-assign-modal-entitylinks["']/.test(modal),
    "must expose quick-assign-modal-entitylinks"
  );
  assert(/kind=["']driver["']/.test(modal), "must EntityLink kind=driver");
  assert(/kind=["']unit["']/.test(modal), "must EntityLink kind=unit");
  assert(/kind=["']trailer["']/.test(modal), "must EntityLink kind=trailer");
  assert(/loadId=\{quickAssignLoad\.id\}/.test(board), "DispatchBoard must pass loadId");
}

function check() {
  checkSource(fs.readFileSync(MODAL, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(MODAL, "utf8");
  const mutations = [
    [/import \{ EntityLinkOrTombstone \} from "\.\.\/\.\.\/\.\.\/components\/shared\/EntityLinkOrTombstone";/, 'import { EntityLinkOrTombstone } from "../../../components/shared/EntityLink";'],
    [/data-testid=["']quick-assign-modal-entitylinks["']/, 'data-testid="planted-missing"'],
    [/kind="driver" id=\{driverId\} name=\{null\}/, 'kind="driver" id={driverId} name={driverId}'],
    [/kind="unit" id=\{unitId\} name=\{null\}/, 'kind="unit" id={unitId} name={unitId}'],
    [/kind="trailer" id=\{trailerId\} name=\{null\}/, 'kind="trailer" id={trailerId} name={trailerId}'],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = original.replace(pattern, replacement);
    assert(broken !== original, `--selftest plant must mutate ${pattern}`);
    let failed = false;
    try {
      checkSource(broken);
    } catch {
      failed = true;
    }
    assert(failed, `--selftest expected FAIL for ${pattern}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS (${mutations.length} mutations)`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
