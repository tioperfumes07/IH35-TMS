class KnownHandler {
  eventType = "known.event" as const;
}

export function buildOutboxHandlerRegistry() {
  const handlers = [new KnownHandler()];
  return new Map(handlers.map((handler) => [handler.eventType, handler]));
}
