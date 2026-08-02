// DOT Violation Types list — flat section chrome, no filter+table double border (verify-step 2034, Cursor EVEN band).
export default {
  name: "lst-dot-violation-types-list-chrome",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-lst-dot-violation-types-list-chrome.mjs"]);
  },
};
