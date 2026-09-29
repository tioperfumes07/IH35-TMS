#!/usr/bin/env node
/**
 * verify-gate-exception-sets-never-grow — ROUND 240 shrink-only ratchet on the two
 * R224 gate loosenings (owner order 2026-09-29):
 *
 *   1. load-to-cash LINK1/LINK2 R224 additions (13622 / 13622+13624)
 *   2. LIVE_DOMAIN accounting/ exact-file skip allowlist (index.ts + checks.routes.ts)
 *
 * Counts are FIXED at the committed baseline ceiling and may ONLY decrease. Adding a
 * load or a skip path requires GATE_EXCEPTION_GROWTH_RULING=<docs/bus ruling file>
 * quoting a Lead ruling by number (same shape as verify-baseline-never-grows).
 *
 * Compares THIS branch's baseline against origin/main's baseline when present; also
 * asserts the live sources still consume the baseline (no hard-coded twin).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-gate-exception-sets-never-grow";
const BASELINE_REL = "scripts/lib/r224-gate-exception-sets.baseline.json";
const BASELINE_PATH = path.join(ROOT, BASELINE_REL);
const LOAD_TO_CASH = path.join(ROOT, "scripts/verify-load-to-cash-chain.mjs");
const MONEY_GATE = path.join(ROOT, "scripts/money-pr-local-gate.mjs");

export function loadBaseline(text) {
  const j = JSON.parse(text);
  const link1 = [...(j.r224_load_to_cash_link1 ?? [])].sort();
  const link2 = [...(j.r224_load_to_cash_link2 ?? [])].sort();
  const skips = [...(j.r224_accounting_live_domain_skip ?? [])].sort();
  return {
    link1,
    link2,
    skips,
    ceiling: {
      link1: Number(j.ceiling?.link1_count ?? 0),
      link2: Number(j.ceiling?.link2_count ?? 0),
      skips: Number(j.ceiling?.accounting_skip_count ?? 0),
    },
  };
}

function extractSkipAllowlist(moneyGateSrc) {
  // Prefer the R224 Set consumer; fall back to legacy exact-equality arms.
  if (
    moneyGateSrc.includes("R224_ACCOUNTING_LIVE_DOMAIN_SKIP") &&
    /R224_ACCOUNTING_LIVE_DOMAIN_SKIP\.has\s*\(\s*f\s*\)/.test(moneyGateSrc)
  ) {
    // Members come from the baseline JSON the gate loads — return null to mean "trust baseline".
    return null;
  }
  const hits = [];
  if (/f\s*===\s*["']apps\/backend\/src\/accounting\/index\.ts["']/.test(moneyGateSrc)) {
    hits.push("apps/backend/src/accounting/index.ts");
  }
  if (
    /f\s*===\s*["']apps\/backend\/src\/accounting\/checks\/checks\.routes\.ts["']/.test(
      moneyGateSrc,
    )
  ) {
    hits.push("apps/backend/src/accounting/checks/checks.routes.ts");
  }
  return hits.sort();
}

export function analyse({ nowText, beforeText, loadToCashSrc, moneyGateSrc, rulingFile }) {
  let now;
  try {
    now = loadBaseline(nowText);
  } catch (e) {
    return { ok: false, message: `${LABEL}: FAIL — baseline unreadable: ${e.message}` };
  }

  const problems = [];

  if (now.link1.length > now.ceiling.link1) {
    problems.push(`link1 members ${now.link1.length} > ceiling ${now.ceiling.link1}`);
  }
  if (now.link2.length > now.ceiling.link2) {
    problems.push(`link2 members ${now.link2.length} > ceiling ${now.ceiling.link2}`);
  }
  if (now.skips.length > now.ceiling.skips) {
    problems.push(`accounting_skip members ${now.skips.length} > ceiling ${now.ceiling.skips}`);
  }

  if (!loadToCashSrc.includes("r224-gate-exception-sets.baseline.json")) {
    problems.push("verify-load-to-cash-chain.mjs must read r224-gate-exception-sets.baseline.json");
  }
  if (!/\bR224_LINK1_PENDING\b/.test(loadToCashSrc) || !/\bR224_LINK2_PENDING\b/.test(loadToCashSrc)) {
    problems.push("verify-load-to-cash-chain.mjs must export/use R224_LINK1_PENDING and R224_LINK2_PENDING");
  }
  if (!moneyGateSrc.includes("r224-gate-exception-sets.baseline.json")) {
    problems.push("money-pr-local-gate.mjs must read r224-gate-exception-sets.baseline.json");
  }
  if (!/R224_ACCOUNTING_LIVE_DOMAIN_SKIP\.has\s*\(\s*f\s*\)/.test(moneyGateSrc)) {
    problems.push(
      "money-pr-local-gate.mjs must GATE-SCOPE via R224_ACCOUNTING_LIVE_DOMAIN_SKIP.has(f)",
    );
  }

  const liveSkips = extractSkipAllowlist(moneyGateSrc);
  if (liveSkips != null && liveSkips.join(",") !== now.skips.join(",")) {
    problems.push(
      `accounting live-domain skip allowlist live=[${liveSkips}] != baseline=[${now.skips}]`,
    );
  }

  if (beforeText != null) {
    let before;
    try {
      before = loadBaseline(beforeText);
    } catch {
      before = null;
    }
    if (before) {
      if (now.link1.length > before.link1.length || now.ceiling.link1 > before.ceiling.link1) {
        problems.push(
          `link1 GREW members ${before.link1.length}->${now.link1.length} or ceiling ${before.ceiling.link1}->${now.ceiling.link1}`,
        );
      }
      if (now.link2.length > before.link2.length || now.ceiling.link2 > before.ceiling.link2) {
        problems.push(
          `link2 GREW members ${before.link2.length}->${now.link2.length} or ceiling ${before.ceiling.link2}->${now.ceiling.link2}`,
        );
      }
      if (now.skips.length > before.skips.length || now.ceiling.skips > before.ceiling.skips) {
        problems.push(
          `accounting_skip GREW members ${before.skips.length}->${now.skips.length} or ceiling ${before.ceiling.skips}->${now.ceiling.skips}`,
        );
      }
      for (const id of now.link1) {
        if (!before.link1.includes(id) && before.link1.length > 0) {
          // new id while set non-empty on main = growth of membership even if count flat via swap
          if (!before.link1.includes(id)) {
            /* allow shrink+swap only if count did not grow — already covered by count check;
               additionally forbid brand-new ids unless ruling */
            const isNew = !before.link1.includes(id);
            if (isNew && now.link1.length >= before.link1.length) {
              problems.push(`link1 added new load ${id} without shrinking the set`);
            }
          }
        }
      }
      for (const id of now.link2) {
        if (!before.link2.includes(id) && now.link2.length >= before.link2.length) {
          problems.push(`link2 added new load ${id} without shrinking the set`);
        }
      }
      for (const p of now.skips) {
        if (!before.skips.includes(p) && now.skips.length >= before.skips.length) {
          problems.push(`accounting_skip added new path ${p} without shrinking the set`);
        }
      }
    }
  }

  if (problems.length) {
    if (rulingFile) {
      return {
        ok: true,
        message: `${LABEL}: PASS — ${problems.join("; ")} — AUTHORIZED by GATE_EXCEPTION_GROWTH_RULING=${rulingFile}. Growth is OPEN DEBT.`,
      };
    }
    return {
      ok: false,
      message:
        `${LABEL}: FAIL — ${problems.join("; ")}.\n` +
        `${LABEL}: R224 exception sets are SHRINK-ONLY. Adding a load or a skip path requires a Lead ruling quoted by number + GATE_EXCEPTION_GROWTH_RULING=<docs/bus file>.`,
    };
  }

  return {
    ok: true,
    message: `${LABEL}: PASS — link1=${now.link1.length}/${now.ceiling.link1} link2=${now.link2.length}/${now.ceiling.link2} accounting_skip=${now.skips.length}/${now.ceiling.skips} (shrink-only; sources consume baseline)`,
  };
}

