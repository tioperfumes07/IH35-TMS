import { Button } from "../components/Button";
import { PageHeader } from "../components/layout/PageHeader";

const DRIVER_PWA_URL =
  (import.meta.env.VITE_DRIVER_PWA_URL as string | undefined)?.trim() || "https://driver.ih35dispatch.com";

export function DriverAppLandingPage() {
  function openDriverPwa() {
    window.open(DRIVER_PWA_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Driver PWA" subtitle="Separate deploy for drivers" />
      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p className="mb-3">
          The driver-facing app runs at{" "}
          <span className="font-mono text-xs text-gray-900">{DRIVER_PWA_URL}</span>. Drivers sign in there with
          phone-based authentication. Office staff generally don&apos;t need to log in to the driver PWA except for
          impersonation testing during onboarding.
        </p>
        <Button type="button" onClick={openDriverPwa}>
          Open Driver PWA →
        </Button>
        <p className="mt-3 text-xs text-gray-500">
          Opens in a new browser tab. Use your phone or a driver test account; the office session here stays on this
          tab.
        </p>
      </div>
    </div>
  );
}
