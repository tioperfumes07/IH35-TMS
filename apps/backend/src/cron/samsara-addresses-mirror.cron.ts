/**
 * ENGINE: Samsara address mirror refresh
 * SCHEDULE: 45 *\/6 * * * (+ once ~2 min after boot)
 * WRITES: integrations.samsara_addresses only (the read-only mirror of Samsara's address book)
 * IDEMPOTENCY: UNIQUE(operating_company_id, samsara_address_id) ON CONFLICT DO UPDATE (DETERMINISTIC OVERWRITE)
 * OVERLAP: lease per tick (withJobLease); a second instance skips
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 443.38 item 3 (owner 2026-10-11 00:30 CT): integrations.samsara_addresses froze at 2026-10-01 04:38 UTC because NOTHING
 * scheduled ever refreshed it — the only writer, mirrorSamsaraAddresses, ran inside runGeofenceAddressLink's AUTH-gated
 * --apply, executed once by the AUTH-183..187 fence-link script; the GET route is dry-run only. Booking now resolves stops
 * against these addresses (street + lat/lng + geofence), so the mirror must track Samsara. This engine refreshes the MIRROR
 * only: it never links or edits a geofence (that stays the AUTH-gated runGeofenceAddressLink / a human acceptProposal).
 * Tenants: listSamsaraIngestionTenantIds (USMCA owns the one Samsara feed; frozen Transportation is excluded).
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import { listSamsaraIngestionTenantIds } from "../integrations/samsara/ingestion-tenants.service.js";
import { mirrorSamsaraAddresses } from "../integrations/samsara/geofences/geofence-address-link.service.js";
import type { SamsaraAddress } from "../integrations/samsara/samsara-client.js";

const CRON_NAME = "samsara.addresses_mirror";
let initialized = false;

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
export type AddressFetcher = (operatingCompanyId: string, client: Db) => Promise<SamsaraAddress[] | null>;

const fetchFromSamsara: AddressFetcher = async (operatingCompanyId, client) => {
  const cfg = await getSamsaraConfigForCompany(client as never, operatingCompanyId);
  if (!cfg || !cfg.is_enabled) return null;
  return new SamsaraClient({
    apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>),
    samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
  }).listAddresses();
};

/** One refresh: every ingestion tenant's Samsara address book upserted into the mirror. */
export async function runSamsaraAddressesMirrorTick(fetch: AddressFetcher = fetchFromSamsara) {
  return withLuciaBypass(async (client) => {
    const out: Array<{ operating_company_id: string; written?: number; skipped?: string }> = [];
    for (const operatingCompanyId of await listSamsaraIngestionTenantIds(client)) {
      assertTenantContext(operatingCompanyId, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      const raw = await fetch(operatingCompanyId, client as Db);
      if (!raw) {
        out.push({ operating_company_id: operatingCompanyId, skipped: "samsara_not_configured" });
        continue;
      }
      // An empty answer is a Samsara/token fault, never "the owner deleted every address": keep the mirror as it is.
      if (raw.length === 0) throw new Error(`${CRON_NAME}: Samsara returned 0 addresses for ${operatingCompanyId}; mirror left unchanged`);
      out.push({ operating_company_id: operatingCompanyId, written: await mirrorSamsaraAddresses(client as never, operatingCompanyId, raw) });
    }
    return out;
  });
}

export function initializeSamsaraAddressesMirrorCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  const tick = (name: string) =>
    wrapBackgroundJobTick(name, async () => {
      app.log.info({ result: await runSamsaraAddressesMirrorTick() }, `${name} complete`);
    }, app.log, { leaseSeconds: JOB_LEASE_SECONDS });
  cron.schedule("45 */6 * * *", async () => { await tick(CRON_NAME); }, { timezone: "America/Chicago", maxRandomDelay: 30_000 });
  // A deploy refreshes a stale mirror without waiting for the next 6-hour mark.
  setTimeout(() => { void tick(`${CRON_NAME}.boot`); }, 120_000).unref?.();
  app.log.info(`${CRON_NAME} scheduled (every 6 h at :45 America/Chicago, + once after boot)`);
}
