import { afterEach, describe, expect, it, vi } from "vitest";
import { SamsaraApiError, SamsaraClient } from "./samsara-client.js";

const originalFetch = globalThis.fetch;

describe("SamsaraClient count methods", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("counts drivers across paginated responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "d1" }, { id: "d2" }],
            pagination: { hasNextPage: true, endCursor: "c2" },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "d3" }],
            pagination: { hasNextPage: false },
          }),
          { status: 200 }
        )
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SamsaraClient({ apiToken: "token", samsaraOrgId: "org-1" });
    const count = await client.countDrivers();

    expect(count).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/fleet/drivers");
  });

  it("throws SamsaraApiError on 429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "rate limited" }), { status: 429 })
    ) as unknown as typeof fetch;

    const client = new SamsaraClient({ apiToken: "token", samsaraOrgId: "org-1" });

    try {
      await client.countVehicles();
      throw new Error("expected countVehicles to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SamsaraApiError);
      expect(error).toMatchObject({ statusCode: 429 });
    }
  });
});
