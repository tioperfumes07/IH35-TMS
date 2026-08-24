#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const homeSources = [
  "apps/frontend/src/pages/home/roles/DefaultHome.tsx",
  "apps/frontend/src/pages/home/OwnerHome.tsx",
];
const reportsRoutePath = path.join(ROOT, "apps/backend/src/reports/library.routes.ts");

function fail(message) {
  console.error(`verify:fleet-counter-tenant-scope FAILED\n- ${message}`);
  process.exit(1);
}

function evaluate(homeTexts, reportsText) {
  const errors = [];
  for (const [rel, homeText] of homeTexts) {
  if (/label:\s*"Vehicles in Service"[\s\S]*number:\s*"94"/m.test(homeText)) {
      errors.push(`Vehicles in Service card in ${rel} must not use hardcoded 94`);
  }
  if (!/label:\s*"Vehicles in Service"[\s\S]*kpiSummaryQuery\.data\?\.live_units/m.test(homeText)) {
      errors.push(`Vehicles in Service card in ${rel} must read tenant-scoped live_units from API`);
    }
  }
  const liveUnitsStart = reportsText.indexOf("const liveUnitsRes = await client.query(");
  const liveUnitsEnd = reportsText.indexOf("live_units: Number(((liveUnitsRes.rows[0]", liveUnitsStart);
  const liveUnitsBlock = liveUnitsStart >= 0 && liveUnitsEnd >= 0
    ? reportsText.slice(liveUnitsStart, liveUnitsEnd + 80)
    : "";
  const requiredFragments = [
    "const liveUnitsRes = await client.query(",
    "FROM mdata.units u",
    "AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)",
    "live_units: Number(((liveUnitsRes.rows[0]",
  ];
  for (const fragment of requiredFragments) {
    if (!liveUnitsBlock.includes(fragment)) {
      errors.push(`kpi-summary route missing tenant-scoped live_units fragment: ${fragment}`);
    }
  }
  return errors;
}

function readSources() {
  const homeTexts = homeSources.map((rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) fail(`missing ${rel}`);
    return [rel, fs.readFileSync(abs, "utf8")];
  });
  if (!fs.existsSync(reportsRoutePath)) {
    fail("missing apps/backend/src/reports/library.routes.ts");
  }
  return { homeTexts, reportsText: fs.readFileSync(reportsRoutePath, "utf8") };
}

const sources = readSources();
const errors = evaluate(sources.homeTexts, sources.reportsText);
if (errors.length) fail(errors.join("\n- "));

if (process.argv.includes("--selftest")) {
  const mutateLiveUnitsBlock = (needle, replacement) => {
    const start = sources.reportsText.indexOf("const liveUnitsRes = await client.query(");
    const before = sources.reportsText.slice(0, start);
    const after = sources.reportsText.slice(start).replace(needle, replacement);
    return before + after;
  };
  const mutations = [
    {
      name: "default-home-live-units-binding",
      homeTexts: sources.homeTexts.map(([rel, text], index) => [rel, index === 0 ? text.replace("kpiSummaryQuery.data?.live_units", "undefined") : text]),
      reportsText: sources.reportsText,
    },
    {
      name: "owner-home-live-units-binding",
      homeTexts: sources.homeTexts.map(([rel, text], index) => [rel, index === 1 ? text.replace("kpiSummaryQuery.data?.live_units", "undefined") : text]),
      reportsText: sources.reportsText,
    },
    {
      name: "units-source-table",
      homeTexts: sources.homeTexts,
      reportsText: mutateLiveUnitsBlock("FROM mdata.units u", "FROM mdata.drivers u"),
    },
    {
      name: "owner-or-lease-company-scope",
      homeTexts: sources.homeTexts,
      reportsText: mutateLiveUnitsBlock("AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)", "AND TRUE"),
    },
    {
      name: "response-live-units-binding",
      homeTexts: sources.homeTexts,
      reportsText: sources.reportsText.replace("live_units: Number(((liveUnitsRes.rows[0]", "live_units: Number(((totalLoadsRes.rows[0]"),
    },
  ];
  for (const mutation of mutations) {
    if (evaluate(mutation.homeTexts, mutation.reportsText).length === 0) {
      fail(`selftest mutation escaped: ${mutation.name}`);
    }
  }
  console.log(`verify:fleet-counter-tenant-scope SELFTEST OK — ${mutations.length} mutations detected`);
}

console.log("verify:fleet-counter-tenant-scope OK");
