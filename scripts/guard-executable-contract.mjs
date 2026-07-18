#!/usr/bin/env node

export const GUARD_CONTRACT_REPORT_PREFIX = "IH35_GUARD_CONTRACT ";

function normalizeViolations(result, label) {
  if (!Array.isArray(result) || !result.every((item) => typeof item === "string")) {
    throw new TypeError(`${label} checker result must be an array of violation strings`);
  }
  return result;
}

function cloneFixture(value) {
  return structuredClone(value);
}

function sameResult(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function runExecutableGuard({
  label,
  checker,
  loadRepositoryFixture,
  goodFixture,
  badFixture,
  expectedBadViolationSubstrings = [],
  argv = process.argv,
}) {
  if (typeof label !== "string" || !label) throw new TypeError("guard contract label is required");
  if (typeof checker !== "function") throw new TypeError("guard contract checker must be a function");
  if (typeof loadRepositoryFixture !== "function") {
    throw new TypeError("guard contract repository fixture loader must be a function");
  }

  if (argv.includes("--selftest")) {
    if (JSON.stringify(goodFixture) === JSON.stringify(badFixture)) {
      throw new Error(`${label} --selftest fixtures must differ`);
    }

    // Repeated, cloned, interleaved calls reject stateful/call-order fixtures and
    // demonstrate that this checker returns different decisions for supplied input.
    const badFirst = normalizeViolations(checker(cloneFixture(badFixture)), "bad fixture");
    const goodFirst = normalizeViolations(checker(cloneFixture(goodFixture)), "good fixture");
    const goodSecond = normalizeViolations(checker(cloneFixture(goodFixture)), "good fixture");
    const badSecond = normalizeViolations(checker(cloneFixture(badFixture)), "bad fixture");
    if (!sameResult(goodFirst, goodSecond) || !sameResult(badFirst, badSecond)) {
      throw new Error(`${label} --selftest checker result depends on call order or hidden state`);
    }
    if (goodFirst.length !== 0) {
      throw new Error(`${label} --selftest good fixture produced violations: ${goodFirst.join("; ")}`);
    }
    if (badFirst.length === 0) {
      throw new Error(`${label} --selftest planted-bad fixture was not detected`);
    }
    for (const expected of expectedBadViolationSubstrings) {
      if (!badFirst.some((violation) => violation.includes(expected))) {
        throw new Error(`${label} --selftest did not detect planted violation: ${expected}`);
      }
    }

    if (argv.includes("--guard-contract-report")) {
      console.log(
        `${GUARD_CONTRACT_REPORT_PREFIX}${JSON.stringify({
          version: 1,
          label,
          nonce: process.env.IH35_GUARD_CONTRACT_NONCE ?? null,
          execution: "same-checker-real-good-bad",
          goodViolationCount: goodFirst.length,
          badViolationCount: badFirst.length,
        })}`
      );
    } else {
      console.log(`${label} --selftest PASS`);
    }
    return;
  }

  const violations = normalizeViolations(
    checker(loadRepositoryFixture()),
    "repository fixture"
  );
  if (violations.length > 0) {
    console.error(`${label} FAIL:`);
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${label} PASS`);
}
