import { Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { CompanyProvider } from "./contexts/CompanyContext";
import { ROUTES } from "./routes/manifest";
import { useUrlCanonicalize } from "./routes/url-canonicalize";

function UrlCanonicalizeGate({ children }: { children: ReactNode }) {
  useUrlCanonicalize();
  return children;
}

export default function App() {
  return (
    <CompanyProvider>
      <UrlCanonicalizeGate>
        <Routes>{ROUTES.map((route) => route)}</Routes>
      </UrlCanonicalizeGate>
    </CompanyProvider>
  );
}
