import { ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "../api/identity";
import { colors, spacing, typography } from "../design/tokens";
import type { AuthMeResponse } from "../types/api";
import { CompanySwitcher } from "./CompanySwitcher";
import { useToast } from "./Toast";

type Props = {
  auth: AuthMeResponse["user"];
};

function formatNow(now: Date): string {
  return now.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Topbar({ auth }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const emailLabel = auth.email ?? "Phone login";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(() => formatNow(now), [now]);

  return (
    <header
      className="grid items-center border-b"
      style={{
        gridTemplateColumns: "1fr auto 1fr",
        height: spacing.topbarHeight,
        backgroundColor: colors.topbarBg,
        borderBottomColor: colors.sidebarBorder,
        padding: `${spacing.topbarPaddingY}px ${spacing.topbarPaddingX}px`,
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 font-medium uppercase" style={{ fontSize: 13, color: colors.sidebarTextActive }}>
          IH 35 Dispatch
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <div className="rounded-full px-2 py-0.5 text-[12px]" style={{ backgroundColor: "#151A24", color: colors.sidebarTextMuted }}>
          <span style={{ color: colors.sidebarTextActive }}>QuickBooks</span> ·{" "}
          <span style={{ color: colors.sidebarTextActive }}>Telematics</span> ·{" "}
          <span style={{ color: colors.sidebarTextActive }}>Relay</span>
        </div>
        <CompanySwitcher />
      </div>

      <div className="relative flex items-center justify-end gap-2 text-sm text-gray-700">
        <span style={{ fontSize: typography.pageSubtitle, color: colors.sidebarTextMuted }}>{dateLabel}</span>
        <button
          type="button"
          className="flex h-7 items-center gap-1 rounded border px-2 hover:bg-white/10"
          style={{ borderColor: colors.sidebarBorder, color: colors.sidebarTextActive, fontSize: typography.pageSubtitle }}
          onClick={() => setOpen((current) => !current)}
        >
          {emailLabel}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open ? (
          <div className="absolute right-0 top-8 z-30 w-40 rounded border border-gray-200 bg-white p-1 shadow" style={{ zIndex: 30 }}>
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100"
              onClick={() => {
                setOpen(false);
                pushToast("Profile page coming next phase");
              }}
            >
              Profile
            </button>
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100"
              onClick={async () => {
                setOpen(false);
                try {
                  await signOut(window.location.origin);
                } catch {
                  pushToast("Sign out failed, redirecting to login", "info");
                } finally {
                  queryClient.removeQueries({ queryKey: ["auth", "me"] });
                  window.location.href = "/login";
                }
              }}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
