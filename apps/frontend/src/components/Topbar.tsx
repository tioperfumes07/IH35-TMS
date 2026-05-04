import { ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "../api/identity";
import type { AuthMeResponse } from "../types/api";
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = useMemo(() => formatNow(now), [now]);

  return (
    <header className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          IH 35 TRANSPORTATION LLC
          <span className="inline-block h-2 w-2 rounded-full bg-ok" />
        </div>
      </div>

      <div className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
        QuickBooks · Samsara · Relay not yet connected
      </div>

      <div className="relative flex items-center gap-3 text-sm text-gray-700">
        <span className="text-xs">{dateLabel}</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50"
          onClick={() => setOpen((current) => !current)}
        >
          {auth.email}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open ? (
          <div className="absolute right-0 top-9 z-30 w-40 rounded border border-gray-200 bg-white p-1 shadow">
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
