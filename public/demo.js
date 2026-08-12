"use strict";

(function exposeFinovaDemo(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FinovaDemo = api;
})(typeof globalThis === "object" ? globalThis : null, function createFinovaDemoApi() {
  const STAGES = Object.freeze(["empty", "entered", "categorized", "budget"]);

  function nextStage(stage) {
    const index = STAGES.indexOf(stage);
    if (index < 0) throw new TypeError("Unknown ledger demo stage.");
    return STAGES[(index + 1) % STAGES.length];
  }

  function createController({
    onStage,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    duration = 2200,
    reducedMotion = false,
  }) {
    if (typeof onStage !== "function") throw new TypeError("A stage renderer is required.");
    let current = reducedMotion ? "budget" : "empty";
    let playing = false;
    let disposed = false;
    let timer = null;

    function cancelTimer() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    }

    function emit() { if (!disposed) onStage(current); }

    function schedule() {
      if (!playing || reducedMotion || disposed || timer !== null) return;
      timer = setTimer(() => {
        timer = null;
        if (!playing || disposed) return;
        current = nextStage(current);
        emit();
        schedule();
      }, duration);
    }

    function play() {
      if (disposed || reducedMotion) return;
      playing = true;
      schedule();
    }

    function pause() {
      playing = false;
      cancelTimer();
    }

    function select(stage) {
      if (!STAGES.includes(stage)) throw new TypeError("Unknown ledger demo stage.");
      cancelTimer();
      current = stage;
      emit();
      schedule();
    }

    function replay() {
      cancelTimer();
      current = reducedMotion ? "budget" : "empty";
      emit();
      schedule();
    }

    function dispose() {
      pause();
      disposed = true;
    }

    emit();
    return { play, pause, replay, select, dispose, stage: () => current };
  }

  return { STAGES, nextStage, createController };
});

(function bindFinovaLanding(root) {
  if (!root || !root.document || !root.FinovaDemo) return;

  function setup() {
    const document = root.document;
    const demo = document.querySelector(".ledger-demo");
    if (!demo) return;
    const status = demo.querySelector("[data-demo-status]");
    const toggle = demo.querySelector("[data-demo-toggle]");
    const replay = demo.querySelector("[data-demo-replay]");
    const stageButtons = Array.from(demo.querySelectorAll("[data-demo-select]"));
    const navToggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector("#site-nav");
    const reducedMotion = Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const stageMessages = {
      empty: "The ledger is ready for a record you choose to add.",
      entered: "Neighborhood Market was added as an unsorted manual entry.",
      categorized: "The transaction is now categorized as Groceries.",
      budget: "Budget updated. $413.60 remains.",
    };
    let playing = false;

    function render(stage) {
      demo.dataset.demoStage = stage;
      if (status) status.textContent = stageMessages[stage];
      for (const button of stageButtons) button.setAttribute("aria-pressed", String(button.dataset.demoSelect === stage));
    }

    const controller = root.FinovaDemo.createController({ onStage: render, reducedMotion });

    function setPlaying(next) {
      playing = Boolean(next) && !reducedMotion;
      if (playing) controller.play(); else controller.pause();
      if (toggle) toggle.textContent = playing ? "Pause demo" : "Play demo";
    }

    toggle?.addEventListener("click", () => setPlaying(!playing));
    replay?.addEventListener("click", () => {
      controller.replay();
      setPlaying(!reducedMotion);
    });
    for (const button of stageButtons) {
      button.addEventListener("click", () => {
        setPlaying(false);
        controller.select(button.dataset.demoSelect);
      });
    }

    if ("IntersectionObserver" in root && !reducedMotion) {
      const observer = new root.IntersectionObserver((entries) => {
        setPlaying(Boolean(entries[0]?.isIntersecting));
      }, { threshold: 0.35 });
      observer.observe(demo);
      root.addEventListener("pagehide", () => observer.disconnect(), { once: true });
    } else {
      setPlaying(!reducedMotion);
    }

    navToggle?.addEventListener("click", () => {
      const open = navToggle.getAttribute("aria-expanded") !== "true";
      navToggle.setAttribute("aria-expanded", String(open));
      nav?.setAttribute("data-open", String(open));
    });
    nav?.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        navToggle?.setAttribute("aria-expanded", "false");
        nav.setAttribute("data-open", "false");
      }
    });
    root.addEventListener("pagehide", () => controller.dispose(), { once: true });
  }

  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
})(typeof globalThis === "object" ? globalThis : null);
