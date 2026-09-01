import { keepPreviousData } from "@tanstack/react-query";

/** Keep prior catalog rows visible while debounced server search refetches (LISTS-CATALOG-SEARCH-FLAKY). */
export const catalogListSearchQueryOptions = {
  placeholderData: keepPreviousData,
} as const;