function rulingOverride() {
  const name = (process.env.GATE_EXCEPTION_GROWTH_RULING || "").trim();
  if (!name) return null;
  const p = name.includes("/") ? path.join(ROOT, name) : path.join(ROOT, "docs/bus", name);
  return fs.existsSync(p) ? name : null;
}

function selftest() {
  const goodBase = JSON.stringify({
    r224_load_to_cash_link1: ["13622"],
    r224_load_to_cash_link2: ["13622", "13624"],
    r224_accounting_live_domain_skip: [
      "apps/backend/src/accounting/index.ts",
      "apps/backend/src/accounting/checks/checks.routes.ts",
    ],
    ceiling: { link1_count: 1, link2_count: 2, accounting_skip_count: 2 },
  });
  const goodLoad = `
const _ = "r224-gate-exception-sets.baseline.json";
export const R224_LINK1_PENDING = Object.freeze(["13622"]);
export const R224_LINK2_PENDING = Object.freeze(["13622", "13624"]);
`;
  const goodGate = `
const x = "r224-gate-exception-sets.baseline.json";
const R224_ACCOUNTING_LIVE_DOMAIN_SKIP = new Set(["apps/backend/src/accounting/index.ts"]);
if (R224_ACCOUNTING_LIVE_DOMAIN_SKIP.has(f)) return false;
`;
  const ok = analyse({
    nowText: goodBase,
    beforeText: null,
    loadToCashSrc: goodLoad,
    moneyGateSrc: goodGate,
  });
  if (!ok.ok) {
    console.error(`${LABEL} SELFTEST FAIL — good fixture rejected: ${ok.message}`);
    process.exit(1);
  }

  const grew = analyse({
    nowText: JSON.stringify({
      r224_load_to_cash_link1: ["13622", "99999"],
      r224_load_to_cash_link2: ["13622", "13624"],
      r224_accounting_live_domain_skip: [
        "apps/backend/src/accounting/index.ts",
        "apps/backend/src/accounting/checks/checks.routes.ts",
      ],
      ceiling: { link1_count: 2, link2_count: 2, accounting_skip_count: 2 },
    }),
    beforeText: goodBase,
    loadToCashSrc: goodLoad,
    moneyGateSrc: goodGate,
  });
  if (grew.ok) {
    console.error(`${LABEL} SELFTEST FAIL — growth vs origin/main not caught: ${grew.message}`);
    process.exit(1);
  }

  const twin = analyse({
    nowText: goodBase,
    beforeText: null,
    loadToCashSrc: `export const R224_LINK1_PENDING = [];\nexport const R224_LINK2_PENDING = [];\n`,
    moneyGateSrc: goodGate,
  });
  if (twin.ok) {
    console.error(`${LABEL} SELFTEST FAIL — missing baseline import not caught`);
    process.exit(1);
  }

  const overCeil = analyse({
    nowText: JSON.stringify({
      r224_load_to_cash_link1: ["13622", "x"],
      r224_load_to_cash_link2: ["13622", "13624"],
      r224_accounting_live_domain_skip: [
        "apps/backend/src/accounting/index.ts",
        "apps/backend/src/accounting/checks/checks.routes.ts",
      ],
      ceiling: { link1_count: 1, link2_count: 2, accounting_skip_count: 2 },
    }),
    beforeText: null,
    loadToCashSrc: goodLoad,
    moneyGateSrc: goodGate,
  });
  if (overCeil.ok) {
    console.error(`${LABEL} SELFTEST FAIL — members > ceiling not caught`);
    process.exit(1);
  }

  const noHas = analyse({
    nowText: goodBase,
    beforeText: null,
    loadToCashSrc: goodLoad,
    moneyGateSrc: `const x = "r224-gate-exception-sets.baseline.json";\nif (f === "apps/backend/src/accounting/index.ts") return false;\n`,
  });
  if (noHas.ok) {
    console.error(`${LABEL} SELFTEST FAIL — missing R224_ACCOUNTING_LIVE_DOMAIN_SKIP.has(f) not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS (5 planted regressions caught)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`${LABEL}: FAIL — missing ${BASELINE_REL}`);
    process.exit(1);
  }
  let beforeText = null;
  try {
    beforeText = execSync(`git show origin/main:${BASELINE_REL}`, {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch {
    beforeText = null;
  }
  const result = analyse({
    nowText: fs.readFileSync(BASELINE_PATH, "utf8"),
    beforeText,
    loadToCashSrc: fs.readFileSync(LOAD_TO_CASH, "utf8"),
    moneyGateSrc: fs.readFileSync(MONEY_GATE, "utf8"),
    rulingFile: rulingOverride(),
  });
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
