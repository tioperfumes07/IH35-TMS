import assert from "node:assert/strict";
import {
  applyEnvStartupChecks,
  getEnvStatus,
  getRequiredEnvSpec,
  REQUIRED_ENV,
  setDisabledFeatures,
  isFeatureDisabled,
} from "../required-env.ts";

type TestFn = (name: string, fn: () => void | Promise<void>) => void;

type LoggerCapture = {
  logger: { error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
  errors: unknown[][];
  warns: unknown[][];
};

function makeLogger(): LoggerCapture {
  const errors: unknown[][] = [];
  const warns: unknown[][] = [];
  return {
    logger: {
      error: (...args: unknown[]) => errors.push(args),
      warn: (...args: unknown[]) => warns.push(args),
    },
    errors,
    warns,
  };
}

function registerTests(test: TestFn) {
  test("getEnvStatus returns present when env exists", () => {
    const spec = getRequiredEnvSpec("QBO_WEBHOOK_VERIFIER_TOKEN");
    assert.ok(spec);
    const status = getEnvStatus(spec, { QBO_WEBHOOK_VERIFIER_TOKEN: "abc123" });
    assert.equal(status.state, "present");
    if (status.state === "present") {
      assert.equal(status.value, "abc123");
    }
  });

  test("applyEnvStartupChecks hard-fails DATABASE_URL in production when missing", () => {
    const { logger, errors } = makeLogger();
    const result = applyEnvStartupChecks(logger, { NODE_ENV: "production" });
    assert.ok(result.hard_fail_messages.some((msg) => msg.includes("DATABASE_URL")));
    assert.ok(errors.length > 0);
  });

  test("applyEnvStartupChecks disables features with error logging in production", () => {
    const { logger, errors } = makeLogger();
    const result = applyEnvStartupChecks(logger, {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
    });
    assert.equal(result.disabled_features.has("qbo_webhook_signature_verification"), true);
    assert.equal(result.disabled_features.has("phone_auth"), true);
    assert.ok(errors.length > 0);
  });

  test("applyEnvStartupChecks supports disable_feature_log_warning behavior", () => {
    const { logger, warns } = makeLogger();
    const customSpec = {
      name: "OPTIONAL_WARNING_ENV",
      feature: "warning_only_feature",
      behavior_in_prod: "disable_feature_log_warning",
      behavior_in_dev: "disable_feature_log_warning",
      affects: ["test"],
      documentation: "test warning",
    } as const;
    const backup = REQUIRED_ENV.slice();
    (REQUIRED_ENV as unknown as Array<unknown>).push(customSpec);
    try {
      const result = applyEnvStartupChecks(logger, { NODE_ENV: "production", DATABASE_URL: "postgres://x" });
      assert.equal(result.disabled_features.has("warning_only_feature"), true);
      assert.ok(warns.length > 0);
    } finally {
      (REQUIRED_ENV as unknown as Array<unknown>).splice(0, REQUIRED_ENV.length, ...backup);
    }
  });

  test("dev/test accept_with_opt_in works while production ignores opt-in", () => {
    const { logger: devLogger } = makeLogger();
    const devResult = applyEnvStartupChecks(devLogger, {
      NODE_ENV: "test",
      IH35_DEV_ACCEPT_MISSING_REQUIRED_ENV: "1",
    });
    assert.equal(devResult.disabled_features.has("primary_database"), false);

    const { logger: prodLogger } = makeLogger();
    const prodResult = applyEnvStartupChecks(prodLogger, {
      NODE_ENV: "production",
      IH35_DEV_ACCEPT_MISSING_REQUIRED_ENV: "1",
    });
    assert.equal(prodResult.hard_fail_messages.some((msg) => msg.includes("DATABASE_URL")), true);
  });

  test("setDisabledFeatures and isFeatureDisabled share runtime state", () => {
    const s = new Set<string>(["qbo_webhook_signature_verification"]);
    setDisabledFeatures(s);
    assert.equal(isFeatureDisabled("qbo_webhook_signature_verification"), true);
    assert.equal(isFeatureDisabled("phone_auth"), false);
  });
}

const isVitest = typeof process.env.VITEST !== "undefined";
if (isVitest) {
  const { test } = await import("vitest");
  registerTests(test as TestFn);
} else {
  const { default: test } = await import("node:test");
  registerTests(test as TestFn);
}
