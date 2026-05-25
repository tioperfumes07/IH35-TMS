export type EnvBehaviorInProd =
  | "hard_fail_at_boot"
  | "disable_feature_log_error"
  | "disable_feature_log_warning";

export interface RequiredEnvSpec {
  name: string;
  feature: string;
  behavior_in_prod: EnvBehaviorInProd;
  behavior_in_dev: "disable_feature_log_warning" | "accept_with_opt_in";
  affects: string[];
  documentation: string;
}

const DEV_OPT_IN_ENV = "IH35_DEV_ACCEPT_MISSING_REQUIRED_ENV";

export const REQUIRED_ENV: ReadonlyArray<RequiredEnvSpec> = [
  {
    name: "QBO_WEBHOOK_VERIFIER_TOKEN",
    feature: "qbo_webhook_signature_verification",
    behavior_in_prod: "disable_feature_log_error",
    behavior_in_dev: "disable_feature_log_warning",
    affects: ["POST /api/v1/qbo/webhook"],
    documentation: "Intuit-issued shared secret for HMAC-SHA256 verification of inbound QBO webhook events.",
  },
  {
    name: "TWILIO_ACCOUNT_SID",
    feature: "phone_auth",
    behavior_in_prod: "disable_feature_log_error",
    behavior_in_dev: "disable_feature_log_warning",
    affects: ["POST /api/v1/auth/phone/start", "POST /api/v1/auth/phone/verify"],
    documentation: "Twilio Verify Account SID for SMS-based phone authentication.",
  },
  {
    name: "TWILIO_AUTH_TOKEN",
    feature: "phone_auth",
    behavior_in_prod: "disable_feature_log_error",
    behavior_in_dev: "disable_feature_log_warning",
    affects: ["POST /api/v1/auth/phone/start", "POST /api/v1/auth/phone/verify"],
    documentation: "Twilio Verify Auth Token for SMS-based phone authentication.",
  },
  {
    name: "TWILIO_VERIFY_SERVICE_SID",
    feature: "phone_auth",
    behavior_in_prod: "disable_feature_log_error",
    behavior_in_dev: "disable_feature_log_warning",
    affects: ["POST /api/v1/auth/phone/start", "POST /api/v1/auth/phone/verify"],
    documentation: "Twilio Verify Service SID for SMS-based phone authentication.",
  },
  {
    name: "DATABASE_URL",
    feature: "primary_database",
    behavior_in_prod: "hard_fail_at_boot",
    behavior_in_dev: "accept_with_opt_in",
    affects: ["all DB-backed routes"],
    documentation: "Postgres connection string. Backend cannot function without DB.",
  },
  {
    name: "SAMSARA_API_TOKEN",
    feature: "samsara_master_sync",
    behavior_in_prod: "disable_feature_log_error",
    behavior_in_dev: "disable_feature_log_warning",
    affects: ["samsara master sync cron", "samsara master projection to mdata.drivers/mdata.equipment"],
    documentation: "Samsara API token required for driver/vehicle master sync jobs.",
  },
] as const;

type Logger = {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

let disabledFeatures = new Set<string>();

export function setDisabledFeatures(features: Set<string>) {
  disabledFeatures = new Set(features);
}

export function isFeatureDisabled(feature: string): boolean {
  return disabledFeatures.has(feature);
}

export function getRequiredEnvSpec(name: string): RequiredEnvSpec | undefined {
  return REQUIRED_ENV.find((entry) => entry.name === name);
}

export function getEnvStatus(
  spec: RequiredEnvSpec,
  env: NodeJS.ProcessEnv = process.env
): { state: "present"; value: string } | { state: "missing"; behavior: EnvBehaviorInProd } {
  const value = (env[spec.name] ?? "").trim();
  if (value) return { state: "present", value };
  return { state: "missing", behavior: spec.behavior_in_prod };
}

function missingMessage(spec: RequiredEnvSpec) {
  return `${spec.name} missing for feature ${spec.feature}; affects ${spec.affects.join(", ")}`;
}

export function applyEnvStartupChecks(
  logger: Logger,
  env: NodeJS.ProcessEnv = process.env
): { disabled_features: Set<string>; hard_fail_messages: string[] } {
  const disabled = new Set<string>();
  const hardFailMessages: string[] = [];
  const isProd = env.NODE_ENV === "production";
  const devOptInEnabled = (env[DEV_OPT_IN_ENV] ?? "").trim() === "1";

  for (const spec of REQUIRED_ENV) {
    const status = getEnvStatus(spec, env);
    if (status.state === "present") continue;

    const payload = {
      event: "required_env_missing",
      env_name: spec.name,
      feature: spec.feature,
      behavior_in_prod: spec.behavior_in_prod,
      behavior_in_dev: spec.behavior_in_dev,
      affects: spec.affects,
      documentation: spec.documentation,
      node_env: env.NODE_ENV ?? "",
    };

    if (isProd) {
      if (spec.behavior_in_prod === "hard_fail_at_boot") {
        hardFailMessages.push(missingMessage(spec));
        logger.error(payload, "required_env hard-fail at boot");
      } else if (spec.behavior_in_prod === "disable_feature_log_error") {
        disabled.add(spec.feature);
        logger.error(payload, "required_env feature disabled");
      } else {
        disabled.add(spec.feature);
        logger.warn(payload, "required_env feature disabled");
      }
      continue;
    }

    if (spec.behavior_in_dev === "accept_with_opt_in" && devOptInEnabled) {
      logger.warn(payload, `required_env missing accepted via ${DEV_OPT_IN_ENV}=1`);
      continue;
    }

    disabled.add(spec.feature);
    logger.warn(payload, "required_env feature disabled in dev/test");
  }

  return { disabled_features: disabled, hard_fail_messages: hardFailMessages };
}
