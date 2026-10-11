import { describe, expect, it } from "vitest";
import { samsaraReason } from "./samsara-client.js";

// 443.49: keep Samsara's own 4xx text on the thrown error (a bare "samsara_http_400" hid why 11 address creates failed).
describe("samsaraReason", () => {
  it("returns ':<message>' from a Samsara error body, '' when there is none", () => {
    expect(samsaraReason({ message: "externalIds value already in use" })).toBe(":externalIds value already in use");
    expect(samsaraReason({ errors: [{ field: "name" }] })).toBe(':[{"field":"name"}]');
    expect(samsaraReason({})).toBe("");
    expect(samsaraReason(null)).toBe("");
  });
});
