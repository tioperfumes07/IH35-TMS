import { describe, expect, it, vi } from "vitest";
import {
  normalizePersonName,
  normalizePhoneDigits,
  resolveMatchedDriverId,
} from "./relay-fuel-driver-match.js";
import type { DbClient } from "./db-client.type.js";

function mockClient(responses: Array<{ rows: Array<{ id: string }> }>): DbClient {
  let i = 0;
  return {
    query: vi.fn(async () => {
      const next = responses[i] ?? { rows: [] };
      i += 1;
      return next;
    }),
  } as unknown as DbClient;
}

describe("relay-fuel-driver-match helpers", () => {
  it("normalizes phone to last 10 digits", () => {
    expect(normalizePhoneDigits("+1 (956) 813-5701")).toBe("9568135701");
    expect(normalizePhoneDigits("8135701")).toBeNull();
    expect(normalizePhoneDigits(null)).toBeNull();
  });

  it("normalizes person names", () => {
    expect(normalizePersonName("  FERNANDO  ")).toBe("fernando");
    expect(normalizePersonName("")).toBeNull();
  });

  it("prefers integration_id when unique", async () => {
    const client = mockClient([{ rows: [{ id: "drv-int" }] }]);
    const id = await resolveMatchedDriverId(client, "opco", {
      integration_id: "8029341864745431",
      phone: "+19568135701",
      first_name: "FERNANDO",
      last_name: "MECOR",
    });
    expect(id).toBe("drv-int");
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("falls back to unique phone when integration_id misses", async () => {
    const client = mockClient([{ rows: [] }, { rows: [{ id: "drv-phone" }] }]);
    const id = await resolveMatchedDriverId(client, "opco", {
      integration_id: "8029341864745431",
      phone: "+19568135701",
      first_name: "FERNANDO",
      last_name: "MECOR",
    });
    expect(id).toBe("drv-phone");
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("falls back to unique name when phone misses", async () => {
    // null integration_id + null phone skip those queries — only name hits the DB
    const client = mockClient([{ rows: [{ id: "drv-name" }] }]);
    const id = await resolveMatchedDriverId(client, "opco", {
      integration_id: null,
      phone: null,
      first_name: "Leonel",
      last_name: "Morales",
    });
    expect(id).toBe("drv-name");
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("falls through to name when phone is ambiguous", async () => {
    // null integration_id skips; phone returns 2 rows → name
    const client = mockClient([{ rows: [{ id: "a" }, { id: "b" }] }, { rows: [{ id: "name" }] }]);
    const id = await resolveMatchedDriverId(client, "opco", {
      integration_id: null,
      phone: "+19568135701",
      first_name: "X",
      last_name: "Y",
    });
    expect(id).toBe("name");
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("skips placeholder all-zero integration_id", async () => {
    const client = mockClient([{ rows: [{ id: "drv-phone" }] }]);
    const id = await resolveMatchedDriverId(client, "opco", {
      integration_id: "0000000000000000",
      phone: "+12108893066",
      first_name: "RUBEN",
      last_name: "GARCIA",
    });
    expect(id).toBe("drv-phone");
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
