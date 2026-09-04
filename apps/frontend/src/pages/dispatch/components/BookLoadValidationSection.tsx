import { colors } from "../../../design/tokens";
import { DataPanel } from "../../../components/layout/DataPanel";

// GO-21-J1: this component was cited as the owner's own proof of the "text sizes, column headers
// look too dirty" defect — 4 different arbitrary sizes in one 2-box section (text-xs=12,
// plus 10.5px / 9px / 10px arbitrary brackets). Rebuilt on the shared DataPanel (already in production
// on Home/DispatchOverview — this is adoption, not a new component), which already carries the
// LOCKED column/section-header treatment (11px/700/UPPERCASE/#4B5563 — see DataPanel.tsx). Per
// GLOBAL-TYPE-SIZE-BASELINE.md's own binary rule ("is this text a header or is it body? Nothing
// else is allowed"), everything inside each panel — including the status-code chip and the
// state-glyph badge, which previously had their own separate 9px/10px/10.5px sizes — is body text
// now: Tailwind's own `text-xs` (no theme override in this app) is exactly the locked 12px, so
// this is the locked size via a real utility class, not another one-off arbitrary bracket.
type Props = {
  checks: Array<{
    text: string;
    code: string;
    // WIZ-47: "blocked" is a live gate that is CURRENTLY failing. A gate that blocks
    // submit must never render as a passing "live" ✓ — it renders red so the checks
    // panel reads the same truth as the submit button.
    state: "live" | "pending" | "on_save" | "blocked";
  }>;
};

export function BookLoadValidationSection({ checks }: Props) {
  const liveCount = checks.filter((check) => check.state === "live").length;
  const blockedCount = checks.filter((check) => check.state === "blocked").length;
  const pendingCount = checks.filter((check) => check.state === "pending").length;
  const onSaveCount = checks.filter((check) => check.state === "on_save").length;
  const saveActions = [
    "Create load with assigned status",
    "Auto-create driver bill (loaded miles × loaded rate + empty miles × empty rate)",
    "Queue QBO outbox invoice + bill",
    "Send driver dispatch message",
    "Prepare factoring packet",
  ];

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      <DataPanel title="Book + dispatch checks">
        <div className="space-y-1">
          {checks.map((check, index) => (
            <div
              key={`${check.text}-${index}`}
              className="flex items-center gap-2 border-b border-gray-100 pb-1 text-xs"
              style={{ color: colors.bodyText }}
            >
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-xs font-semibold ${
                  check.state === "blocked"
                    ? "bg-[#b91c1c] text-white"
                    : check.state === "live"
                      ? "bg-[#1c9d5b] text-white"
                      : check.state === "pending"
                        ? "bg-slate-200 text-slate-700"
                        : "bg-[#1f2733] text-white"
                }`}
                aria-label={
                  check.state === "blocked"
                    ? "Active blocker"
                    : check.state === "live"
                      ? "Live gate"
                      : check.state === "pending"
                        ? "Not automated"
                        : "Runs on save"
                }
              >
                {check.state === "blocked" ? "✕" : check.state === "live" ? "✓" : check.state === "pending" ? "—" : "→"}
              </span>
              <span className="flex-1" style={check.state === "blocked" ? { color: "#b91c1c", fontWeight: 600 } : undefined}>
                {check.text}
              </span>
              <span className="rounded-sm border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-xs" style={{ color: colors.mutedText }}>
                {check.code}
              </span>
            </div>
          ))}
        </div>
      </DataPanel>
      <DataPanel title="On save — book + dispatch">
        <div className="space-y-1 text-xs" style={{ color: colors.bodyText }}>
          {saveActions.map((action) => (
            <div key={action}>
              <span className="mr-1">→</span>
              {action}
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-gray-100 pt-1.5 text-xs font-semibold" style={{ color: colors.bodyText }}>
          {blockedCount > 0 ? (
            <span style={{ color: "#b91c1c" }}>{blockedCount} active blocker{blockedCount === 1 ? "" : "s"} · </span>
          ) : null}
          {liveCount} live gates · {pendingCount} not automated · {onSaveCount} run on save
        </div>
      </DataPanel>
    </section>
  );
}
