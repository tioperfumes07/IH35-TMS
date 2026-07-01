import { describe, it, expect } from "vitest";
import { activeMentionToken, keptMentionIds } from "./tasksChatMentions";

describe("TASK-3 team chat @mention helpers", () => {
  describe("activeMentionToken", () => {
    it("returns the open token after the last '@' up to the cursor", () => {
      const v = "hey @jor";
      expect(activeMentionToken(v, v.length)).toBe("jor");
    });

    it("returns '' immediately after typing '@'", () => {
      const v = "ping @";
      expect(activeMentionToken(v, v.length)).toBe("");
    });

    it("closes the token once whitespace follows the '@'", () => {
      const v = "hi @Ana Lopez done";
      expect(activeMentionToken(v, v.length)).toBeNull();
    });

    it("returns null when there is no '@'", () => {
      expect(activeMentionToken("plain comment", 5)).toBeNull();
    });

    it("uses the cursor position, not the whole string", () => {
      const v = "@alice and @bob";
      // cursor right after "@al"
      expect(activeMentionToken(v, 3)).toBe("al");
    });

    it("returns null for an over-long run (not a real mention)", () => {
      const v = "@" + "x".repeat(50);
      expect(activeMentionToken(v, v.length)).toBeNull();
    });
  });

  describe("keptMentionIds", () => {
    const names: Record<string, string> = { u1: "Ana Lopez", u2: "Bob Ruiz", u3: "Cy Vance" };
    const nameById = (id: string) => names[id];

    it("keeps only ids whose @Name still appears in the body", () => {
      const body = "Thanks @Ana Lopez, please sync with @Cy Vance";
      expect(keptMentionIds(body, ["u1", "u2", "u3"], nameById).sort()).toEqual(["u1", "u3"]);
    });

    it("drops a mention removed from the text", () => {
      const body = "no mentions here";
      expect(keptMentionIds(body, ["u1", "u2"], nameById)).toEqual([]);
    });

    it("ignores ids with no known name", () => {
      const body = "@Ana Lopez hi";
      expect(keptMentionIds(body, ["u1", "unknown"], nameById)).toEqual(["u1"]);
    });
  });
});
