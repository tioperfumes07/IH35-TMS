#!/usr/bin/env node
/**
 * ROUND 443.280 — Settlements › Home board vs docs/design/v3/Settlements.
 * Panels use shared BoardSection; Week-of Status is Paid/Open with dots; chart footer board text;
 * SettlementRefCell beside loads. Static. --selftest plants regressions.
 */
export const ALLOW_OFFLINE_SKIP = "static source contract — no Neon required";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlements-home-board";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PANELS = "apps/frontend/src/pages/driver-finance/SettlementsHomeBoardPanels.tsx";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";

export function check({ panels, page }) {
  const f = [];
  if (!panels) {
    f.push(`${PANELS}: missing`);
    return f;
  }
  if (!/from ["']\.\.\/\.\.\/components\/v3\/BoardSection["']/.test(panels) && !/from ["'].*components\/v3\/BoardSection["']/.test(panels)) {
    f.push(`${PANELS}: must import shared BoardSection (not a local extract)`);
  }
  if (/^function BoardSection\b/m.test(panels) || /function BoardSection\(/.test(panels)) {
    f.push(`${PANELS}: local BoardSection function is LAYERED extract theater — use shared BoardSection`);
  }
  if (/<V3Panel\b/.test(panels)) f.push(`${PANELS}: must not mount V3Panel`);
  if (!/Net driver pay by week/.test(panels)) f.push(`${PANELS}: missing Net driver pay by week panel`);
  if (!/Deductions this week/.test(panels)) f.push(`${PANELS}: missing Deductions this week panel`);
  if (!/11 weeks, not cancelled, not sample|weeks, not cancelled, not sample/.test(panels)) {
    f.push(`${PANELS}: chart footer must use board "weeks, not cancelled, not sample" grammar`);
  }
  if (!/>Status</.test(panels) && !/>Status\n/.test(panels) && !/Status<\/span>/.test(panels)) {
    f.push(`${PANELS}: Week-of table must have Status column (board grammar)`);
  }
  if (!/function boardStatus/.test(panels) || !/label: "Paid"/.test(panels) || !/label: "Open"/.test(panels)) {
    f.push(`${PANELS}: Status must paint Paid/Open (board ● Paid / ● Open)`);
  }
  if (!/<SettlementRefCell\b/.test(panels)) {
    f.push(`${PANELS}: Loads column must mount SettlementRefCell (ALL-SEATS beside load)`);
  }
  if (!/settlements-home-week-of-export/.test(panels)) {
    f.push(`${PANELS}: Week-of header must expose Export (board)`);
  }
  if (!page) f.push(`${PAGE}: missing`);
  else {
    if (!/<SettlementsHomeBoardPanels\b/.test(page)) f.push(`${PAGE}: must mount SettlementsHomeBoardPanels on settlements tab`);
    if (!/companyId=\{companyId\}/.test(page) || !/<SettlementsHomeBoardPanels[\s\S]{0,400}companyId=\{companyId\}/.test(page)) {
      f.push(`${PAGE}: SettlementsHomeBoardPanels must receive companyId (SettlementRefCell)`);
    }
    if (!/data-testid="settlements-home-kpi-strip"/.test(page)) f.push(`${PAGE}: Home KPI strip missing`);
    if (!/<V3KpiTile\b/.test(page)) f.push(`${PAGE}: Home must mount V3KpiTile strip`);
  }
  return f;
}

const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : null);
const real = () => ({ panels: read(PANELS), page: read(PAGE) });

if (process.argv.includes("--selftest")) {
  const r = real();
  if (check(r).length) {
    console.error(`${LABEL} --selftest FAIL: tree not clean:\n  ${check(r).join("\n  ")}`);
    process.exit(1);
  }
  const plants = [
    ["local BoardSection back", { ...r, panels: r.panels.replace(/import \{ BoardSection \} from "[^"]+";/, 'function BoardSection(){return null}\n') }],
    ["Status drops Paid/Open", { ...r, panels: r.panels.replace(/function boardStatus[\s\S]*?\n\}/, "function boardStatus(){return {label:'X',color:'#000'}}") }],
    ["SettlementRefCell removed", { ...r, panels: r.panels.replace(/<SettlementRefCell\b[\s\S]*?\/>/g, "") }],
    ["board unmounted", { ...r, page: r.page.replace("<SettlementsHomeBoardPanels", "<GonePanels") }],
  ];
  const missed = plants.filter(([, s]) => check(s).length === 0).map(([n]) => n);
  if (missed.length) {
    console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(real());
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Settlements Home board (shared BoardSection + Status Paid/Open + SettlementRefCell)`);
