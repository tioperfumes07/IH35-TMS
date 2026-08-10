#!/usr/bin/env node
/**
 * GUARD: an operator-facing error reply must carry a readable `message`, never only a machine code.
 *
 * FAIL-U1, second surface. `canAssignLoadToDriver` returns both uuids AND human labels
 * (`work_order_display_id`, `asset_label`), and LoadCreateModal's pre-check panel shows them. The
 * /quick-assign 409 — the SAME interlock, reached from the dispatch board instead of the create
 * modal — hand-built a subset of that object, kept only the uuids, and shipped no `message` at all.
 * DispatchBoard's catch toasts `data.message ?? data.error`, so the dispatcher's red toast read the
 * literal string `E_DRIVER_REPAIR_BLOCK` while the readable sentence sat one field away in
 * `blocker`.
 *
 * IN SCOPE: any `reply.code(4xx|5xx).send({...})` whose object literal sets `error:` to an
 *           E_-prefixed or SCREAMING_SNAKE code.
 * ASSERTS:  the same object also sets `message` (or `blocker`/`reason`/`detail` — a named human
 *           field). A code alone is not something an operator can act on.
 *
 * The 28 pre-existing sites this guard found are held at a per-file RATCHET (below) that may only
 * shrink — a stale ceiling is itself a failure, so a fix cannot be made and then forgotten.
 *
 * Run:  node scripts/verify-blocker-errors-carry-message.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "apps/backend/src");
const LABEL = "verify-blocker-errors-carry-message";

/** Human-readable payload fields. Any ONE of these makes the reply actionable. */
const HUMAN_FIELDS = ["message", "blocker", "reason", "detail", "details", "hint"];

/**
 * RATCHET — the pre-existing sites, per file, measured 2026-08-09 when this guard was written.
 *
 * The guard was built for ONE defect (the /quick-assign 409) and immediately found 28 more across
 * dispatch, settlements, safety, maintenance and accounting. Both alternatives to a ratchet are
 * wrong: shipping it red fails the build on work nobody has done, and blind-fixing 28 surfaces means
 * inventing 28 operator sentences without knowing what each interlock actually means to the person
 * reading it. Each of these needs a JUDGED message, one surface at a time.
 *
 * Counts may only SHRINK. Lowering a number is the unit of progress; raising one is a visible edit.
 */
const KNOWN_GAPS = new Map([
  ["apps/backend/src/settlements/team-splits/team-splits.routes.ts", 8],
  ["apps/backend/src/driver-finance/settlement-dispute.routes.ts", 5],
  ["apps/backend/src/dispatch/dispatch-refinements.routes.ts", 5],
  ["apps/backend/src/routes/safety/complaints.ts", 3],
  ["apps/backend/src/mdata/units.routes.ts", 1],
  ["apps/backend/src/mdata/equipment-transfer.routes.ts", 1],
  ["apps/backend/src/mdata/driver-team-split.routes.ts", 1],
  ["apps/backend/src/maintenance/work-orders.routes.ts", 1],
  ["apps/backend/src/maintenance/parts-invoice-links.routes.ts", 1],
  ["apps/backend/src/dispatch/quicksave.routes.ts", 1],
  ["apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts", 1],
]);

const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

/** Balanced object literal starting at `{`. A regex cannot do this — nested objects are normal here. */
export function objectLiteralAt(code, braceIndex) {
  let depth = 0;
  for (let i = braceIndex; i < code.length; i += 1) {
    const c = code[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(braceIndex, i + 1);
    }
  }
  return code.slice(braceIndex);
}

/** Only the TOP level of the literal — a nested `message` belongs to some other sub-object. */
export function topLevelKeys(objectLiteral) {
  const keys = [];
  let depth = 0;
  const body = objectLiteral;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if ("{[(".includes(c)) depth += 1;
    else if ("}])".includes(c)) depth -= 1;
    else if (depth === 1) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(i));
      if (m && (i === 0 || /[{,\s]/.test(body[i - 1]))) {
        keys.push(m[1]);
        i += m[0].length - 1;
      }
    }
  }
  return keys;
}

