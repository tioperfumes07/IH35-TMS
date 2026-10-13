#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const files = ['apps/backend/src/lib/sentry.ts', 'apps/frontend/src/observability/sentry-client.ts'];
const sources = files.map(file => readFileSync(new URL(file, root), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const privacy = {
  userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
  urlQueryParams: false, graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false }, databaseQueryData: false,
  queues: false, stackFrameVariables: false,
};

function literal(node) {
  if (!node) return undefined;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
    if (!ts.isPropertyAssignment(p)) return ['unsupported', undefined];
    return [p.name.getText().replaceAll('"', '').replaceAll("'", ''), literal(p.initializer)];
  }));
  return undefined;
}

function options(source) {
  const tree = ts.createSourceFile('sentry.ts', source, ts.ScriptTarget.Latest, true);
  const found = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'Sentry.init') found.push(literal(node.arguments[0]));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(found.length, 1, 'one Sentry initializer per client');
  return found[0];
}

function verify(texts, manifest) {
  const versions = ['node', 'profiling-node', 'react'].map(name => manifest.dependencies[`@sentry/${name}`]);
  assert.ok(versions.every(v => v === versions[0] && v.startsWith('^11.')), 'Sentry SDKs must share v11');
  const [backend, frontend] = texts.map(options);
  for (const config of [backend, frontend]) {
    assert.deepEqual(config.dataCollection, privacy, 'automatic sensitive-data collection must remain disabled');
    assert.equal(config.traceLifecycle, 'static');
    assert.equal(config.tracesSampleRate, 0.1);
  }
  assert.equal(backend.profileSessionSampleRate, 0.1);
  assert.equal(backend.profileLifecycle, 'trace');
  assert.ok(!Object.hasOwn(backend, 'profilesSampleRate'), 'removed profiling API');
}

verify(sources, pkg);
if (process.argv.includes('--selftest')) {
  let count = 0;
  for (let side = 0; side < sources.length; side++) {
    for (const key of Object.keys(privacy)) {
      const mutated = [...sources];
      mutated[side] = mutated[side].replace(`${key}:`, `removed_${key}:`);
      assert.notEqual(mutated[side], sources[side], `mutation must alter ${key}`);
      assert.throws(() => verify(mutated, pkg), `missing ${key} must fail`);
      count++;
    }
  }
  assert.throws(() => verify([sources[0].replace('profileSessionSampleRate', 'profilesSampleRate'), sources[1]], pkg));
  assert.throws(() => verify(sources, { ...pkg, dependencies: { ...pkg.dependencies, '@sentry/node': '^10.75.0' } }));
  console.log(`verify-sentry-sdk-contract SELFTEST PASS ${count + 2}/${count + 2}`);
} else console.log('verify-sentry-sdk-contract PASS: SDK alignment, profiling and both-client privacy');
