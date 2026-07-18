import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STRICT_FRESHNESS_CONTEXT,
  evaluateProtectionDrift,
  missingProtectionTokenOutcome,
  selectProtectionReadToken,
} from "../verify-ci-policy-applied.mjs";

const expected = {
  required_status_checks: {
    strict: true,
    contexts: [STRICT_FRESHNESS_CONTEXT, "ci / build-typecheck"],
  },
};

test("live ruleset drift fails when strict freshness is disabled", () => {
  const drift = evaluateProtectionDrift(expected, {
    required_status_checks: {
      strict: false,
      contexts: [STRICT_FRESHNESS_CONTEXT, "ci / build-typecheck"],
    },
  });
  assert.ok(drift.some((item) => item.includes("strict freshness is disabled")));
});

test("live ruleset drift fails when freshness context is absent", () => {
  const drift = evaluateProtectionDrift(expected, {
    required_status_checks: {
      strict: true,
      contexts: ["ci / build-typecheck"],
    },
  });
  assert.ok(drift.some((item) => item.includes(STRICT_FRESHNESS_CONTEXT)));
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
