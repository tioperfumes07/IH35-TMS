#!/usr/bin/env node
/**
 * ACCT-F176 / CLS-BANNER-ASSERTS-UNREAD-FLAG — a banner that tells the operator what a feature flag
 * is doing must READ that flag. Hardcoding the answer produces a confident sentence that is wrong the
 * moment the flag is overridden, and it is trusted precisely because it looks authoritative.
 *
 * WHAT WAS BROKEN (live-proven on Neon prod br-fancy-credit-akjnd07a 2026-08-07):
 * `BankingTransactionsDesignView.tsx` rendered a static `<p>`: "Categorize tags are not ledger posts —
 * BANK_FEED_GL_POSTING_ENABLED stays OFF by default … that alone does not post a balanced TMS JE."
 * Both sentences were literals; the component never read the flag. Measured:
 * `BANK_FEED_GL_POSTING_ENABLED` has `default_enabled = false` and a per-entity override of **TRUE for
 * USMCA, TRANSP and TRK** — ON in every entity that exists. Categorizing a single $918.00 row created
 * a new balanced journal entry whose own memo read "Bank categorization … posting". With rows sitting
 * in the queue, an operator trusting the banner and working it would have posted one unintended entry
 * per row into a live ledger.
 *
 * The poster was correct and the flag was correct. Only the prose was wrong — which is the dangerous
 * shape, because nothing fails, nothing logs, and the number that appears later looks like it was
 * always meant to be there.
 *
 * WHAT THIS GUARD ASSERTS. For every component that renders a flag-honesty banner (identified by a
 * `data-testid` ending `-honesty-banner`), if the banner's text NAMES a feature-flag key then the
 * component must also READ that key through `useFeatureFlag`. It deliberately does NOT try to judge
 * whether the wording is accurate — that is prose, and a guard that grades English is a guard that
 * cries wolf. Naming a flag you never read is objectively checkable, and it is the actual defect.
 *
 * WHY `useFeatureFlag` AND NOT "mentions the key somewhere": the key appearing in a string is exactly
 * what the broken version had. The assertion is that the key reaches the component as a VALUE.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-flag-honesty-banner-reads-flag";
const SRC = "apps/frontend/src";

/** A flag key: SCREAMING_SNAKE, long enough that ordinary constants do not match by accident. */
const FLAG_KEY = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g;

/**
 * The banner's own JSX subtree, so only keys the OPERATOR actually reads are considered.
 *
 * The first version of this guard scanned the WHOLE FILE and immediately accused the correct code: a
 * component of this size is full of SCREAMING_SNAKE module constants (COMPANY_TRANSACTIONS_PAGE_SIZE,
 * MATCH_CANDIDATE_KIND_LABELS, BANKING_REVIEW_TABS …) that match the key shape and are not feature
 * flags. The fix is NOT a growing exemption list — a long exemption list means the matcher is wrong.
 * It is to look only where the claim is made.
 *
 * Walks from the `data-testid` back to its opening `<div`, then forward with a depth counter over
 * `<div` / `</div>` so nested markup is included and the next banner is not.
 */
export function bannerBlocks(src) {
  const blocks = [];
  const re = /data-testid="[^"]*-honesty-banner"/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.lastIndexOf("<div", m.index);
    if (open === -1) continue;
    let depth = 0;
    let i = open;
    while (i < src.length) {
      if (src.startsWith("<div", i)) depth++;
      else if (src.startsWith("</div>", i)) {
        depth--;
        if (depth === 0) {
          i += "</div>".length;
          break;
        }
      }
      i++;
    }
    blocks.push(src.slice(open, i));
  }
  return blocks;
}

export function auditSources(files) {
  const problems = [];
  let banners = 0;
  for (const { rel, src } of files) {
    if (!/data-testid="[^"]*-honesty-banner"/.test(src)) continue;
    banners++;

    // Only the keys named INSIDE a banner — what the operator is actually being told.
    const named = new Set();
    for (const block of bannerBlocks(src)) {
      for (const m of block.matchAll(FLAG_KEY)) named.add(m[0]);
    }
    if (named.size === 0) continue;

    for (const key of named) {
      // Read as a VALUE: useFeatureFlag("KEY", …). A bare mention is what the defect looked like.
      const readsIt = new RegExp(`useFeatureFlag\\(\\s*["'\`]${key}["'\`]`).test(src);
      if (!readsIt) {
        problems.push(
          `${rel}: renders an honesty banner that names the feature flag ${key} but never reads it ` +
            `via useFeatureFlag("${key}", …). The banner therefore states a flag's behaviour from a ` +
            `LITERAL. That is ACCT-F176: BANK_FEED_GL_POSTING_ENABLED read "stays OFF by default" ` +
            `while it was overridden ON for all three entities, and categorizing posted a real ` +
            `journal entry per row. Read the flag and branch on it, or stop naming it.`
        );
      }
    }
  }
  return { problems, banners };
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "dist") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (rel.endsWith(".tsx") && !rel.includes(".test.")) out.push(rel);
}

