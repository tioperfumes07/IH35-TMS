import { describe, it, expect, vi } from "vitest";
import {
  attachRedisConnectionLogging,
  buildResilientRedisOptions,
  redisReconnectOnError,
  redisRetryStrategy,
} from "../redis.client.js";

describe("redis.client resilient options", () => {
  it("sets required ioredis resilience options", () => {
    const opts = buildResilientRedisOptions();
    expect(opts.enableOfflineQueue).toBe(true);
    expect(opts.maxRetriesPerRequest).toBe(20);
    expect(opts.connectTimeout).toBe(10_000);
    expect(opts.commandTimeout).toBe(5_000);
    expect(opts.lazyConnect).toBe(false);
    expect(opts.enableReadyCheck).toBe(true);
    expect(opts.keepAlive).toBe(30_000);
    expect(opts.family).toBe(0);
    expect(opts.retryStrategy).toBe(redisRetryStrategy);
    expect(opts.reconnectOnError).toBe(redisReconnectOnError);
  });

  it("does not inject explicit tls options (rediss:// handles TLS)", () => {
    const opts = buildResilientRedisOptions();
    expect(opts.tls).toBeUndefined();
  });

  it("retryStrategy uses exponential backoff capped at 2s", () => {
    expect(redisRetryStrategy(1)).toBe(100);
    expect(redisRetryStrategy(2)).toBe(200);
    expect(redisRetryStrategy(10)).toBe(1000);
    expect(redisRetryStrategy(20)).toBe(2000);
    expect(redisRetryStrategy(100)).toBe(2000);
  });

  it("reconnectOnError matches READONLY, ECONNRESET, and stream write errors", () => {
    expect(redisReconnectOnError(new Error("READONLY You can't write against a read only replica."))).toBe(true);
    expect(redisReconnectOnError(new Error("read ECONNRESET"))).toBe(true);
    expect(redisReconnectOnError(new Error("Stream isn't writeable and enableOfflineQueue options is false"))).toBe(
      true
    );
    expect(redisReconnectOnError(new Error("WRONGPASS invalid username-password pair"))).toBe(false);
  });
});

describe("attachRedisConnectionLogging", () => {
  it("registers INFO-level connection event handlers", () => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const mockRedis = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
      }),
    };

    attachRedisConnectionLogging(mockRedis as never);
    expect(Object.keys(handlers).sort()).toEqual(["connect", "end", "error", "ready", "reconnecting"]);

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    handlers.connect?.();
    handlers.ready?.();
    handlers.error?.(new Error("boom"));
    handlers.reconnecting?.();
    handlers.end?.();
    expect(infoSpy).toHaveBeenCalledWith("[redis] connect");
    expect(infoSpy).toHaveBeenCalledWith("[redis] ready");
    expect(infoSpy).toHaveBeenCalledWith("[redis] error", "boom");
    expect(infoSpy).toHaveBeenCalledWith("[redis] reconnecting");
    expect(infoSpy).toHaveBeenCalledWith("[redis] end");
    infoSpy.mockRestore();
  });
});
