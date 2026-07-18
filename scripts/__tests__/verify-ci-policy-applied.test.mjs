import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STRICT_FRESHNESS_CONTEXT,
  evaluateProtectionDrift,
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
