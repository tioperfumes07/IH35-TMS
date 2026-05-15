import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Redis } from "ioredis";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import * as Sentry from "@sentry/node";
import { withLuciaBypass } from "../auth/db.js";

let sharedRedis: Redis | null = null;

export function getRateLimiterRedis(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!sharedRedis) {
    sharedRedis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  }
  return sharedRedis;
}

function hashKey(parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

function clientIp(req: FastifyRequest): string {
  return req.ip || "unknown";
}

async function auditRateLimitExceeded(payload: Record<string, unknown>) {
  try {
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL::uuid, $4)`, [
        "identity.rate_limit_exceeded",
        "warning",
        JSON.stringify(payload),
        "P6-T11194-rate-limit",
      ]);
    });
  } catch {
    // non-fatal
  }
}

async function send429(reply: FastifyReply, retrySeconds: number, payload: Record<string, unknown>) {
  reply.header("Retry-After", String(Math.max(1, retrySeconds)));
  if (process.env.SENTRY_DSN?.trim()) {
    Sentry.captureMessage("identity.rate_limit_exceeded", {
      level: "warning",
      tags: { subsystem: "rate-limit" },
      extra: payload,
    });
  }
  await auditRateLimitExceeded(payload);
  return reply.code(429).send({ error: "rate_limited" });
}

function buildLimiter(args: { keyPrefix: string; points: number; durationSec: number; blockDurationSec?: number }) {
  const redis = getRateLimiterRedis();
  if (!redis) return null;
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: args.keyPrefix,
    points: args.points,
    duration: args.durationSec,
    blockDuration: args.blockDurationSec ?? 0,
  });
}

let memoLoginIp: RateLimiterRedis | null | undefined;
let memoOtpPhoneStart: RateLimiterRedis | null | undefined;
let memoOtpEmailStart: RateLimiterRedis | null | undefined;
let memoPasswordResetEmail: RateLimiterRedis | null | undefined;
let memoPasswordResetRequestByEmail: RateLimiterRedis | null | undefined;
let memoOtpVerify: RateLimiterRedis | null | undefined;
let memoDriverPhoneVerify: RateLimiterRedis | null | undefined;

function loginIpLimiter(): RateLimiterRedis | null {
  if (memoLoginIp !== undefined) return memoLoginIp;
  memoLoginIp = buildLimiter({ keyPrefix: "rl_auth_login_ip", points: 5, durationSec: 15 * 60, blockDurationSec: 60 * 60 });
  return memoLoginIp;
}

function otpPhoneStartLimiter(): RateLimiterRedis | null {
  if (memoOtpPhoneStart !== undefined) return memoOtpPhoneStart;
  memoOtpPhoneStart = buildLimiter({ keyPrefix: "rl_auth_otp_phone_start", points: 3, durationSec: 5 * 60 });
  return memoOtpPhoneStart;
}

function otpEmailStartLimiter(): RateLimiterRedis | null {
  if (memoOtpEmailStart !== undefined) return memoOtpEmailStart;
  memoOtpEmailStart = buildLimiter({ keyPrefix: "rl_auth_otp_email_start", points: 3, durationSec: 5 * 60 });
  return memoOtpEmailStart;
}

function passwordResetEmailLimiter(): RateLimiterRedis | null {
  if (memoPasswordResetEmail !== undefined) return memoPasswordResetEmail;
  memoPasswordResetEmail = buildLimiter({ keyPrefix: "rl_auth_password_reset_email", points: 3, durationSec: 60 * 60 });
  return memoPasswordResetEmail;
}

function passwordResetRequestByEmailLimiter(): RateLimiterRedis | null {
  if (memoPasswordResetRequestByEmail !== undefined) return memoPasswordResetRequestByEmail;
  memoPasswordResetRequestByEmail = buildLimiter({
    keyPrefix: "rl_office_password_reset_request_email",
    points: 1,
    durationSec: 5 * 60,
  });
  return memoPasswordResetRequestByEmail;
}

function otpVerifyLimiter(): RateLimiterRedis | null {
  if (memoOtpVerify !== undefined) return memoOtpVerify;
  memoOtpVerify = buildLimiter({ keyPrefix: "rl_auth_otp_verify_code", points: 5, durationSec: 10 * 60 });
  return memoOtpVerify;
}

function driverPhoneVerifyLimiter(): RateLimiterRedis | null {
  if (memoDriverPhoneVerify !== undefined) return memoDriverPhoneVerify;
  memoDriverPhoneVerify =
    buildLimiter({
      keyPrefix: "rl_driver_phone_login",
      points: 5,
      durationSec: 15 * 60,
      blockDurationSec: 60 * 60,
    }) ?? null;
  return memoDriverPhoneVerify;
}

async function consumeOr429(
  reply: FastifyReply,
  limiter: RateLimiterRedis | null,
  key: string,
  auditPayload: Record<string, unknown>
): Promise<boolean> {
  if (!limiter) return true;
  try {
    await limiter.consume(key);
    return true;
  } catch (error) {
    const rlRes = error as RateLimiterRes;
    const secs = Math.ceil((rlRes.msBeforeNext ?? 1000) / 1000);
    await send429(reply, secs, auditPayload);
    return false;
  }
}

/** Maps legacy/spec endpoints to implemented OTP routes (IH35 uses email/* + phone/*). */
export async function enforceAuthEmailStartLimits(
  req: FastifyRequest,
  reply: FastifyReply,
  email: string
): Promise<boolean> {
  const ip = clientIp(req);
  const okOtp = await consumeOr429(reply, otpEmailStartLimiter(), email.toLowerCase(), {
    route_key: "auth.email.start≈auth/otp/request",
    limiter: "otp_email_start",
    email,
    ip,
  });
  if (!okOtp) return false;

  const okReset = await consumeOr429(reply, passwordResetEmailLimiter(), email.toLowerCase(), {
    route_key: "auth.email.start≈auth/password-reset",
    limiter: "password_reset_email",
    email,
    ip,
  });
  return okReset;
}

export async function enforceAuthEmailVerifyLimits(
  req: FastifyRequest,
  reply: FastifyReply,
  email: string,
  code: string
): Promise<boolean> {
  const ip = clientIp(req);
  const okIp = await consumeOr429(reply, loginIpLimiter(), ip, {
    route_key: "auth.email.verify≈auth/login",
    limiter: "login_ip",
    ip,
  });
  if (!okIp) return false;

  const codeKey = hashKey(["email", email.toLowerCase(), code]);
  return consumeOr429(reply, otpVerifyLimiter(), codeKey, {
    route_key: "auth.email.verify≈auth/otp/verify",
    limiter: "otp_verify_code",
    email,
    ip,
  });
}

export async function enforceAuthPhoneStartLimits(
  req: FastifyRequest,
  reply: FastifyReply,
  phone: string
): Promise<boolean> {
  const ip = clientIp(req);
  return consumeOr429(reply, otpPhoneStartLimiter(), phone, {
    route_key: "auth.phone.start≈auth/otp/request",
    limiter: "otp_phone_start",
    phone,
    ip,
  });
}

export async function enforceAuthPhoneVerifyLimits(
  req: FastifyRequest,
  reply: FastifyReply,
  phone: string,
  code: string
): Promise<boolean> {
  const ip = clientIp(req);

  const okIp = await consumeOr429(reply, loginIpLimiter(), ip, {
    route_key: "auth.phone.verify≈auth/login",
    limiter: "login_ip",
    ip,
  });
  if (!okIp) return false;

  const okDriver = await consumeOr429(reply, driverPhoneVerifyLimiter(), phone, {
    route_key: "auth.phone.verify≈driver/login",
    limiter: "driver_phone_login",
    phone,
    ip,
  });
  if (!okDriver) return false;

  const codeKey = hashKey(["phone", phone, code]);
  return consumeOr429(reply, otpVerifyLimiter(), codeKey, {
    route_key: "auth.phone.verify≈auth/otp/verify",
    limiter: "otp_verify_code",
    phone,
    ip,
  });
}

export async function enforceOfficePasswordResetRequestLimits(
  req: FastifyRequest,
  reply: FastifyReply,
  email: string
): Promise<boolean> {
  const ip = clientIp(req);
  const okIp = await consumeOr429(reply, loginIpLimiter(), ip, {
    route_key: "identity/password-reset/request",
    limiter: "login_ip",
    email,
    ip,
  });
  if (!okIp) return false;
  return consumeOr429(reply, passwordResetRequestByEmailLimiter(), email.toLowerCase(), {
    route_key: "identity/password-reset/request",
    limiter: "password_reset_request_email_5m",
    email,
    ip,
  });
}

export async function enforceOfficePasswordLoginIpLimits(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const ip = clientIp(req);
  return consumeOr429(reply, loginIpLimiter(), ip, {
    route_key: "auth/office/email-login",
    limiter: "login_ip",
    ip,
  });
}
