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

const VISION_MODEL = "claude-sonnet-4-20250514";

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

export class AnthropicRateLimitError extends Error {
  constructor(message = "anthropic_rate_limit") {
    super(message);
    this.name = "AnthropicRateLimitError";
  }
}

export class AnthropicTimeoutError extends Error {
  constructor(message = "anthropic_timeout") {
    super(message);
    this.name = "AnthropicTimeoutError";
  }
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
      const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("anthropic_not_configured");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
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
          }),
        });

        if (response.status === 429) {
          throw new AnthropicRateLimitError();
        }
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`anthropic_http_${response.status}:${detail.slice(0, 200)}`);
        }

        const payload = (await response.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };
        const textBlock = payload.content?.find((c) => c.type === "text");
        if (!textBlock?.text) {
          throw new Error("anthropic_parse_error: empty_content");
        }
        return parseCompareResponse(textBlock.text);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new AnthropicTimeoutError();
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export { buildPrompt, parseCompareResponse, VISION_MODEL };
