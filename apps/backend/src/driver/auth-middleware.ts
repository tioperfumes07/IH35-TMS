import type { FastifyRequest } from "fastify";
import { verifyDriverAccessToken } from "./driver-jwt.js";

function extractBearer(tokenHeader: string | undefined, driverHeader: string | undefined): string | null {
  if (typeof driverHeader === "string" && driverHeader.trim().length > 0) return driverHeader.trim();
  if (typeof tokenHeader === "string" && tokenHeader.toLowerCase().startsWith("bearer ")) {
    const t = tokenHeader.slice(7).trim();
    if (t.length > 0) return t;
  }
  return null;
}

export function tryAttachDriverJwt(req: FastifyRequest): boolean {
  const rawToken = extractBearer(
    typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
    typeof req.headers["x-driver-token"] === "string" ? req.headers["x-driver-token"] : undefined
  );
  if (!rawToken) return false;
  const claims = verifyDriverAccessToken(rawToken);
  if (!claims) return false;
  req.user = {
    uuid: claims.sub,
    email: null,
    role: claims.role,
  };
  req.session = { id: "driver-jwt" };
  return true;
}
