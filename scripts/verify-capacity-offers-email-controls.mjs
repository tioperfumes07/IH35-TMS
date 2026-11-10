#!/usr/bin/env node
/**
 * verify-capacity-offers-email-controls — CAPACITY ENGINE spec §6 (email half). The system emails real customers, so
 * every control is asserted on the live tree:
 *   1. audience = contacts flagged receives_truck_offers only, minus unsubscribes (suppression table);
 *   2. lane match: a recipient whose customer has no lane-state history gets nothing;
 *   3. hard cap 2/day: kind ∈ {morning, change} + UNIQUE(company, lower(email), send_date, kind), claimed BEFORE the queue;
 *   4. the company switch gates every send and is created OFF (DEFAULT false, no migration turns it on); only the Owner
 *      can flip it;
 *   5. List-Unsubscribe + List-Unsubscribe-Post headers, footer with legal name + address + unsubscribe link,
 *      a Reply-To; SES (which cannot carry the headers) refuses instead of sending without them;
 *   6. the cron is single-fire (leaseSeconds) at 07:00 and 12:30 America/Chicago.
 * Usage: node scripts/verify-capacity-offers-email-controls.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-capacity-offers-email-controls";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/dispatch/capacity/capacity-offers.service.ts";
const CRON = "apps/backend/src/dispatch/capacity/capacity-offers.cron.ts";
const ROUTES = "apps/backend/src/dispatch/capacity/capacity.routes.ts";
const TPL = "apps/backend/src/email/templates/capacity-offer.eta";
const SES = "apps/backend/src/email/providers/ses.ts";
const INDEX = "apps/backend/src/index.ts";
const MIG_DIR = "db/migrations";

function migration(files) {
  return Object.entries(files).filter(([k]) => k.startsWith(MIG_DIR)).map(([, v]) => v).join("\n");
}

export function check(files) {
  const f = [];
  const svc = files[SVC] ?? "";
  const cron = files[CRON] ?? "";
  const routes = files[ROUTES] ?? "";
  const tpl = files[TPL] ?? "";
  const ses = files[SES] ?? "";
  const mig = migration(files);
  if (!svc || !cron || !tpl) return ["capacity offers service / cron / template missing"];
  // 1 audience
  if (!/WHERE cc\.receives_truck_offers/.test(svc)) f.push("audience is not limited to contacts flagged receives_truck_offers");
  if (!/NOT EXISTS \(\s*SELECT 1 FROM dispatch\.capacity_offer_suppressions/.test(svc)) f.push("unsubscribed addresses are not excluded (capacity_offer_suppressions)");
  // 2 lane match
  if (!/if \(!lanes \|\| lanes\.size === 0\) continue;/.test(svc)) f.push("a recipient with no lane history is not skipped");
  if (!/laneStates\.has\(/.test(svc)) f.push("trucks are not matched to the customer's lane states");
  // 3 cap
  if (!/kind\s+text NOT NULL CHECK \(kind IN \('morning', 'change'\)\)/.test(mig)) f.push("capacity_offer_sends.kind is not limited to morning|change");
  if (!/CREATE UNIQUE INDEX IF NOT EXISTS capacity_offer_sends_one_kind_per_day\s+ON dispatch\.capacity_offer_sends \(operating_company_id, lower\(email\), send_date, kind\)/.test(mig)) f.push("no UNIQUE(company, lower(email), send_date, kind) — the 2-per-day cap is not enforced by the database");
  const claimAt = svc.indexOf("INSERT INTO dispatch.capacity_offer_sends");
  const enqueueAt = svc.indexOf("await enqueueEmailWithClient(");
  if (claimAt < 0 || enqueueAt < 0 || claimAt > enqueueAt || !/ON CONFLICT DO NOTHING RETURNING id/.test(svc)) f.push("the send is not claimed (ON CONFLICT DO NOTHING) before the email is queued");
  // 4 switch
  const switchAt = svc.indexOf('if (!settings.send_truck_offers) return { status: "switch_off" };');
  if (switchAt < 0 || switchAt > enqueueAt) f.push("the Send-truck-offers switch does not gate the send");
  if (!/send_truck_offers\s+boolean NOT NULL DEFAULT false/.test(mig)) f.push("the switch is not created OFF (DEFAULT false)");
  if (/INSERT INTO dispatch\.capacity_settings[\s\S]{0,200}\btrue\b/i.test(mig)) f.push("a migration turns the Send-truck-offers switch on — only the owner does that");
  if (!/owner_only_switch/.test(routes)) f.push("PUT settings lets a non-Owner flip the switch");
  // 5 headers + footer
  if (!/"List-Unsubscribe": `<\$\{unsubUrl\}>`/.test(svc) || !/"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/.test(svc)) f.push("List-Unsubscribe / List-Unsubscribe-Post headers missing");
  if (!/replyTo,/.test(svc)) f.push("Reply-To (dispatch) not set on the offer email");
  for (const v of ["companyLegalName", "companyAddress", "unsubscribeUrl"]) if (!tpl.includes(`it.${v}`)) f.push(`email footer is missing ${v}`);
  if (!/capacity_offers_company_footer_incomplete/.test(svc)) f.push("an email can go out without the legal name / address");
  if (!/ses_provider_custom_headers_not_supported/.test(ses)) f.push("SES silently drops List-Unsubscribe headers instead of refusing");
  // 6 cron
  const ticks = [...cron.matchAll(/wrapBackgroundJobTick\(([\s\S]*?)\n\s*\}\);/g)].map((m) => m[1]);
  if (ticks.length !== 2 || ticks.some((t) => !/leaseSeconds: JOB_LEASE_SECONDS/.test(t))) f.push("capacity offer cron ticks are not both leased (single-fire)");
  if (!/"0 7 \* \* \*"/.test(cron) || !/"30 12 \* \* \*"/.test(cron) || (cron.match(/timezone: "America\/Chicago"/g) ?? []).length !== 2) f.push("cron is not 07:00 + 12:30 America/Chicago");
  if (!/initializeCapacityOffersCron\(app\);/.test(files[INDEX] ?? "")) f.push("capacity offers cron is not initialized in index.ts");
  return f;
}

function readAll() {
  const out = {};
  for (const rel of [SVC, CRON, ROUTES, TPL, SES, INDEX]) {
    const abs = path.join(ROOT, rel);
    out[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  for (const e of fs.readdirSync(path.join(ROOT, MIG_DIR))) {
    if (/capacity_engine/.test(e) && e.endsWith(".sql")) out[`${MIG_DIR}/${e}`] = fs.readFileSync(path.join(ROOT, MIG_DIR, e), "utf8");
  }
  return out;
}

function selftest() {
  const live = readAll();
  const migKey = Object.keys(live).find((k) => k.startsWith(MIG_DIR));
  const mut = (key, from, to) => ({ ...live, [key]: live[key].replace(from, to) });
  const cases = [
    ["blast to every contact", mut(SVC, "WHERE cc.receives_truck_offers", "WHERE true")],
    ["unsubscribes ignored", mut(SVC, "NOT EXISTS (", "EXISTS (")],
    ["no lane match", mut(SVC, "if (!lanes || lanes.size === 0) continue;", "")],
    ["cap index dropped", mut(migKey, "capacity_offer_sends_one_kind_per_day", "capacity_offer_sends_idx")],
    ["switch gate removed", mut(SVC, 'if (!settings.send_truck_offers) return { status: "switch_off" };', "")],
    ["switch created ON", mut(migKey, /send_truck_offers\s+boolean NOT NULL DEFAULT false/, "send_truck_offers boolean NOT NULL DEFAULT true")],
    ["admin may flip switch", mut(ROUTES, /owner_only_switch/g, "forbidden")],
    ["no unsubscribe header", mut(SVC, '"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"', '"X-Note": "x"')],
    ["footer without address", mut(TPL, "it.companyAddress", "it.companyMc")],
    ["SES drops headers", mut(SES, /ses_provider_custom_headers_not_supported/g, "x")],
    ["lease dropped", mut(CRON, "leaseSeconds: JOB_LEASE_SECONDS", "")],
    ["wrong timezone", mut(CRON, 'timezone: "America/Chicago"', 'timezone: "UTC"')],
  ];
  let pass = 0;
  const liveF = check(live);
  if (liveF.length === 0) pass += 1; else console.error(`${LABEL} --selftest: live tree fails`, liveF);
  for (const [name, files] of cases) {
    if (check(files).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = check(readAll());
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — flagged contacts only, lane match, <=2/day DB-enforced, switch created OFF + owner-only, unsubscribe headers + footer, leased 07:00/12:30 CT cron`);
}
