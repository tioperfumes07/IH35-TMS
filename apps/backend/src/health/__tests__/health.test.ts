import { describe, it, expect, beforeEach, afterAll } from "vitest";
import Fastify from "fastify";
import {
  registerHealthRoutes,
  resolveBackendVersion,
  backgroundJobRule,
  toPublicHealthErrorCode,
  HealthCheckError,
  HEALTH_ERROR_GENERIC,
} from "../health.routes.js";
import { setAppReady } from "../../lib/startup-ready.js";

describe("health routes", () => {
  beforeEach(() => {
    setAppReady(false);
  });

  it("GET /api/v1/healthz/shallow returns ok + uptime", async () => {
    const app = Fastify();
    await registerHealthRoutes(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/healthz/shallow" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; uptime_seconds: number; version: string };
    expect(body.ok).toBe(true);
    expect(Number.isFinite(body.uptime_seconds)).toBe(true);
    expect(body.version).toBe(resolveBackendVersion());
  });

  it("resolveBackendVersion prefers RENDER_GIT_COMMIT then GITHUB_SHA", () => {
    const priorRender = process.env.RENDER_GIT_COMMIT;
    const priorGithub = process.env.GITHUB_SHA;
    try {
      delete process.env.RENDER_GIT_COMMIT;
      delete process.env.GITHUB_SHA;
      expect(resolveBackendVersion()).toBe("dev");

      process.env.GITHUB_SHA = "abcdef1234567890";
      expect(resolveBackendVersion()).toBe("abcdef1");

      process.env.RENDER_GIT_COMMIT = "1234567890abcdef";
      expect(resolveBackendVersion()).toBe("1234567");
    } finally {
      if (priorRender === undefined) delete process.env.RENDER_GIT_COMMIT;
      else process.env.RENDER_GIT_COMMIT = priorRender;
      if (priorGithub === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = priorGithub;
    }
  });

  it("GET /api/v1/healthz/readyz returns 503 before app ready", async () => {
    const app = Fastify();
    await registerHealthRoutes(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/healthz/readyz" });
    expect(res.statusCode).toBe(503);
  });

  it("GET /api/v1/healthz/readyz returns 200 after ready", async () => {
    setAppReady(true);
    const app = Fastify();
    await registerHealthRoutes(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/healthz/readyz" });
    expect(res.statusCode).toBe(200);
  });
});

// SEC-HEALTHZ-01 — /api/v1/healthz is unauthenticated (session-middleware.ts returns before auth
// for every /api/v1/healthz url), so anything in its body is world-readable. It used to publish
// `String((error as Error)?.message ?? error)` — raw pg/ioredis/S3 driver text carrying host, port,
// database, DB role, schema and relation names. Only a DECLARED bounded code may escape now.
describe("SEC-HEALTHZ-01 — no raw driver text escapes to an anonymous caller", () => {
  const REAL_DRIVER_ERRORS = [
    // pg — credentials, role and host
    new Error('password authentication failed for user "ih35_app"'),
    new Error("getaddrinfo ENOTFOUND ep-fancy-credit-akjnd07a.us-east-1.aws.neon.tech"),
    // pg — schema disclosure
    new Error('relation "accounting.bills" does not exist'),
    // ioredis — internal host:port
    new Error("connect ECONNREFUSED 10.0.0.5:6379"),
    // S3/R2 — endpoint carries the Cloudflare account id
    Object.assign(new Error("Bad Request"), {
      $metadata: { httpStatusCode: 400 },
      message: "endpoint https://abc123deadbeef.r2.cloudflarestorage.com rejected the request",
    }),
    // non-Error throws must not slip through the `instanceof` gap either
    "raw string throw with DATABASE_URL=postgres://ih35_app:hunter2@host/neondb",
    { message: 'password authentication failed for user "ih35_app"' },
    null,
    undefined,
  ];

  it("every driver error collapses to the generic code", () => {
    for (const err of REAL_DRIVER_ERRORS) {
      expect(toPublicHealthErrorCode(err)).toBe(HEALTH_ERROR_GENERIC);
    }
  });

  it("no sensitive token survives into the published code", () => {
    const forbidden = [/ih35_app/i, /neon\.tech/i, /ECONNREFUSED/i, /accounting\./i, /r2\.cloudflarestorage/i, /postgres:\/\//i, /\d+\.\d+\.\d+\.\d+/];
    for (const err of REAL_DRIVER_ERRORS) {
      const published = toPublicHealthErrorCode(err);
      for (const pattern of forbidden) {
        expect(pattern.test(published), `"${published}" leaked ${pattern}`).toBe(false);
      }
    }
  });

  it("a DECLARED code is published, but its detail is not", () => {
    expect(toPublicHealthErrorCode(new HealthCheckError("stale_jobs", "qbo.sync_queue_runner:412.5m"))).toBe(
      "stale_jobs"
    );
    expect(toPublicHealthErrorCode(new HealthCheckError("unresolved_depth_high", "1483"))).toBe(
      "unresolved_depth_high"
    );
    expect(toPublicHealthErrorCode(new HealthCheckError("timeout", "after_1000ms"))).toBe("timeout");
  });

  it("the real error is still preserved on the error object for server-side logging", () => {
    const err = new HealthCheckError("stale_jobs", "qbo.sync_queue_runner:412.5m");
    expect(err.message).toContain("qbo.sync_queue_runner:412.5m");
    expect(err.stack).toBeTruthy();
  });

  it("an out-of-vocabulary code cannot be smuggled through HealthCheckError", () => {
    // Interpolating driver text into the code would re-open the leak — it must fail closed.
    const smuggled = new HealthCheckError('relation "accounting.bills" does not exist');
    expect(smuggled.publicCode).toBe(HEALTH_ERROR_GENERIC);
    expect(toPublicHealthErrorCode(smuggled)).toBe(HEALTH_ERROR_GENERIC);
  });

  it("every publishable code is a bounded lowercase token", () => {
    const codes = [
      HEALTH_ERROR_GENERIC,
      toPublicHealthErrorCode(new HealthCheckError("timeout")),
      toPublicHealthErrorCode(new HealthCheckError("migration_ledger_missing")),
      toPublicHealthErrorCode(new HealthCheckError("r2_not_configured")),
      toPublicHealthErrorCode(new HealthCheckError("queued_depth_high", "9999")),
      "missing_redis_url",
    ];
    for (const code of codes) expect(code).toMatch(/^[a-z0-9_]{1,48}$/);
  });
});

// G4-HEALTH — every MONEY / recon cron that records a _system.background_jobs row MUST have a
// backgroundJobRule so a silently-stopped cron surfaces on /healthz. This guard fails if a money-cron
// job_name loses its freshness rule (regression protection).
describe("backgroundJobRule money-cron freshness coverage (G4-HEALTH guard)", () => {
  const MONEY_CRON_JOB_NAMES = [
    // recon passes (landed via A1-2)
    "accounting.recon_am_bank_count",
    "accounting.recon_pm_categorization_diff",
    // settlement / driver pay
    "driver_finance.settlement_auto_pay_cron",
    // bank feed + bank reconciliation
    "banking.plaid_daily_sync_cron",
    "accounting.bank_recon_auto_match_cron",
    // A/R collections + fuel-card expense import + insurance payments
    "accounting.collections_sync_cron",
    "fuel.loves_card_import_cron",
    "insurance.payment_reminder_cron",
    // QBO sync (inbound + change-data-capture + entity pushes)
    "integrations.qbo_inbound_sync",
    "integrations.qbo_cdc_poll",
    "sync.qbo_vendors_push",
    "sync.qbo_customers_push",
    "sync.qbo_accounts_push",
  ];

  it("every money cron has a freshness rule with a positive staleness window", () => {
    for (const jobName of MONEY_CRON_JOB_NAMES) {
      const rule = backgroundJobRule(jobName, false);
      expect(rule, `missing freshness rule for money cron "${jobName}"`).not.toBeNull();
      expect(rule!.maxStaleMinutes, `non-positive window for "${jobName}"`).toBeGreaterThan(0);
      expect(typeof rule!.enabled, `enabled must be boolean for "${jobName}"`).toBe("boolean");
    }
  });

  it("QBO inbound/CDC/push are dormant when no realm is connected (H4 — not stale)", () => {
    for (const jobName of [
      "integrations.qbo_inbound_sync",
      "integrations.qbo_cdc_poll",
      "sync.qbo_vendors_push",
      "sync.qbo_customers_push",
      "sync.qbo_accounts_push",
    ]) {
      const off = backgroundJobRule(jobName, false);
      expect(off?.enabled).toBe(false);
      expect(off?.dormantReason).toBe("no_qbo_realm_connected");
      const on = backgroundJobRule(jobName, true);
      expect(on?.enabled).toBe(true);
      expect(on?.dormantReason).toBeUndefined();
    }
  });

  it("unknown job names have no rule (default null)", () => {
    expect(backgroundJobRule("does.not.exist", false)).toBeNull();
  });

  it("settlement auto-pay rule respects its env gating", () => {
    const prior = process.env.ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON;
    try {
      delete process.env.ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON;
      expect(backgroundJobRule("driver_finance.settlement_auto_pay_cron", false)?.enabled).toBe(true);
      process.env.ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON = "false";
      expect(backgroundJobRule("driver_finance.settlement_auto_pay_cron", false)?.enabled).toBe(false);
    } finally {
      if (prior === undefined) delete process.env.ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON;
      else process.env.ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON = prior;
    }
  });

  it("default-OFF bank-recon cron only monitors when explicitly enabled", () => {
    const prior = process.env.BANK_RECON_AUTO_MATCH_CRON_ENABLED;
    try {
      delete process.env.BANK_RECON_AUTO_MATCH_CRON_ENABLED;
      expect(backgroundJobRule("accounting.bank_recon_auto_match_cron", false)?.enabled).toBe(false);
      process.env.BANK_RECON_AUTO_MATCH_CRON_ENABLED = "true";
      expect(backgroundJobRule("accounting.bank_recon_auto_match_cron", false)?.enabled).toBe(true);
    } finally {
      if (prior === undefined) delete process.env.BANK_RECON_AUTO_MATCH_CRON_ENABLED;
      else process.env.BANK_RECON_AUTO_MATCH_CRON_ENABLED = prior;
    }
  });

  // SYSTEM-BACKGROUND-JOB-LEDGER-STALE-AFTER-SUCCESSFUL-TICKS — this rule used to be unconditionally
  // enabled while the cron itself (samsara-webhook-projection.cron.ts) and its in-process catch-up
  // both default-ON-unless-explicitly-"false" gate on ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON. A
  // deliberately-disabled cron could never satisfy this rule's 15-minute window, so it alarmed DOWN
  // forever. Live-confirmed 2026-08-25: this job sat 5,305 minutes stale, the largest single
  // contributor to background_jobs.stale.
  it("samsara webhook projection rule respects the same default-ON-unless-false env gate as the cron itself", () => {
    const prior = process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON;
    try {
      delete process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON;
      expect(backgroundJobRule("samsara.webhook_projection_cron", false)?.enabled).toBe(true);
      process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON = "false";
      expect(backgroundJobRule("samsara.webhook_projection_cron", false)?.enabled).toBe(false);
      process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON = "true";
      expect(backgroundJobRule("samsara.webhook_projection_cron", false)?.enabled).toBe(true);
    } finally {
      if (prior === undefined) delete process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON;
      else process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON = prior;
    }
  });
});

// A1-1 guard: the QBO master-data mirror-staleness alarm must not self-disable when the
// sync-enabled flag is OFF — it must fire whenever a QBO realm is connected, and stay silent
// only when no realm is connected. Regression guard for the self-disabling health gate.
describe("A1-1 backgroundJobRule — QBO mirror-staleness arms on connected realm", () => {
  const prior = process.env.QBO_MASTERDATA_SYNC_ENABLED;
  beforeEach(() => {
    delete process.env.QBO_MASTERDATA_SYNC_ENABLED;
  });
  afterAll(() => {
    if (prior === undefined) delete process.env.QBO_MASTERDATA_SYNC_ENABLED;
    else process.env.QBO_MASTERDATA_SYNC_ENABLED = prior;
  });

  it("sync flag OFF + realm CONNECTED → alarm armed (was silently skipped)", () => {
    delete process.env.QBO_MASTERDATA_SYNC_ENABLED;
    const rule = backgroundJobRule("qbo.master_data_sync.delta", true);
    expect(rule).not.toBeNull();
    expect(rule?.enabled).toBe(true);
    expect(rule?.maxStaleMinutes).toBe(30);
  });

  it("sync flag OFF + NO realm connected → alarm stays silent (correct)", () => {
    delete process.env.QBO_MASTERDATA_SYNC_ENABLED;
    const rule = backgroundJobRule("qbo.master_data_sync.delta", false);
    expect(rule?.enabled).toBe(false);
  });

  it("sync flag ON → alarm armed regardless of realm connection", () => {
    process.env.QBO_MASTERDATA_SYNC_ENABLED = "true";
    expect(backgroundJobRule("qbo.master_data_sync.delta", false)?.enabled).toBe(true);
    expect(backgroundJobRule("qbo.master_data_sync.delta", true)?.enabled).toBe(true);
  });

  it("realm connection does not spuriously arm unrelated jobs", () => {
    expect(backgroundJobRule("qbo.sync_alerts_cron", true)?.enabled).toBe(false);
    expect(backgroundJobRule("email.queue_processor", true)?.enabled).toBe(false);
  });

  it("chat confirmation escalation is armed unless explicitly disabled", () => {
    delete process.env.ENABLE_CHAT_CONFIRMATION_ESCALATION_CRON;
    expect(backgroundJobRule("chat.confirmation_escalation", false)?.enabled).toBe(true);
    expect(backgroundJobRule("chat.confirmation_escalation", false)?.maxStaleMinutes).toBe(5);
    process.env.ENABLE_CHAT_CONFIRMATION_ESCALATION_CRON = "false";
    expect(backgroundJobRule("chat.confirmation_escalation", false)?.enabled).toBe(false);
  });
});
