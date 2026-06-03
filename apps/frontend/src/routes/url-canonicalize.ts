import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import manifestSource from "./manifest.tsx?raw";
import { COLLECTIONS_ROUTE } from "./collections.routes";

export function underscoreToHyphenPath(pathname: string): string {
  return pathname.replace(/_/g, "-");
}

export function extractStaticRoutePaths(source: string): Set<string> {
  const paths = new Set<string>([COLLECTIONS_ROUTE.path]);

  const literalRe = /path="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = literalRe.exec(source))) {
    const routePath = match[1];
    if (routePath.startsWith("/") && !routePath.includes(":")) {
      paths.add(routePath);
    }
  }

  const mappedRe = /path:\s*"(\/[^"]+)"/g;
  while ((match = mappedRe.exec(source))) {
    const routePath = match[1];
    if (!routePath.includes(":")) {
      paths.add(routePath);
    }
  }

  return paths;
}

export const CANONICAL_STATIC_PATHS = extractStaticRoutePaths(manifestSource);

export function resolveUnderscoreRedirectPath(
  pathname: string,
  canonicalPaths: Set<string> = CANONICAL_STATIC_PATHS,
): string | null {
  if (!pathname.includes("_")) return null;

  const hyphenPath = underscoreToHyphenPath(pathname);
  if (hyphenPath === pathname) return null;
  if (!canonicalPaths.has(hyphenPath)) return null;

  return hyphenPath;
}

export function useUrlCanonicalize(): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const redirectPath = resolveUnderscoreRedirectPath(location.pathname);
    if (!redirectPath) return;

    navigate(`${redirectPath}${location.search}${location.hash}`, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);
}
