import { useRef, useState, type ReactNode } from "react";

type Action = {
  id: string;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
};

type Props = {
  children: ReactNode;
  actions: Action[];
};

export function SwipeActionRow({ children, actions }: Props) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);

  const maxReveal = Math.min(actions.length * 72, 216);

  return (
    <div className="relative overflow-hidden rounded border border-gray-200 bg-white" data-testid="swipe-action-row">
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`min-h-11 px-4 text-xs font-semibold text-white ${
              action.tone === "danger" ? "bg-red-600" : "bg-[#1F2A44]"
            }`}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div
        className="relative bg-white transition-transform"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(event) => {
          startX.current = event.touches[0]?.clientX ?? 0;
        }}
        onTouchMove={(event) => {
          const currentX = event.touches[0]?.clientX ?? 0;
          const delta = currentX - startX.current;
          if (delta < 0) setOffset(Math.max(delta, -maxReveal));
        }}
        onTouchEnd={() => {
          if (offset < -maxReveal / 2) setOffset(-maxReveal);
          else setOffset(0);
        }}
      >
        {children}
      </div>
    </div>
  );
}
