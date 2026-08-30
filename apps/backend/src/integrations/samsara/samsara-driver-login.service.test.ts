import { describe, expect, it, vi } from "vitest";
import { recordSamsaraDriverLogin } from "./samsara-driver-login.service.js";

describe("recordSamsaraDriverLogin", () => {
  it("updates only a same-company or actively authorized driver and never regresses time", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "driver-1" }], rowCount: 1 });
    const changed = await recordSamsaraDriverLogin(
      { query },
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "2026-08-30T12:00:00.000Z"
    );

    expect(changed).toBe(true);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("d.operating_company_id = $1::uuid");
    expect(sql).toContain("samsara_login_dca.is_authorized = true");
    expect(sql).toContain("samsara_login_dca.deactivated_at IS NULL");
    expect(sql).toContain("d.last_samsara_login_at < $3::timestamptz");
    expect(values).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "2026-08-30T12:00:00.000Z",
    ]);
  });
});
