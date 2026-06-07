export type OperationsSubView = {
  slug: string;
  label: string;
};

export type OperationsGroup = {
  group: string;
  items: OperationsSubView[];
};

/** The 12 driver operations-depth sub-views, grouped for the hover-dropdown nav (G3 pattern). */
export const OPERATIONS_DEPTH_GROUPS: OperationsGroup[] = [
  {
    group: "Financial",
    items: [
      { slug: "debt-history", label: "Debt History" },
      { slug: "payroll-history", label: "Payroll History" },
      { slug: "escrow-history", label: "Escrow History" },
      { slug: "settlement-history", label: "Settlement History" },
      { slug: "fuel-history", label: "Fuel History" },
    ],
  },
  {
    group: "Compliance & Safety",
    items: [
      { slug: "permit-history", label: "Permit History" },
      { slug: "accident-history", label: "Accident History" },
      { slug: "safety-events", label: "Safety Events" },
    ],
  },
  {
    group: "Operations",
    items: [
      { slug: "maintenance-assignments", label: "Maintenance Assignments" },
      { slug: "documents-vault", label: "Documents Vault" },
    ],
  },
  {
    group: "Engagement",
    items: [
      { slug: "communications-log", label: "Communications Log" },
      { slug: "pwa-engagement", label: "PWA Engagement" },
    ],
  },
];

export const OPERATIONS_DEPTH_SUBVIEWS: OperationsSubView[] = OPERATIONS_DEPTH_GROUPS.flatMap((group) => group.items);

type Props = {
  activeSlug: string;
  onChange: (slug: string) => void;
};

/**
 * Secondary navigation for the driver Operations tab. Each group is a hover-dropdown
 * that reveals its sub-views (G3 hover-dropdown pattern); selecting one swaps the panel.
 */
export function OperationsDepthNav({ activeSlug, onChange }: Props) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-gray-200 bg-white px-2 py-1" data-testid="operations-depth-nav">
      {OPERATIONS_DEPTH_GROUPS.map((group) => {
        const groupActive = group.items.some((item) => item.slug === activeSlug);
        return (
          <div key={group.group} className="group relative">
            <button
              type="button"
              className={`rounded px-2 py-1 text-xs font-semibold ${
                groupActive ? "bg-[#1f2a44] text-white" : "text-slate-600 hover:bg-gray-100"
              }`}
            >
              {group.group}
            </button>
            <div className="absolute left-0 z-20 hidden min-w-[12rem] flex-col rounded border border-gray-200 bg-white py-1 shadow-lg group-hover:flex">
              {group.items.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => onChange(item.slug)}
                  className={`px-3 py-1.5 text-left text-xs ${
                    item.slug === activeSlug ? "bg-sky-50 font-semibold text-sky-800" : "text-slate-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
