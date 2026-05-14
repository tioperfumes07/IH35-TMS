import { describe, expect, it } from "vitest";
import { issueDriverTokenPair, verifyDriverAccessToken, verifyDriverRefreshToken } from "./driver-jwt.js";

describe("driver-jwt", () => {
  it("round-trips access token for Driver role", () => {
    const pair = issueDriverTokenPair("00000000-0000-4000-8000-0000000000aa", "Driver");
    const access = verifyDriverAccessToken(pair.access_token);
    expect(access?.sub).toBe("00000000-0000-4000-8000-0000000000aa");
    const refresh = verifyDriverRefreshToken(pair.refresh_token);
    expect(refresh?.sub).toBe("00000000-0000-4000-8000-0000000000aa");
  });
});
