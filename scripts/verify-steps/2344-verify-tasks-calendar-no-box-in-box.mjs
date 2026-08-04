// CLS-BOX-IN-BOX — Tasks Calendar page flatten (verify-step 2344 · Cursor EVEN band).
export default {
  name: "tasks-calendar-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-tasks-calendar-no-box-in-box.mjs"]);
  },
};
