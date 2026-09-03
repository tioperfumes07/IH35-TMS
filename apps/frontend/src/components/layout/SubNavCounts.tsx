import type { ListsModule } from "../../api/listsHub";
import { useModuleCount } from "../../hooks/useModuleCount";

type Props = {
  module: ListsModule;
};

export function SubNavCounts({ module }: Props) {
  const { count, loading, error } = useModuleCount(module);

  return (
    <span className="ml-1 rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
      {loading ? "…" : error || count == null ? "—" : count}
    </span>
  );
}
