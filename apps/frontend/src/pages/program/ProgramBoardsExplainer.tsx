export function ProgramBoardsExplainer({ active }: { active: "matrix" }) {
  return (
    <div
      className="px-4 py-3 text-xs leading-snug"
      style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", color: "#334155" }}
      data-testid="program-boards-explainer"
    >
      {active === "matrix" ? (
        <>
          <b>Module matrix</b> is the launch 4-box board (Required / Audited / Built / Live) from{" "}
          <code>*.required.json</code> plus <code>GET /api/v1/program/module-matrix</code>.
        </>
      ) : null}
    </div>
  );
}
