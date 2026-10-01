import { describe, expect, it } from "vitest";
import {
  chooseCurrentOdometer,
  latestStopCapturedOdometer,
  type OdometerReading,
} from "../pm-current-odometer.js";
import { computePmDueEngineForCompany } from "../pm-due-engine.service.js";

const UNIT = "00000000-0000-4000-8000-000000000001";
const OPCO = "00000000-0000-4000-8000-0000000000aa";

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}
const MIN = 60_000;
const HOUR = 60 * MIN;

type Fix = { captured_at: string; speed_mph: number | null; odometer_mi: number | null; engine_state?: string };

/** A run of fixes every 2 min, all at one speed, optionally carrying an odometer on one of them. */
function run(startMsAgo: number, count: number, speed: number, odometer: number | null, odoIndex = 0): Fix[] {
  return Array.from({ length: count }, (_, i) => ({
    captured_at: iso(startMsAgo - i * 2 * MIN),
    speed_mph: speed,
    odometer_mi: i === odoIndex ? odometer : null,
    engine_state: speed > 1 ? "on" : "idle",
  }));
}

function fixesClient(fixes: Fix[]) {
  return {
    query: async <T>(_sql: string): Promise<{ rows: T[] }> =>
      ({
        rows: fixes.map((f) => ({
          captured_at: f.captured_at,
          lat: 27.5,
          lng: -99.5,
          speed_mph: f.speed_mph,
          engine_state: f.engine_state ?? null,
          odometer_mi: f.odometer_mi,
          city: "Laredo",
          state: "TX",
        })) as T[],
      }),
  };
}

describe("chooseCurrentOdometer -- newest real read wins, a backwards read is held", () => {
  const r = (odometer_miles: number, msAgo: number, source: OdometerReading["source"]): OdometerReading => ({
    odometer_miles,
    read_at: iso(msAgo),
    source,
  });

  it("takes the newer reading when it is not lower", () => {
    const out = chooseCurrentOdometer([r(455164, 6 * HOUR, "odometer_readings"), r(455487.2, 0.4 * HOUR, "stop_capture")]);
    expect(out).toMatchObject({ odometer_miles: 455487.2, source: "stop_capture", held_note: null });
  });

  it("T171 shape: a newer stop read 12.5 mi BELOW a manual ledger entry is held, the ledger stands", () => {
    const out = chooseCurrentOdometer([r(437005, 6 * HOUR, "odometer_readings"), r(436992.5, 0.2 * HOUR, "stop_capture")]);
    expect(out.odometer_miles).toBe(437005);
    expect(out.source).toBe("odometer_readings");
    expect(out.held_note).toMatch(/stop_capture 436992\.5 mi .* BELOW odometer_readings 437005 mi .* held, not used/);
  });

  it("equal readings keep the newer source, nothing held", () => {
    const out = chooseCurrentOdometer([r(571543.5, 8 * HOUR, "odometer_readings"), r(571543.5, 1 * HOUR, "stop_capture")]);
    expect(out).toMatchObject({ source: "stop_capture", held_note: null });
  });

  it("no real reading at all is null, never a number", () => {
    expect(chooseCurrentOdometer([null, undefined])).toEqual({ odometer_miles: null, read_at: null, source: null, held_note: null });
  });

  it("drops non-finite values and unparseable timestamps instead of comparing them", () => {
    const out = chooseCurrentOdometer([
      { odometer_miles: Number.NaN, read_at: iso(0), source: "stop_capture" },
      { odometer_miles: 999999, read_at: "not-a-date", source: "stop_capture" },
      r(100, HOUR, "odometer_readings"),
    ]);
    expect(out).toMatchObject({ odometer_miles: 100, source: "odometer_readings" });
  });
});

