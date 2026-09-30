import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Run every check for a complete report; any failed, killed, or unstarted check
// makes the batch fail. This is not an exemption or a best-effort runner.
export function runRequiredGuards(files, spawn = spawnSync) {
  if (!files.length || new Set(files).size !== files.length) {
    throw new Error('Required guard list must be nonempty and unique');
  }
  const failures = [];
  for (const file of files) {
    try {
      const result = spawn(process.execPath, [file], { stdio: 'inherit' });
      if (result.error || result.signal || result.status !== 0) {
        failures.push({ file, status: result.status, signal: result.signal, error: result.error?.message });
      }
    } catch (error) {
      failures.push({ file, error: error.message });
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  const failures = runRequiredGuards(files);
  for (const failure of failures) console.error(JSON.stringify(failure));
  console.log(`Required guards: executed=${files.length} passed=${files.length - failures.length} failed=${failures.length}`);
  process.exitCode = failures.length ? 1 : 0;
}