/** SCREAMING_SNAKE or E_-prefixed string literal = a machine code, not operator text. */
export function isMachineCode(objectLiteral) {
  const m = /\berror\s*:\s*["'`]([^"'`]+)["'`]/.exec(objectLiteral);
  if (!m) return false;
  const v = m[1];
  return /^E_[A-Z0-9_]+$/.test(v) || /^[A-Z][A-Z0-9_]{3,}$/.test(v);
}

export function collectProblems(files) {
  const problems = [];
  const bare = new Map(); // rel -> [codeName…]

  for (const { rel, src } of files) {
    const code = strip(src);
    const re = /reply\s*\.\s*code\s*\(\s*([45]\d\d)\s*\)\s*\.\s*send\s*\(\s*\{/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const brace = code.indexOf("{", m.index + m[0].length - 1);
      const lit = objectLiteralAt(code, brace);
      if (!isMachineCode(lit)) continue;
      if (HUMAN_FIELDS.some((k) => topLevelKeys(lit).includes(k))) continue;

      const codeName = /\berror\s*:\s*["'`]([^"'`]+)["'`]/.exec(lit)?.[1] ?? "?";
      if (!bare.has(rel)) bare.set(rel, []);
      bare.get(rel).push(`${m[1]} ${codeName}`);
    }
  }

  for (const [rel, codes] of bare) {
    const allowed = KNOWN_GAPS.get(rel) ?? 0;
    if (codes.length > allowed) {
      problems.push(
        `${rel}: ${codes.length} machine-code-only error replies, ratchet allows ${allowed} — ` +
          `${codes.join(", ")}. A FE catch that toasts \`data.message ?? data.error\` shows the operator ` +
          `the raw code (FAIL-U1: dispatchers were toasted "E_DRIVER_REPAIR_BLOCK"). Add the readable ` +
          `sentence, plus any human LABEL the source already computed — never only uuids.`
      );
    }
  }
  // A ratchet that is never lowered is decoration; a stale entry hides a fix that already happened.
  for (const [rel, allowed] of KNOWN_GAPS) {
    const actual = bare.get(rel)?.length ?? 0;
    if (files.some((f) => f.rel === rel) && actual < allowed) {
      problems.push(
        `${rel}: only ${actual} bare replies remain but the ratchet still allows ${allowed}. Lower it to ` +
          `${actual} so the gap cannot silently regrow.`
      );
    }
  }
  return problems;
}

function readTree() {
  return walk(DIR).map((f) => ({ rel: path.relative(root, f), src: fs.readFileSync(f, "utf8") }));
}

function selftest() {
  const mk = (rel, src) => ({ rel, src });
  const cases = [
    { name: "real tree passes", files: null, expect: 0 },
    {
      name: "the original 409 shape is caught",
      files: [mk("a.ts", `reply.code(409).send({ error: "E_DRIVER_REPAIR_BLOCK", work_order_id: x, asset_id: y });`)],
      expectAtLeast: 1,
    },
    {
      name: "the fixed shape passes",
      files: [mk("a.ts", `reply.code(409).send({ error: "E_DRIVER_REPAIR_BLOCK", message: m, asset_label: l });`)],
      expect: 0,
    },
    {
      name: "blocker counts as human",
      files: [mk("a.ts", `reply.code(409).send({ error: "E_X_Y_Z", blocker: b });`)],
      expect: 0,
    },
    {
      name: "a ratcheted file at its ceiling passes",
      files: [mk("apps/backend/src/mdata/units.routes.ts", `reply.code(409).send({ error: "E_UNIT_HAS_OPEN_WO", id });`)],
      expect: 0,
    },
    {
      name: "a ratcheted file ABOVE its ceiling is caught",
      files: [
        mk(
          "apps/backend/src/mdata/units.routes.ts",
          `reply.code(409).send({ error: "E_UNIT_HAS_OPEN_WO", id }); reply.code(400).send({ error: "E_OTHER_THING", id });`
        ),
      ],
      expectAtLeast: 1,
    },
    {
      name: "a ratcheted file that got FIXED must lower its number",
      files: [mk("apps/backend/src/mdata/units.routes.ts", `reply.code(409).send({ error: "E_UNIT_HAS_OPEN_WO", message: m });`)],
      expectAtLeast: 1,
    },
    {
      name: "lowercase snake error slug is not a machine code",
      files: [mk("a.ts", `reply.code(400).send({ error: "validation_error" });`)],
      expect: 0,
    },
    {
      name: "a NESTED message does not satisfy the top level",
      files: [mk("a.ts", `reply.code(409).send({ error: "E_A_B", context: { message: "x" } });`)],
      expectAtLeast: 1,
    },
    {
      name: "2xx replies are out of scope",
      files: [mk("a.ts", `reply.code(200).send({ error: "E_A_B" });`)],
      expect: 0,
    },
    {
      name: "commented-out reply does not count",
      files: [mk("a.ts", `// reply.code(409).send({ error: "E_A_B", id: 1 });`)],
      expect: 0,
    },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = collectProblems(c.files ?? readTree());
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(DIR)) {
    console.error(`${LABEL}: FAIL — ${DIR} not found`);
    return 1;
  }
  const problems = collectProblems(readTree());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  for (const [file, n] of KNOWN_GAPS) console.log(`  RATCHET (must shrink) — ${file}: ${n}`);
  return 0;
}

process.exit(main());
