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
  deliver: (payload: OutboxPayload, ctx: OutboxHandlerContext) => Promise<OutboxHandlerResult | void>;
}
