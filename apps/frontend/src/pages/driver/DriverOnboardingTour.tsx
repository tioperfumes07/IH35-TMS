import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import Joyride, { STATUS, type CallBackProps, type Step } from "react-joyride";
import { getDriverMe, patchDriverOnboarding } from "../../api/driver";

const DRIVER_STEPS: Step[] = [
  {
    target: '[data-tour="driver-nav-loads"]',
    content: "Home — your loads inbox and quick access to active freight.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="driver-nav-loads"]',
    content: "Active load — open any row for details, documents, and stops.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="driver-nav-disputes"]',
    content: "Settlement disputes — escalate or review settlement questions.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="driver-nav-settings"]',
    content: "Profile — language, help links, and preferences.",
    disableBeacon: true,
  },
];

export function DriverOnboardingTour() {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["driver", "me"],
    queryFn: getDriverMe,
  });

  const [run, setRun] = useState(false);

  useEffect(() => {
    if (meQuery.isLoading || !meQuery.data) return;
    if (meQuery.data.onboarding_completed_at) return;
    const t = window.setTimeout(() => setRun(true), 600);
    return () => window.clearTimeout(t);
  }, [meQuery.isLoading, meQuery.data]);

  const onCallback = useCallback(
    async (data: CallBackProps) => {
      if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
        setRun(false);
        try {
          await patchDriverOnboarding({ complete: true });
          await qc.invalidateQueries({ queryKey: ["driver", "me"] });
        } catch {
          /* ignore */
        }
      }
    },
    [qc]
  );

  return (
    <Joyride
      steps={DRIVER_STEPS}
      run={run}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableScrolling={false}
      styles={{ options: { zIndex: 60_000 } }}
      callback={onCallback}
    />
  );
}
