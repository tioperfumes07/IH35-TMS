import type { AuthMeResponse } from "../types/api";

const DONE_ITEMS = [
  "BT-1-IDENT-01",
  "BT-1-IDENT-02",
  "BT-1-IDENT-03",
  "BT-1-MDATA-01",
  "BT-1-MDATA-02",
  "BT-1-MDATA-02b",
  "BT-1-MDATA-03",
  "BT-1-CATAL-01",
  "BT-1-CATAL-02",
  "BT-1-CATAL-03",
  "BT-1-PHASE1-AUDIT",
];

const COMING_SOON = [
  "Maintenance",
  "Accounting",
  "Banking",
  "Fuel",
  "Safety",
  "Dispatch",
  "Reports",
  "425C",
  "Driver App",
];

type Props = {
  auth: AuthMeResponse["user"];
};

export function HomePage({ auth }: Props) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Welcome, {auth.email}</h1>
        <p className="text-sm text-gray-600">
          Role: {auth.role} · logged in
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Phase 1 Status</h2>
          <p className="mt-1 text-sm text-gray-600">11 of 13 backend blocks complete.</p>
          <div className="mt-3 grid gap-1 text-sm text-gray-700">
            {DONE_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="text-ok">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Coming Soon</h2>
          <p className="mt-1 text-sm text-gray-600">Modules planned in next web blocks.</p>
          <div className="mt-3 grid gap-1 text-sm text-gray-700">
            {COMING_SOON.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="text-inactive">•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="text-xs text-gray-500">
        Backend version: {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "dev"}
      </footer>
    </div>
  );
}
