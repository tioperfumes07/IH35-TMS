import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import type { SafetyGroup } from "./SAFETY_TABS_CONFIG";
import { SAFETY_ALIAS_TABS } from "./SAFETY_TABS_CONFIG";
import { HoverDropdown } from "../shared/HoverDropdown";

type Props = {
  groups: SafetyGroup[];
  activeTabId: string;
  onTabChange?: (tabId: string) => void;
};

export function SafetyGroupNav({ groups, activeTabId, onTabChange }: Props) {
  const groupsWithCertExpiry = useMemo(() => {
    return groups.map((group) => {
      const aliases = SAFETY_ALIAS_TABS.filter((alias) => alias.groupId === group.id).map((alias) => alias.tab);
      if (aliases.length === 0) return group;
      const missing = aliases.filter((alias) => !group.tabs.some((tab) => tab.id === alias.id));
      if (missing.length === 0) return group;
      return { ...group, tabs: [...group.tabs, ...missing] };
    });
  }, [groups]);

  const activeMeta = useMemo(() => {
    for (const group of groupsWithCertExpiry) {
      const tab = group.tabs.find((item) => item.id === activeTabId);
      if (tab) return { group, tab };
    }
    return null;
  }, [groupsWithCertExpiry, activeTabId]);

  return (
    <div className="relative border-b border-gray-200 bg-white">
      <div className="flex items-center gap-0 px-[22px]">
        {groupsWithCertExpiry.map((group) => {
          const hasActive = group.tabs.some((tab) => tab.id === activeTabId);
          return (
            <HoverDropdown
              key={group.id}
              trigger={
                <span
                  className="flex items-center gap-1 whitespace-nowrap border-b-2 border-transparent bg-transparent px-4 py-3 text-xs font-semibold text-slate-500"
                  style={hasActive ? { color: "#1f2a44", borderBottomColor: "#1f2a44" } : undefined}
                >
                  <span>{group.label}</span>
                  <span className="text-[9px] opacity-60">v</span>
                </span>
              }
              minWidth={240}
            >
              {group.tabs.map((tab) => {
                const active = tab.id === activeTabId;
                return (
                  <NavLink
                    key={tab.id}
                    to={tab.route}
                    onClick={() => onTabChange?.(tab.id)}
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
                  </NavLink>
                );
              })}
            </HoverDropdown>
          );
        })}
        <div className="ml-auto whitespace-nowrap px-4 py-3 text-[11px] text-slate-400">
          Active: <span className="font-semibold text-[#1f2a44]">{activeMeta?.tab.label ?? "Driver Files"}</span>
        </div>
      </div>
    </div>
  );
}
