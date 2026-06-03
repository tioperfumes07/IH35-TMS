import type { ListsModule } from "../../../api/listsHub";
import { useModuleCount } from "../../../hooks/useModuleCount";
import { DomainTab } from "./DomainTab";

const DOMAIN_MODULE: Record<string, ListsModule> = {
  safety: "SAFETY",
  maintenance: "MAINTENANCE",
  dispatch: "DISPATCH",
  fuel: "FUEL",
  drivers: "DRIVERS",
  fleet: "FLEET",
  accounting: "ACCOUNTING",
  names_master: "NAMES_MASTER",
};

type Props = {
  domain: string;
  label: string;
  isActive: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

export function DomainModuleTab({ domain, label, isActive, onMouseEnter, onClick }: Props) {
  const module = DOMAIN_MODULE[domain];
  const { count, loading } = useModuleCount(module);

  return (
    <DomainTab
      label={label}
      count={count}
      loading={loading}
      isActive={isActive}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    />
  );
}
