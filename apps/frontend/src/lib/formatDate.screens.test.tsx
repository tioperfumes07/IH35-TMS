// Rows 183 201 205 206 219 228 245 246 251 253 (design audit D004 D025 D029 D030 D043 D052 D069 D070 D075 D077):
// every one of those screens renders its dates through lib/formatDate. These tests pin the exact shapes those
// screens now emit for the inputs they actually receive, so a revert to M/D/YY, YYYY-MM-DD, MON-DD, "Oct 22" or an
// unpadded locale string fails here. The static guard scripts/verify-dates-use-shared-us-format.mjs pins the call sites.
import { describe, expect, it } from "vitest";
import { formatDate, formatDateQboList, formatDateTimeUS, formatDateUS, mmmDd } from "./formatDate";
import { TOUR_LOAD_COLUMNS, type TourLoadRow } from "../components/dispatch/TourLoadRows";

const MMDDYYYY = /^\d{2}\/\d{2}\/\d{4}$/;
const MMDDYYYY_TIME = /^\d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (AM|PM)$/;

describe("shared US date formatter — the shapes the 10 register screens render", () => {
  it("bare ISO dates (183 axis, 201 PU/DEL, 205 Since, 206 subtitle + grid, 219 cells, 245 heading, 246 candidates, 251 PU/DEL)", () => {
    for (const iso of ["2026-10-01", "2026-10-23", "2026-01-05", "2026-12-31"]) {
      expect(formatDateUS(iso)).toMatch(MMDDYYYY);
    }
    expect(formatDateUS("2026-10-01")).toBe("10/01/2026");
    expect(formatDate("2026-01-05")).toBe("01/05/2026");
    // 245 (D069) heading and 201 (D025) cells call formatDateQboList — must be four-digit year, never 10/23/26.
    expect(formatDateQboList("2026-10-23")).toBe("10/23/2026");
    // 251 (D075) — the retired MMM-DD helper must not resurrect "OCT-21".
    expect(mmmDd("2026-10-21")).toBe("10/21/2026");
  });

  it("no timezone shift on a bare calendar date (06:00 UTC west-of-GMT trap)", () => {
    expect(formatDateUS("2026-08-01")).toBe("08/01/2026");
  });

  it("timestamps (228 Filed, 253 Updated) are zero-padded MM/DD/YYYY, h:mm AM/PM in Central", () => {
    const filed = formatDateTimeUS("2026-03-04T15:07:00Z");
    expect(filed).toMatch(MMDDYYYY_TIME);
    expect(filed).toBe("03/04/2026, 9:07 AM");
    expect(formatDateTimeUS("2026-10-05T02:30:00Z")).toBe("10/04/2026, 9:30 PM");
  });

  it("blank input renders blank, never 'Invalid Date'", () => {
    expect(formatDateUS(null)).toBe("");
    expect(formatDateUS("not-a-date")).toBe("");
    expect(formatDateTimeUS("")).toBe("");
  });
});

describe("Row 251 (D075) — Settlements › Open Tours PU / DEL cells", () => {
  it("pickup / delivery / started cells render MM/DD/YYYY, not OCT-21", () => {
    const cols = TOUR_LOAD_COLUMNS("open");
    const row = {
      pickup_date: "2026-10-21",
      delivery_date: "2026-10-23",
      trip_started_at: "2026-10-21",
      trip_closed_at: null,
    } as unknown as TourLoadRow;
    const cell = (key: string) => String(cols.find((c) => c.key === key)?.render?.(row));
    expect(cell("pickup")).toBe("10/21/2026");
    expect(cell("delivery")).toBe("10/23/2026");
    expect(cell("started")).toBe("10/21/2026");
  });
});
