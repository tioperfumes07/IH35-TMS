// Complaint Types list — flat section chrome, no filter+table double border (verify-step 2030, Cursor EVEN band).
export default {
  name: "lst-complaint-types-list-chrome",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-lst-complaint-types-list-chrome.mjs"]);
  },
};
