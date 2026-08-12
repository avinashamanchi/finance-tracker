import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../public/demo.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(script, context, { filename: 'public/demo.js' });
const { STAGES, nextStage, createController } = context.globalThis.FinovaDemo;

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
