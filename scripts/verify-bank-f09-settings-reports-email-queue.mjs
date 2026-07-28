#!/usr/bin/env node
/**
 * BANK-F09 — Banking settings / reports entry / email-queue deep-wizard structural DoD.
 *
 * Asserts:
 *  - DOD-A: /banking/email-queue mounts EmailQueuePage (no ComingSoon twin)
 *  - DOD-B: queue list + retry action bound to company-scoped API (list + admin retry)
 *  - VERIFY-3: email-queue API uses /api/v1/email/queue + admin retry (entity query param)
 *  - NEVER-DELETE: Banking settings keeps cash-gl-setup + categorization-rules; Home keeps Email Queue CTA
 *  - VERIFY-7: Banking-linked report entry (CashFlowOverview) keeps reverse link to categorization-rules
 *
 * Does NOT flip scoreboard PASS — live TRANSP+USMCA browser remains UNVERIFIED (Rule 23).
 *
 *   node scripts/verify-bank-f09-settings-reports-email-queue.mjs
 *   node scripts/verify-bank-f09-settings-reports-email-queue.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-f09-settings-reports-email-queue";

const FILES = {
  manifest: "apps/frontend/src/routes/manifest.tsx",
  emailPage: "apps/frontend/src/pages/banking/EmailQueuePage.tsx",
  home: "apps/frontend/src/pages/banking/BankingHome.tsx",
  settingsGuard: "scripts/verify-banking-settings-tab.mjs",
  emailApi: "apps/frontend/src/api/email-queue.ts",
  cashFlow: "apps/frontend/src/pages/reports/CashFlowOverviewPage.tsx",
  sidebar: "apps/frontend/src/components/layout/sidebar-config.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,800}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];

  const emailBlock = routeBlock(src.manifest, "/banking/email-queue");
  if (!emailBlock) errors.push("DOD-A: missing route /banking/email-queue");
  else {
    if (/ComingSoonPage/.test(emailBlock)) {
      errors.push("DOD-A: email-queue must not mount ComingSoonPage");
    }
    if (!emailBlock.includes("<EmailQueuePage")) {
      errors.push("DOD-A: /banking/email-queue must render <EmailQueuePage />");
    }
  }

  if (!src.emailPage.includes("export function EmailQueuePage")) {
    errors.push("DOD-A: EmailQueuePage export must remain live");
  }
  for (const needle of ["listEmailQueue", "adminRetryEmailQueueItem", "useCompanyContext", "Retry send"]) {
    if (!src.emailPage.includes(needle)) {
      errors.push(`DOD-B: EmailQueuePage must keep ${needle}`);
    }
  }
  if (!src.emailPage.includes("No email queue rows returned for this company")) {
    errors.push("DOD-B: EmailQueuePage must keep honest empty-state copy");
  }

  if (!src.home.includes("/banking/email-queue")) {
    errors.push("NEVER-DELETE: BankingHome must keep Email Queue entry → /banking/email-queue");
  }
  if (!src.sidebar.includes('/banking/email-queue')) {
    errors.push("NEVER-DELETE: sidebar must keep Email Queue → /banking/email-queue");
  }

  // Settings leaf pins (companion structural guard must stay)
  if (!src.settingsGuard.includes("/banking/cash-gl-setup") || !src.settingsGuard.includes("/banking/categorization-rules")) {
    errors.push("NEVER-DELETE: verify-banking-settings-tab must keep cash-gl-setup + categorization-rules");
  }

  if (!src.emailApi.includes("/api/v1/email/queue")) {
    errors.push("VERIFY-3: listEmailQueue must call /api/v1/email/queue");
  }
  if (!src.emailApi.includes("/api/v1/admin/email-queue/")) {
    errors.push("VERIFY-3: adminRetryEmailQueueItem must call /api/v1/admin/email-queue/:id/retry");
  }
  if (!src.emailApi.includes("operating_company_id") && !src.emailApi.includes("operatingCompanyId")) {
    errors.push("VERIFY-3: email-queue API client must pass operating company scope");
  }

  if (!src.cashFlow.includes("/banking/categorization-rules")) {
    errors.push("VERIFY-7: CashFlowOverview must keep reverse link to /banking/categorization-rules");
  }

  return errors;
}

function selftest() {
  const good = {
    manifest: 'path="/banking/email-queue"\n<EmailQueuePage />\n',
    emailPage: [
      "export function EmailQueuePage",
      "listEmailQueue",
      "adminRetryEmailQueueItem",
      "useCompanyContext",
      "Retry send",
      "No email queue rows returned for this company",
    ].join("\n"),
    home: 'navigate("/banking/email-queue")',
    settingsGuard: "/banking/cash-gl-setup\n/banking/categorization-rules",
    emailApi: "/api/v1/email/queue\n/api/v1/admin/email-queue/\noperatingCompanyId",
    cashFlow: 'to="/banking/categorization-rules"',
    sidebar: 'to: "/banking/email-queue"',
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const twin = { ...good, manifest: 'path="/banking/email-queue"\n<ComingSoonPage />\n' };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  const noEmpty = {
    ...good,
    emailPage: good.emailPage.replace("No email queue rows returned for this company", ""),
  };
  if (!contractErrors(noEmpty).some((e) => e.includes("honest empty"))) {
    console.error(`${LABEL} --selftest FAIL empty-state miss not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — BANK-F09 settings/email-queue structural DoD; live browser TRANSP+USMCA still UNVERIFIED`
);
process.exit(0);
