import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REQUIRED_GATE_CONTEXTS,
  STRICT_FRESHNESS_CONTEXT,
  evaluateProtectionDrift,
  missingProtectionTokenOutcome,
  selectProtectionReadToken,
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
  for (const context of [
    "perf-budget-check / perf-audit",
    "security-checks / security-audit",
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

test("token selection prefers admin then GitHub then gh token", () => {
  assert.deepEqual(
    selectProtectionReadToken({
      GH_ADMIN_TOKEN: "admin",
      GITHUB_TOKEN: "github",
      GH_TOKEN: "gh",
    }),
    { name: "GH_ADMIN_TOKEN", value: "admin" }
  );
  assert.deepEqual(selectProtectionReadToken({ GITHUB_TOKEN: "github", GH_TOKEN: "gh" }), {
    name: "GITHUB_TOKEN",
    value: "github",
  });
  assert.deepEqual(selectProtectionReadToken({ GH_TOKEN: "gh" }), {
    name: "GH_TOKEN",
    value: "gh",
  });
});

test("missing CI token is a distinct blocking unverified result", () => {
  const outcome = missingProtectionTokenOutcome(true);
  assert.equal(outcome.blocking, true);
  assert.match(outcome.message, /BLOCKED-UNVERIFIED/);
  assert.doesNotMatch(outcome.message, /PASS/);
});

test("missing local token warns unverified without claiming enforcement", () => {
  const outcome = missingProtectionTokenOutcome(false);
  assert.equal(outcome.blocking, false);
  assert.match(outcome.message, /UNVERIFIED \(local\)/);
  assert.doesNotMatch(outcome.message, /PASS|active|applied/);
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
