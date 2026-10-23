(function (scope) {
  'use strict';

  // A single timer owns the slide deadline. Independent pause reasons compose
  // without losing elapsed time or restarting an explicitly paused slideshow.
  class CarouselScheduler {
    constructor(options = {}) {
      this.total = Math.max(1, Math.floor(options.total || 3));
      this.duration = Math.max(1, options.duration || 6000);
      this.index = 0;
      this.now = options.now || (() => performance.now());
      this.setTimer = options.setTimeout || ((callback, delay) => setTimeout(callback, delay));
      this.clearTimer = options.clearTimeout || (id => clearTimeout(id));
      this.onChange = options.onChange || (() => {});
      this.onState = options.onState || (() => {});
      this.reasons = new Set(options.pauseReasons || []);
      this.userPaused = Boolean(options.userPaused);
      this.reducedMotion = Boolean(options.reducedMotion);
      this.motionBlocked = this.reducedMotion;
      this.remainingMs = this.duration;
      this.startedAt = null;
      this.timer = null;
      this.destroyed = false;
      this._arm();
      this._emit();
    }

    get running() {
      return !this.destroyed && this.total > 1 && !this.userPaused && !this.motionBlocked && this.reasons.size === 0;
    }

    get remaining() {
      return this.timer === null ? this.remainingMs : Math.max(0, this.remainingMs - Math.max(0, this.now() - this.startedAt));
    }

    snapshot() {
      const remaining = this.remaining;
      return {
        index: this.index,
        total: this.total,
        duration: this.duration,
        remaining,
        progress: Math.max(0, Math.min(1, 1 - remaining / this.duration)),
        running: this.running,
        userPaused: this.userPaused,
        reducedMotion: this.reducedMotion,
        motionBlocked: this.motionBlocked,
        playbackRequested: !this.userPaused && !this.motionBlocked && !this.destroyed,
        pauseReasons: [...this.reasons],
        destroyed: this.destroyed
      };
    }

    _freeze() {
      if (this.timer === null) return;
      this.remainingMs = this.remaining;
      this.clearTimer(this.timer);
      this.timer = null;
      this.startedAt = null;
    }

    _arm() {
      if (!this.running || this.timer !== null) return;
      this.startedAt = this.now();
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.startedAt = null;
        if (this.destroyed) return;
        this.index = (this.index + 1) % this.total;
        this.remainingMs = this.duration;
        this._arm();
        this.onChange(this.index, this.snapshot());
        this._emit();
      }, Math.max(1, this.remainingMs));
    }

    _emit() { this.onState(this.snapshot()); }

    setPause(reason, paused) {
      if (this.destroyed || this.reasons.has(reason) === Boolean(paused)) return;
      this._freeze();
      if (paused) this.reasons.add(reason);
      else this.reasons.delete(reason);
      this._arm();
      this._emit();
    }

    pause() {
      if (this.destroyed || this.userPaused) return;
      this._freeze();
      this.userPaused = true;
      this._emit();
    }

    play() {
      if (this.destroyed) return;
      this._freeze();
      this.userPaused = false;
      // Explicit Play is an informed opt-in even with reduced motion enabled.
      this.motionBlocked = false;
      this._arm();
      this._emit();
    }

    toggle() {
      if (this.userPaused || this.motionBlocked) this.play();
      else this.pause();
    }

    setReducedMotion(reduced) {
      if (this.destroyed || this.reducedMotion === Boolean(reduced)) return;
      this._freeze();
      this.reducedMotion = Boolean(reduced);
      this.motionBlocked = this.reducedMotion;
      this._arm();
      this._emit();
    }

    select(index) {
      if (this.destroyed || !Number.isFinite(Number(index))) return;
      this._freeze();
      this.index = ((Math.trunc(Number(index)) % this.total) + this.total) % this.total;
      this.remainingMs = this.duration;
      this._arm();
      this.onChange(this.index, this.snapshot());
      this._emit();
    }

    next() { this.select(this.index + 1); }
    previous() { this.select(this.index - 1); }

    destroy() {
      if (this.destroyed) return;
      this._freeze();
      this.destroyed = true;
      this._emit();
    }
  }

  if (typeof module === 'object' && module.exports) module.exports = { CarouselScheduler };
  if (typeof document === 'undefined') return;

  const region = document.getElementById('showcase');
  if (!region) return;
  const $ = selector => region.querySelector(selector);
  const $$ = selector => [...region.querySelectorAll(selector)];
  const image = $('#showcase-image') || $('.showcase-image');
  const playback = $('#showcase-pause');
  const progress = $('#showcase-progress');
  const content = $('#showcase-content') || $('#showcase-model')?.parentElement || region;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hover = window.matchMedia('(hover: hover)');
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const slides = [
    { id: 2, description: 'Presença que transforma qualquer caminho.', brand: 'AUDI', model: 'Q5 Sportback', version: '2.0 55 TFSIe PHEV Performance Quattro', year: '2023/2023', km: '30.000 km', price: 269900 },
    { id: 3, description: 'Personalidade para seguir seu próprio caminho.', brand: 'JEEP', model: 'Renegade', version: '1.8 16V Flex · Automático', year: '2016/2016', km: '135.000 km', price: 66900 },
    { id: 0, description: 'Um novo capítulo começa ao volante.', brand: 'HYUNDAI', model: 'HB20', version: '1.0 12V Flex Comfort · Manual', year: '2024/2025', km: '47.000 km', price: 74900 }
  ];
  const abort = new AbortController();
  const listen = (target, type, callback, options = {}) => target?.addEventListener(type, callback, { ...options, signal: abort.signal });
  let scheduler;
  let frame = null;
  let transitionTimer = null;
  let intersectionObserver = null;
  let disposed = false;

  function setText(id, text) {
    const element = $(id);
    if (element) element.textContent = text;
  }

  function renderSlide(index, immediate = false) {
    const slide = slides[index];
    if (!slide) return;
    clearTimeout(transitionTimer);
    $$('[data-showcase-slide]').forEach(button => {
      const active = Number(button.dataset.showcaseSlide) === index;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const update = () => {
      if (disposed) return;
      if (image) {
        image.src = `assets/car-${slide.id}.jpg`;
        image.alt = `${slide.brand} ${slide.model} do estoque Paulino Automóveis`;
      }
      setText('#showcase-brand', slide.brand);
      setText('#showcase-model', slide.model);
      setText('#showcase-description', slide.description);
      setText('#showcase-version', slide.version);
      setText('#showcase-year', slide.year);
      setText('#showcase-km', slide.km);
      setText('#showcase-price', money.format(slide.price));
      setText('#showcase-current', String(index + 1).padStart(2, '0'));
      setText('#showcase-total', String(slides.length).padStart(2, '0'));
      $$('[data-showcase-vehicle]').forEach(button => { button.dataset.vehicle = String(slide.id); });
      region.classList.remove('is-transitioning');
    };
    if (immediate || reducedMotion.matches) update();
    else {
      region.classList.add('is-transitioning');
      transitionTimer = setTimeout(update, 180);
    }
  }

  function paintProgress(state) {
    const value = String(state.progress);
    region.style.setProperty('--progress', value);
    if (progress) {
      progress.style.setProperty('--progress', value);
      const bar = progress.querySelector('span, div');
      if (bar) bar.style.transform = `scaleX(${value})`;
    }
  }

  function progressFrame() {
    frame = null;
    if (disposed || !scheduler) return;
    const state = scheduler.snapshot();
    paintProgress(state);
    if (state.running) frame = requestAnimationFrame(progressFrame);
  }

  function renderState(state) {
    if (disposed) return;
    region.classList.toggle('is-playing', state.running);
    region.classList.toggle('is-paused', !state.playbackRequested);
    content.setAttribute('aria-live', state.running ? 'off' : 'polite');
    content.setAttribute('aria-atomic', 'true');
    if (playback) {
      playback.setAttribute('aria-pressed', String(!state.playbackRequested));
      playback.setAttribute('aria-label', state.playbackRequested ? 'Pausar apresentação automática' : 'Reproduzir apresentação automática');
    }
    setText('#playback-label', state.playbackRequested ? 'Pausar' : 'Reproduzir');
    const icon = $('#playback-icon');
    if (icon) {
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = state.playbackRequested
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
    }
    paintProgress(state);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = state.running ? requestAnimationFrame(progressFrame) : null;
  }

  const initialReasons = [];
  if (document.hidden) initialReasons.push('visibility');
  if ('IntersectionObserver' in window) initialReasons.push('offscreen');
  if (hover.matches && region.matches(':hover')) initialReasons.push('hover');
  const activeElement = document.activeElement;
  if (region.contains(activeElement) && !playback?.contains(activeElement)) initialReasons.push('focus');

  renderSlide(0, true);
  scheduler = new CarouselScheduler({
    total: slides.length,
    duration: 6000,
    reducedMotion: reducedMotion.matches,
    pauseReasons: initialReasons,
    onChange: index => renderSlide(index),
    onState: renderState
  });

  listen(playback, 'click', () => scheduler.toggle());
  listen($('#showcase-next'), 'click', () => scheduler.next());
  listen($('#showcase-prev'), 'click', () => scheduler.previous());
  $$('[data-showcase-slide]').forEach(button => listen(button, 'click', () => scheduler.select(Number(button.dataset.showcaseSlide))));
  listen(region, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches('input, select, textarea, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (event.key === 'ArrowLeft') scheduler.previous();
      else scheduler.next();
    }
  });
  listen(region, 'pointerenter', event => {
    if (hover.matches && event.pointerType !== 'touch') scheduler.setPause('hover', true);
  });
  listen(region, 'pointerleave', () => scheduler.setPause('hover', false));
  listen(region, 'focusin', event => scheduler.setPause('focus', !playback?.contains(event.target)));
  listen(region, 'focusout', () => queueMicrotask(() => {
    const focused = document.activeElement;
    scheduler.setPause('focus', region.contains(focused) && !playback?.contains(focused));
  }));
  listen(document, 'visibilitychange', () => scheduler.setPause('visibility', document.hidden));
  listen(reducedMotion, 'change', event => scheduler.setReducedMotion(event.matches));
  listen(hover, 'change', event => {
    scheduler.setPause('hover', event.matches && region.matches(':hover'));
  });

  if ('IntersectionObserver' in window) {
    try {
      intersectionObserver = new IntersectionObserver(entries => {
        const entry = entries.find(item => item.target === region);
        if (entry) scheduler.setPause('offscreen', !entry.isIntersecting);
      }, { threshold: 0.12 });
      intersectionObserver.observe(region);
    } catch {
      scheduler.setPause('offscreen', false);
    }
  }

  // Warm only local images so the next vehicle can appear without a network wait.
  slides.forEach(slide => { const preload = new Image(); preload.src = `assets/car-${slide.id}.jpg`; });
  listen(window, 'pagehide', event => {
    if (event.persisted) {
      scheduler.setPause('page-cache', true);
      return;
    }
    disposed = true;
    scheduler.destroy();
    abort.abort();
    clearTimeout(transitionTimer);
    if (frame !== null) cancelAnimationFrame(frame);
    intersectionObserver?.disconnect();
  });
  listen(window, 'pageshow', () => scheduler.setPause('page-cache', false));
  scope.PaulinoCarouselScheduler = CarouselScheduler;
})(typeof window !== 'undefined' ? window : globalThis);
