import { Redis, type RedisOptions } from "ioredis";

export type RedisHealthStatus = "ok" | "reconnecting" | "down";

/** Exponential backoff capped at 2s (100ms, 200ms, … 2000ms). */
export function redisRetryStrategy(times: number): number {
  return Math.min(times * 100, 2000);
}

export function redisReconnectOnError(err: Error): boolean {
  const msg = err.message ?? "";
  if (msg.includes("READONLY")) return true;
  if (msg.includes("ECONNRESET")) return true;
  if (msg.includes("Stream isn't writeable")) return true;
  return false;
}

export function buildResilientRedisOptions(overrides?: RedisOptions): RedisOptions {
  return {
    enableOfflineQueue: true,
    maxRetriesPerRequest: 20,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    lazyConnect: false,
    enableReadyCheck: true,
    keepAlive: 30_000,
    family: 0,
    retryStrategy: redisRetryStrategy,
    reconnectOnError: redisReconnectOnError,
    ...overrides,
  };
}

export function attachRedisConnectionLogging(redis: Redis): void {
  redis.on("connect", () => {
    console.info("[redis] connect");
  });
  redis.on("ready", () => {
    console.info("[redis] ready");
  });
  redis.on("error", (err: Error) => {
    console.info("[redis] error", err.message);
  });
  redis.on("reconnecting", () => {
    console.info("[redis] reconnecting");
  });
  redis.on("end", () => {
    console.info("[redis] end");
  });
}

export function createResilientRedis(url: string, overrides?: RedisOptions): Redis {
  const redis = new Redis(url, buildResilientRedisOptions(overrides));
  attachRedisConnectionLogging(redis);
  return redis;
}
