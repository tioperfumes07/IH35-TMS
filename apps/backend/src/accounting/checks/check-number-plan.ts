// U9 (owner UI register 2026-10-03, CC-2) — "Print checks: the number is PROPOSED at print and EDITABLE, the sequence
// continues from what he types, a duplicate warns, a gap is recorded with a reason."
//
// Pure planning for one print batch, shared by the preview (read-only) and the assignment (writes) so the numbers the
// owner sees are exactly the numbers that print:
//   * number i = what the owner typed for row i, else (number i-1) + 1; row 0 falls back to the stock's next number.
//   * a GAP is every number from the stock's next number up to the highest number in the batch that this batch does
//     not use and nothing already holds — those check-stock leaves are skipped, so each is recorded with a reason.
//   * a DUPLICATE is a number already held on this bank account (registry, an expense check, a bill payment) or used
//     twice in the batch. A check number identifies one check at the bank; a duplicate is refused at assignment.
//   * the stock's next number afterwards continues from the highest number printed (never moves backwards — a lower
//     typed number fills older unused stock and does not rewind the sequence onto numbers already printed).

export const MAX_GAP_NUMBERS = 100;
const NUMBER_RE = /^\d{1,12}$/;

export class CheckNumberPlanError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CheckNumberPlanError";
    this.code = code;
  }
}

export type CheckNumberGap = { from: string; to: string; count: number };

export type CheckNumberPlan = {
  numbers: string[];
  gaps: CheckNumberGap[];
  gap_count: number;
  in_batch_duplicates: string[];
  next_after: string;
};

export function parseCheckNumber(raw: string): bigint {
  const s = raw.trim();
  if (!NUMBER_RE.test(s) || BigInt(s) <= 0n) {
    throw new CheckNumberPlanError("CHECK_NUMBER_INVALID", `"${raw}" is not a check number (digits only, greater than zero).`);
  }
  return BigInt(s);
}

/**
 * @param nextOnFile the bank account's next_check_number (null = the owner has never typed one)
 * @param count      checks in the batch, in print order
 * @param typed      the owner's typed number per row (null/undefined/"" = continue the sequence)
 * @param held       numbers already used on this bank account (any writer), as normalized digit strings
 */
export function planCheckNumbers(
  nextOnFile: string | null,
  count: number,
  typed: ReadonlyArray<string | null | undefined>,
  held: ReadonlySet<string>
): CheckNumberPlan {
  const numbers: bigint[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = typed[i]?.trim();
    if (t) numbers.push(parseCheckNumber(t));
    else if (i > 0) numbers.push(numbers[i - 1] + 1n);
    else if (nextOnFile) numbers.push(parseCheckNumber(nextOnFile));
    else
      throw new CheckNumberPlanError(
        "CHECK_STOCK_NOT_INITIALIZED",
        "No starting check number is on file for this bank account. Type the number printed on the first check -- it is never guessed."
      );
  }

  const asText = numbers.map((n) => n.toString());
  const seen = new Set<string>();
  const inBatchDup = new Set<string>();
  for (const n of asText) {
    if (seen.has(n)) inBatchDup.add(n);
    seen.add(n);
  }

  const max = numbers.reduce((m, n) => (n > m ? n : m), 0n);
  const floor = nextOnFile ? parseCheckNumber(nextOnFile) : (numbers[0] ?? 1n);
  const gaps: CheckNumberGap[] = [];
  let gapCount = 0;
  let runStart: bigint | null = null;
  for (let n = floor; n < max; n += 1n) {
    const free = !seen.has(n.toString()) && !held.has(n.toString());
    if (free) {
      gapCount += 1;
      if (gapCount > MAX_GAP_NUMBERS) {
        throw new CheckNumberPlanError(
          "GAP_TOO_LARGE",
          `These numbers skip more than ${MAX_GAP_NUMBERS} unused checks after #${floor.toString()}. Check the number typed; if a new check book starts there, save it as the starting number first.`
        );
      }
      if (runStart === null) runStart = n;
    } else if (runStart !== null) {
      gaps.push({ from: runStart.toString(), to: (n - 1n).toString(), count: Number(n - runStart) });
      runStart = null;
    }
  }
  if (runStart !== null) gaps.push({ from: runStart.toString(), to: (max - 1n).toString(), count: Number(max - runStart) });

  const nextAfter = max + 1n > floor ? max + 1n : floor;
  return { numbers: asText, gaps, gap_count: gapCount, in_batch_duplicates: [...inBatchDup], next_after: nextAfter.toString() };
}
