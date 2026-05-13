import { TEST_OWNER_USER_ID } from "./constants.js";

export function testAuthHeaders(userId: string = TEST_OWNER_USER_ID, role = "Owner") {
  const payload = Buffer.from(JSON.stringify({ id: userId, role, email: "integration.owner@test.invalid" }), "utf8").toString(
    "base64url"
  );
  return { "x-test-auth": payload };
}
