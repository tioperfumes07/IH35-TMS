import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * UI-SCROLL-POSITION-NOT-RESET-ON-NAVIGATE: React Router's client-side (pushState) navigation does
 * NOT reset window scroll position -- browsers only do that automatically for full (non-SPA) page
 * loads. This app had zero scroll-reset-on-navigate logic anywhere (verified: no ScrollToTop /
 * scrollRestoration component existed in the whole frontend tree), so every module/tab click
 * inherited whatever scroll position the PREVIOUS page happened to be at.
 *
 * Live-confirmed the exact owner-reported symptom via a scripted repro: scrolled
 * /safety/driver-files to window.scrollY=4000, then clicked a real <Link> to /fuel (a completely
 * different module) -- the new page rendered at window.scrollY=1122, not 0. "Every time I click on
 * a module it does not begin at the top of the page" was a real, reproducible bug, not a one-off.
 *
 * Only reset on PUSH/REPLACE (a genuine forward navigation to new content) -- never on POP (browser
 * back/forward button), where the user correctly expects their previous scroll position restored,
 * which `history.scrollRestoration`'s browser-default "auto" already handles on its own.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);

  return null;
}
