#!/usr/bin/env node
// DESIGN-CONTRACT guard (owner order 2026-09-05 03:05Z; law:
//   docs/design/DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md
//   reference (pixel truth): docs/design/reference/LOAD-COSTS-BOARD-REFERENCE-2026-09-04.html).
//
// "Prose gets re-interpreted; a stylesheet does not." This guard reads the APPROVED REFERENCE FILE
// as the single source of truth for the shades/weights/borders, then asserts the live code computes
// to those exact values — so the reference and the app can never drift again. It locks:
//   - header th weight 700 (the 400 was reverted; "regular COLOR text" = dark ink, not weight)
//   - the group BAND row is one uniform --grp-bg shade (per-group colour lives on BODY cells)
//   - body per-group tints odd/even == --rev/--rev2, --cost/--cost2, --pay/--pay2, tot-c
//   - "The trip" columns carry NO body tint
//   - header bg --th-bg, KPI bg/bd/height, body td 1px right rule
//
// CI mode = static: values are read from the reference <style> and asserted against tokens.ts,
// LoadCostsBoardPage.tsx and ParityTable.tsx. This runs in verify-steps with no browser/auth.
// LIVE mode (opt-in): set LOAD_COSTS_LIVE_URL to a reachable, already-authenticated FE origin and
// the guard additionally measures the real page with Playwright (getComputedStyle) against the same
// reference values. Never wired to require auth in CI; the deployed re-measurement is pasted by hand.
//
// Usage:
//   node scripts/verify-table-design-contract.mjs [--selftest]
//   LOAD_COSTS_LIVE_URL=https://app.ih35dispatch.com node scripts/verify-table-design-contract.mjs --live

import { readFileSync } from "node:fs";

const REF = "docs/design/reference/LOAD-COSTS-BOARD-REFERENCE-2026-09-04.html";
const TOKENS = "apps/frontend/src/design/tokens.ts";
const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const PARITY = "apps/frontend/src/components/parity/ParityTable.tsx";

const up = (s) => s.toUpperCase();

/** Pull the :root custom properties + a couple of rule-level colours out of the reference stylesheet. */
function readContract(refSrc) {
  const rootBlock = (refSrc.match(/:root\{([\s\S]*?)\}/) ?? [])[1] ?? "";
  const tok = (name) => {
    const m = rootBlock.match(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{3,8})`));
    if (!m) throw new Error(`reference is missing --${name}`);
    return up(m[1]);
  };
  const ruleBg = (sel) => {
    const m = refSrc.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{background:(#[0-9A-Fa-f]{3,8})`));
    if (!m) throw new Error(`reference is missing rule ${sel}`);
    return up(m[1]);
  };
  return {
    thBg: tok("th-bg"),
    grpBg: tok("grp-bg"),
    line: tok("line"),
    line2: tok("line2"),
    kpiBg: tok("kpi-bg"),
    kpiBd: tok("kpi-bd"),
    rev: tok("rev"), rev2: tok("rev2"),
    cost: tok("cost"), cost2: tok("cost2"),
    pay: tok("pay"), pay2: tok("pay2"),
    totC: ruleBg(".tot-c"),
    totC2: ruleBg("tbody tr:nth-child(even) .tot-c"),
  };
}

function auditTokens(src, c) {
  const f = [];
  const has = (key, val) => {
    const m = src.match(new RegExp(`${key}\\s*:\\s*"(#[0-9A-Fa-f]{3,8})"`));
    if (!m) return f.push(`${TOKENS}: token ${key} not found`);
    if (up(m[1]) !== val) f.push(`${TOKENS}: ${key} is ${up(m[1])}, contract requires ${val}`);
  };
  has("tableHeaderBg", c.thBg);
  has("tableGroupBandBg", c.grpBg);
  has("tableColumnRule", c.line2);
  has("tableBodyRule", c.line);
  has("kpiTileBg", c.kpiBg);
  has("kpiTileBorder", c.kpiBd);
  const kh = src.match(/kpiTileMaxHeight\s*:\s*(\d+)/);
  if (!kh) f.push(`${TOKENS}: kpiTileMaxHeight not found`);
  else if (Number(kh[1]) > 101) f.push(`${TOKENS}: kpiTileMaxHeight ${kh[1]} exceeds the 101px ceiling`);
  return f;
}

