import { useEffect, useMemo, useRef, useState } from "react";
import type { SafetyGroup } from "./SAFETY_TABS_CONFIG";

type Props = {
  groups: SafetyGroup[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
};

export function SafetyGroupNav({ groups, activeTabId, onTabChange }: Props) {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenGroupId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeMeta = useMemo(() => {
    for (const group of groups) {
      const tab = group.tabs.find((item) => item.id === activeTabId);
      if (tab) return { group, tab };
    }
    return null;
  }, [groups, activeTabId]);

  return (
    <div ref={navRef} className="relative border-b border-gray-200 bg-white">
      <div className="flex items-center gap-0 px-[22px]">
        {groups.map((group) => {
          const hasActive = group.tabs.some((tab) => tab.id === activeTabId);
          const open = openGroupId === group.id;
          return (
            <div key={group.id} className="relative" onMouseEnter={() => setOpenGroupId(group.id)}>
              <button
                type="button"
                onClick={() => setOpenGroupId((current) => (current === group.id ? null : group.id))}
                className="flex items-center gap-1 whitespace-nowrap border-b-2 border-transparent bg-transparent px-4 py-3 text-xs font-semibold text-slate-500"
                style={hasActive || open ? { color: "#1f2a44", borderBottomColor: "#1f2a44" } : undefined}
              >
                <span>{group.label}</span>
                <span className="text-[9px] opacity-60" style={open ? { transform: "rotate(180deg)" } : undefined}>
                  v
                </span>
              </button>

              {open ? (
                <div
                  className="absolute left-0 top-full z-50 min-w-[240px] rounded-b border border-gray-200 bg-white py-1 shadow-md"
                  style={{ borderTop: "2px solid #1f2a44", boxShadow: "0 4px 14px rgba(15,23,41,0.08)" }}
                  onMouseLeave={() => setOpenGroupId((current) => (current === group.id ? null : current))}
                >
                  {group.tabs.map((tab) => {
                    const active = tab.id === activeTabId;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          onTabChange(tab.id);
                          setOpenGroupId(null);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-600 hover:bg-gray-50 hover:text-[#1f2a44]"
                        style={active ? { color: "#1f2a44", borderLeft: "3px solid #1f2a44", background: "#f8fafc", fontWeight: 600 } : { borderLeft: "3px solid transparent" }}
                      >
                        <span>{tab.label}</span>
                        {tab.badge === "new" ? (
                          <span className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: "#d1fae5", color: "#065f46" }}>
                            NEW
                          </span>
                        ) : tab.badge === "renamed" ? (
                          <span className="rounded px-1.5 py-0.5 text-[8px] font-bold" style={{ background: "#fef3c7", color: "#d97706" }}>
                            RENAMED
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="ml-auto whitespace-nowrap px-4 py-3 text-[11px] text-slate-400">
          Active: <span className="font-semibold text-[#1f2a44]">{activeMeta?.tab.label ?? "Driver Files"}</span>
        </div>
      </div>
    </div>
  );
}
