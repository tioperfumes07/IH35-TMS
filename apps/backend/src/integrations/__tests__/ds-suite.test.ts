import { describe, expect, it } from "vitest";
import { verifyQboMirror } from "../qbo/mirror-integrity.service.js";

describe("data sovereignty DS suite", () => {
  it("DS-1 mirror integrity computes drift", async () => {
    const client = { query: async () => ({ rows: [{ cnt: "10" }] }) };
    const rows = await verifyQboMirror(client, "oci");
    expect(rows.length).toBe(5);
  });
});
