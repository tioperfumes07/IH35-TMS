type Props = {
  states: string[];
};

export function AvoidStatesBanner({ states }: Props) {
  return (
    <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs">
      <div className="font-semibold text-red-700">Avoid expensive states (WF-015 heuristic)</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {states.map((state) => (
          <span key={state} className="rounded-full border border-red-300 bg-white px-2 py-0.5 text-red-700">
            {state}
          </span>
        ))}
      </div>
    </div>
  );
}