function auditTree() {
  const rels = [];
  walk(SRC, rels);
  const files = rels.map((rel) => ({ rel, src: readFileSync(join(ROOT, rel), "utf8") }));
  const { problems, banners } = auditSources(files);
  if (banners === 0) {
    return [
      `${LABEL}: found ZERO honesty banners — the data-testid convention ("*-honesty-banner") changed, ` +
        `so this guard is scanning nothing. Refusing to pass vacuously.`,
    ];
  }
  return problems;
}

/** Mutation proof: each case plants the real defect and asserts this guard goes RED. */
function selftest() {
  const failures = [];
  const banner = (body) =>
    `<div data-testid="banking-bank-feed-gl-posting-honesty-banner">${body}</div>`;

  // case1 — THE DEFECT verbatim: names the flag in prose, never reads it.
  const hardcoded = {
    rel: "apps/frontend/src/pages/banking/components/X.tsx",
    src: banner(`<p>BANK_FEED_GL_POSTING_ENABLED stays OFF by default</p>`),
  };
  if (auditSources([hardcoded]).problems.length === 0)
    failures.push("case1 FAIL — a banner naming a flag it never reads was NOT caught");

  // case2 — the FIX: same prose, but the flag is read as a value.
  const wired = {
    rel: "apps/frontend/src/pages/banking/components/X.tsx",
    src:
      `const f = useFeatureFlag("BANK_FEED_GL_POSTING_ENABLED", companyId);\n` +
      banner(`<p>BANK_FEED_GL_POSTING_ENABLED is {f.enabled ? "ON" : "OFF"}</p>`),
  };
  if (auditSources([wired]).problems.length !== 0)
    failures.push("case2 FAIL — a banner that reads its flag was flagged");

  // case3 — a banner naming NO flag is out of scope; not every honesty banner is about a flag.
  const noFlag = {
    rel: "apps/frontend/src/pages/banking/components/Y.tsx",
    src: banner(`<p>Bank row attachments and notes are not wired yet</p>`),
  };
  if (auditSources([noFlag]).problems.length !== 0)
    failures.push("case3 FAIL — a banner naming no flag was flagged");

  // case4 — a file with no honesty banner is out of scope even if it names a flag.
  const notABanner = {
    rel: "apps/frontend/src/pages/banking/components/Z.tsx",
    src: `<p>BANK_FEED_GL_POSTING_ENABLED</p>`,
  };
  if (auditSources([notABanner]).problems.length !== 0)
    failures.push("case4 FAIL — a non-banner file was flagged");

  // case5 — reading a DIFFERENT flag does not license naming this one.
  const wrongFlag = {
    rel: "apps/frontend/src/pages/banking/components/W.tsx",
    src:
      `const f = useFeatureFlag("SOME_OTHER_POSTING_FLAG", companyId);\n` +
      banner(`<p>BANK_FEED_GL_POSTING_ENABLED stays OFF</p>`),
  };
  if (auditSources([wrongFlag]).problems.length === 0)
    failures.push("case5 FAIL — reading a different flag was accepted as reading this one");

  // case6 — MUTATION AGAINST THE REAL FILE. Every case above is a fixture this author wrote; only the
  // real source proves the shipped fix is what holds this guard green.
  const rel = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    failures.push(`case6 FAIL — ${rel} is missing; the live mutation proof cannot run`);
  } else {
    const real = readFileSync(abs, "utf8");
    if (auditSources([{ rel, src: real }]).problems.length !== 0)
      failures.push(`case6 FAIL — the REAL ${rel} does not satisfy this guard`);
    const mutated = real.replace(/useFeatureFlag\(\s*"BANK_FEED_GL_POSTING_ENABLED"/, 'useFeatureFlag("UNRELATED_FLAG_KEY"');
    if (mutated === real) failures.push(`case6 FAIL — the useFeatureFlag call was not found in the REAL ${rel}`);
    else if (auditSources([{ rel, src: mutated }]).problems.length === 0)
      failures.push(`case6 FAIL — removing the flag read from the REAL ${rel} left this guard GREEN`);
  }

  return failures;
}

const selfFailures = selftest();
if (selfFailures.length) {
  console.error(`${LABEL} SELFTEST FAILED:\n  ${selfFailures.join("\n  ")}`);
  process.exit(1);
}

const problems = auditTree();
if (problems.length) {
  console.error(`${LABEL} FAIL (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every honesty banner that names a feature flag also reads it`);
