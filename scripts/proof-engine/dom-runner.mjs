#!/usr/bin/env node
/**
 * PROOF ENGINE — DOM RUNNER  (kind:"dom")
 *
 * AUTH DECISION (b), explicit: postdeploy has no browser cookie. Authenticated
 * proofs (auth:"session") WITHOUT ctx.session derive UNVERIFIED — never PASS.
 * Unauthenticated proofs run against fixture HTML (selftest / plants) or a
 * fetch that must still pass the D1 anchor. Live PlannerGrid A-checks stay
 * UNVERIFIED until a scoped service session exists.
 *
 * D1  Anchor selector MUST exist first. Zero-count without an anchor is R1-b.
 * D2  Assert data-* / data-testid, never styling class names as the contract.
 * D4  Empty selector is FAIL unless expect_count:0 AND the anchor already passed.
 */
import { JSDOM } from "jsdom";

export function assertDomProofShape(proof) {
  const id = proof.name || proof.id || "dom";
  if (proof.kind !== "dom") throw new Error(`DOM PROOF REJECTED ${id}: kind must be "dom"`);
  if (!proof.anchor || typeof proof.anchor !== "string")
    throw new Error(`DOM PROOF REJECTED ${id}: anchor is mandatory (D1)`);
  if (/\.[a-zA-Z][\w-]*\b/.test(proof.anchor) && !proof.anchor.includes("[") && !proof.anchor.includes("#"))
    throw new Error(`DOM PROOF REJECTED ${id}: anchor must be a data-* / id / testid hook, not a class (D2)`);
  if (!Array.isArray(proof.expect) || proof.expect.length === 0)
    throw new Error(`DOM PROOF REJECTED ${id}: expect[] is mandatory`);
  if (!proof.html && !proof.url)
    throw new Error(`DOM PROOF REJECTED ${id}: supply html (fixture) or url`);
  const auth = proof.auth ?? "none";
  if (auth !== "none" && auth !== "session")
    throw new Error(`DOM PROOF REJECTED ${id}: auth must be "none" or "session"`);
  return true;
}

function done(ok, observed, err, extra = {}) {
  return { ok, observed, err: err || null, kind: "dom", unverified: false, ...extra };
}

function loadDom(html) {
  return new JSDOM(html, { pretendToBeVisual: true }).window;
}

function pxWidth(win, el) {
  const cs = win.getComputedStyle(el);
  const n = parseFloat(cs.width);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  const inline = String(el.getAttribute("style") || "").match(/width:\s*([\d.]+)px/i);
  if (inline) return Math.round(Number(inline[1]));
  return 0;
}

function gradeExpect(win, doc, spec) {
  const op = spec.op;
  if (op === "exists") {
    const el = doc.querySelector(spec.selector || spec.anchor);
    if (!el) return { ok: false, observed: "missing", err: `exists failed: ${spec.selector}` };
    return { ok: true, observed: "present" };
  }
  if (op === "unique_per_id") {
    const attr = spec.attr || "data-load-id";
    const nodes = [...doc.querySelectorAll(spec.selector || `[${attr}]`)];
    const counts = new Map();
    for (const n of nodes) {
      const id = n.getAttribute(attr);
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const chopped = [...counts.entries()].filter(([, c]) => c !== 1);
    if (chopped.length)
      return { ok: false, observed: chopped, err: `unique_per_id: duplicate ${attr}` };
    if (counts.size === 0)
      return { ok: false, observed: 0, err: "unique_per_id: no ids (empty is never PASS)" };
    return { ok: true, observed: counts.size };
  }
  if (op === "all_equal") {
    const nodes = [...doc.querySelectorAll(spec.selector)];
    if (nodes.length === 0)
      return { ok: false, observed: 0, err: "all_equal: no elements" };
    const widths = nodes.map((n) => pxWidth(win, n));
    const distinct = [...new Set(widths)];
    if (distinct.length !== 1)
      return { ok: false, observed: distinct, err: "all_equal: widths differ" };
    if (spec.value != null && distinct[0] !== Number(spec.value))
      return { ok: false, observed: distinct[0], err: `all_equal: expected ${spec.value}` };
    return { ok: true, observed: distinct[0] };
  }
  if (op === "style_contains") {
    const el = doc.querySelector(spec.selector);
    if (!el) return { ok: false, observed: "missing", err: "style_contains: selector missing" };
    const cs = win.getComputedStyle(el);
    const raw = `${cs.getPropertyValue(spec.prop || "background-image")} ${el.getAttribute("style") || ""}`;
    if (!raw.includes(spec.substring))
      return { ok: false, observed: raw.slice(0, 80), err: "style_contains: substring absent" };
    return { ok: true, observed: "matched" };
  }
  if (op === "count_zero") {
    const n = doc.querySelectorAll(spec.selector).length;
    if (n !== 0) return { ok: false, observed: n, err: "count_zero: matches exist" };
    return { ok: true, observed: 0 };
  }
  if (op === "text_nonempty") {
    const nodes = [...doc.querySelectorAll(spec.selector)];
    if (nodes.length === 0)
      return { ok: false, observed: 0, err: "text_nonempty: no elements" };
    const empty = nodes.filter((n) => !String(n.textContent || "").trim());
    if (empty.length)
      return { ok: false, observed: empty.length, err: "text_nonempty: blank label" };
    return { ok: true, observed: nodes.length };
  }
  return { ok: false, observed: op, err: `unknown op ${op}` };
}

export async function runDomProof(proof, ctx = {}) {
  try {
    assertDomProofShape(proof);
  } catch (e) {
    return done(false, null, String(e.message || e).slice(0, 200));
  }

  const auth = proof.auth ?? "none";
  if (auth === "session" && !ctx.session) {
    return {
      ok: false,
      unverified: true,
      observed: null,
      err: "auth:session with no ctx.session — UNVERIFIED, never PASS (D3 option b)",
      kind: "dom",
    };
  }

  let html = proof.html || "";
  if (!html && proof.url) {
    if (typeof ctx.fetch !== "function")
      return done(false, null, "url proof but ctx.fetch is not wired");
    const r = await ctx.fetch(proof.url, { method: "GET" });
    if (r.status === 404 || r.status === 0)
      html = "";
    else if (typeof r.text === "function") html = await r.text();
    else html = "";
  }

  const win = loadDom(html || "<html><body></body></html>");
  const doc = win.document;
  const anchor = doc.querySelector(proof.anchor);
  if (!anchor) {
    return done(false, "anchor missing", `page did not render — D1 anchor ${proof.anchor} absent (404/blank/login must not pass count_zero)`);
  }

  const observed = {};
  for (const spec of proof.expect) {
    const g = gradeExpect(win, doc, spec);
    observed[spec.op] = g.observed;
    if (!g.ok) return done(false, observed, g.err);
  }
  return done(true, observed, null);
}

export function makeDomRunner(baseCtx = {}) {
  return (proof) => runDomProof(proof, baseCtx);
}
