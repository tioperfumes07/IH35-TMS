import type { ListsModule } from "../../api/listsHub";
import { useModuleCount } from "../../hooks/useModuleCount";

type Props = {
  module: ListsModule;
};

export function SubNavCounts({ module }: Props) {
  const { count, loading, error } = useModuleCount(module);

  return (
    <span className="ml-1 rounded-sm bg-[#F7F8FA] px-1.5 py-0.5 text-xs font-semibold text-[#1F2A44]">
      {loading ? "…" : error || count == null ? "—" : count}
    </span>
  );
}