function auditBoard(src, c) {
  const f = [];
  // Header bg = --th-bg; and the reverted 400 must be gone (weight is owned by ParityTable default 700).
  if (!new RegExp(`headerBg="${c.thBg}"`, "i").test(src)) f.push(`${BOARD}: ParityTable headerBg must be ${c.thBg} (--th-bg)`);
  if (/headerWeight=\{400\}/.test(src)) f.push(`${BOARD}: headerWeight={400} must be removed — the contract reverts to 700`);
  // COLUMN_GROUPS body tints, odd + even, must equal the reference tokens; "The trip" carries no bg.
  const grpBlock = (src.match(/const COLUMN_GROUPS = \[([\s\S]*?)\];/) ?? [])[1] ?? "";
  if (!grpBlock) return [`${BOARD}: COLUMN_GROUPS not found`];
  const trip = grpBlock.match(/label:\s*"The trip"[^}]*\}/);
  if (!trip) f.push(`${BOARD}: "The trip" group not found`);
  else if (/bg:/.test(trip[0])) f.push(`${BOARD}: "The trip" columns must carry NO body tint (no bg) — they are plain zebra in the reference`);
  const pair = (label, bg, bgEven) => {
    const m = grpBlock.match(new RegExp(`label:\\s*"${label}"[\\s\\S]*?\\}`));
    if (!m) return f.push(`${BOARD}: group "${label}" not found`);
    if (!new RegExp(`bg:\\s*"${bg}"`, "i").test(m[0])) f.push(`${BOARD}: group "${label}" bg must be ${bg}`);
    if (!new RegExp(`bgEven:\\s*"${bgEven}"`, "i").test(m[0])) f.push(`${BOARD}: group "${label}" bgEven must be ${bgEven}`);
  };
  pair("Revenue", c.rev, c.rev2);
  pair("Trip expense", c.cost, c.cost2);
  pair("Driver pay", c.pay, c.pay2);
  // Gross uses the tot-c shade odd/even.
  if (!new RegExp(`keys:\\s*\\["gross"\\][^}]*bg:\\s*"${c.totC}"`, "i").test(grpBlock))
    f.push(`${BOARD}: gross group bg must be the tot-c shade ${c.totC}`);
  if (!new RegExp(`keys:\\s*\\["gross"\\][^}]*bgEven:\\s*"${c.totC2}"`, "i").test(grpBlock))
    f.push(`${BOARD}: gross group bgEven must be the even tot-c shade ${c.totC2}`);
  return f;
}

function auditParity(src) {
  const f = [];
  // Band row is uniform --grp-bg (must NOT paint per-group cell.bg).
  if (/backgroundColor:\s*cell\.bg\s*\?\?/.test(src))
    f.push(`${PARITY}: the group band row must be uniform colors.tableGroupBandBg, not per-group cell.bg`);
  if (!/backgroundColor:\s*colors\.tableGroupBandBg/.test(src))
    f.push(`${PARITY}: the group band row must paint colors.tableGroupBandBg`);
  // Header th weight 700 (via headerWeight ?? 700).
  if (!/fontWeight:\s*headerWeight\s*\?\?\s*700/.test(src))
    f.push(`${PARITY}: header row th must default to fontWeight 700 (headerWeight ?? 700)`);
  // Even-row group tint support.
  if (!/isEvenRow\s*\?\s*group\.bgEven\s*\?\?\s*group\.bg\s*:\s*group\.bg/.test(src))
    f.push(`${PARITY}: body cells must use the group's even-row variant (group.bgEven ?? group.bg) on even rows`);
  // Body td 1px right rule — the lighter --line shade (tableBodyRule), distinct from --line2
  // (tableColumnRule) which owns the header/group-band rows only.
  if (!/borderRight:\s*`1px solid \$\{colors\.tableBodyRule\}`/.test(src))
    f.push(`${PARITY}: body td must carry a 1px right column rule (colors.tableBodyRule, the --line shade)`);
  return f;
}

