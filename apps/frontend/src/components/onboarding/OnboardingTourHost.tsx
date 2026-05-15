import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import Joyride, { STATUS, type CallBackProps, type Step } from "react-joyride";
import { getIdentityProfile, patchIdentityOnboarding } from "../../api/identity";
import type { UserRole } from "../../types/api";

type Props = {
  role: UserRole;
};

function ownerSteps(): Step[] {
  return [
    {
      target: '[data-tour="tour-nav-home"]',
      content: "Home — shortcuts into the modules you use most.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="tour-nav-dispatch"]',
      content: "Dispatch — plan freight, capacity, and assignments.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="tour-nav-banking"]',
      content: "Banking — live balances, transfers, and reconciliation.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="tour-nav-drivers"]',
      content: "Drivers — open the flyout for settlements and driver finance tools.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="tour-nav-admin"]',
      content: "Users — invite teammates and control roles.",
      disableBeacon: true,
    },
  ];
}

function dispatcherSteps(): Step[] {
  return [
    {
      target: '[data-tour="tour-nav-home"]',
      content: "Home — your launch point for the day.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="tour-nav-dispatch"]',
      content: "Dispatch — board, filters, and quick actions (use the flyout for Loads).",
      disableBeacon: true,
    },
    {
      target: '[data-tour="tour-nav-dispatch"]',
      content: "Loads — keep this board tight; drill in when a load needs attention.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="tour-nav-drivers"]',
      content: "Drivers — roster, contacts, and assignments.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="tour-nav-customers"]',
      content: "Customers — lanes, billing contacts, and history.",
      disableBeacon: true,
    },
  ];
}

function stepsForRole(role: UserRole): Step[] {
  if (role === "Owner" || role === "Administrator" || role === "SuperAdmin") return ownerSteps();
  if (role === "Dispatcher") return dispatcherSteps();
  return [
    {
      target: '[data-tour="tour-nav-home"]',
      content: "Welcome — use the sidebar to move between modules.",
      disableBeacon: true,
    },
  ];
}

export function OnboardingTourHost({ role }: Props) {
  const qc = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["identity", "profile"],
    queryFn: getIdentityProfile,
  });

  const [run, setRun] = useState(false);
  const steps = useMemo(() => stepsForRole(role), [role]);

  useEffect(() => {
    if (profileQuery.isLoading || !profileQuery.data) return;
    if (profileQuery.data.onboarding_completed_at) return;
    const t = window.setTimeout(() => setRun(true), 600);
    return () => window.clearTimeout(t);
  }, [profileQuery.isLoading, profileQuery.data]);

  const handleJoyride = useCallback(
    async (data: CallBackProps) => {
      const { status } = data;
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setRun(false);
        try {
          await patchIdentityOnboarding({ complete: true });
          await qc.invalidateQueries({ queryKey: ["identity", "profile"] });
        } catch {
          /* non-fatal */
        }
      }
    },
    [qc]
  );

  if (role === "Driver") return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableScrolling={false}
      styles={{ options: { zIndex: 60_000 } }}
      callback={handleJoyride}
    />
  );
}
