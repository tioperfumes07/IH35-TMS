#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  route: "apps/backend/src/telematics/dashcam-on-demand.routes.ts",
  detail: "apps/frontend/src/pages/safety/HarshEventDetail.tsx",
};

export function audit(src) {
  const failures = [];
  if (!/WHERE operating_company_id = \$1::uuid[\s\S]{0,120}linked_harsh_event_id = \$2::uuid/.test(src.route)) {
    failures.push(`${FILES.route}: clip history must retain exact company and harsh-event predicates`);
  }
  if (!/ORDER BY triggered_at DESC, id DESC/.test(src.route)) {
    failures.push(`${FILES.route}: complete clip history needs deterministic timestamp/id ordering`);
  }
  if (/linked_harsh_event_id = \$2::uuid[\s\S]{0,120}LIMIT\s+\d+/i.test(src.route)) {
    failures.push(`${FILES.route}: mounted harsh-event clip history must not carry a silent row cap`);
  }
  if (!/listHarshEventDashcamClips\(companyId, harshEventId\)/.test(src.detail) ||
      !/clipsQuery\.isError[\s\S]{0,260}<ListErrorState[\s\S]{0,260}onRetry=\{\(\) => void clipsQuery\.refetch\(\)\}/.test(src.detail)) {
    failures.push(`${FILES.detail}: mounted detail must consume the exact range and expose failed-read retry`);
  }
  return failures;
}

function load() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));
}

const good = load();
if (process.argv.includes("--selftest")) {
  if (audit(good).length) {
    console.error(`verify-harsh-event-dashcam-complete-range SELFTEST FAIL — real repo rejected: ${audit(good).join("; ")}`);
    process.exit(1);
  }
  const mutations = [
    ["silent-cap", "route", /ORDER BY triggered_at DESC, id DESC/, "ORDER BY triggered_at DESC LIMIT 20"],
    ["company-scope", "route", /operating_company_id = \$1::uuid/, "operating_company_id IS NOT NULL"],
    ["stable-order", "route", /ORDER BY triggered_at DESC, id DESC/, "ORDER BY triggered_at DESC"],
    ["mounted-read", "detail", /listHarshEventDashcamClips\(companyId, harshEventId\)/, "Promise.resolve({ rows: [] })"],
    ["read-retry", "detail", /onRetry=\{\(\) => void clipsQuery\.refetch\(\)\}/, "onRetry={undefined}"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key] || audit(mutated).length === 0) {
      console.error(`verify-harsh-event-dashcam-complete-range SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`verify-harsh-event-dashcam-complete-range SELFTEST PASS — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(good);
if (failures.length) {
  console.error(`verify-harsh-event-dashcam-complete-range FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-harsh-event-dashcam-complete-range PASS — mounted harsh-event clips expose the complete scoped range");
