type TabOption = {
  id: string;
  label: string;
};

type Props = {
  tabs: TabOption[];
  activeId: string;
  onChange: (tabId: string) => void;
  className?: string;
};

export function SecondaryNavTabs({ tabs, activeId, onChange, className = "" }: Props) {
  return (
    <div className={`overflow-x-auto border-b border-gray-200 bg-white px-2 py-1 ${className}`.trim()}>
      <div className="flex min-w-max gap-4">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`pb-0.5 text-xs font-semibold ${
                active ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

