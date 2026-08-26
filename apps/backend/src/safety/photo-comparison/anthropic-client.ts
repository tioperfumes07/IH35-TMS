import { withCircuitBreaker } from "../../lib/circuit-breaker/index.js";
import {
  AnthropicRateLimitError,
  AnthropicTimeoutError,
  callAnthropicMessages,
  extractText,
} from "../../ai/anthropic-messages.js";
import { SAFETY_VISION_MODEL } from "../../ai/models.js";

// Re-export the shared error types so existing importers of this module keep compiling unchanged.
export { AnthropicRateLimitError, AnthropicTimeoutError };

export type DamageFinding = {
  location: string;
  severity: "minor" | "moderate" | "severe";
  description: string;
  confidence: number;
};

export type CompareImagesResult = {
  has_new_damage: boolean;
  findings: DamageFinding[];
};

export type AnthropicCompareClient = {
  compareImages: (
    preImageUrl: string,
    postImageUrl: string,
    angleLabel: string
  ) => Promise<CompareImagesResult>;
};

// Model ID from the central registry (ai/models.ts). (Previously a hardcoded model string that Anthropic
// later retired.) Sonnet supports image/vision input.
const VISION_MODEL = SAFETY_VISION_MODEL;

function buildPrompt(angleLabel: string): string {
  return `You are an insurance damage assessor. Compare these two photos of the same vehicle/trailer at angle '${angleLabel}'. Identify any NEW damage in the second photo not present in the first. Respond with JSON only:
{"has_new_damage": boolean, "findings": [{"location": string, "severity": "minor"|"moderate"|"severe", "description": string, "confidence": number}]}`;
}

function parseCompareResponse(text: string): CompareImagesResult {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("anthropic_parse_error: no_json");
  }
  const parsed = JSON.parse(jsonMatch[0]) as CompareImagesResult;
  if (typeof parsed.has_new_damage !== "boolean" || !Array.isArray(parsed.findings)) {
    throw new Error("anthropic_parse_error: invalid_shape");
  }
  return {
    has_new_damage: parsed.has_new_damage,
    findings: parsed.findings.map((f) => ({
      location: String(f.location ?? "unknown"),
      severity: (["minor", "moderate", "severe"].includes(f.severity) ? f.severity : "minor") as DamageFinding["severity"],
      description: String(f.description ?? ""),
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0)),
    })),
  };
}

export function createAnthropicClient(options?: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): AnthropicCompareClient {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 30_000;

  return {
    async compareImages(preImageUrl, postImageUrl, angleLabel) {
      return withCircuitBreaker("openai", async () => {
        return compareImagesInner(preImageUrl, postImageUrl, angleLabel, {
          apiKey: options?.apiKey,
          fetchImpl,
          timeoutMs,
        });
      });
    },
  };
}

async function compareImagesInner(
  preImageUrl: string,
  postImageUrl: string,
  angleLabel: string,
  options?: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<CompareImagesResult> {
  // Single shared key/HTTP path — no second Anthropic client. The compare-specific error mapping
  // (rate-limit / timeout / not-configured) is owned by callAnthropicMessages and re-exported above.
  const payload = await callAnthropicMessages(
    {
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(angleLabel) },
            { type: "image", source: { type: "url", url: preImageUrl } },
            { type: "image", source: { type: "url", url: postImageUrl } },
          ],
        },
      ],
    },
    { apiKey: options?.apiKey, fetchImpl: options?.fetchImpl, timeoutMs: options?.timeoutMs },
  );
  return parseCompareResponse(extractText(payload));
}

export { buildPrompt, parseCompareResponse, VISION_MODEL };
