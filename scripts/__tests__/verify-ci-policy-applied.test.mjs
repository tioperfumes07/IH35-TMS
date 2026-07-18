import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASELINE_ONLY_MESSAGE,
  REQUIRED_GATE_CONTEXTS,
  STRICT_FRESHNESS_CONTEXT,
  baselineOnlyOutcome,
  evaluateProtectionDrift,
  selectProtectionReadToken,
  verifyLiveProtection,
} from "../verify-ci-policy-applied.mjs";
import {
  OWNER_AUTHORIZATION_ENV,
  assertOwnerAuthorization,
} from "../ci-apply-branch-protection.mjs";

const expected = {
  required_status_checks: {
    strict: true,
    contexts: REQUIRED_GATE_CONTEXTS,
  },
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
  },
  enforce_admins: true,
  required_conversation_resolution: true,
  allow_force_pushes: false,
  allow_deletions: false,
};

function liveProtection(overrides = {}) {
  return {
    ...expected,
    ...overrides,
    required_status_checks: {
      ...expected.required_status_checks,
      ...overrides.required_status_checks,
    },
  };
}

test("live ruleset drift fails when strict freshness is disabled", () => {
  const drift = evaluateProtectionDrift(expected, liveProtection({
    required_status_checks: {
      strict: false,
    },
  }));
  assert.ok(drift.some((item) => item.includes("strict freshness is disabled")));
});

test("live ruleset drift fails when freshness context is absent", () => {
  const drift = evaluateProtectionDrift(expected, liveProtection({
    required_status_checks: {
      contexts: REQUIRED_GATE_CONTEXTS.filter((context) => context !== STRICT_FRESHNESS_CONTEXT),
    },
  }));
  assert.ok(drift.some((item) => item.includes(STRICT_FRESHNESS_CONTEXT)));
});

test("live ruleset drift rejects conditional checks as required contexts", () => {
  // NOTE: security-checks / security-audit is intentionally NOT in this list —
  // owner decision 2026-07-18 keeps it a REQUIRED gate (it lives in
  // REQUIRED_GATE_CONTEXTS). Only perf/pass-8/pr-preview are conditional.
  for (const context of [
    "perf-budget-check / perf-audit",
    "pass-8-smoke-verify / pass-8",
    "pr-preview-smoke / PR Preview Smoke",
  ]) {
    const drift = evaluateProtectionDrift(expected, liveProtection({
      required_status_checks: {
        contexts: [...REQUIRED_GATE_CONTEXTS, context],
      },
    }));
    assert.ok(drift.some((item) => item.includes(`non-approved required context: ${context}`)));
  }
});

test("live ruleset drift rejects bypassable governance controls", () => {
  const drift = evaluateProtectionDrift(expected, liveProtection({
    enforce_admins: { enabled: false },
    allow_force_pushes: { enabled: true },
  }));
  assert.ok(drift.some((item) => item.includes("enforce administrators")));
  assert.ok(drift.some((item) => item.includes("disallow force pushes")));
});

test("ordinary GitHub tokens are never selected for live protection reads", () => {
  assert.deepEqual(
    selectProtectionReadToken({
      GH_ADMIN_TOKEN: "admin",
      GITHUB_TOKEN: "github",
      GH_TOKEN: "gh",
    }),
    { name: "GH_ADMIN_TOKEN", value: "admin" }
  );
  assert.equal(selectProtectionReadToken({ GITHUB_TOKEN: "github", GH_TOKEN: "gh" }), null);
  assert.equal(selectProtectionReadToken({ GH_TOKEN: "gh" }), null);
});

test("baseline-only result explicitly passes committed policy without claiming live verification", () => {
  const outcome = baselineOnlyOutcome();
  assert.equal(outcome.baselinePassed, true);
  assert.equal(outcome.liveVerified, false);
  assert.equal(outcome.message, BASELINE_ONLY_MESSAGE);
  assert.match(outcome.message, /BASELINE PASS — LIVE UNVERIFIED, owner handoff required/);
  assert.doesNotMatch(outcome.message, /LIVE PASS|live protection verified/);
});

test("GH_ADMIN_TOKEN 403 fails closed", async () => {
  await assert.rejects(
    () =>
      verifyLiveProtection({ repository: "tioperfumes07/IH35-TMS", branch: "main", protection: expected }, "admin", async () => ({
        ok: false,
        status: 403,
        text: async () => "Resource not accessible by integration",
      })),
    /GitHub API 403.*Resource not accessible by integration/
  );
});

test("GH_ADMIN_TOKEN 404 fails closed", async () => {
  await assert.rejects(
    () =>
      verifyLiveProtection({ repository: "tioperfumes07/IH35-TMS", branch: "main", protection: expected }, "admin", async () => ({
        ok: false,
        status: 404,
        text: async () => "Branch not protected",
      })),
    /GitHub API 404: branch protection not applied/
  );
});

test("valid live policy passes only through explicit admin verification", async () => {
  const outcome = await verifyLiveProtection(
    { repository: "tioperfumes07/IH35-TMS", branch: "main", protection: expected },
    "admin",
    async () => ({
      ok: true,
      status: 200,
      json: async () => liveProtection(),
    })
  );
  assert.equal(outcome.baselinePassed, true);
  assert.equal(outcome.liveVerified, true);
  assert.match(
    outcome.message,
    new RegExp(`LIVE PASS — ${REQUIRED_GATE_CONTEXTS.length} owner-approved contexts verified`)
  );
});

test("branch-protection apply requires exact owner authorization", () => {
  assert.throws(() => assertOwnerAuthorization({}), /owner authorization required/);
  assert.throws(
    () => assertOwnerAuthorization({ [OWNER_AUTHORIZATION_ENV]: "yes" }),
    /owner authorization required/
  );
  assert.doesNotThrow(() =>
    assertOwnerAuthorization({ [OWNER_AUTHORIZATION_ENV]: "YES" })
  );
});

test("branch-protection apply is forbidden in CI even with owner authorization", () => {
  assert.throws(
    () =>
      assertOwnerAuthorization({
        [OWNER_AUTHORIZATION_ENV]: "YES",
        CI: "true",
      }),
    /refusing branch-protection apply from CI/
  );
  assert.throws(
    () =>
      assertOwnerAuthorization({
        [OWNER_AUTHORIZATION_ENV]: "YES",
        GITHUB_ACTIONS: "true",
      }),
    /refusing branch-protection apply from CI/
  );
});
