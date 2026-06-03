import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parsePrintRoutesRouteKeys } from "../lib/fastify-route-duplicates.js";

/** Paths that intentionally retain underscores and must never redirect. */
const CANONICAL_UNDERSCORE_PATHS = new Set(["/api/v1/_healthcheck"]);

export function underscoreToHyphenPath(pathname: string): string {
  return pathname.replace(/_/g, "-");
}

export function splitRequestUrl(rawUrl: string): [pathname: string, querySuffix: string] {
  const qIndex = rawUrl.indexOf("?");
  if (qIndex === -1) return [rawUrl, ""];
  return [rawUrl.slice(0, qIndex), rawUrl.slice(qIndex)];
}

export function buildStaticGetPathSet(app: FastifyInstance): Set<string> {
  const keys = parsePrintRoutesRouteKeys(app.printRoutes({ commonPrefix: false }));
  const paths = new Set<string>();
  for (const key of keys) {
    const spaceIndex = key.indexOf(" ");
    if (spaceIndex === -1) continue;
    const method = key.slice(0, spaceIndex);
    const routePath = key.slice(spaceIndex + 1).trim();
    if (method !== "GET" && method !== "HEAD") continue;
    if (!routePath || routePath.includes(":")) continue;
    paths.add(routePath.startsWith("/") ? routePath : `/${routePath}`);
  }
  return paths;
}

export function resolveUnderscoreRedirectPath(
  pathname: string,
  staticGetPaths: Set<string>,
): string | null {
  if (!pathname.includes("_")) return null;
  if (CANONICAL_UNDERSCORE_PATHS.has(pathname)) return null;

  const hyphenPath = underscoreToHyphenPath(pathname);
  if (hyphenPath === pathname) return null;
  if (!staticGetPaths.has(hyphenPath)) return null;

  return hyphenPath;
}

export async function registerUrlCanonicalizeMiddleware(app: FastifyInstance): Promise<void> {
  let staticGetPaths: Set<string> | null = null;

  app.addHook("onReady", async () => {
    staticGetPaths = buildStaticGetPathSet(app);
  });

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== "GET" && req.method !== "HEAD") return;

    if (!staticGetPaths) {
      staticGetPaths = buildStaticGetPathSet(app);
    }

    const rawUrl = req.raw.url ?? req.url ?? "/";
    const [pathname, querySuffix] = splitRequestUrl(rawUrl);
    const redirectPath = resolveUnderscoreRedirectPath(pathname, staticGetPaths);
    if (!redirectPath) return;

    return reply.redirect(`${redirectPath}${querySuffix}`, 301);
  });
}
