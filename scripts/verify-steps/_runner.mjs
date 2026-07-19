/**
 * Shared verify-step runner for `npm run verify:pre-commit`.
 *
 * IMPORTANT: many steps signal failure with `return 1` (or `return ctx.run(...)`).
 * Historically this helper ignored the return value, so those failures were silently
 * discarded and CI printed PASS. Always treat a non-zero numeric status as failure.
 * Steps that throw (preferred) still fail via exception propagation.
 */
export async function runStep({ index, total, name, run }) {
  console.log(`verify:pre-commit step ${index}/${total}: ${name}`);
  const status = await run();
  if (typeof status === "number" && status !== 0) {
    throw new Error(`verify:pre-commit step failed: ${name} (status ${status})`);
  }
  return status;
}
