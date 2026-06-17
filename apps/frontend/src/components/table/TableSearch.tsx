import { Search } from "lucide-react";

// GLOBAL-TABLE-CONTROLS — shared free-text filter box. Narrows a list as you type.
type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
};

export function TableSearch({ value, onChange, placeholder = "Search…", className = "" }: Props) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded border border-gray-300 pl-7 pr-2 text-[13px]"
      />
    </div>
  );
}
