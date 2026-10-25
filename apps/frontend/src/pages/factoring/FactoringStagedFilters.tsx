import type { ComponentProps } from "react";
import { CollapsedListFilters } from "../../components/table/CollapsedListFilters";

/** Factoring home staged filter chrome (443.326 — keep CollapsedListFilters out of FactoringHome.tsx). */
export function FactoringStagedFilters(
  props: ComponentProps<typeof CollapsedListFilters>,
) {
  return <CollapsedListFilters {...props} />;
}
