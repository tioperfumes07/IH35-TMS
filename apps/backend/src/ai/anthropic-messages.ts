// Shared low-level Anthropic Messages client. The SINGLE key-handling + HTTP path for the whole backend —
// do not open a second one. Callers (safety photo-comparison, dispatch rate-con extraction) build a request
// and parse the response; this module owns the endpoint, the x-api-key header, the timeout/abort, and the
// 429/timeout/not-configured error taxonomy. The model is always a caller-supplied constant, never an env var.

export class AnthropicNotConfiguredError extends Error {
  constructor(message = "anthropic_not_configured") {
    super(message);
    this.name = "AnthropicNotConfiguredError";
  }
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

export type AnthropicTextBlock = { type: "text"; text: string };
export type AnthropicImageBlock = { type: "image"; source: { type: "url"; url: string } | { type: "base64"; media_type: string; data: string } };
export type AnthropicDocumentBlock = { type: "document"; source: { type: "base64"; media_type: string; data: string } };
export type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock | AnthropicDocumentBlock;

export type AnthropicMessage = { role: "user" | "assistant"; content: string | AnthropicContentBlock[] };

export type AnthropicMessagesRequest = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
};

export type AnthropicMessagesResponse = {
  content?: Array<{ type: string; text?: string }>;
};

export type AnthropicCallOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";

export type AnthropicModel = { id: string; display_name?: string; created_at?: string; type?: string };
export type AnthropicModelsResponse = { data?: AnthropicModel[]; has_more?: boolean };

/** GET the list of models currently available on the account's Claude API (read-only). Same key/error
 *  taxonomy as callAnthropicMessages. Used by the model-lifecycle monitor to detect a registered model that
 *  has been retired or is missing BEFORE it causes an outage. Paginates defensively (Anthropic caps page size). */
export async function listAnthropicModels(options?: AnthropicCallOptions): Promise<AnthropicModel[]> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicNotConfiguredError();
  }

  const models: AnthropicModel[] = [];
  let afterId: string | undefined;
  for (let page = 0; page < 20; page++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = new URL(ANTHROPIC_MODELS_URL);
      url.searchParams.set("limit", "100");
      if (afterId) url.searchParams.set("after_id", afterId);
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        signal: controller.signal,
        headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      });
      if (response.status === 429) throw new AnthropicRateLimitError();
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`anthropic_http_${response.status}:${detail.slice(0, 200)}`);
      }
      const body = (await response.json()) as AnthropicModelsResponse;
      const rows = body.data ?? [];
      models.push(...rows);
      if (!body.has_more || rows.length === 0) break;
      afterId = rows[rows.length - 1]?.id;
      if (!afterId) break;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new AnthropicTimeoutError();
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  return models;
}

/** POST a Messages request. Throws AnthropicNotConfiguredError / AnthropicRateLimitError / AnthropicTimeoutError
 *  or a generic anthropic_http_<code> Error. Returns the raw payload; callers extract their own content. */
export async function callAnthropicMessages(
  request: AnthropicMessagesRequest,
  options?: AnthropicCallOptions,
): Promise<AnthropicMessagesResponse> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicNotConfiguredError();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(request),
    });

    if (response.status === 429) {
      throw new AnthropicRateLimitError();
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`anthropic_http_${response.status}:${detail.slice(0, 200)}`);
    }
    return (await response.json()) as AnthropicMessagesResponse;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AnthropicTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Concatenate all text blocks from a response, or throw if none. */
export function extractText(response: AnthropicMessagesResponse): string {
  const text = (response.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("");
  if (!text) {
    throw new Error("anthropic_parse_error: empty_content");
  }
  return text;
}
