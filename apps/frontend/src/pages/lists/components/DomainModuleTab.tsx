import { DOMAIN_CATALOG_COUNTS } from "./AllCatalogsMap";
import { DomainTab } from "./DomainTab";

type Props = {
  domain: string;
  label: string;
  isActive: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

export function DomainModuleTab({ domain, label, isActive, onMouseEnter, onClick }: Props) {
  // #P3 — read the same per-domain catalog count the All Catalogs map renders. The badges
  // previously used a per-module count hook whose endpoint returned 0. Counts are
  // static/registry-derived, so there is nothing to load.
  const count = DOMAIN_CATALOG_COUNTS[domain] ?? 0;

  return (
    <DomainTab
      label={label}
      count={count}
      loading={false}
      isActive={isActive}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    />
  );
}
