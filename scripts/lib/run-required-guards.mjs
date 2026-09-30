import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function formatLocalOutcomes(label, outcomes, deferredCount, exitCode) {
  return `${label}: LOCAL PHASE OUTCOMES passed=${outcomes.passed} failed=${outcomes.failed} skipped=${outcomes.skipped + deferredCount} gate_exit=${exitCode}; local skips are NOT live passes; required CI must execute them`;
}

// Existing guards report named skips in text. Required CI must not accept an
// exit-zero skip as proof. Also recognize batch summaries with nonzero skips.
export function reportedSkip(output) {
  const text = String(output).replace(/\x1b\[[0-9;]*m/g, '');
  return text.split('\n').some(line =>
    /^\s*(?:\[[^\]]+\]\s*)?(?:[\w./-]+:\s*)?(?:SKIP(?:PED)?(?:[\s:—-]|$)|DEFERRED\b|EMPTY BY PURGE\b|STATIC ONLY\b|NO STATIC ASSERTION\b)/i.test(line) ||
    /\b[1-9]\d*\s+(?:(?:live\s+)?checks?(?:\(s\))?\s+)?skipped\b/i.test(line) ||
    /\bskipped["']?\s*[:=]\s*[1-9]\d*\b/i.test(line));
}

// Run every check for a complete report; any failed, killed, or unstarted check
// makes the batch fail. This is not an exemption or a best-effort runner.
export function runRequiredGuards(files, spawn = spawnSync) {
  if (!files.length || new Set(files).size !== files.length) {
    throw new Error('Required guard list must be nonempty and unique');
  }
  const failures = [];
  const summary = { attempted: files.length, executed: 0, passed: 0, failed: 0, skipped: 0 };
  for (const file of files) {
    try {
      const result = spawn(process.execPath, [file], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      if (output) process.stdout.write(output);
      if (!result.error) summary.executed++;
      if (result.error || result.signal || result.status !== 0) {
        summary.failed++;
        failures.push({ file, status: result.status, signal: result.signal, error: result.error?.message });
      } else if (reportedSkip(output)) {
        summary.skipped++;
        failures.push({ file, status: 0, error: 'REQUIRED CI SKIP IS A FAILURE — no execution proof' });
      } else {
        summary.passed++;
      }
    } catch (error) {
      summary.failed++;
      failures.push({ file, error: error.message });
    }
  }
  Object.defineProperty(failures, 'summary', { value: summary });
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  const failures = runRequiredGuards(files);
  for (const failure of failures) console.error(JSON.stringify(failure));
  const { attempted, executed, passed, failed, skipped } = failures.summary;
  console.log(`Required guards: executed=${executed} passed=${passed} failed=${failed} skipped=${skipped} attempted=${attempted}; required_skip_failures=${skipped}`);
  process.exitCode = failures.length ? 1 : 0;
}
