#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const redisClientPath = path.join(ROOT, "apps", "backend", "src", "lib", "redis.client.ts");
const healthRoutesPath = path.join(ROOT, "apps", "backend", "src", "health", "health.routes.ts");

function fail(message) {
  console.error(`verify:redis-resilient-config FAILED\n- ${message}`);
  process.exit(1);
}

function readOrFail(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`missing ${label}: ${path.relative(ROOT, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

const redisClient = readOrFail(redisClientPath, "redis client module");
const healthRoutes = readOrFail(healthRoutesPath, "health routes");

const requiredClientFragments = [
  "enableOfflineQueue: true",
  "maxRetriesPerRequest: 20",
  "connectTimeout: 10_000",
  "commandTimeout: 5_000",
  "lazyConnect: false",
  "enableReadyCheck: true",
  "keepAlive: 30_000",
  "family: 0",
  "redisRetryStrategy",
  "redisReconnectOnError",
  'msg.includes("READONLY")',
  'msg.includes("ECONNRESET")',
  'msg.includes("Stream isn\'t writeable")',
  'console.info("[redis] connect")',
  'console.info("[redis] ready")',
  'console.info("[redis] error"',
  'console.info("[redis] reconnecting")',
  'console.info("[redis] end")',
];

for (const fragment of requiredClientFragments) {
  if (!redisClient.includes(fragment)) {
    fail(`redis.client.ts missing required fragment: ${fragment}`);
  }
}

if (redisClient.includes("tls:")) {
  fail("redis.client.ts must not set explicit tls options (preserve rediss:// TLS)");
}

if (healthRoutes.includes("new Redis(")) {
  fail("health.routes.ts must use createResilientRedis instead of inline new Redis(");
}

const requiredHealthFragments = [
  "createResilientRedis",
  "REDIS_HEALTH_TIMEOUT_MS = 3_000",
  'status: "ok"',
  'status: "reconnecting"',
  'status: "down"',
];

for (const fragment of requiredHealthFragments) {
  if (!healthRoutes.includes(fragment)) {
    fail(`health.routes.ts missing required fragment: ${fragment}`);
  }
}

console.log("verify:redis-resilient-config OK");
