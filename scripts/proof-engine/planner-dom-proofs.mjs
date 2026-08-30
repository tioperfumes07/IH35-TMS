/**
 * PlannerGrid A-checks as stored DOM proofs.
 * AUTH (b): auth:"session" — postdeploy without IH35_DOM_SESSION derives UNVERIFIED, never PASS.
 */
export const PLANNER_DOM_ITEMS = [
  {
    file: "planner-dom-proofs.mjs",
    module: "dispatch",
    item: {
      id: "PLANNER-GRID-A-CHECKS",
      proofs: [
        {
          kind: "dom",
          name: "A1-A6 live planner (session)",
          auth: "session",
          url: "https://app.ih35dispatch.com/dispatch/planners/driver",
          anchor: '[data-testid="planner-time-axis"]',
          expect: [
            { op: "unique_per_id", attr: "data-load-id" },
            { op: "style_contains", selector: '[data-testid="planner-grid-track"]', prop: "background-image", substring: "repeating-linear-gradient" },
            { op: "count_zero", selector: '[data-testid="planner-available-cell"]' },
            { op: "text_nonempty", selector: '[data-testid="planner-grid-dwell"]' },
          ],
        },
      ],
    },
  },
];
