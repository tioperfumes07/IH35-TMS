/** Mirrors `apps/backend/src/accounting/vendor-category.constants.ts`. */
export const VENDOR_CATEGORY_VALUES = [
  "diesel",
  "def",
  "repairs_maintenance",
  "road_service",
  "meals_entertainment",
  "driver",
  "washout",
  "lumpers",
  "insurance",
  "tolls",
  "parking",
  "permits",
  "taxes",
  "professional_services",
  "utilities",
  "rent",
  "office_supplies",
  "software",
  "other",
] as const;

export type VendorCategoryValue = (typeof VENDOR_CATEGORY_VALUES)[number];

export function vendorCategoryLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return code.replace(/_/g, " ");
}

/** Tailwind utility bundles for category chips (bg + text). */
export function vendorCategoryChipClasses(code: string | null | undefined): string {
  switch (code) {
    case "diesel":
      return "bg-blue-100 text-blue-900 border-blue-200";
    case "def":
      return "bg-cyan-100 text-cyan-900 border-cyan-200";
    case "repairs_maintenance":
      return "bg-orange-100 text-orange-900 border-orange-200";
    case "road_service":
      return "bg-red-100 text-red-900 border-red-200";
    case "meals_entertainment":
      return "bg-amber-100 text-amber-950 border-amber-200";
    case "driver":
      return "bg-purple-100 text-purple-900 border-purple-200";
    case "washout":
      return "bg-sky-100 text-sky-900 border-sky-200";
    case "lumpers":
      return "bg-lime-100 text-lime-900 border-lime-200";
    case "insurance":
      return "bg-indigo-100 text-indigo-900 border-indigo-200";
    case "tolls":
      return "bg-teal-100 text-teal-900 border-teal-200";
    case "parking":
      return "bg-slate-200 text-slate-900 border-slate-300";
    case "permits":
      return "bg-yellow-100 text-yellow-950 border-yellow-200";
    case "taxes":
      return "bg-rose-100 text-rose-900 border-rose-200";
    case "professional_services":
      return "bg-violet-100 text-violet-900 border-violet-200";
    case "utilities":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "rent":
      return "bg-stone-200 text-stone-900 border-stone-300";
    case "office_supplies":
      return "bg-neutral-200 text-neutral-900 border-neutral-300";
    case "software":
      return "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}
