import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

export type DriverAccessClaims = {
  sub: string;
  role: string;
  typ: "driver_access";
};

export type DriverRefreshClaims = {
  sub: string;
  typ: "driver_refresh";
  jti: string;
};

function jwtSecret(): string {
  const s = process.env.DRIVER_JWT_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "test") return "vitest-driver-jwt-secret";
  throw new Error("DRIVER_JWT_SECRET is required for driver PWA JWTs");
}

function jwtSecretOrNull(): string | null {
  try {
    return jwtSecret();
  } catch {
    return null;
  }
}

const ACCESS_TTL_SEC = 60 * 15;
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;

export function issueDriverTokenPair(identityUserId: string, role: string) {
  const access = jwt.sign(
    { sub: identityUserId, role, typ: "driver_access" } satisfies DriverAccessClaims,
    jwtSecret(),
    { algorithm: "HS256", expiresIn: ACCESS_TTL_SEC }
  );
  const jti = randomUUID();
  const refresh = jwt.sign(
    { sub: identityUserId, typ: "driver_refresh", jti } satisfies DriverRefreshClaims,
    jwtSecret(),
    { algorithm: "HS256", expiresIn: REFRESH_TTL_SEC }
  );
  return { access_token: access, refresh_token: refresh, expires_in: ACCESS_TTL_SEC };
}

export function verifyDriverAccessToken(token: string): DriverAccessClaims | null {
  const secret = jwtSecretOrNull();
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as DriverAccessClaims;
    if (decoded.typ !== "driver_access" || !decoded.sub || decoded.role !== "Driver") return null;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyDriverRefreshToken(token: string): DriverRefreshClaims | null {
  const secret = jwtSecretOrNull();
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as DriverRefreshClaims;
    if (decoded.typ !== "driver_refresh" || !decoded.sub || !decoded.jti) return null;
    return decoded;
  } catch {
    return null;
  }
}
