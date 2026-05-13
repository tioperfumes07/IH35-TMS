import { describe, expect, it, vi } from "vitest";
import { generateWorkOrderNumber } from "../wo-number.service.js";

function mockClient(rowsSequence: Array<Array<Record<string, unknown>>>) {
  let idx = 0;
  return {
    async query(sql: string, values?: unknown[]) {
      const next = rowsSequence[idx] ?? [];
      idx += 1;
      // eslint-disable-next-line no-console
      if (process.env.DEBUG_WO_NUMBER_TESTS) console.error({ sql, values, next });
      return { rows: next };
    },
  };
}

describe("generateWorkOrderNumber", () => {
  it("uses load suffix for linked loads", async () => {
    const client = mockClient([[{ load_number: "L-13518" }]]);
    const num = await generateWorkOrderNumber(client as never, {
      operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      linkedLoadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(num).toBe("W-13518");
  });

  it("uses last segment for dotted load numbers", async () => {
    const client = mockClient([[{ load_number: "L-20260513-0005" }]]);
    const num = await generateWorkOrderNumber(client as never, {
      operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      linkedLoadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(num).toBe("W-0005");
  });

  it("allocates monthly sequences", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T12:00:00.000Z"));
    const client = mockClient([[{ last_seq: 1 }]]);
    const num = await generateWorkOrderNumber(client as never, {
      operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      linkedLoadId: null,
    });
    expect(num).toBe("W-202605-0001");
    vi.useRealTimers();
  });
});
