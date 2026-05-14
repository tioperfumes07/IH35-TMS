import * as Sentry from "@sentry/node";

export type EnvValidationRow = {
  key: string;
  status: "ok" | "missing_required" | "missing_optional" | "conditional_missing";
  detail?: string;
};

export type EnvValidationResult = {
  rows: EnvValidationRow[];
  missingRequired: string[];
  missingOptional: string[];
  ok: boolean;
};

function val(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function baseRequiredKeys(): string[] {
  return [
    "DATABASE_DIRECT_URL",
    "DATABASE_URL",
    "REDIS_URL",
    "QBO_CLIENT_ID",
    "QBO_CLIENT_SECRET",
    "PLAID_CLIENT_ID",
    "PLAID_SECRET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "SENTRY_DSN",
    "SAMSARA_API_TOKEN",
    "EMAIL_PROVIDER",
    "EMAIL_FROM_NOREPLY",
    "EMAIL_FROM_DISPATCH",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
  ];
}

function r2BucketPresent(): boolean {
  return Boolean(val("R2_BUCKET_NAME") || val("R2_BUCKET"));
}

export function validateStartupEnvironment(): EnvValidationResult {
  const rows: EnvValidationRow[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  const emailProvider = val("EMAIL_PROVIDER").toLowerCase();

  for (const key of baseRequiredKeys()) {
    const present = Boolean(val(key));
    if (!present) {
      rows.push({ key, status: "missing_required" });
      missingRequired.push(key);
    } else {
      rows.push({ key, status: "ok" });
    }
  }

  if (!r2BucketPresent()) {
    rows.push({ key: "R2_BUCKET_NAME or R2_BUCKET", status: "missing_required" });
    missingRequired.push("R2_BUCKET_NAME or R2_BUCKET");
  } else {
    rows.push({
      key: val("R2_BUCKET_NAME") ? "R2_BUCKET_NAME" : "R2_BUCKET",
      status: "ok",
    });
  }

  const optionalChecks: Array<{ key: string; note?: string }> = [
    { key: "EMAIL_CRON_ENABLED" },
    { key: "AWS_SES_REGION" },
    { key: "POSTMARK_API_TOKEN" },
    { key: "WO_APPROVED_NOTIFY_EMAIL" },
    { key: "WHATSAPP_BUSINESS_NUMBER" },
  ];

  for (const opt of optionalChecks) {
    if (!val(opt.key)) {
      rows.push({ key: opt.key, status: "missing_optional", detail: opt.note });
      missingOptional.push(opt.key);
    }
  }

  if (emailProvider === "ses" && !val("AWS_SES_REGION")) {
    rows.push({
      key: "AWS_SES_REGION",
      status: "conditional_missing",
      detail: "required when EMAIL_PROVIDER=ses",
    });
    missingRequired.push("AWS_SES_REGION");
  }

  if (emailProvider === "postmark" && !val("POSTMARK_API_TOKEN")) {
    rows.push({
      key: "POSTMARK_API_TOKEN",
      status: "conditional_missing",
      detail: "required when EMAIL_PROVIDER=postmark",
    });
    missingRequired.push("POSTMARK_API_TOKEN");
  }

  const ok = missingRequired.length === 0;

  return { rows, missingRequired, missingOptional, ok };
}

export function printEnvValidationTable(result: EnvValidationResult) {
  console.log("\n[ih35-env] startup environment validation\n");
  for (const row of result.rows) {
    const detail = row.detail ? ` (${row.detail})` : "";
    console.log(`- ${row.key}: ${row.status}${detail}`);
  }
  if (result.missingOptional.length > 0) {
    console.log("\n[ih35-env] optional warnings:", result.missingOptional.join(", "));
  }
  console.log("");
}

export async function runStartupEnvironmentChecks(): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const result = validateStartupEnvironment();
  printEnvValidationTable(result);

  if (process.env.NODE_ENV !== "production" || result.ok) {
    return;
  }

  const message = `[ih35-env] Missing required environment variables: ${result.missingRequired.join(", ")}`;
  console.error(message);
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.captureMessage(message, { level: "fatal", tags: { subsystem: "env-validation" } });
    await Sentry.flush(2000).catch(() => undefined);
  }
  process.exit(1);
}
