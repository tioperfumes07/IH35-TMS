/**
 * GO-19-2b Section 6: self-hosted OSRM provider. Reads OSRM_BASE_URL (a self-hosted OSRM instance
 * this repo does not provision -- infrastructure decision named in the PR, not silently assumed).
 * UNCONFIGURED IS NOT AN ERROR STATE THAT CRASHES A CALLER: route() throws a plain Error when the
 * base URL is missing or the call fails; mileage.service.ts (the ONLY caller) catches it and
 * returns the honest NULL+reason shape -- never a guess, never 0.
 *
 * fastest -> practical (OSRM's standard "driving" profile route distance).
 * shortest -> shortest_miles stays NULL here. Vanilla OSRM's default driving profile IS the
 * fastest-route weighting; a true shortest-BY-DISTANCE route needs a distinct OSRM profile
 * (a custom .lua weighting) that is not deployed -- honest NULL, not a guessed approximation from
 * the fastest route, matching Section 2's own law for lane_mileage.short_miles.
 */
import type { MileagePoint, MileageProvider, MileageRouteResult } from "./mileage-provider.js";

const METERS_PER_MILE = 1609.344;

export class OsrmProvider implements MileageProvider {
  readonly name = "osrm";
  readonly version: string;
  private readonly baseUrl: string | null;

  constructor(opts?: { baseUrl?: string | null; version?: string }) {
    this.baseUrl = opts?.baseUrl ?? process.env.OSRM_BASE_URL ?? null;
    this.version = opts?.version ?? process.env.OSRM_ENGINE_VERSION ?? "unknown";
  }

  async route(from: MileagePoint, to: MileagePoint): Promise<MileageRouteResult> {
    if (!this.baseUrl) {
      return { practical_miles: null, shortest_miles: null, reason: "osrm_not_configured" };
    }
    const url = `${this.baseUrl.replace(/\/$/, "")}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false&steps=false`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      return {
        practical_miles: null,
        shortest_miles: null,
        reason: `osrm_request_failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!res.ok) {
      return { practical_miles: null, shortest_miles: null, reason: `osrm_http_${res.status}` };
    }
    const body = (await res.json()) as { code?: string; routes?: Array<{ distance?: number }> };
    if (body.code !== "Ok" || !body.routes?.[0] || typeof body.routes[0].distance !== "number") {
      return { practical_miles: null, shortest_miles: null, reason: `osrm_no_route (code=${body.code ?? "unknown"})` };
    }
    const miles = body.routes[0].distance / METERS_PER_MILE;
    return { practical_miles: Math.round(miles * 10) / 10, shortest_miles: null };
  }
}
