#!/usr/bin/env node
/**
 * GUARD: the Relay deposit classifier is DISPLAY/classification ONLY — it must never post to the GL and
 * must never auto-label an unmatched funding card "personal".
 *
 * Locks (2026-07-12, owner directive):
 *  - The classifier/service/routes never set posted_to_gl = true.
 *  - An unmatched card classifies as 'unclassified' (owner-review queue), NOT 'personal'/'external'
 *    — a company card never connected to the bank feed would also be unmatched.
 *  - The deposit review routes are registered in index.ts.
 *
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SVC = path.join(root, "apps/backend/src/integrations/relay-payments/relay-deposit-classifier.service.ts");
const REVIEW = path.join(root, "apps/backend/src/integrations/relay-payments/relay-deposit-review.routes.ts");
const INDEX = path.join(root, "apps/backend/src/index.ts");

function assertAll({ svc, review, index }) {
  const errors = [];
  // 1. No GL posting anywhere in the classifier surface.
  for (const [name, src] of [["service", svc], ["review-routes", review]]) {
    if (/posted_to_gl\s*[:=]\s*true/.test(src) || /set\s+posted_to_gl\s*=\s*true/i.test(src)) {
      errors.push(`${name}: sets posted_to_gl = true — the classifier must never post`);
    }
  }
  // 2. classifyDeposit must return 'unclassified' for unmatched cards, never 'personal'/'external'.
  if (!/return "unclassified"/.test(svc)) {
    errors.push(`service: classifyDeposit must fall through to 'unclassified' for unmatched cards`);
  }
  if (/return "personal"|return "external"/.test(svc)) {
    errors.push(`service: classifier auto-labels a card 'personal'/'external' — forbidden; use 'unclassified'`);
  }
  // 3. Review routes registered in index.ts.
  if (!/registerRelayDepositReviewRoutes\s*\(\s*app\s*\)/.test(index)) {
    errors.push(`index.ts: registerRelayDepositReviewRoutes(app) is not registered`);
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = {
    svc: `if (fundingCardLast4 && companyCards.has(fundingCardLast4)) return "company";\n  return "unclassified";`,
    review: `posted_to_gl untouched`,
    index: `await registerRelayDepositReviewRoutes(app);`,
  };
  const bad = {
    svc: `return "personal";`,
    review: `posted_to_gl: true`,
    index: `// not registered`,
  };
  if (assertAll(good).length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", assertAll(good)); process.exit(1); }
  if (assertAll(bad).length < 3) { console.error("SELFTEST FAIL: bad fixture not fully caught", assertAll(bad)); process.exit(1); }
  console.log("verify-relay-deposit-classifier-no-post selftest OK");
  process.exit(0);
}

for (const p of [SVC, REVIEW, INDEX]) {
  if (!fs.existsSync(p)) { console.error(`GUARD FAIL: missing file ${p}`); process.exit(1); }
}
const errors = assertAll({
  svc: fs.readFileSync(SVC, "utf8"),
  review: fs.readFileSync(REVIEW, "utf8"),
  index: fs.readFileSync(INDEX, "utf8"),
});
if (errors.length) {
  console.error("GUARD FAIL — Relay deposit classifier must be display-only + unclassified-not-personal:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-relay-deposit-classifier-no-post OK — no GL posting, unmatched→unclassified, routes wired");
