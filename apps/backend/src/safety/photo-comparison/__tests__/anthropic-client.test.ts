import { describe, expect, it, vi } from "vitest";
import {
  AnthropicRateLimitError,
  AnthropicTimeoutError,
  buildPrompt,
  createAnthropicClient,
  parseCompareResponse,
} from "../anthropic-client.js";

describe("anthropic-client (GAP-50)", () => {
  it("formats the insurance assessor prompt with angle label", () => {
    const prompt = buildPrompt("front-left");
    expect(prompt).toContain("insurance damage assessor");
    expect(prompt).toContain("front-left");
    expect(prompt).toContain("has_new_damage");
  });

  it("parses valid JSON compare response", () => {
    const parsed = parseCompareResponse(
      '{"has_new_damage": true, "findings": [{"location": "bumper", "severity": "moderate", "description": "dent", "confidence": 0.91}]}'
    );
    expect(parsed.has_new_damage).toBe(true);
    expect(parsed.findings[0]?.location).toBe("bumper");
    expect(parsed.findings[0]?.confidence).toBe(0.91);
  });

  it("rejects malformed compare response", () => {
    expect(() => parseCompareResponse("not json")).toThrow(/no_json/);
  });

  it("handles rate limit responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });
    const client = createAnthropicClient({ apiKey: "test-key", fetchImpl });
    await expect(client.compareImages("a", "b", "front")).rejects.toBeInstanceOf(AnthropicRateLimitError);
  });

  it("handles timeout via abort", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    const client = createAnthropicClient({ apiKey: "test-key", fetchImpl, timeoutMs: 5 });
    await expect(client.compareImages("a", "b", "rear")).rejects.toBeInstanceOf(AnthropicTimeoutError);
  });

  it("requires ANTHROPIC_API_KEY when not injected", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const client = createAnthropicClient();
    await expect(client.compareImages("a", "b", "front")).rejects.toThrow(/anthropic_not_configured/);
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
});
