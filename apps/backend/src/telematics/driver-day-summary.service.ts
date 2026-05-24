export type DriverDaySummaryRow = {
  driver_id: string;
  driver_name: string;
  miles: number;
  hours_on_duty: number;
  fuel_stops: number;
  on_time_arrivals: number;
  late_arrivals: number;
};

type PositionPoint = {
  driver_id: string;
  captured_at: string;
  lat: number;
  lng: number;
};

type DutySlice = {
  driver_id: string;
  minutes_on_duty: number;
};

type DriverSummaryFixtureInput = {
  positions: PositionPoint[];
  duty: DutySlice[];
  fuelStops: Array<{ driver_id: string }>;
  arrivals: Array<{ driver_id: string; on_time: boolean }>;
  driverNames: Record<string, string>;
};

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return 3958.7613 * c;
}

export function aggregateDriverDaySummaryFromFixtures(input: DriverSummaryFixtureInput): DriverDaySummaryRow[] {
  const byDriver = new Map<string, DriverDaySummaryRow>();
  const ensure = (driverId: string): DriverDaySummaryRow => {
    let row = byDriver.get(driverId);
    if (!row) {
      row = {
        driver_id: driverId,
        driver_name: input.driverNames[driverId] ?? "Unknown driver",
        miles: 0,
        hours_on_duty: 0,
        fuel_stops: 0,
        on_time_arrivals: 0,
        late_arrivals: 0,
      };
      byDriver.set(driverId, row);
    }
    return row;
  };

  const groupedPoints = new Map<string, PositionPoint[]>();
  for (const point of input.positions) {
    if (!groupedPoints.has(point.driver_id)) groupedPoints.set(point.driver_id, []);
    groupedPoints.get(point.driver_id)!.push(point);
    ensure(point.driver_id);
  }
  for (const [driverId, points] of groupedPoints) {
    points.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      ensure(driverId).miles += haversineMiles(prev.lat, prev.lng, curr.lat, curr.lng);
    }
  }

  for (const slice of input.duty) {
    ensure(slice.driver_id).hours_on_duty += slice.minutes_on_duty / 60;
  }
  for (const stop of input.fuelStops) ensure(stop.driver_id).fuel_stops += 1;
  for (const arrival of input.arrivals) {
    if (arrival.on_time) ensure(arrival.driver_id).on_time_arrivals += 1;
    else ensure(arrival.driver_id).late_arrivals += 1;
  }

  return Array.from(byDriver.values())
    .map((row) => ({
      ...row,
      miles: Number(row.miles.toFixed(1)),
      hours_on_duty: Number(row.hours_on_duty.toFixed(2)),
    }))
    .sort((a, b) => b.miles - a.miles || a.driver_name.localeCompare(b.driver_name));
}
