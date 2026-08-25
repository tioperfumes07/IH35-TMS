import { Suspense } from "react";
import { Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { CompanyProvider } from "./contexts/CompanyContext";
import { ScrollToTop } from "./components/ScrollToTop";
import { ROUTES, RouteFallback } from "./routes/manifest";
import { useUrlCanonicalize } from "./routes/url-canonicalize";

function UrlCanonicalizeGate({ children }: { children: ReactNode }) {
  useUrlCanonicalize();
  return children;
}

export default function App() {
  return (
    <CompanyProvider>
      <UrlCanonicalizeGate>
        <ScrollToTop />
        {/* G5-3 — top-level Suspense boundary catches route chunks that render
            outside the Shell (portal, public/login, driver-app pages). Shell-based
            routes have their own inner boundary so the nav never unmounts. */}
        <Suspense fallback={<RouteFallback />}>
          <Routes>{ROUTES.map((route) => route)}</Routes>
        </Suspense>
      </UrlCanonicalizeGate>
    </CompanyProvider>
  );
}
