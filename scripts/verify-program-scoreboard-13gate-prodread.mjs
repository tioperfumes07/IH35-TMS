#!/usr/bin/env node
/**
 * GUARD: Program scoreboard — live prodReadAt + dual-entity 13×2 gate columns (B11).
 *
 * Fails if:
 *  - audit-scoreboard route does not stamp meta.prodReadAt / prodReadSource (Neon now preferred)
 *  - scripts/audit-coverage-scoreboard.mjs lacks computeGateTally / GATE_LABELS_13 / PROGRAM_BOARD_ENTITIES / cellsByEntity emit
 *  - AuditScoreboardPage lacks dual-entity tally + module table columns
 *  - page still hardcodes only "live prod read" without truthful source label
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-program-scoreboard-13gate-prodread";
const SELFTEST = process.argv.includes("--selftest");

const ROUTES = "apps/backend/src/program/audit-scoreboard.routes.ts";
const PAGE = "apps/frontend/src/pages/program/LegacyAuditScoreboardPage.tsx";
const SCRIPT = "scripts/audit-coverage-scoreboard.mjs";
const GEN = "scripts/gen-program-scoreboard.mjs";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertThirteenGateProdRead(sources) {
  const problems = [];
  const routes = sources?.[ROUTES] ?? read(ROUTES);
  const page = sources?.[PAGE] ?? read(PAGE);
  const script = sources?.[SCRIPT] ?? read(SCRIPT);
  const gen = sources?.[GEN] ?? read(GEN);

  if (!/stampProdReadAt|prodReadSource/.test(routes) || !/SELECT now\(\)/i.test(routes)) {
    problems.push(`${ROUTES}: must stamp prodReadAt via Neon SELECT now() (with honest fallback)`);
  }
  if (!/prodReadAt/.test(routes) || !/neon_now/.test(routes)) {
    problems.push(`${ROUTES}: must set meta.prodReadAt + prodReadSource neon_now|request_time`);
  }
  if (!/ensureGateTally|gateTally/.test(routes)) {
    problems.push(`${ROUTES}: must attach meta.gateTally on the response`);
  }
  if (!/computeGateTally|GATE_LABELS_13/.test(script)) {
    problems.push(`${SCRIPT}: must export computeGateTally + GATE_LABELS_13`);
  }
  if (!/PROGRAM_BOARD_ENTITIES|cellsByEntity|computeGateTallyByEntity/.test(script)) {
    problems.push(`${SCRIPT}: must emit cellsByEntity for TRANSP+USMCA (B11 dual-entity columns)`);
  }
  if (!/cellsByEntity/.test(gen)) {
    problems.push(`${GEN}: must require cellsByEntity TRANSP+USMCA on each module`);
  }
  if (!/T-05: program-scoreboard.json must not have/.test(gen)) {
    problems.push(`${GEN}: T-05 — refuse a program-scoreboard.json \`rows\` key (class-scoreboard owns rows)`);
  }
  if (!/program-scoreboard-gate-tally/.test(page)) {
    problems.push(`${PAGE}: must render data-testid=program-scoreboard-gate-tally`);
  }
  if (!/program-scoreboard-gate-tally-\$\{ent\}|program-scoreboard-col-\$\{ent\}/.test(page) &&
      !/program-scoreboard-gate-tally-TRANSP|program-scoreboard-col-TRANSP/.test(page)) {
    problems.push(`${PAGE}: must render TRANSP+USMCA entity columns (not folded 13 alone)`);
  }
  if (!/gateTally/.test(page) || !/GATE_LABELS\.map/.test(page)) {
    problems.push(`${PAGE}: must map GATE_LABELS into the gate strips`);
  }
  if (!/neon_now|prodReadLabel|live prod read \(Neon/.test(page)) {
    problems.push(`${PAGE}: must label prod-read source truthfully (Neon vs seed/request)`);
  }
  if (/\b(bg-blue|text-blue|purple|indigo)-\d/.test(page)) {
    problems.push(`${PAGE}: §7 palette — no blue/purple utility classes on scoreboard`);
  }
  return problems;
}

function runBaseContract() {
  const r = spawnSync(process.execPath, ["scripts/verify-program-audit-scoreboard-api-url.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if ((r.status ?? 1) !== 0) {
    console.error((r.stdout || "") + (r.stderr || ""));
    return false;
  }
  return true;
}

if (SELFTEST) {
  const live = assertThirteenGateProdRead();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL — live unclean:\n` + live.join("\n"));
    process.exit(1);
  }
  const planted = {
    [ROUTES]: read(ROUTES).replace(/SELECT now\(\)/gi, "SELECT 1"),
    [PAGE]: read(PAGE)
      .replace(/program-scoreboard-gate-tally/g, "program-scoreboard-gate-MISSING")
      .replace(/program-scoreboard-col-\$\{ent\}/g, "MISSING-COL")
      .replace(/BOARD_ENTITIES/g, "FOLDED_ONLY"),
    [SCRIPT]: read(SCRIPT).replace(/cellsByEntity/g, "cellsFOLDED"),
  };
  const caught = assertThirteenGateProdRead(planted);
  if (!caught.some((p) => /SELECT now|gate-tally|cellsByEntity|TRANSP/i.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — planted defects not caught`);
    process.exit(1);
  }
  const mod = await import(pathToFileURL(path.join(ROOT, SCRIPT)).href);
  const t = mod.computeGateTally([{ cells: Array(13).fill("PASS") }]);
  if (mod.GATE_LABELS_13.length !== 13 || t.A.pass !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — computeGateTally`);
    process.exit(1);
  }
  if (!Array.isArray(mod.PROGRAM_BOARD_ENTITIES) || mod.PROGRAM_BOARD_ENTITIES.length !== 2) {
    console.error(`${LABEL} SELFTEST FAIL — PROGRAM_BOARD_ENTITIES`);
    process.exit(1);
  }
  const by = mod.computeGateTallyByEntity([
    {
      cells: Array(13).fill("FAIL"),
      cellsByEntity: { TRANSP: Array(13).fill("PASS"), USMCA: Array(13).fill("UNV") },
    },
  ]);
  if (by.TRANSP.A.pass !== 1 || by.USMCA.A.unverified !== 1) {
    console.error(`${LABEL} SELFTEST FAIL — computeGateTallyByEntity`, by);
    process.exit(1);
  }
  if (mod.worstGate("FAIL", "PASS") !== "FAIL") {
    console.error(`${LABEL} SELFTEST FAIL — worstGate`);
    process.exit(1);
  }
  if (!runBaseContract()) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertThirteenGateProdRead();
if (problems.length) {
  console.error(`${LABEL} FAIL:\n` + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`${LABEL} PASS`);
