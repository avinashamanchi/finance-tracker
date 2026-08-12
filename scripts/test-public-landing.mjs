import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

await import(new URL('../public/demo.js', import.meta.url));
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const favicon = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const pagesWorkflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const iosWorkflow = readFileSync(new URL('../.github/workflows/ios-ci.yml', import.meta.url), 'utf8');
const { STAGES, nextStage, createController } = globalThis.FinovaDemo;

function manualClock() {
  let queued = [];
  return {
    setTimer(callback) { queued.push(callback); return callback; },
    clearTimer(callback) { queued = queued.filter((item) => item !== callback); },
    runNext() { const callback = queued.shift(); if (callback) callback(); },
    pending() { return queued.length; },
  };
}

test('the fixed ledger story advances and wraps without finance input', () => {
  assert.deepEqual(Array.from(STAGES), ['empty', 'entered', 'categorized', 'budget']);
  assert.equal(nextStage('empty'), 'entered');
  assert.equal(nextStage('entered'), 'categorized');
  assert.equal(nextStage('categorized'), 'budget');
  assert.equal(nextStage('budget'), 'empty');
});

test('pause, selection, and replay control rendered ledger stages', () => {
  const clock = manualClock();
  const rendered = [];
  const controller = createController({
    onStage: (stage) => rendered.push(stage),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    duration: 1,
    reducedMotion: false,
  });

  controller.play();
  clock.runNext();
  assert.equal(controller.stage(), 'entered');
  controller.pause();
  assert.equal(clock.pending(), 0);
  controller.select('categorized');
  assert.equal(controller.stage(), 'categorized');
  controller.replay();
  assert.equal(controller.stage(), 'empty');
  assert.deepEqual(rendered.slice(-2), ['categorized', 'empty']);
});

test('reduced motion starts complete and never schedules autoplay', () => {
  const clock = manualClock();
  const rendered = [];
  const controller = createController({
    onStage: (stage) => rendered.push(stage),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    reducedMotion: true,
  });

  controller.play();
  assert.equal(controller.stage(), 'budget');
  assert.deepEqual(rendered, ['budget']);
  assert.equal(clock.pending(), 0);
});

test('dispose removes queued work before it can render', () => {
  const clock = manualClock();
  const rendered = [];
  const controller = createController({
    onStage: (stage) => rendered.push(stage),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    reducedMotion: false,
  });

  controller.play();
  controller.dispose();
  clock.runNext();
  assert.deepEqual(rendered, ['empty']);
});

test('the public entry exposes the live ledger and every primary destination', () => {
  assert.match(html, /rel="icon" href="favicon\.svg"/);
  assert.match(favicon, /<svg/);
  assert.match(html, /aria-label="Finova ledger demo"/);
  assert.match(html, /id="demo"/);
  assert.match(html, /id="how-it-works"/);
  assert.match(html, /id="privacy"/);
  assert.match(html, /href="privacy\.html"/);
  assert.match(html, /href="terms\.html"/);
  assert.match(html, /href="support\.html"/);
  assert.match(html, /data-demo-stage="budget"/);
  assert.match(html, />Pause demo</);
  assert.match(html, />Replay</);
  for (const label of ['Start', 'Add transaction', 'Categorize', 'Update budget']) {
    assert.match(html, new RegExp(`>${label}<`));
  }
});

test('the landing remains a local static explanation rather than a finance intake', () => {
  const script = readFileSync(new URL('../public/demo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<form|type="(?:text|number|file)"|connect (?:a |your )?bank|download on the app store/i);
  assert.doesNotMatch(script, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i);
  assert.match(html, /App Store release in preparation/);
  assert.match(html, /not financial, tax, legal, credit, or investment advice/i);
});

test('both publication paths execute the landing contract', () => {
  assert.match(pagesWorkflow, /node scripts\/test-public-landing\.mjs/);
  assert.match(iosWorkflow, /node scripts\/test-public-landing\.mjs/);
});
