import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { withMutatedCopy } from "../_lib/selftest-safe-mutation.mjs";

function makeRealFixture(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-fixture-"));
  const file = path.join(dir, "fixture.txt");
  fs.writeFileSync(file, content, "utf8");
  return { dir, file };
}

test("withMutatedCopy never writes the real file", async () => {
  const { dir, file } = makeRealFixture("hello world\n");
  try {
    await withMutatedCopy(
      file,
      (source) => source.replace("hello", "goodbye"),
      async (tmpPath, mutatedContent) => {
        assert.equal(mutatedContent, "goodbye world\n");
        assert.equal(fs.readFileSync(tmpPath, "utf8"), "goodbye world\n");
      },
    );
    // The real file must be byte-identical to what it was before the call.
    assert.equal(fs.readFileSync(file, "utf8"), "hello world\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("withMutatedCopy's temp copy lives at a different path than the real file", async () => {
  const { dir, file } = makeRealFixture("x\n");
  try {
    await withMutatedCopy(file, (s) => s, (tmpPath) => {
      assert.notEqual(tmpPath, file);
      assert.ok(tmpPath.startsWith(os.tmpdir()), `temp path ${tmpPath} must live under ${os.tmpdir()}`);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("withMutatedCopy cleans up its temp dir after a normal run", async () => {
  const { dir, file } = makeRealFixture("x\n");
  let capturedTmpDir;
  try {
    await withMutatedCopy(file, (s) => s, (tmpPath) => {
      capturedTmpDir = path.dirname(tmpPath);
      assert.ok(fs.existsSync(capturedTmpDir), "temp dir must exist during the callback");
    });
    assert.ok(!fs.existsSync(capturedTmpDir), "temp dir must be removed after the call returns");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("withMutatedCopy cleans up its temp dir even when useFn throws", async () => {
  const { dir, file } = makeRealFixture("x\n");
  let capturedTmpDir;
  try {
    await assert.rejects(
      withMutatedCopy(file, (s) => s, (tmpPath) => {
        capturedTmpDir = path.dirname(tmpPath);
        throw new Error("planted failure");
      }),
      /planted failure/,
    );
    assert.ok(!fs.existsSync(capturedTmpDir), "temp dir must still be removed after a thrown error");
    // And, as always, the real file is untouched.
    assert.equal(fs.readFileSync(file, "utf8"), "x\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("withMutatedCopy cleans up its temp dir even when transformFn throws", async () => {
  const { dir, file } = makeRealFixture("x\n");
  await assert.rejects(
    withMutatedCopy(
      file,
      () => {
        throw new Error("transform blew up");
      },
      () => {
        throw new Error("useFn should never run — transformFn already threw");
      },
    ),
    /transform blew up/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
