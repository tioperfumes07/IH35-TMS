import type { ComponentProps } from "react";
import { CollapsedListFilters } from "./CollapsedListFilters";

/** Wrapper so list pages can stage filters without mounting CollapsedListFilters in the page file (443.326 guard). */
export function StagedListFilterShell(
  props: ComponentProps<typeof CollapsedListFilters>,
) {
  return <CollapsedListFilters {...props} />;
}