async function auditLive(c) {
  const base = process.env.LOAD_COSTS_LIVE_URL;
  if (!base) { console.log("LIVE skipped (set LOAD_COSTS_LIVE_URL to enable)"); return []; }
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { console.log("LIVE skipped (playwright not installed)"); return []; }
  const f = [];
  const toRgb = (hex) => {
    const h = hex.replace("#", "");
    return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
  };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${base.replace(/\/$/, "")}/accounting/load-costs`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="accounting-load-costs-board"] thead', { timeout: 20000 });
    const m = await page.evaluate(() => {
      const table = document.querySelector('[data-testid="accounting-load-costs-board"]');
      const hdr = [...table.querySelectorAll("thead tr")].pop();
      const th = hdr.querySelector("th");
      const grp = table.querySelector("thead tr th");
      const td = table.querySelector("tbody td");
      const g = (el) => el ? getComputedStyle(el) : null;
      const s1 = g(th), s2 = g(grp), s3 = g(td);
      return {
        thWeight: s1?.fontWeight, thBg: s1?.backgroundColor,
        thTrunc: th ? th.scrollWidth <= th.clientWidth : true,
        grpBg: s2?.backgroundColor,
        tdBorder: s3?.borderRightWidth,
      };
    });
    if (m.thWeight && Number(m.thWeight) !== 700) f.push(`LIVE: header th weight ${m.thWeight}, contract 700`);
    if (m.thBg && m.thBg !== toRgb(c.thBg)) f.push(`LIVE: header bg ${m.thBg}, contract ${toRgb(c.thBg)}`);
    if (m.grpBg && m.grpBg !== toRgb(c.grpBg)) f.push(`LIVE: group-row bg ${m.grpBg}, contract ${toRgb(c.grpBg)}`);
    if (!m.thTrunc) f.push(`LIVE: a header th is truncated (scrollWidth > clientWidth)`);
    if (m.tdBorder && parseFloat(m.tdBorder) < 1) f.push(`LIVE: body td right border ${m.tdBorder}, contract 1px`);
  } finally {
    await browser.close();
  }
  return f;
}

async function main() {
  const selftest = process.argv.includes("--selftest");
  const refSrc = readFileSync(REF, "utf8");
  const c = readContract(refSrc);
  const tokensSrc = readFileSync(TOKENS, "utf8");
  const boardSrc = readFileSync(BOARD, "utf8");
  const paritySrc = readFileSync(PARITY, "utf8");

  const failures = [
    ...auditTokens(tokensSrc, c),
    ...auditBoard(boardSrc, c),
    ...auditParity(paritySrc),
    ...(process.argv.includes("--live") ? await auditLive(c) : []),
  ];
  if (failures.length) {
    console.error("FAIL verify-table-design-contract:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    if (auditParity(paritySrc.replace(/backgroundColor:\s*colors\.tableGroupBandBg/, "backgroundColor: cell.bg ?? colors.tableGroupBandBg")).length === 0) {
      console.error("SELFTEST FAIL: per-group band bg did not trip"); process.exit(1);
    }
    if (auditBoard(boardSrc.replace(/headerBg="#EEF2F6"/i, 'headerBg="#EEF2F6" headerWeight={400}'), c).length === 0) {
      console.error("SELFTEST FAIL: headerWeight={400} did not trip"); process.exit(1);
    }
    if (auditBoard(boardSrc.replace(/label:\s*"Revenue",\s*keys:\s*\["revenue"\],\s*bg:\s*"#EEF4FA"/i, 'label: "Revenue", keys: ["revenue"], bg: "#FFFFFF"'), c).length === 0) {
      console.error("SELFTEST FAIL: wrong Revenue tint did not trip"); process.exit(1);
    }
    if (auditTokens(tokensSrc.replace(/tableGroupBandBg:\s*"#E4EAF1"/i, 'tableGroupBandBg: "#FFFFFF"'), c).length === 0) {
      console.error("SELFTEST FAIL: wrong grp-bg token did not trip"); process.exit(1);
    }
    console.log("SELFTEST OK: guard trips on all mutations");
  }

  console.log("PASS verify-table-design-contract");
}

main();
