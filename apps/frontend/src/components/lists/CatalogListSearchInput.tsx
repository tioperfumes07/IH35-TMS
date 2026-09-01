import { TableSearch } from "../table/TableSearch";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
};

/**
 * LISTS-CATALOG-SEARCH-FLAKY — debounced server-bound catalog search (TableSearch 300ms emit).
 * Raw per-keystroke inputs raced react-query keys and flashed empty grids between fetches.
 */
export function CatalogListSearchInput({
  value,
  onChange,
  placeholder = "Search by code or display name",
  className = "md:col-span-2",
  "data-testid": testId = "catalog-list-search",
}: Props) {
  return (
    <TableSearch
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      data-testid={testId}
    />
  );
}
