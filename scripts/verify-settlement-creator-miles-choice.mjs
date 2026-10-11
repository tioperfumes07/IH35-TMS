#!/usr/bin/env node
/**
 * GUARD — OWNER ORDER (Lead 443.57, CC-3): "for the mileage it should also be the same in settlement creator."
 *   RULE 1 (static) — ONE mileage engine. The Creator drawer reads Historical / Google from CC-2's engine
 *     (postMilesRecommendations -> POST /api/v1/mdata/miles-recommendations) and renders the per-field selector
 *     (CreatorMilesChoicePanel); it calls no other mileage lookup (lane mileage, route mileage, chain deadhead). The post
 *     applies the choice only through the engine (recordDocumentMilesSources + setMilesChoice), writes no miles SQL of its
 *     own, and runs it AFTER the pay-run close, so driver pay (rate × the settlement's miles) is already written.
 *   RULE 2 (live) — a Creator load on a settlement posted after the cutover with a miles field (practical / short / empty)
 *     that has no recorded source fails. Older Creator loads are reported (CC-2's record-sources pass owns them).
 * Run: node scripts/verify-settlement-creator-miles-choice.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "a Creator load whose saved miles have no recorded source is unexplained operating data — fails closed without a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-miles-choice";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
/** Settlements created from here on post through the miles choice (Lead 443.57). */
export const CUTOVER = "2026-10-11T17:00:00Z";
const F = {
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  panel: "apps/frontend/src/pages/settlements/CreatorMilesChoicePanel.tsx",
  module: "apps/backend/src/driver-finance/settlement-creator-miles-choice.ts",
  svc: "apps/backend/src/driver-finance/settlement-creator.service.ts",
};

export function staticProblems(s) {
  const p = [];
  if (!/postMilesRecommendations\(/.test(s.drawer)) p.push("RULE 1 the Creator drawer does not read CC-2's mileage engine (postMilesRecommendations)");
  if (!/<CreatorMilesChoicePanel\b/.test(s.drawer)) p.push("RULE 1 the Creator drawer does not render the per-field miles selector");
  for (const [re, what] of [[/getLaneMileage\(/, "getLaneMileage"], [/getRouteMileage\(/, "getRouteMileage"], [/getChainDeadhead\(/, "getChainDeadhead"], [/lane-mileage|route-mileage|chain-deadhead/, "a lane/route/chain-deadhead URL"]])
    if (re.test(s.drawer)) p.push(`RULE 1 the Creator drawer has a second mileage path (${what})`);
  if (!/value="document"[\s\S]*value="historical"[\s\S]*value="google"[\s\S]*value="manual"/.test(s.panel)) p.push("RULE 1 the selector is not Document | Historical | Google | Manual");
  if (!/recordDocumentMilesSources\(/.test(s.module) || !/setMilesChoice\(/.test(s.module)) p.push("RULE 1 the post does not apply the choice through CC-2's engine (recordDocumentMilesSources + setMilesChoice)");
  if (/UPDATE\s+mdata\.loads|lane_mileage|point_mileage|miles_shortest\s*=|miles_practical\s*=/i.test(s.module)) p.push("RULE 1 the Creator miles module writes miles itself (a second mileage path)");
  const apply = s.svc.indexOf("applyCreatorMilesChoices(");
  const close = s.svc.lastIndexOf("closeSettlementPayRun(");
  if (apply < 0) p.push("RULE 1 the post never applies the miles choice");
  else if (close < 0 || apply < close) p.push("RULE 1 the miles choice runs before the pay-run close (pay could move with it)");
  return p;
}

export function liveProblems({ after, before }) {
  return Number(after) > 0 ? [`RULE 2 ${after} Creator load(s) posted after ${CUTOVER} carry a miles field with no recorded source (older, pending CC-2's record-sources: ${before})`] : [];
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, r]) => [k, fs.readFileSync(path.join(ROOT, r), "utf8")]));

function selftest() {
  const g = read();
  const cases = [
    ["real tree clean", staticProblems(g).length === 0],
    ["drawer without the engine fails", staticProblems({ ...g, drawer: g.drawer.replaceAll("postMilesRecommendations(", "x(") }).length > 0],
    ["drawer with getLaneMileage fails", staticProblems({ ...g, drawer: g.drawer + "\ngetLaneMileage({});" }).length > 0],
    ["drawer with a route-mileage URL fails", staticProblems({ ...g, drawer: g.drawer + '\nfetch("/api/v1/dispatch/route-mileage");' }).length > 0],
    ["panel without Manual fails", staticProblems({ ...g, panel: g.panel.replace('value="manual"', 'value="x"') }).length > 0],
    ["module writing miles SQL fails", staticProblems({ ...g, module: g.module + "\n// UPDATE mdata.loads SET miles_shortest = 1" }).length > 0],
    ["module without setMilesChoice fails", staticProblems({ ...g, module: g.module.replaceAll("setMilesChoice(", "y(") }).length > 0],
    ["choice before the close fails", staticProblems({ ...g, svc: "applyCreatorMilesChoices(\n" + g.svc.replaceAll("applyCreatorMilesChoices(", "z(") }).length > 0],
    ["no live miss passes", liveProblems({ after: 0, before: 146 }).length === 0],
    ["a live miss fails", liveProblems({ after: 1, before: 0 }).length > 0],
  ];
  const bad = cases.filter(([, ok]) => !ok).map(([n]) => n);
  if (bad.length) { console.error(`${LABEL} selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${cases.length}/${cases.length})`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = staticProblems(read());
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let m;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const hasCol = (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'mdata' AND table_name = 'loads' AND column_name = 'miles_choice'`)).rows.length > 0;
    m = hasCol
      ? (await client.query(
          `WITH cl AS (
             SELECT l.id, max(s.created_at) AS posted_at, l.miles_practical, l.miles_shortest, l.miles_deadhead, l.miles_choice
               FROM mdata.loads l
               JOIN driver_finance.settlement_lines sl ON sl.load_id = l.id AND sl.voided_at IS NULL
               JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id AND s.source_document_ref IS NOT NULL AND s.voided_at IS NULL
              WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
              GROUP BY l.id
           ), miss AS (
             SELECT posted_at FROM cl
              WHERE (miles_practical IS NOT NULL AND miles_choice->'practical'->>'source' IS NULL)
                 OR (miles_shortest IS NOT NULL AND miles_choice->'short'->>'source' IS NULL)
                 OR (miles_deadhead IS NOT NULL AND miles_choice->'empty'->>'source' IS NULL)
           )
           SELECT (SELECT count(*) FROM cl)::int AS loads,
                  count(*) FILTER (WHERE posted_at >= $2::timestamptz)::int AS after,
                  count(*) FILTER (WHERE posted_at < $2::timestamptz)::int AS before
             FROM miss`, [USMCA, CUTOVER])).rows[0]
      : { loads: 0, after: 0, before: 0, pending: true };
    await client.query("ROLLBACK");
  } finally {
    client.release?.(); await pool?.end?.();
  }
  p.push(...liveProblems(m));
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(m.pending
    ? `${LABEL} PASS — static rules hold; mdata.loads.miles_choice not on this database yet (live rule pending migration 202615550300)`
    : `${LABEL} PASS — ${m.loads} Creator loads; 0 posted after ${CUTOVER} without a recorded miles source; ${m.before} older pending CC-2's record-sources pass`);
}
