import { STAGE_DISPLAY, stageIndex, type ScenarioState, type ScenarioTrackerItem } from "./types";

type Props = {
  item: ScenarioTrackerItem;
  stale: boolean;
};

export function ScenarioPipeline({ item, stale }: Props) {
  const stage = stageIndex(item.stage);
  const state: ScenarioState = stale ? "go" : item.state || "go";
  const nodes = [];
  for (let i = 0; i < 6; i++) {
    const done = !stale && (state === "done" || i < stage);
    const cur = !stale && state !== "done" && i === stage;
    const cls = [
      "st-pdot",
      done ? "done" : "",
      cur ? `cur ${state}` : "",
      stale ? "stale" : "",
    ]
      .filter(Boolean)
      .join(" ");
    nodes.push(
      <div key={`n-${i}`} className="st-pnode">
        <div className={cls}>{done ? "✓" : ""}</div>
      </div>,
    );
    if (i < 5) {
      const on = !stale && (state === "done" || i < stage);
      nodes.push(<div key={`s-${i}`} className={`st-pseg${on ? " on" : ""}${stale ? " stale" : ""}`} />);
    }
  }
  const label = stale
    ? "—"
    : state === "done"
      ? "Complete"
      : state === "fix"
        ? `${STAGE_DISPLAY[stage]} · fixing`
        : STAGE_DISPLAY[stage];
  return (
    <div className={`st-pipewrap${stale ? " is-stale" : ""}`} data-testid="scenario-pipeline">
      <div className="st-pipe">{nodes}</div>
      <div className={`st-pcur ${stale ? "stale" : state}`}>
        <span className="st-stg">Now:</span> <strong>{label}</strong>
      </div>
    </div>
  );
}
