// @cron-tenant-agnostic: the certifier deliberately evaluates EVERY entity in one pass and must NOT
// set app.operating_company_id. Measured on prod: setting that GUC alongside the lucia bypass drops
// visibility to zero, so asserting a single tenant context here would blind the probes and certify a
// false all-red board. Entity scoping is carried by each probe's $1 parameter instead, which is why
// there is no per-tenant scheduler context to assert (DD-7 / B-017 does not apply).
/**
 * Scenario-tracker certifier cron (spec §4) — every 5 minutes, America/Chicago.
 *
 * Render cron SERVICES were never provisioned for this repo (see the crons-run-in-process landmine), so
 * a render.yaml entry would schedule nothing. This runs in-process alongside the other crons, which is
 * where the schedule actually lives.
 *
 * Cadence affects freshness, NOT correctness: the read path re-evaluates every predicate at request
 * time and downgrades a dot itself, so a stale certification can never show false green. That is what
 * makes it safe to run unattended.
 *
 * Off switch: ENABLE_SCENARIO_CERTIFY_CRON=false.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { certifyAllScenarios } from "./scenario-certify.service.js";

let initialized = false;

export function registerScenarioCertifyCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_SCENARIO_CERTIFY_CRON === "false") {
    app.log.info("Scenario certify cron disabled via ENABLE_SCENARIO_CERTIFY_CRON=false");
    return;
  }

  cron.schedule(
    "*/5 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "scenario.certify_cron",
        async () => {
          // withLuciaBypass supplies the session-scoped bypass. Deliberately NOT setting
          // app.operating_company_id: measured on prod, setting it alongside the bypass drops
          // visibility to zero. Entity scoping lives in each probe's $1 parameter.
          const summary = await withLuciaBypass((client) => certifyAllScenarios(client));
          app.log.info(
            {
              certified: summary.certified,
              passed: summary.passed,
              not_yet: summary.notYet,
              regressed: summary.regressed,
              skipped: summary.skipped,
              errors: summary.errors.length,
            },
            "scenario certify tick"
          );
          if (summary.errors.length) {
            app.log.warn({ errors: summary.errors.slice(0, 5) }, "scenario certify: slice error(s)");
          }
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Scenario certify cron scheduled (every 5 min, America/Chicago)");
}
