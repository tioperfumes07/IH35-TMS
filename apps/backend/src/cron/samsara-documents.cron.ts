/**
 * ENGINE: Samsara documents (POD photo) mirror
 * SCHEDULE: 17 * * * *
 * WRITES: docs.files, docs.file_links, R2 objects
 * IDEMPOTENCY: UNIQUE(r2_key) ON CONFLICT DO NOTHING; UNIQUE(file_id, entity_type, entity_id) ON CONFLICT on links; R2 put of the same bytes is a DETERMINISTIC OVERWRITE
 * OVERLAP: second run inserts 0 files and 0 links
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 313 E-32 — hourly: Samsara driver documents (Proof of Delivery photos) of the last 7 days into docs.files,
 * linked to load / stop / unit / driver (integrations/samsara/documents/samsara-documents.service.ts). Idempotent
 * per document photo. Needs R2 configured (the store every document upload uses); otherwise it reports and stops.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { ingestSamsaraDocuments } from "../integrations/samsara/documents/samsara-documents.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CRON_NAME = "integrations.samsara_documents";
let initialized = false;

async function fetchPhoto(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`samsara_photo_http_${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "image/jpeg" };
}

export async function runSamsaraDocumentsTick(operatingCompanyId = USMCA_COMPANY_ID) {
  if (!isR2Configured()) return { skipped: "r2_not_configured" };
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const cfg = await getSamsaraConfigForCompany(client as never, operatingCompanyId);
    if (!cfg || !cfg.is_enabled) return { skipped: "samsara_not_configured" };
    const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null });
    const end = new Date();
    const docs = await api.listDocuments(new Date(end.getTime() - 7 * 86_400_000).toISOString(), end.toISOString());
    return ingestSamsaraDocuments(client as never, operatingCompanyId, docs, { put: (k, b, m) => putObjectBytes(k, b, m) }, fetchPhoto);
  });
}

export function initializeSamsaraDocumentsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  cron.schedule("17 * * * *", async () => {
    await wrapBackgroundJobTick(CRON_NAME, async () => {
      assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
      app.log.info(await runSamsaraDocumentsTick(), `${CRON_NAME} tick`);
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 30_000 });
  app.log.info(`${CRON_NAME} scheduled (hourly :17)`);
}
