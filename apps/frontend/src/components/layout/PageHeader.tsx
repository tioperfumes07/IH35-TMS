import { ArrowLeft } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { colors, typography } from "../../design/tokens";
import { lastModuleHref, shouldUseLastModuleBack } from "../../lib/lastModuleNav";
import { hasInAppHistory } from "../../lib/smart-back";

type Props = {
  backHref?: string;
  // Callback-based back for headers rendered inside a stateful panel (not on their own route), where
  // `navigate(-1)` would leave the surface instead of returning to the in-panel list. Takes precedence
  // over backHref when provided.
  onBack?: () => void;
  // Module-header breadcrumb trail (§7 module-header law: ← back + breadcrumb). Rendered above the title
  // only when provided, so existing headers are unchanged.
  breadcrumb?: string[];
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ backHref, onBack, breadcrumb, title, subtitle, actions }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="mb-4">
      {breadcrumb && breadcrumb.length > 0 ? (
        <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
          {breadcrumb.map((item, index) => (
            <Fragment key={`${item}-${index}`}>
              <span>{item}</span>
              {index < breadcrumb.length - 1 ? <span className="mx-1.5">›</span> : null}
            </Fragment>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/*
          BANKING-HOME-TITLE-ACTIONS-OVERLAP: this title-group used to carry `min-w-0` alongside
          `flex-1`, which let the flex algorithm shrink this WHOLE group narrower than the title's own
          (flexShrink:0, nowrap) content when the sibling actions block's natural width left little
          room — e.g. /banking/transactions and /banking/reconciliation, whose action list is short
          enough to fit on the header's first line, unlike /banking (Accounts) with its long action
          list that already forced a wrap. With min-w-0 the browser preferred shrinking this box to a
          few px (down to just the back button) over wrapping the row, and the h1 — which itself
          refuses to shrink and has no overflow clipping — rendered straight over the actions text
          instead of moving to a second line, corrupting both readability and click targets. Live-
          reproduced and live-fixed via DOM patch on /banking/transactions before touching source: with
          min-w-0 removed, the parent's `flex-wrap` correctly pushes the actions block to its own line
          once the two groups' natural widths exceed the row, matching the working /banking (Accounts)
          layout instead of overlapping it. No other prop of this shared component changes; the title/
          subtitle-vs-title truncation math below is unaffected.
        */}
        <div className="flex min-w-0 flex-1 items-end gap-2 overflow-hidden">
          <button
            type="button"
            aria-label="Back"
            className="mb-1 inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
            onClick={() => {
              if (onBack) {
                onBack();
                return;
              }
              // UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: prefer true history-based back
              // whenever the user actually navigated within the app to reach this page -- a static
              // backHref always sends them to the same hardcoded parent even when they arrived from
              // somewhere else entirely. Only fall back to backHref on a direct URL load/refresh,
              // where there is no real in-app page to go back to.
              if (hasInAppHistory(window.history.state)) {
                navigate(-1);
                return;
              }
              if (backHref) {
                navigate(backHref);
                return;
              }
              const remembered = lastModuleHref();
              if (shouldUseLastModuleBack(location.pathname, remembered) && remembered) {
                navigate(remembered);
                return;
              }
              navigate(-1);
            }}
          >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-[11px] font-semibold">Back</span>
          </button>
          {/*
            The title must NOT be squeezed by the subtitle. Observed live on /dispatch: the subtitle
            "Loads, stops, assignments, geofencing" wrapped onto THREE lines beside the heading, because
            it was a bare <span> with no wrap control inside a flex row — so it took width from the title
            and stacked. whiteSpace: nowrap stops the stacking; flexShrink 0 on the title (with the
            subtitle at 999) makes the SUBTITLE absorb the overflow, never the module name.

            This is the SECOND PageHeader in the codebase — components/forms/shared/PageHeader has the
            same role and the identical defect class, fixed separately. They are genuinely different
            components (different files, different props, one CSS-class based and one inline-style
            based), so the fix has to be made in both; there is no shared rule to change.
          */}
          <h1
            style={{
              fontFamily: typography.fontSerif,
              fontSize: typography.pageHeading,
              color: colors.pageHeading,
              fontWeight: 600,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <span
              style={{
                fontSize: typography.pageSubtitle,
                color: colors.mutedText,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                // minWidth: 0 is required for the ellipsis — without it a flex item refuses to shrink
                // below its content width and text-overflow silently never engages.
                minWidth: 0,
                flexShrink: 999,
              }}
            >
              {subtitle}
            </span>
          ) : null}
        </div>
        <div className="relative z-50 w-full shrink-0 sm:w-auto">{actions}</div>
      </div>
    </div>
  );
}
