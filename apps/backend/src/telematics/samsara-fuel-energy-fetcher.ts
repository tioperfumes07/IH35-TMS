import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import { SamsaraClient, type SamsaraFuelEnergyRow } from "../integrations/samsara/samsara-client.js";
import { getSamsaraConfigForCompany, type PgClient } from "../integrations/samsara/samsara.service.js";

/**
 * The one way to read Samsara's Fuel & Energy report for a company and window (T-50 route and the
 * E-21 integrity signal). Throws "samsara_not_configured" when the company has no Samsara config;
 * callers report that as a reason, never as zero consumption.
 */
export function samsaraFuelEnergyFetcher(client: PgClient, operatingCompanyId: string, fromIso: string, toIso: string) {
  return async (kind: "vehicles" | "drivers"): Promise<SamsaraFuelEnergyRow[]> => {
    const config = await getSamsaraConfigForCompany(client as never, operatingCompanyId);
    if (!config) throw new Error("samsara_not_configured");
    return new SamsaraClient({ apiToken: resolveSamsaraApiToken(config as Record<string, unknown>), samsaraOrgId: null }).listFuelEnergyReports(kind, fromIso, toIso);
  };
}
