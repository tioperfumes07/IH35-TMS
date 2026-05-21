import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { collectSamsaraRemoteCounts } from "./remote-count-collector.js";
import { withLuciaBypass } from "../../auth/db.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { SamsaraApiError, SamsaraClient } from "./samsara-client.js";

const { countDriversMock, countVehiclesMock } = vi.hoisted(() => ({
  countDriversMock: vi.fn(),
  countVehiclesMock: vi.fn(),
}));

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(),
}));

vi.mock("./samsara.service.js", () => ({
  getSamsaraConfigForCompany: vi.fn(),
}));

vi.mock("../../lib/samsara-crypto.js", () => ({
  decryptSamsaraSecret: vi.fn(),
}));

vi.mock("./samsara-client.js", () => ({
  SamsaraApiError: class SamsaraApiError extends Error {
    statusCode: number | null;
    body: Record<string, unknown> | null;
    retryable: boolean;
    constructor(message: string, statusCode: number | null, body: Record<string, unknown> | null, retryable: boolean) {
      super(message);
      this.statusCode = statusCode;
      this.body = body;
      this.retryable = retryable;
    }
  },
  SamsaraClient: vi.fn().mockImplementation(() => ({
    countDrivers: countDriversMock,
    countVehicles: countVehiclesMock,
  })),
}));

describe("samsara remote-count collector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countDriversMock.mockReset();
    countVehiclesMock.mockReset();
  });

  it("skips when tenant has no enabled config", async () => {
    const queryMock = vi.fn(async () => ({ rows: [] }));
    (withLuciaBypass as unknown as Mock).mockImplementation(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock })
    );
    (getSamsaraConfigForCompany as unknown as Mock).mockResolvedValue(null);

    const result = await collectSamsaraRemoteCounts("11111111-1111-1111-1111-111111111111");

    expect(result.collected_count).toBe(0);
    expect(result.failed_entities).toHaveLength(0);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("audit.append_event"),
      expect.arrayContaining(["cron_skipped_samsara_disabled"])
    );
  });

  it("collects and persists both entity counts on success", async () => {
    const inserts: string[] = [];
    const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM integrations.samsara_remote_count_collection_state")) {
        return { rows: [{ consecutive_failures: 0 }] };
      }
      if (sql.includes("INSERT INTO integrations.samsara_remote_counts")) {
        inserts.push(String(values?.[1]));
        return { rows: [] };
      }
      return { rows: [] };
    });

    (withLuciaBypass as unknown as Mock).mockImplementation(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock })
    );
    (getSamsaraConfigForCompany as unknown as Mock).mockResolvedValue({
      is_enabled: true,
      api_token_encrypted: Buffer.from("token"),
      samsara_org_id: "org-1",
    });
    (decryptSamsaraSecret as unknown as Mock).mockReturnValue("decrypted-token");
    countDriversMock.mockResolvedValue(10);
    countVehiclesMock.mockResolvedValue(5);

    const result = await collectSamsaraRemoteCounts("11111111-1111-1111-1111-111111111111");

    expect(result.collected_count).toBe(2);
    expect(result.failed_entities).toEqual([]);
    expect(inserts.sort()).toEqual(["drivers", "vehicles"]);
  });

  it("marks auth failure and continues with other entity", async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes("FROM integrations.samsara_remote_count_collection_state")) {
        return { rows: [{ consecutive_failures: 1 }] };
      }
      return { rows: [] };
    });

    (withLuciaBypass as unknown as Mock).mockImplementation(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock })
    );
    (getSamsaraConfigForCompany as unknown as Mock).mockResolvedValue({
      is_enabled: true,
      api_token_encrypted: Buffer.from("token"),
      samsara_org_id: "org-1",
    });
    (decryptSamsaraSecret as unknown as Mock).mockReturnValue("decrypted-token");
    countDriversMock.mockRejectedValue(new SamsaraApiError("auth_lost", 401, { message: "forbidden" }, false));
    countVehiclesMock.mockResolvedValue(3);

    const result = await collectSamsaraRemoteCounts("11111111-1111-1111-1111-111111111111");

    expect(result.auth_failed).toBe(true);
    expect(result.failed_entities).toEqual(["drivers"]);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("audit.append_event"),
      expect.arrayContaining(["samsara_auth_failed"])
    );
  });

  it("retries once on rate limit and succeeds on second attempt", async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes("FROM integrations.samsara_remote_count_collection_state")) {
        return { rows: [{ consecutive_failures: 0 }] };
      }
      return { rows: [] };
    });
    (withLuciaBypass as unknown as Mock).mockImplementation(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock })
    );
    (getSamsaraConfigForCompany as unknown as Mock).mockResolvedValue({
      is_enabled: true,
      api_token_encrypted: Buffer.from("token"),
      samsara_org_id: "org-1",
    });
    (decryptSamsaraSecret as unknown as Mock).mockReturnValue("decrypted-token");
    countDriversMock
      .mockRejectedValueOnce(new SamsaraApiError("rate_limited", 429, { message: "slow down" }, true))
      .mockResolvedValueOnce(9);
    countVehiclesMock.mockResolvedValue(4);

    const result = await collectSamsaraRemoteCounts("11111111-1111-1111-1111-111111111111");

    expect(result.failed_entities).toEqual([]);
    expect(result.collected_count).toBe(2);
    expect(countDriversMock).toHaveBeenCalledTimes(2);
  });
});
