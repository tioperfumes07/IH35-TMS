// Relay fuel ingest — one daily tick on demand, run as a Render one-off job inside the backend's own
// environment (the Relay keys never leave Render):
//   node dist/sync/run-relay-fuel-ingest-tick.js [operating_company_id ...]
// Same function the 07:00 Chicago cron calls (runRelayFuelIngestTick): claim, resume from the last
// covered day, pull, upsert, sync-log row. No ids = every flag-ON company.
import { initBackendSentry } from "../lib/sentry.js";
import { runRelayFuelIngestTick } from "../integrations/relay-payments/relay-fuel-ingest.cron.js";

initBackendSentry();

const log = {
  info: (...a: unknown[]) => console.log("[relay-fuel-ingest-tick]", JSON.stringify(a)),
  warn: (...a: unknown[]) => console.warn("[relay-fuel-ingest-tick]", JSON.stringify(a)),
  error: (...a: unknown[]) => console.error("[relay-fuel-ingest-tick]", JSON.stringify(a, (_k, v) => (v instanceof Error ? v.message : v))),
};

const ids = process.argv.slice(2).filter((x) => /^[0-9a-f-]{36}$/i.test(x));

runRelayFuelIngestTick({ log } as never, ids.length ? { operatingCompanyIds: ids } : undefined)
  .then(() => {
    console.log("[relay-fuel-ingest-tick] done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[relay-fuel-ingest-tick] failed", error);
    process.exit(1);
  });
