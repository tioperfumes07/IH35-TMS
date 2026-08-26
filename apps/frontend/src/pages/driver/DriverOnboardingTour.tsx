import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Joyride, STATUS, type EventData, type Step } from "react-joyride";
import { getDriverMe, patchDriverOnboarding } from "../../api/driver";
import { userFacingApiError } from "../../lib/api-error-message";

const DRIVER_STEPS: Step[] = [
  {
    target: '[data-tour="driver-nav-loads"]',
    content: "Home — your loads inbox and quick access to active freight.",
    skipBeacon: true,
  },
  {
    target: '[data-tour="driver-nav-loads"]',
    content: "Active load — open any row for details, documents, and stops.",
    skipBeacon: true,
  },
  {
    target: '[data-tour="driver-nav-disputes"]',
    content: "Settlement disputes — escalate or review settlement questions.",
    skipBeacon: true,
  },
  {
    target: '[data-tour="driver-nav-settings"]',
    content: "Profile — language, help links, and preferences.",
    skipBeacon: true,
  },
];

export function DriverOnboardingTour() {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["driver", "me"],
    queryFn: getDriverMe,
  });

  const [run, setRun] = useState(false);
  const [completionPending, setCompletionPending] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  useEffect(() => {
    if (meQuery.isLoading || !meQuery.data) return;
    if (meQuery.data.onboarding_completed_at) return;
    const t = window.setTimeout(() => setRun(true), 600);
    return () => window.clearTimeout(t);
  }, [meQuery.isLoading, meQuery.data]);

  const persistCompletion = useCallback(async () => {
    setCompletionPending(true);
    setCompletionError(null);
    try {
      await patchDriverOnboarding({ complete: true });
      await qc.invalidateQueries({ queryKey: ["driver", "me"] });
    } catch (error) {
      // DRIVER-F6459: completing or skipping the tour is a durable profile write.
      // Never close silently and let the tour unexpectedly return on reload.
      setCompletionError(userFacingApiError(error, "Could not save tour completion."));
    } finally {
      setCompletionPending(false);
    }
  }, [qc]);

  const onCallback = useCallback(
    (data: EventData) => {
      if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
        setRun(false);
        void persistCompletion();
      }
    },
    [persistCompletion]
  );

  return (
    <>
      <Joyride
        steps={DRIVER_STEPS}
        run={run}
        continuous
        scrollToFirstStep
        options={{ showProgress: true, zIndex: 60_000 }}
        onEvent={onCallback}
      />
      {completionError ? (
        <div role="alert" className="fixed bottom-4 right-4 z-[60001] max-w-sm rounded-sm border border-red-300 bg-red-50 p-3 text-xs text-red-900 shadow-lg">
          <p>{completionError}</p>
          <button
            type="button"
            className="mt-2 rounded-sm border border-red-400 bg-white px-2 py-1 font-semibold disabled:opacity-50"
            disabled={completionPending}
            onClick={() => void persistCompletion()}
          >
            {completionPending ? "Saving…" : "Retry saving completion"}
          </button>
        </div>
      ) : null}
    </>
  );
}
