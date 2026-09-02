import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { closeTour, getTourCloseEligibility } from "../api/tour";
import { useToast } from "./Toast";

/**
 * TOUR CLOSE + GEOFENCE (owner direct instruction, 2026-09-02). Read-only eligibility poll drives
 * two mutually-exclusive states, both optional (renders nothing otherwise — an active load, or a
 * position/geofence we simply can't confirm yet, is not an error the driver needs to see):
 *   - should_prompt_deadhead_to_yard: no more loads, but not yet at the yard -> the "head to the
 *     yard" banner. Purely informational; never calls the close endpoint.
 *   - can_close: at the yard, no active load -> the Close Tour button. closeTour() re-validates
 *     eligibility server-side (this banner's own can_close is advisory, never trusted for the
 *     actual close decision).
 */
export function TourCloseBanner() {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const eligibilityQuery = useQuery({
    queryKey: ["pwa", "tour", "close-eligibility"],
    queryFn: getTourCloseEligibility,
    refetchInterval: 60_000,
  });

  const eligibility = eligibilityQuery.data;
  if (!eligibility) return null;

  async function handleClose() {
    try {
      const result = await closeTour();
      pushToast(result.closed ? t("tour_close.closed_success") : t("tour_close.close_failed"), result.closed ? "success" : "error");
      await queryClient.invalidateQueries({ queryKey: ["pwa", "tour", "close-eligibility"] });
      await queryClient.invalidateQueries({ queryKey: ["pwa", "loads", "today"] });
    } catch {
      pushToast(t("tour_close.close_failed"), "error");
    }
  }

  if (eligibility.can_close) {
    return (
      <div className="mb-3 rounded-lg border border-pwa-border bg-[#101522] p-3" data-testid="tour-close-banner">
        <button
          type="button"
          className="min-h-11 w-full rounded-lg bg-pwa-accent px-3 text-sm font-semibold text-white"
          onClick={() => void handleClose()}
          data-testid="tour-close-button"
        >
          {t("tour_close.close_button")}
        </button>
      </div>
    );
  }

  if (eligibility.should_prompt_deadhead_to_yard) {
    return (
      <div
        className="mb-3 rounded-lg border border-pwa-border bg-[#101522] p-3 text-sm text-pwa-text-secondary"
        data-testid="tour-close-deadhead-prompt"
      >
        {t("tour_close.deadhead_prompt")}
      </div>
    );
  }

  return null;
}
