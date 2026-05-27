import test from "node:test";
import assert from "node:assert/strict";
import { verifyNoInternalPayloadInNotes } from "../verify-no-internal-payload-in-notes.mjs";

test("verifyNoInternalPayloadInNotes passes current frontend", () => {
  assert.doesNotThrow(() => verifyNoInternalPayloadInNotes());
});
