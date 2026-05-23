import { getCurrentClocks, type HosClocks } from "./hos-clocks.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type FuelRouteContextRow = {
  load_id: string;
  driver_id: string | null;
  current_fuel_gallons: number | null;
  fuel_capacity_gallons: number | null;
  current_mpg: number | null;
};

type RouteStopRow = {
  stop_id: string;
  sequence_number: number;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  scheduled_arrival_at: string | null;
};

export type FuelStopRecommendationReason = "low_fuel" | "ten_hour_reset_window";

export type FuelStopRecommendation = {
  stop_id: string;
  sequence_number: number;
  city: string | null;
  state: string | null;
  reason: FuelStopRecommendationReason;
  estimated_arrival_at: string | null;
  estimated_route_mile: number;
  drive_remaining_min_at_arrival: number;
  note: string;
};

export type RecommendFuelStopsInput = {
  operating_company_id: string;
  recommendation_id: string;
  avg_speed_mph?: number;
  safety_threshold_miles?: number;
};

export const DEFAULT_AVG_SPEED_MPH = 60;
export const DEFAULT_MPG = 6.5;
export const DEFAULT_SAFETY_THRESHOLD_MILES = 50;

export function estimateRouteMilesByStop(stops: RouteStopRow[]): Array<RouteStopRow & { estimated_route_mile: number }> {
  if (stops.length === 0) return [];
  let cumulative = 0;
  return stops.map((stop, idx) => {
    if (idx > 0) cumulative += 150;
    return { ...stop, estimated_route_mile: cumulative };
  });
}

export function deriveFuelRecommendations(args: {
  stops: Array<RouteStopRow & { estimated_route_mile: number }>;
  hos: HosClocks | null;
  currentFuelGallons: number | null;
  mpg: number | null;
  avgSpeedMph?: number;
  safetyThresholdMiles?: number;
}): FuelStopRecommendation[] {
  const avgSpeed = args.avgSpeedMph ?? DEFAULT_AVG_SPEED_MPH;
  const safetyThreshold = args.safetyThresholdMiles ?? DEFAULT_SAFETY_THRESHOLD_MILES;
  const mpg = args.mpg ?? DEFAULT_MPG;
  const remainingFuelMiles = (args.currentFuelGallons ?? 0) * mpg;
  const remainingDriveMiles = args.hos ? (args.hos.drive_remaining_min / 60) * avgSpeed : Number.POSITIVE_INFINITY;
  const recommendations: FuelStopRecommendation[] = [];
  let resetSuggestionAdded = false;

  for (const stop of args.stops) {
    const milesAtStop = stop.estimated_route_mile;
    const etaMinutes = Math.round((milesAtStop / avgSpeed) * 60);
    const driveAtArrival = Math.max(0, Math.floor((remainingDriveMiles - milesAtStop) / avgSpeed * 60));
    const estimatedArrivalAt = stop.scheduled_arrival_at
      ? new Date(new Date(stop.scheduled_arrival_at).getTime() - Math.max(0, etaMinutes) * 60000).toISOString()
      : null;

    if (remainingFuelMiles - milesAtStop <= safetyThreshold) {
      recommendations.push({
        stop_id: stop.stop_id,
        sequence_number: stop.sequence_number,
        city: stop.city,
        state: stop.state,
        reason: "low_fuel",
        estimated_arrival_at: estimatedArrivalAt,
        estimated_route_mile: milesAtStop,
        drive_remaining_min_at_arrival: driveAtArrival,
        note: "Fuel range approaches safety threshold.",
      });
      continue;
    }

    if (!resetSuggestionAdded && remainingDriveMiles < milesAtStop) {
      recommendations.push({
        stop_id: stop.stop_id,
        sequence_number: stop.sequence_number,
        city: stop.city,
        state: stop.state,
        reason: "ten_hour_reset_window",
        estimated_arrival_at: estimatedArrivalAt,
        estimated_route_mile: milesAtStop,
        drive_remaining_min_at_arrival: 0,
        note: "HOS drive clock exhausted before destination; schedule refuel during reset.",
      });
      resetSuggestionAdded = true;
    }
  }

  return recommendations;
}

async function fetchRouteContext(client: DbClient, input: RecommendFuelStopsInput): Promise<FuelRouteContextRow | null> {
  const res = await client.query<FuelRouteContextRow>(
    `
      SELECT
        r.load_id::text AS load_id,
        r.driver_id::text AS driver_id,
        r.current_fuel_gallons::double precision AS current_fuel_gallons,
        r.fuel_capacity_gallons::double precision AS fuel_capacity_gallons,
        r.current_mpg::double precision AS current_mpg
      FROM fuel.route_recommendations r
      WHERE r.id = $1::uuid
        AND r.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.recommendation_id, input.operating_company_id]
  );
  return res.rows[0] ?? null;
}

async function fetchRouteStops(client: DbClient, input: RecommendFuelStopsInput, loadId: string): Promise<RouteStopRow[]> {
  const res = await client.query<RouteStopRow>(
    `
      SELECT
        s.id::text AS stop_id,
        s.sequence_number,
        s.city,
        s.state,
        COALESCE(s.latitude, loc.latitude)::double precision AS latitude,
        COALESCE(s.longitude, loc.longitude)::double precision AS longitude,
        s.scheduled_arrival_at::text
      FROM mdata.load_stops s
      JOIN mdata.loads l ON l.id = s.load_id
      LEFT JOIN mdata.locations loc ON loc.id = s.location_id
      WHERE s.load_id = $1::uuid
        AND l.operating_company_id = $2::uuid
      ORDER BY s.sequence_number ASC
    `,
    [loadId, input.operating_company_id]
  );
  return res.rows;
}

export async function recommendFuelStopsForRecommendation(
  client: DbClient,
  input: RecommendFuelStopsInput
): Promise<FuelStopRecommendation[]> {
  const context = await fetchRouteContext(client, input);
  if (!context) return [];

  const stops = await fetchRouteStops(client, input, context.load_id);
  const routeMiles = estimateRouteMilesByStop(stops);
  const hos = context.driver_id ? await getCurrentClocks(client as never, input.operating_company_id, context.driver_id) : null;

  return deriveFuelRecommendations({
    stops: routeMiles,
    hos,
    currentFuelGallons: context.current_fuel_gallons,
    mpg: context.current_mpg,
    avgSpeedMph: input.avg_speed_mph,
    safetyThresholdMiles: input.safety_threshold_miles,
  });
}
