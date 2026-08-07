/**
 * Neutral leaf types for outbox handlers.
 * Imported by registry + individual handlers so handlers do not import registry
 * (avoids registry <-> handler import cycles).
 */
import type { PoolClient } from "pg";

export type OutboxPayload = Record<string, unknown>;

export type OutboxHandlerContext = {
  client: PoolClient;
  eventId: string;
  instanceId: string;
  log: (message: string, meta?: Record<string, unknown>) => void;
};

export type OutboxHandlerResult = {
  message?: string;
};

export interface OutboxEventHandler {
  eventType: string;
  canHandle: () => boolean;
  /**
   * When true, an UNAVAILABLE handler is a FAILURE rather than a skip.
   *
   * processor.ts marks an event whose handler returns canHandle() === false as DELIVERED
   * ("skipped ... handler unavailable in this environment"). For a metric or an optional dev-only
   * integration that is a fair no-op. For anything a human is relying on — a driver being told their
   * load, an Owner being told a DOT stop was overridden — it is the system reporting success for
   * something that did not happen.
   *
   * Defaults to FALSE, so existing handlers keep their current behaviour exactly. Opt in only where a
   * silent skip would mislead someone.
   */
  requiresDelivery?: boolean;
  deliver: (payload: OutboxPayload, ctx: OutboxHandlerContext) => Promise<OutboxHandlerResult | void>;
}
