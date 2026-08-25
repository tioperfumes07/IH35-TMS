import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Sidebar module clicks are PUSH navigations. Without a reset, the shared shell keeps the previous
 * page's scrollY so the next module opens at the bottom.
 * Hash deep-links and browser Back (POP) keep their own scroll.
 */
export function RouteScrollReset() {
  const location = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (location.hash) return;
    if (navType === "POP") return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname, location.hash, navType]);

  return null;
}
