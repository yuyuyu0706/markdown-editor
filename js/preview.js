(function (global) {
  'use strict';

  const DEFAULT_OPTIONS = {
    previewSelector: '#preview',
    toolbarSelector: '#toolbar',
    editorSelector: '#editor'
  };

  const INPUT_SCROLL_SUPPRESS_DURATION = 400;
  const PREVIEW_RENDER_SCROLL_SUPPRESS_DURATION = 400;
  const MANUAL_SCROLL_INTENT_DURATION = 1200;

  let previewEl = null;
  let toolbarEl = null;
  let editorEl = null;
  let initialized = false;

  let imageMap = Object.create(null);
  let previewTaskCheckboxMappings = [];

  let isSyncingEditorScroll = false;
  let isSyncingPreviewScroll = false;
  let editorScrollSuppressUntil = 0;
  let previewScrollSuppressUntil = 0;
  let editorManualScrollIntentUntil = 0;
  let isEditorScrollbarDragActive = false;
  let isPreviewManuallyPositioned = false;

  let reducedMotionQuery = null;
  let prefersReducedMotion = false;

  let markedConfigured = false;

  const lastScrollInfo = { top: 0, height: 0 };

  if (typeof global.__lastPreviewScrollTarget === 'undefined') {
    global.__lastPreviewScrollTarget = null;
  }

  function ensureImageMap() {
    const existing = global.__previewImageMap;
    if (existing && typeof existing === 'object') {
      imageMap = existing;
    } else {
      imageMap = Object.create(null);
      global.__previewImageMap = imageMap;
    }
  }

  function configureMarkedRenderer() {
    if (!global.marked || markedConfigured) {
      return;
    }
    function escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    global.marked.use({
      renderer: {
        code(code, infostring) {
          const lang = (infostring || '').trim().toLowerCase();
          if (lang === 'mermaid') {
            return `<div class="mermaid">${escapeHtml(code)}</div>`;
          }
          return false;
        }
      }
    });
    markedConfigured = true;
  }

  function setupMermaid() {
    if (!global.mermaid) {
      return;
    }
    try {
      global.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        flowchart: { htmlLabels: true }
      });
    } catch (error) {
      console.error('[Preview] Failed to initialise mermaid.', error);
    }
  }

  function setupReducedMotionListener() {
    if (!global.matchMedia) {
      return;
    }
    reducedMotionQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = !!(reducedMotionQuery && reducedMotionQuery.matches);
    const handler = event => {
      prefersReducedMotion = !!(event && event.matches);
    };
    if (!reducedMotionQuery) {
      return;
    }
    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', handler);
    } else if (typeof reducedMotionQuery.addListener === 'function') {
      reducedMotionQuery.addListener(handler);
    }
  }

  function shouldReduceMotion() {
    return prefersReducedMotion;
  }

  function extendEditorScrollSuppression(duration = INPUT_SCROLL_SUPPRESS_DURATION) {
    const targetTime = performance.now() + duration;
    if (targetTime > editorScrollSuppressUntil) {
      editorScrollSuppressUntil = targetTime;
    }
    if (!isEditorScrollbarDragActive) {
      editorManualScrollIntentUntil = 0;
    }
  }

  function registerEditorScrollIntent(duration = MANUAL_SCROLL_INTENT_DURATION) {
    if (duration === Infinity) {
      editorManualScrollIntentUntil = Infinity;
      return;
    }
    if (editorManualScrollIntentUntil === Infinity) {
      return;
    }
    const targetTime = performance.now() + duration;
    if (targetTime > editorManualScrollIntentUntil) {
      editorManualScrollIntentUntil = targetTime;
    }
  }

  function registerPreviewManualInteraction() {
    previewScrollSuppressUntil = 0;
    isPreviewManuallyPositioned = true;
  }

  function registerEditorManualInteraction() {
    registerEditorScrollIntent();
    editorScrollSuppressUntil = 0;
    previewScrollSuppressUntil = 0;
    isPreviewManuallyPositioned = false;
  }

  function getHeaderOffset() {
    return toolbarEl ? toolbarEl.offsetHeight : 0;
  }

  function getPreviewPaddingTop() {
    if (!previewEl) {
      return 0;
    }
    const padding = parseFloat(global.getComputedStyle(previewEl).paddingTop || '0');
    return Number.isFinite(padding) ? padding : 0;
  }

  /**
   * Compute the scroll target for a heading element within the preview.
   * @param {HTMLElement} headingEl
   * @returns {{ top: number, id: string, headerHeight: number, paddingTop: number }}
   */
  function computeScrollTarget(headingEl) {
    const previewRect = previewEl.getBoundingClientRect();
    const elementRect = headingEl.getBoundingClientRect();
    const paddingTop = getPreviewPaddingTop();
    const headerHeight = getHeaderOffset();
    const relativeTop = elementRect.top - previewRect.top + previewEl.scrollTop;
    const maxScroll = Math.max(previewEl.scrollHeight - previewEl.clientHeight, 0);
    const top = Math.min(Math.max(relativeTop - headerHeight - paddingTop, 0), maxScroll);
    return {
      top,
      id: headingEl.id || '',
      headerHeight,
      paddingTop
    };
  }

  function clampPreviewScrollTop(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const maxScrollTop = Math.max(0, previewEl.scrollHeight - previewEl.clientHeight);
    if (maxScrollTop <= 0) {
      return 0;
    }
    if (value <= 0) {
      return 0;
    }
    return Math.min(value, maxScrollTop);
  }

  function restorePreviewScrollPosition(targetScrollTop) {
    const clamped = clampPreviewScrollTop(targetScrollTop);
    const prevSuppressUntil = previewScrollSuppressUntil;
    previewScrollSuppressUntil = Math.max(prevSuppressUntil, performance.now() + 50);
    isSyncingPreviewScroll = true;
    previewEl.scrollTop = clamped;
    isSyncingPreviewScroll = false;
    updateScrollInfo();
  }

  function syncScroll(source, target) {
    const sourceMax = source.scrollHeight - source.clientHeight;
    const targetMax = target.scrollHeight - target.clientHeight;
    if (sourceMax <= 0 || targetMax <= 0) {
      return;
    }
    const ratio = source.scrollTop / sourceMax;
    target.scrollTop = ratio * targetMax;
  }

  function updateScrollInfo() {
    lastScrollInfo.top = previewEl.scrollTop;
    lastScrollInfo.height = previewEl.scrollHeight;
  }

  /**
   * Emit preview scroll notifications via DOM event and Bus.
   * @param {{ id: string, top: number, headerHeight: number, paddingTop: number }} detail
   */
  function dispatchPreviewScrolled(detail) {
    global.__lastPreviewScrollTarget = detail;
    updateScrollInfo();
    if (global.Bus && typeof global.Bus.emit === 'function') {
      global.Bus.emit('preview:scrolled', detail);
    }
    previewEl.dispatchEvent(new CustomEvent('preview:scrolled', { detail }));
  }

  function expandImagePlaceholders(raw) {
    if (!raw) {
      return '';
    }
    return raw.replace(/<!-- image:(.*?) -->[\s\S]*?<!-- \/image -->/g, (match, filename) => {
      const trimmedFilename = typeof filename === 'string' ? filename.trim() : '';
      if (!trimmedFilename) {
        return match;
      }
      const matchBase64 = imageMap[trimmedFilename];
      if (typeof matchBase64 === 'string' && matchBase64) {
        return `![${trimmedFilename}](${matchBase64})`;
      }
      if (global.i18n && typeof global.i18n.t === 'function') {
        return global.i18n.t('image.fallback', { filename: trimmedFilename });
      }
      return match;
    });
  }

  function convertMermaidBlocks() {
    const blocks = previewEl.querySelectorAll('pre code.language-mermaid');
    blocks.forEach(block => {
      const pre = block.parentElement;
      if (!pre) {
        return;
      }
      const div = global.document.createElement('div');
      div.className = 'mermaid';
      div.textContent = block.textContent || '';
      pre.replaceWith(div);
    });

    if (!global.mermaid) {
      return;
    }
    try {
      const nodes = previewEl.querySelectorAll('.mermaid');
      if (typeof global.mermaid.run === 'function') {
        global.mermaid.run({ nodes });
      } else if (typeof global.mermaid.init === 'function') {
        global.mermaid.init(undefined, nodes);
      }
    } catch (error) {
      console.error('[Preview] Mermaid render failed.', error);
    }
  }

  function updatePreviewTaskCheckboxes(raw) {
    previewTaskCheckboxMappings = [];
    const lines = raw.split('\n');
    let index = 0;
    let inCode = false;
    const taskPattern = /^(\s*)(?:[*+-]|\d+[.)])\s+\[( |x|X)\]/;

    for (const line of lines) {
      const fence = line.match(/^```/);
      if (fence) {
        inCode = !inCode;
        index += line.length + 1;
        continue;
      }
      if (!inCode && taskPattern.test(line)) {
        const bracketIndex = line.indexOf('[');
        if (bracketIndex !== -1) {
          previewTaskCheckboxMappings.push({ index: index + bracketIndex + 1 });
        }
      }
      index += line.length + 1;
    }

    const checkboxes = previewEl.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox, idx) => {
      const mapping = previewTaskCheckboxMappings[idx];
      if (!mapping) {
        checkbox.disabled = true;
        delete checkbox.dataset.taskIndex;
        return;
      }
      checkbox.disabled = false;
      checkbox.dataset.taskIndex = String(idx);
      checkbox.checked = raw.charAt(mapping.index).toLowerCase() === 'x';
    });
  }

  function handlePreviewCheckboxChange(event) {
    const target = event.target;
    if (!(target instanceof global.HTMLInputElement) || target.type !== 'checkbox') {
      return;
    }
    const { taskIndex } = target.dataset;
    if (taskIndex === undefined) {
      return;
    }
    const mappingIndex = Number(taskIndex);
    if (!Number.isInteger(mappingIndex) || mappingIndex < 0) {
      return;
    }
    const mapping = previewTaskCheckboxMappings[mappingIndex];
    if (!mapping) {
      return;
    }
    const newChar = target.checked ? 'x' : ' ';
    const currentValue = global.AppState && typeof global.AppState.getText === 'function'
      ? global.AppState.getText()
      : editorEl.value;
    if (currentValue.charAt(mapping.index).toLowerCase() === newChar) {
      return;
    }
    const prevSelectionStart = editorEl.selectionStart;
    const prevSelectionEnd = editorEl.selectionEnd;
    const prevScrollTop = editorEl.scrollTop;

    const nextValue =
      currentValue.slice(0, mapping.index) + newChar + currentValue.slice(mapping.index + 1);

    editorEl.value = nextValue;
    editorEl.scrollTop = prevScrollTop;
    editorEl.selectionStart = prevSelectionStart;
    editorEl.selectionEnd = prevSelectionEnd;

    extendEditorScrollSuppression();
    if (global.AppState && typeof global.AppState.setText === 'function') {
      global.AppState.setText(nextValue, 'state');
    }
  }

  function preparePreviewLinks() {
    const anchors = previewEl.querySelectorAll('a[href]');
    anchors.forEach(anchor => {
      const href = anchor.getAttribute('href') || '';
      if (!href) {
        return;
      }
      if (href.startsWith('#')) {
        anchor.dataset.previewAnchor = href.slice(1);
        return;
      }
      if (href.startsWith('http://') || href.startsWith('https://')) {
        if (!anchor.hasAttribute('target')) {
          anchor.setAttribute('target', '_blank');
        }
        if (!anchor.hasAttribute('rel')) {
          anchor.setAttribute('rel', 'noopener');
        }
      }
    });
  }

  function handlePreviewClick(event) {
    const anchor = event.target instanceof global.Element
      ? event.target.closest('a[data-preview-anchor]')
      : null;
    if (!anchor) {
      return;
    }
    const slug = anchor.dataset.previewAnchor;
    if (!slug) {
      return;
    }
    event.preventDefault();
    scrollToHeading(slug);
  }

  function handlePreviewScroll() {
    if (isSyncingPreviewScroll) {
      isSyncingPreviewScroll = false;
      return;
    }
    if (performance.now() < previewScrollSuppressUntil) {
      updateScrollInfo();
      return;
    }
    isSyncingEditorScroll = true;
    syncScroll(previewEl, editorEl);
    updateScrollInfo();
  }

  function handleEditorScroll() {
    const now = performance.now();
    if (isSyncingEditorScroll) {
      isSyncingEditorScroll = false;
      return;
    }
    const hasManualIntent =
      editorManualScrollIntentUntil === Infinity || now < editorManualScrollIntentUntil;
    if (!hasManualIntent) {
      return;
    }
    if (now < editorScrollSuppressUntil || now < previewScrollSuppressUntil) {
      return;
    }
    if (isPreviewManuallyPositioned) {
      return;
    }
    isSyncingPreviewScroll = true;
    syncScroll(editorEl, previewEl);
    isSyncingEditorScroll = false;
    updateScrollInfo();
  }

  function handleEditorTextInput() {
    extendEditorScrollSuppression();
  }

  function handleEditorPointerDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) {
      return;
    }
    const rect = editorEl.getBoundingClientRect();
    if (event.clientX >= rect.right - 20) {
      isEditorScrollbarDragActive = true;
      registerEditorScrollIntent(Infinity);
      registerEditorManualInteraction();
    }
  }

  function handleEditorBlur() {
    if (!isEditorScrollbarDragActive && editorManualScrollIntentUntil !== Infinity) {
      editorManualScrollIntentUntil = 0;
    }
  }

  function handleDocumentPointerUp(event) {
    if (event.pointerType !== 'mouse' || !isEditorScrollbarDragActive) {
      return;
    }
    isEditorScrollbarDragActive = false;
    if (editorManualScrollIntentUntil === Infinity) {
      editorManualScrollIntentUntil = performance.now() + MANUAL_SCROLL_INTENT_DURATION;
    }
  }

  function handleDocumentPointerCancel(event) {
    if (event.pointerType !== 'mouse' || !isEditorScrollbarDragActive) {
      return;
    }
    isEditorScrollbarDragActive = false;
    if (editorManualScrollIntentUntil === Infinity) {
      editorManualScrollIntentUntil = 0;
    }
  }

  function handlePreviewPointerDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) {
      return;
    }
    const rect = previewEl.getBoundingClientRect();
    if (event.clientX >= rect.right - 20) {
      registerPreviewManualInteraction();
    }
  }

  function handleEditorKeydown(event) {
    if (
      event.key === 'PageDown' ||
      event.key === 'PageUp' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (event.metaKey || event.ctrlKey))
    ) {
      registerEditorManualInteraction();
      return;
    }
    handleEditorTextInput();
  }

  function attachPreviewEvents() {
    previewEl.addEventListener('wheel', registerPreviewManualInteraction, { passive: true });
    previewEl.addEventListener('touchmove', registerPreviewManualInteraction, {
      passive: true
    });
    previewEl.addEventListener('touchstart', registerPreviewManualInteraction, {
      passive: true
    });
    previewEl.addEventListener('pointerdown', handlePreviewPointerDown);
    previewEl.addEventListener('change', handlePreviewCheckboxChange);
    previewEl.addEventListener('scroll', handlePreviewScroll);
    previewEl.addEventListener('click', handlePreviewClick);
  }

  function attachEditorEvents() {
    editorEl.addEventListener('beforeinput', handleEditorTextInput);
    editorEl.addEventListener('input', handleEditorTextInput);
    editorEl.addEventListener('compositionstart', handleEditorTextInput);
    editorEl.addEventListener('compositionupdate', handleEditorTextInput);
    editorEl.addEventListener('compositionend', handleEditorTextInput);
    editorEl.addEventListener('wheel', registerEditorManualInteraction, { passive: true });
    editorEl.addEventListener('touchmove', registerEditorManualInteraction, {
      passive: true
    });
    editorEl.addEventListener('touchstart', registerEditorManualInteraction, {
      passive: true
    });
    editorEl.addEventListener('pointerdown', handleEditorPointerDown);
    editorEl.addEventListener('blur', handleEditorBlur);
    editorEl.addEventListener('scroll', handleEditorScroll);
    editorEl.addEventListener('keydown', handleEditorKeydown);
    global.document.addEventListener('pointerup', handleDocumentPointerUp);
    global.document.addEventListener('pointercancel', handleDocumentPointerCancel);
  }

  function attachBusListeners() {
    if (!global.Bus || typeof global.Bus.on !== 'function') {
      return;
    }
    global.Bus.on('preview:image', payload => {
      if (!payload || typeof payload.filename !== 'string') {
        return;
      }
      const trimmed = payload.filename.trim();
      if (!trimmed) {
        return;
      }
      if (typeof payload.data === 'string' && payload.data) {
        imageMap[trimmed] = payload.data;
      }
    });
    global.Bus.on('preview:manual-reset', () => {
      isPreviewManuallyPositioned = false;
    });
  }

  function getInitialText() {
    if (global.AppState && typeof global.AppState.getText === 'function') {
      const text = global.AppState.getText();
      if (typeof text === 'string') {
        return text;
      }
    }
    if (editorEl && typeof editorEl.value === 'string') {
      return editorEl.value;
    }
    return '';
  }

  /**
   * Render markdown content into the preview pane.
   * @param {string} markdown
   * @returns {void}
   */
  function render(markdown) {
    if (!previewEl) {
      return;
    }
    const raw = typeof markdown === 'string' ? markdown : '';
    const renderStart = performance.now();
    const previousScrollTop = previewEl.scrollTop;

    const expanded = expandImagePlaceholders(raw);
    previewEl.innerHTML = global.marked
      ? global.marked.parse(expanded, { breaks: true, mangle: false })
      : expanded;
    preparePreviewLinks();
    updatePreviewTaskCheckboxes(raw);
    convertMermaidBlocks();

    const renderEnd = performance.now();
    const renderDuration = renderEnd - renderStart;
    previewScrollSuppressUntil =
      renderEnd + Math.max(PREVIEW_RENDER_SCROLL_SUPPRESS_DURATION, renderDuration);

    const restore = () => restorePreviewScrollPosition(previousScrollTop);
    restore();
    global.requestAnimationFrame(restore);
    global.requestAnimationFrame(() => global.requestAnimationFrame(restore));

    extendEditorScrollSuppression(renderDuration + INPUT_SCROLL_SUPPRESS_DURATION);
  }

  /**
   * Scroll the preview to the heading associated with the provided slug.
   * @param {string} slug
   * @returns {void}
   */
  function scrollToHeading(slug) {
    if (!previewEl || !slug) {
      return;
    }
    let selector = '#' + slug;
    if (global.CSS && typeof global.CSS.escape === 'function') {
      selector = '#' + global.CSS.escape(slug);
    }
    const target = previewEl.querySelector(selector);
    if (!target) {
      return;
    }
    const { top, headerHeight, paddingTop } = computeScrollTarget(target);
    const difference = Math.abs(previewEl.scrollTop - top);
    const behavior = shouldReduceMotion() ? 'auto' : 'smooth';
    const detail = { id: slug, top, headerHeight, paddingTop };
    const notify = () => dispatchPreviewScrolled(detail);

    registerPreviewManualInteraction();

    if (difference <= 1) {
      global.requestAnimationFrame(notify);
    } else {
      previewEl.scrollTo({ top, behavior });
      if (behavior === 'auto') {
        global.requestAnimationFrame(notify);
      } else {
        const waitForSettle = () => {
          if (Math.abs(previewEl.scrollTop - top) <= 1) {
            notify();
          } else {
            global.requestAnimationFrame(waitForSettle);
          }
        };
        waitForSettle();
      }
    }
  }

  /**
   * Retrieve the current preview scroll position and content height.
   * @returns {{ top: number, height: number }}
   */
  function getCurrentScrollInfo() {
    return Object.assign({}, lastScrollInfo);
  }

  /**
   * Initialise the preview module by binding DOM references and listeners.
   * @param {{ previewSelector?: string, toolbarSelector?: string, editorSelector?: string }} [options]
   * @returns {void}
   */
  function init(options) {
    if (initialized) {
      return;
    }
    const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
    previewEl = global.document.querySelector(opts.previewSelector);
    toolbarEl = global.document.querySelector(opts.toolbarSelector);
    editorEl = global.document.querySelector(opts.editorSelector);

    if (!previewEl) {
      throw new Error('Preview element not found.');
    }
    if (!editorEl) {
      throw new Error('Editor element not found.');
    }

    ensureImageMap();
    configureMarkedRenderer();
    setupMermaid();
    setupReducedMotionListener();
    attachPreviewEvents();
    attachEditorEvents();
    attachBusListeners();

    initialized = true;
    render(getInitialText());
  }

  const Preview = {
    init,
    render,
    scrollToHeading,
    getCurrentScrollInfo,
    computeScrollTarget
  };

  global.Preview = Preview;
})(window);
