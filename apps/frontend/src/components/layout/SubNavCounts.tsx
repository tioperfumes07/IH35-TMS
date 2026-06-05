import type { ListsModule } from "../../api/listsHub";
import { useModuleCount } from "../../hooks/useModuleCount";

type Props = {
  module: ListsModule;
};

export function SubNavCounts({ module }: Props) {
  const { count, loading } = useModuleCount(module);

  return (
    <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
      {loading ? "…" : count}
    </span>
  );
}