describe("latestStopCapturedOdometer -- reuses the Lead's engine, READ or ABSENT", () => {
  it("returns the odometer read inside the most recent stop", async () => {
    const fixes = [...run(90 * MIN, 5, 55, null), ...run(80 * MIN, 6, 0, 398304.1, 2), ...run(68 * MIN, 3, 50, null)];
    const out = await latestStopCapturedOdometer(fixesClient(fixes), UNIT);
    expect(out).toMatchObject({ odometer_miles: 398304.1, source: "stop_capture" });
  });

  it("attaches the nearest odometer within tolerance when the stop itself carried none", async () => {
    const fixes = [...run(40 * MIN, 2, 55, 500100, 0), ...run(30 * MIN, 5, 0, null)];
    const out = await latestStopCapturedOdometer(fixesClient(fixes), UNIT);
    expect(out?.odometer_miles).toBe(500100);
  });

  it("never takes a moving fix's odometer when the truck never stopped >= 3 min", async () => {
    const fixes = run(30 * MIN, 10, 60, 600000, 4);
    expect(await latestStopCapturedOdometer(fixesClient(fixes), UNIT)).toBeNull();
  });

  it("a stop with no odometer anywhere within tolerance yields null, not a stale value", async () => {
    const fixes = [...run(10 * HOUR, 2, 55, 700000, 0), ...run(30 * MIN, 5, 0, null)];
    expect(await latestStopCapturedOdometer(fixesClient(fixes), UNIT)).toBeNull();
  });
});

describe("computePmDueEngineForCompany -- the newest record decides", () => {
  function engineClient(opts: { gapMsAgo: number | null; ledgerReal: { odo: number; msAgo: number } | null; fixes: Fix[] }) {
    return {
      query: async <T>(sql: string): Promise<{ rows: T[] }> => {
        const rows = (x: unknown[]) => ({ rows: x as T[] });
        if (sql.includes("FROM maintenance.pm_schedules")) {
          return rows([{ id: "s1", unit_id: UNIT, unit_number: "T170", label: "PM A", interval_value: 25000, last_service_odometer: 390000 }]);
        }
        if (sql.includes("FROM telematics.vehicle_locations")) return fixesClient(opts.fixes).query<T>(sql);
        if (sql.includes("confidence = 'suggested'")) return rows([{ n: opts.gapMsAgo == null ? "0" : "1" }]);
        if (sql.includes("ORDER BY read_at ASC")) return rows([]);
        const real = opts.ledgerReal
          ? { odometer_miles: String(opts.ledgerReal.odo), read_at: new Date(Date.now() - opts.ledgerReal.msAgo), confidence: "measured" }
          : null;
        if (sql.includes("confidence IN ('measured', 'entered')")) return rows(real ? [real] : []);
        const gap = opts.gapMsAgo == null ? null : { odometer_miles: null, read_at: new Date(Date.now() - opts.gapMsAgo), confidence: "suggested" };
        const newest = [gap, real].filter(Boolean).sort((a, b) => b!.read_at.getTime() - a!.read_at.getTime())[0];
        return rows(newest ? [newest] : []);
      },
    };
  }

  it("T170 shape: a real stop read NEWER than the ledger's gap row recovers the current odometer", async () => {
    const client = engineClient({
      gapMsAgo: 28.7 * HOUR,
      ledgerReal: { odo: 398000, msAgo: 30 * HOUR },
      fixes: run(100 * MIN, 6, 0, 398304.1, 1),
    });
    const [row] = await computePmDueEngineForCompany(client, OPCO);
    expect(row).toMatchObject({ current_odometer: 398304.1, current_odometer_source: "stop_capture" });
    expect(row.miles_since_service).toBeCloseTo(8304.1, 5);
  });

  it("a gap row NEWER than every real read stays unknown -- never an older number", async () => {
    const client = engineClient({
      gapMsAgo: 10 * MIN,
      ledgerReal: { odo: 398000, msAgo: 30 * HOUR },
      fixes: run(100 * MIN, 6, 0, 398304.1, 1),
    });
    const [row] = await computePmDueEngineForCompany(client, OPCO);
    expect(row.current_odometer).toBeNull();
    expect(row.current_odometer_note).toMatch(/newest record is a recorded odometer gap/);
    expect(row.miles_since_service).toBeNull();
  });

  it("no stop in the window leaves the ledger reading exactly as before", async () => {
    const client = engineClient({ gapMsAgo: null, ledgerReal: { odo: 815317.3, msAgo: 6 * HOUR }, fixes: [] });
    const [row] = await computePmDueEngineForCompany(client, OPCO);
    expect(row).toMatchObject({ current_odometer: 815317.3, current_odometer_source: "odometer_readings", current_odometer_note: null });
  });
});
