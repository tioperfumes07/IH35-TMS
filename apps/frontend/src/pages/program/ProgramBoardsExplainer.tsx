export function ProgramBoardsExplainer({ active }: { active: "matrix" | "legacy" }) {
  return (
    <div
      className="px-4 py-3 text-[13px] leading-snug"
      style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#334155" }}
      data-testid="program-boards-explainer"
    >
      {active === "matrix" ? (
        <>
          <b>Module matrix</b> is the launch 4-box board (Required / Audited / Built / Live) from{" "}
          <code>*.required.json</code> plus <code>GET /api/v1/program/module-matrix</code>. It is not the
          13-gate strip. That lives on <b>Legacy certification board</b> and auto-polls every 3 seconds.
        </>
      ) : (
        <>
          <b>Legacy certification board</b> is the 13-gate scoreboard (A–E + V1–V8). Auto-refresh is already
          on. It does not copy the 4-box matrix cells — different measurement. Open{" "}
          <code>/program/matrix</code> for Required/Built/Live leaves.
        </>
      )}
    </div>
  );
}
