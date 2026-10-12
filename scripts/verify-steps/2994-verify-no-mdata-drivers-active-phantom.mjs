import { run } from "../verify-no-mdata-drivers-active-phantom.mjs";

export default {
  name: "verify-no-mdata-drivers-active-phantom",
  async run(ctx) {
    const { ok, message } = run();
    if (!ok) {
      ctx.fail(message);
    } else {
      // 443.99: the verify-steps context has no ctx.pass (only fail) — a passing guard crashed the step.
      console.log(message);
    }
  },
};
