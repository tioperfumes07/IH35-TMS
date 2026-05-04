import { AlertTriangle, FileText, Fuel, Navigation, Settings, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { signOut } from "../api/identity";
import { useAuth } from "../auth/useAuth";
import { HosCell } from "../components/HosCell";
import { InstallPrompt } from "../components/InstallPrompt";
import { Modal } from "../components/Modal";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";

const issues = [
  "Mechanical",
  "Road condition",
  "Customer issue",
  "Accident",
  "Medical",
  "Other",
];

function deriveDriverName(email: string): string {
  const base = email.split("@")[0];
  const words = base.split(/[._-]/).filter(Boolean);
  if (words.length === 0) return "Driver";
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

export function HomePage() {
  const auth = useAuth();
  const { pushToast } = useToast();
  const [issueOpen, setIssueOpen] = useState(false);

  const driverName = useMemo(() => deriveDriverName(auth.user?.email ?? "driver"), [auth.user?.email]);

  return (
    <div className="min-h-screen bg-pwa-bg px-4 py-3 text-sm text-pwa-text-primary">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-20">
        <header className="rounded-xl border border-pwa-border bg-pwa-card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-semibold">{driverName}</p>
              <p className="text-sm text-pwa-text-secondary">Unit 0234</p>
            </div>
            <Link to="/profile" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-pwa-border">
              <Settings className="h-5 w-5 text-pwa-text-secondary" />
            </Link>
          </div>
          <p className="mt-2 text-sm text-pwa-text-secondary">Welcome back</p>
        </header>

        <PwaCard title="HOS Overview" subtitle="Phase 1 placeholder data — will sync with Samsara in Phase 4">
          <div className="grid grid-cols-2 gap-3">
            <HosCell label="Drive" value="8h 12m" subtitle="of 11h limit" tone="driving" />
            <HosCell label="Shift" value="11h 04m" subtitle="of 14h limit" tone="driving" />
            <HosCell label="70-Hour" value="42h" subtitle="of 70h" tone="driving" />
            <HosCell label="Tank" value="21%" subtitle="refuel alert" tone="violation" />
          </div>
        </PwaCard>

        <PwaCard title="Active Load #2024-0058" subtitle="Phase 1 placeholder — live load data in Phase 3">
          <p className="font-medium">Houston, TX → Atlanta, GA</p>
          <div className="mt-2 inline-flex rounded-full border border-hos-driving/40 bg-hos-driving/10 px-2 py-1 text-xs font-semibold text-hos-driving">
            Driving
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PwaButton className="w-full">Status</PwaButton>
            <PwaButton
              variant="secondary"
              className="w-full"
              onClick={() => window.open("https://maps.google.com/?q=Atlanta,GA", "_blank")}
            >
              <Navigation className="h-4 w-4" />
              Directions
            </PwaButton>
            <PwaButton variant="secondary" className="w-full">
              Docs
            </PwaButton>
          </div>
        </PwaCard>

        <PwaCard title="Next Fuel Recommendation" subtitle="Phase 1 placeholder — live recommendations in Phase 4">
          <p className="font-medium">Recommended fuel stop: Pilot #492 — Tyler, TX</p>
          <p className="mt-1 text-pwa-text-secondary">120 mi away · saves $48 vs nearest</p>
          <PwaButton
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => window.open("https://maps.google.com/?q=Pilot+492+Tyler+TX", "_blank")}
          >
            Tap to navigate
          </PwaButton>
        </PwaCard>

        <PwaCard title="Driver Actions">
          <div className="grid grid-cols-2 gap-3">
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col"
              onClick={() => pushToast("Coming in Phase 2")}
              icon={<Truck className="h-5 w-5" />}
            >
              Pre-trip
            </PwaButton>
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col"
              onClick={() => pushToast("Coming in Phase 2")}
              icon={<Fuel className="h-5 w-5" />}
            >
              Log Fuel
            </PwaButton>
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col"
              onClick={() => pushToast("Coming in Phase 2")}
              icon={<FileText className="h-5 w-5" />}
            >
              Upload BOL
            </PwaButton>
            <PwaButton
              variant="secondary"
              className="min-h-20 flex-col border-hos-violation/50 text-hos-violation"
              onClick={() => setIssueOpen(true)}
              icon={<AlertTriangle className="h-5 w-5" />}
            >
              Report Issue
            </PwaButton>
          </div>
          <p className="mt-3 text-xs text-pwa-text-secondary">Phase 1 placeholder — action flows land in Phase 2</p>
        </PwaCard>

        <footer className="space-y-2 rounded-xl border border-pwa-border bg-pwa-card p-4 text-xs text-pwa-text-secondary">
          <p>Backend version: {import.meta.env.VITE_BUILD_COMMIT ? String(import.meta.env.VITE_BUILD_COMMIT) : "dev"}</p>
          <button
            className="text-pwa-text-primary underline"
            type="button"
            onClick={async () => {
              try {
                await signOut();
              } finally {
                window.location.href = "/login";
              }
            }}
          >
            Sign out
          </button>
        </footer>
      </div>

      <InstallPrompt />

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Report issue">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {issues.map((issue) => (
              <PwaButton key={issue} variant="secondary" className="min-h-14" onClick={() => pushToast(`${issue} saved as placeholder`)}>
                {issue}
              </PwaButton>
            ))}
          </div>
          <div className="rounded-xl border border-dashed border-pwa-border p-4 text-center text-pwa-text-secondary">
            Photo upload placeholder
          </div>
          <p className="text-xs text-pwa-text-secondary">Phase 2 implementation</p>
          <div className="flex gap-2">
            <PwaButton variant="secondary" className="flex-1" onClick={() => setIssueOpen(false)}>
              Cancel
            </PwaButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
