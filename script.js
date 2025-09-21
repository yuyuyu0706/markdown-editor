async function bootstrap() {
  await i18n.init();
  startApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

function startApp() {
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const divider = document.getElementById('divider');
  const tocDivider = document.getElementById('toc-divider');
  const mainContainer = document.querySelector('main');
  const imageInput = document.getElementById('imageInput');
  const insertImageBtn = document.getElementById('insert-image');
  const toc = document.getElementById('toc');
  const toolbar = document.getElementById('toolbar');
  const exportPdfBtn = document.getElementById('export-pdf');
  const saveMdBtn = document.getElementById('save-md');
  const openMdBtn = document.getElementById('open-md');
  const helpBtn = document.getElementById('help-btn');
  const helpWindow = document.getElementById('help-window');
  const helpClose = document.getElementById('help-close');
  const templateBtn = document.getElementById('template-btn');
  const templateOptions = document.getElementById('template-options');
  const markdownInput = document.getElementById('markdownInput');
  const langSwitch = document.getElementById('lang-switch');

  const templates = [
    { key: 'templates.meetingNotes', path: 'template/meeting-notes.md' },
    { key: 'templates.systemChangeOverview', path: 'template/system-change-overview.md' },
    { key: 'templates.systemChangeChecklist', path: 'template/system-change-checklist.md' },
    { key: 'templates.readme', path: 'template/readme.md' },
    { key: 'templates.releaseNotes', path: 'template/release-notes.md' }
  ];

  const updateDocumentTitle = () => {
    document.title = i18n.t('app.title');
  };

  updateDocumentTitle();

  if (langSwitch) {
    langSwitch.value = i18n.getCurrentLang();
    langSwitch.addEventListener('change', event => {
      i18n.setLang(event.target.value);
    });
  }

  if (insertImageBtn && imageInput) {
    insertImageBtn.addEventListener('click', () => {
      imageInput.click();
    });
  }

  if (openMdBtn && markdownInput) {
    openMdBtn.addEventListener('click', () => {
      markdownInput.click();
    });

    markdownInput.addEventListener('change', event => {
      const [file] = event.target.files || [];
      if (!file) {
        return;
      }

      const reader = new FileReader();

      reader.onload = loadEvent => {
        const { result } = loadEvent.target || {};
        if (typeof result !== 'string') {
          markdownInput.value = '';
          return;
        }

        editor.value = result;
        editor.selectionStart = editor.selectionEnd = 0;

        if (typeof editor.focus === 'function') {
          try {
            editor.focus({ preventScroll: true });
          } catch (err) {
            editor.focus();
          }
        }

        update();
        adjustTOCPosition();
        updateTOCHighlight();

        const resetScrollPositions = () => {
          editor.scrollTop = 0;
          preview.scrollTop = 0;
          if (toc) {
            toc.scrollTop = 0;
          }
        };

        resetScrollPositions();
        requestAnimationFrame(resetScrollPositions);
        isPreviewManuallyPositioned = false;

        markdownInput.value = '';
      };

      reader.onerror = () => {
        console.error(i18n.t('dialogs.fileReadErrorLog'));
        alert(i18n.t('dialogs.fileReadErrorAlert'));
        markdownInput.value = '';
      };

      reader.readAsText(file, 'utf-8');
    });
  }

  let templateButtons = [];
  let currentTemplateIndex = -1;
  let closeTemplateMenu = () => {};

  function buildTemplateOptions() {
    if (!templateOptions) {
      templateButtons = [];
      return;
    }

    templateOptions.innerHTML = '';
    templateButtons = [];

  templates.forEach(({ key, path }) => {
    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = 'template-option';
    optionBtn.dataset.path = path;
    optionBtn.dataset.i18n = key;
    optionBtn.setAttribute('role', 'menuitem');
    templateOptions.appendChild(optionBtn);
    templateButtons.push(optionBtn);
    i18n.applyToDOM(optionBtn);
  });

  i18n.applyToDOM(templateOptions);
}

  if (templateBtn && templateOptions) {
    buildTemplateOptions();

    const focusOption = index => {
      if (!templateButtons.length) return;
      const normalizedIndex =
        (index + templateButtons.length) % templateButtons.length;
      const option = templateButtons[normalizedIndex];
      if (option) {
        option.focus();
        currentTemplateIndex = normalizedIndex;
      }
    };

    const openTemplateMenu = (startIndex = 0) => {
      if (!templateButtons.length) return;
      templateOptions.hidden = false;
      templateBtn.setAttribute('aria-expanded', 'true');
      focusOption(startIndex);
    };

    const closeMenu = () => {
      if (templateOptions.hidden) return;
      templateOptions.hidden = true;
      templateBtn.setAttribute('aria-expanded', 'false');
      currentTemplateIndex = -1;
    };

    const applyTemplate = async templatePath => {
      if (!templatePath) return;

      if (editor.value.trim() && !confirm(i18n.t('dialogs.replaceTemplate'))) {
        return;
      }

      try {
        const response = await fetch(templatePath);
        if (!response.ok) {
          throw new Error(`Failed to load template: ${response.status}`);
        }
        const text = await response.text();
        editor.value = text;
        editor.selectionStart = editor.selectionEnd = 0;

        if (typeof editor.focus === 'function') {
          try {
            editor.focus({ preventScroll: true });
          } catch (err) {
            editor.focus();
          }
        }

        update();
        adjustTOCPosition();
        updateTOCHighlight();

        const resetScrollPositions = () => {
          editor.scrollTop = 0;
          preview.scrollTop = 0;
          if (toc) {
            toc.scrollTop = 0;
          }
        };

        resetScrollPositions();
        requestAnimationFrame(resetScrollPositions);
        isPreviewManuallyPositioned = false;
      } catch (error) {
        console.error(i18n.t('dialogs.templateLoadErrorLog'), error);
        alert(i18n.t('dialogs.templateLoadErrorAlert'));
      }
    };

    templateBtn.addEventListener('click', () => {
      if (templateOptions.hidden) {
        openTemplateMenu();
      } else {
        closeMenu();
      }
    });

    templateBtn.addEventListener('keydown', event => {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'Spacebar'
      ) {
        event.preventDefault();
        if (templateOptions.hidden) {
          const startIndex =
            event.key === 'ArrowUp' && templateButtons.length
              ? templateButtons.length - 1
              : 0;
          openTemplateMenu(startIndex);
        }
      } else if (event.key === 'Escape' && !templateOptions.hidden) {
        event.preventDefault();
        closeMenu();
      }
    });

    templateOptions.addEventListener('focusin', event => {
      const option = event.target.closest('.template-option');
      if (!option) return;
      currentTemplateIndex = templateButtons.indexOf(option);
    });

    templateOptions.addEventListener('keydown', event => {
      if (!templateButtons.length) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          focusOption(currentTemplateIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusOption(currentTemplateIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          focusOption(0);
          break;
        case 'End':
          event.preventDefault();
          focusOption(templateButtons.length - 1);
          break;
        case 'Escape':
          event.preventDefault();
          closeMenu();
          templateBtn.focus();
          break;
        case 'Tab':
          closeMenu();
          break;
        default:
          break;
      }
    });

    templateOptions.addEventListener('click', event => {
      const option = event.target.closest('.template-option');
      if (!option) return;
      event.stopPropagation();
      closeMenu();
      applyTemplate(option.dataset.path);
    });

    document.addEventListener('click', event => {
      if (
        templateOptions.hidden ||
        templateOptions.contains(event.target) ||
        templateBtn.contains(event.target)
      ) {
        return;
      }
      closeMenu();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !templateOptions.hidden) {
        closeMenu();
        templateBtn.focus();
      }
    });

    closeTemplateMenu = closeMenu;
  }

  document.addEventListener('i18n:change', () => {
    updateDocumentTitle();
    if (langSwitch) {
      langSwitch.value = i18n.getCurrentLang();
    }
    if (templateBtn && templateOptions) {
      closeTemplateMenu();
      buildTemplateOptions();
    }
  });

  let headings = [];
  let tocItems = [];
  let headingPositions = [];
  let previewTaskCheckboxMappings = [];

  if (window.mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      flowchart: { htmlLabels: true }
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Convert mermaid code fences to diagram containers
  marked.use({
    renderer: {
      code(code, infostring, escaped) {
        const lang = (infostring || '').trim().toLowerCase();
        if (lang === 'mermaid') {
          return `<div class="mermaid">${escapeHtml(code)}</div>`;
        }
        return false; // use default renderer
      }
    }
  });

  // Enable drag to resize panes
  let isDraggingEditor = false;
  let isDraggingTOC = false;

  divider.addEventListener('mousedown', e => {
    isDraggingEditor = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  tocDivider.addEventListener('mousedown', e => {
    isDraggingTOC = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    const rect = mainContainer.getBoundingClientRect();
    const minWidth = 100;
    if (isDraggingEditor) {
      const tocWidth = toc.offsetWidth + tocDivider.offsetWidth;
      const dividerWidth = divider.offsetWidth;
      let newEditorWidth = e.clientX - rect.left - tocWidth;
      const maxWidth = rect.width - tocWidth - dividerWidth - minWidth;
      if (newEditorWidth < minWidth) newEditorWidth = minWidth;
      if (newEditorWidth > maxWidth) newEditorWidth = maxWidth;
      editor.style.width = `${newEditorWidth}px`;
    } else if (isDraggingTOC) {
      const dividerWidth = tocDivider.offsetWidth;
      let newTocWidth = e.clientX - rect.left;
      const maxWidth = rect.width - dividerWidth - divider.offsetWidth - editor.offsetWidth - minWidth;
      if (newTocWidth < minWidth) newTocWidth = minWidth;
      if (newTocWidth > maxWidth) newTocWidth = maxWidth;
      toc.style.width = `${newTocWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDraggingEditor || isDraggingTOC) {
      isDraggingEditor = false;
      isDraggingTOC = false;
      document.body.style.cursor = '';
    }
  });

  // Flags to avoid recursive scroll events
  let isSyncingEditorScroll = false;
  let isSyncingPreviewScroll = false;
  let editorScrollSuppressUntil = 0;
  let previewScrollSuppressUntil = 0;
  const INPUT_SCROLL_SUPPRESS_DURATION = 400;
  const PREVIEW_RENDER_SCROLL_SUPPRESS_DURATION = 400;
  const MANUAL_SCROLL_INTENT_DURATION = 1200;
  let editorManualScrollIntentUntil = 0;
  let isEditorScrollbarDragActive = false;
  let isPreviewManuallyPositioned = false;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = reducedMotionQuery.matches;

  const handleReducedMotionChange = event => {
    prefersReducedMotion = event.matches;
  };

  if (typeof reducedMotionQuery.addEventListener === 'function') {
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
  } else if (typeof reducedMotionQuery.addListener === 'function') {
    reducedMotionQuery.addListener(handleReducedMotionChange);
  }

  if (typeof window.__lastPreviewScrollTarget === 'undefined') {
    window.__lastPreviewScrollTarget = null;
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

  function getHeaderOffset() {
    return toolbar ? toolbar.offsetHeight : 0;
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

  function adjustTOCPosition() {
    const offset = getHeaderOffset();
    document.documentElement.style.setProperty('--header-offset', offset + 'px');
  }

  function getPreviewPaddingTop() {
    const padding = parseFloat(window.getComputedStyle(preview).paddingTop || '0');
    return Number.isFinite(padding) ? padding : 0;
  }

  function computePreviewScrollTarget(element) {
    const previewRect = preview.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const paddingTop = getPreviewPaddingTop();
    const headerHeight = getHeaderOffset();
    const relativeTop = elementRect.top - previewRect.top + preview.scrollTop;
    const maxScroll = Math.max(preview.scrollHeight - preview.clientHeight, 0);
    const targetTop = Math.min(
      Math.max(relativeTop - headerHeight - paddingTop, 0),
      maxScroll
    );
    return { targetTop, headerHeight, paddingTop };
  }

  function dispatchPreviewScrolled(detail) {
    window.__lastPreviewScrollTarget = detail;
    preview.dispatchEvent(new CustomEvent('preview:scrolled', { detail }));
  }

  function performInitialLayout() {
    adjustTOCPosition();
    const renderDuration = update();
    extendEditorScrollSuppression(renderDuration + INPUT_SCROLL_SUPPRESS_DURATION);
    updateTOCHighlight();
  }

  if (document.readyState === 'complete') {
    performInitialLayout();
  } else {
    window.addEventListener('load', performInitialLayout, { once: true });
  }

  window.addEventListener('resize', adjustTOCPosition);

  function syncScroll(source, target) {
    const sourceMax = source.scrollHeight - source.clientHeight;
    const targetMax = target.scrollHeight - target.clientHeight;
    if (sourceMax <= 0 || targetMax <= 0) return;
    const ratio = source.scrollTop / sourceMax;
    target.scrollTop = ratio * targetMax;
  }

  editor.addEventListener('scroll', () => {
    const now = performance.now();
    if (isSyncingEditorScroll) {
      isSyncingEditorScroll = false;
      return;
    }

    const hasManualIntent =
      editorManualScrollIntentUntil === Infinity ||
      now < editorManualScrollIntentUntil;

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
    syncScroll(editor, preview);
    isSyncingEditorScroll = false;
  });

  preview.addEventListener('scroll', () => {
    if (isSyncingPreviewScroll) {
      isSyncingPreviewScroll = false;
      return;
    }

    if (performance.now() < previewScrollSuppressUntil) {
      return;
    }

    isSyncingEditorScroll = true;
    syncScroll(preview, editor);
  });

  // Update preview and expand stored Base64 images
  function clampPreviewScrollTop(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const maxScrollTop = Math.max(0, preview.scrollHeight - preview.clientHeight);
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
    preview.scrollTop = clamped;
    isSyncingPreviewScroll = false;
  }

  function update() {
    const renderStart = performance.now();
    const raw = editor.value;
    const previousScrollTop = preview.scrollTop;

    // Expand <!-- image:filename --> ... <!-- /image --> placeholders
    const expanded = raw.replace(/<!-- image:(.*?) -->[\s\S]*?<!-- \/image -->/g, (match, filename) => {
      const trimmedFilename = filename.trim();
      const matchBase64 = imageMap[trimmedFilename];
      if (matchBase64) {
        return `![${trimmedFilename}](${matchBase64})`;
      }
      return i18n.t('image.fallback', { filename: trimmedFilename });
    });

    preview.innerHTML = marked.parse(expanded, { breaks: true, mangle: false });
    updatePreviewTaskCheckboxes(raw);

    // Fallback: convert any remaining mermaid code blocks after parsing
    preview.querySelectorAll('pre code.language-mermaid').forEach(block => {
      const pre = block.parentElement;
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = block.textContent;
      pre.replaceWith(div);
    });

    if (window.mermaid) {
      try {
        const nodes = preview.querySelectorAll('.mermaid');
        if (mermaid.run) {
          mermaid.run({ nodes });
        } else if (mermaid.init) {
          mermaid.init(undefined, nodes);
        }
      } catch (e) {
        console.error(e);
      }
    }
    buildTOC();

    const renderEnd = performance.now();
    const renderDuration = renderEnd - renderStart;
    previewScrollSuppressUntil =
      renderEnd +
      Math.max(PREVIEW_RENDER_SCROLL_SUPPRESS_DURATION, renderDuration);

    const restore = () => restorePreviewScrollPosition(previousScrollTop);
    restore();
    requestAnimationFrame(restore);
    requestAnimationFrame(() => requestAnimationFrame(restore));

    return renderDuration;
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

    const checkboxes = preview.querySelectorAll('input[type="checkbox"]');
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
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
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
    const currentValue = editor.value;

    if (currentValue.charAt(mapping.index).toLowerCase() === newChar) {
      return;
    }

    const prevSelectionStart = editor.selectionStart;
    const prevSelectionEnd = editor.selectionEnd;
    const prevScrollTop = editor.scrollTop;

    editor.value =
      currentValue.slice(0, mapping.index) +
      newChar +
      currentValue.slice(mapping.index + 1);

    editor.scrollTop = prevScrollTop;
    editor.selectionStart = prevSelectionStart;
    editor.selectionEnd = prevSelectionEnd;

    extendEditorScrollSuppression();
    const renderDuration = update();
    extendEditorScrollSuppression(renderDuration + INPUT_SCROLL_SUPPRESS_DURATION);
    updateTOCHighlight();
  }

  function buildTOC() {
    const raw = editor.value;
    const slugCounts = {};
    headingPositions = [];

    // Collect heading lines while ignoring fenced code blocks
    const lines = raw.split('\n');
    let index = 0;
    let inCode = false;
    for (const line of lines) {
      const fence = line.match(/^```/);
      if (fence) {
        inCode = !inCode;
        index += line.length + 1;
        continue;
      }
      if (!inCode) {
        const m = line.match(/^(#{1,5})\s+(.*)$/);
        if (m) {
          const level = m[1].length;
          const text = m[2].trim();
          const base = text.toLowerCase().replace(/[^\w]+/g, '-');
          const count = slugCounts[base] || 0;
          slugCounts[base] = count + 1;
          const id = count ? `${base}-${count}` : base;
          headingPositions.push({ level, text, id, start: index });
        }
      }
      index += line.length + 1;
    }

    const headingElements = Array.from(
      preview.querySelectorAll('h1, h2, h3, h4, h5')
    );
    headingElements.forEach((h, i) => {
      if (headingPositions[i]) {
        h.id = headingPositions[i].id;
      }
    });

    const root = document.createElement('ul');
    const stack = [root];
    let currentLevel = 1;

    headingPositions.forEach(({ level, text, id }) => {
      if (level > currentLevel) {
        for (let i = currentLevel; i < level; i++) {
          const ul = document.createElement('ul');
          const lastLi = stack[stack.length - 1].lastElementChild;
          if (lastLi) {
            lastLi.appendChild(ul);
          } else {
            stack[stack.length - 1].appendChild(ul);
          }
          stack.push(ul);
        }
      } else if (level < currentLevel) {
        for (let i = currentLevel; i > level; i--) {
          stack.pop();
        }
      }

      const li = document.createElement('li');
      li.className = 'toc-item';
      li.dataset.target = id;
      li.textContent = text;
      stack[stack.length - 1].appendChild(li);

      currentLevel = level;
    });

    toc.innerHTML = '';
    toc.appendChild(root);

    tocItems = toc.querySelectorAll('.toc-item');
    headings = headingElements;

    tocItems.forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const target = document.getElementById(item.dataset.target);
        if (!target) {
          return;
        }

        const { targetTop, headerHeight, paddingTop } = computePreviewScrollTarget(target);
        const difference = Math.abs(preview.scrollTop - targetTop);
        const behavior = shouldReduceMotion() ? 'auto' : 'smooth';
        const detail = {
          id: item.dataset.target,
          top: targetTop,
          headerHeight,
          paddingTop,
        };
        const notify = () => dispatchPreviewScrolled(detail);

        isPreviewManuallyPositioned = true;

        if (difference <= 1) {
          requestAnimationFrame(notify);
        } else {
          preview.scrollTo({ top: targetTop, behavior });
          if (behavior === 'auto') {
            requestAnimationFrame(notify);
          } else {
            const waitForSettle = () => {
              if (Math.abs(preview.scrollTop - targetTop) <= 1) {
                notify();
              } else {
                requestAnimationFrame(waitForSettle);
              }
            };
            waitForSettle();
          }
        }
        const hp = headingPositions.find(h => h.id === item.dataset.target);
        if (hp) {
          editor.focus();
          editor.selectionStart = editor.selectionEnd = hp.start;
          updateTOCHighlight();
        }
      });
    });

    updateTOCHighlight();
  }

  function updateTOCHighlight() {
    if (!headingPositions.length) return;
    const pos = editor.selectionStart;
    let currentId = headingPositions[0].id;
    for (const hp of headingPositions) {
      if (pos >= hp.start) {
        currentId = hp.id;
      } else {
        break;
      }
    }
    tocItems.forEach(item => {
      item.classList.toggle('active', item.dataset.target === currentId);
    });
  }

  // Map for storing Base64-encoded images
  const imageMap = {};

  editor.addEventListener('beforeinput', () => {
    extendEditorScrollSuppression();
  });

  editor.addEventListener('input', () => {
    extendEditorScrollSuppression();
    const renderDuration = update();
    extendEditorScrollSuppression(renderDuration + INPUT_SCROLL_SUPPRESS_DURATION);
    updateTOCHighlight();
  });

  editor.addEventListener('compositionstart', extendEditorScrollSuppression);
  editor.addEventListener('compositionupdate', extendEditorScrollSuppression);
  editor.addEventListener('compositionend', extendEditorScrollSuppression);

  const registerPreviewManualInteraction = () => {
    previewScrollSuppressUntil = 0;
    isPreviewManuallyPositioned = true;
  };

  preview.addEventListener('wheel', registerPreviewManualInteraction, { passive: true });
  preview.addEventListener('touchmove', registerPreviewManualInteraction, {
    passive: true,
  });
  preview.addEventListener('touchstart', registerPreviewManualInteraction, {
    passive: true,
  });
  preview.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const rect = preview.getBoundingClientRect();
    if (event.clientX >= rect.right - 20) {
      registerPreviewManualInteraction();
    }
  });
  preview.addEventListener('change', handlePreviewCheckboxChange);

  const registerEditorManualInteraction = () => {
    registerEditorScrollIntent();
    editorScrollSuppressUntil = 0;
    previewScrollSuppressUntil = 0;
    isPreviewManuallyPositioned = false;
  };

  editor.addEventListener('wheel', registerEditorManualInteraction, { passive: true });
  editor.addEventListener('touchmove', registerEditorManualInteraction, {
    passive: true,
  });
  editor.addEventListener('touchstart', registerEditorManualInteraction, {
    passive: true,
  });
  editor.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const rect = editor.getBoundingClientRect();
    if (event.clientX >= rect.right - 20) {
      isEditorScrollbarDragActive = true;
      registerEditorScrollIntent(Infinity);
      registerEditorManualInteraction();
    }
  });
  editor.addEventListener('blur', () => {
    if (!isEditorScrollbarDragActive && editorManualScrollIntentUntil !== Infinity) {
      editorManualScrollIntentUntil = 0;
    }
  });
  document.addEventListener('pointerup', event => {
    if (event.pointerType !== 'mouse' || !isEditorScrollbarDragActive) {
      return;
    }
    isEditorScrollbarDragActive = false;
    if (editorManualScrollIntentUntil === Infinity) {
      editorManualScrollIntentUntil =
        performance.now() + MANUAL_SCROLL_INTENT_DURATION;
    }
  });
  document.addEventListener('pointercancel', event => {
    if (event.pointerType !== 'mouse' || !isEditorScrollbarDragActive) {
      return;
    }
    isEditorScrollbarDragActive = false;
    if (editorManualScrollIntentUntil === Infinity) {
      editorManualScrollIntentUntil = 0;
    }
  });

  function continueListOnEnter(event) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return false;
    }

    const { selectionStart, selectionEnd, value } = editor;

    if (selectionStart !== selectionEnd) {
      return false;
    }

    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const beforeCursor = value.slice(lineStart, selectionStart);
    const listMatch = beforeCursor.match(
      /^(\s*)([*+-]|\d+[.)])\s+(\[(?: |x|X)\]\s*)?/
    );

    if (!listMatch) {
      return false;
    }

    const nextNewlineIndex = value.indexOf('\n', selectionEnd);
    const afterCursorWithinLine =
      nextNewlineIndex === -1
        ? value.slice(selectionEnd)
        : value.slice(selectionEnd, nextNewlineIndex);
    const fullLineContent = beforeCursor + afterCursorWithinLine;
    const contentAfterMarker = fullLineContent.slice(listMatch[0].length);

    if (!contentAfterMarker.trim()) {
      return false;
    }

    event.preventDefault();
    extendEditorScrollSuppression();

    const indent = listMatch[1] || '';
    const marker = listMatch[2];
    const hasCheckbox = Boolean(listMatch[3]);
    const orderedMatch = marker.match(/^(\d+)([.)])$/);
    let nextMarker = marker;
    if (orderedMatch) {
      const nextNumber = Number(orderedMatch[1]) + 1;
      nextMarker = `${nextNumber}${orderedMatch[2]}`;
    }

    let remainder = value.slice(selectionEnd);
    if (remainder.startsWith(' ')) {
      remainder = remainder.slice(1);
    }

    const checkboxSegment = hasCheckbox ? '[ ] ' : '';
    const insertion = `\n${indent}${nextMarker} ${checkboxSegment}`;
    const newValue =
      value.slice(0, selectionStart) + insertion + remainder;

    const newCursorPos = selectionStart + insertion.length;
    const prevScrollTop = editor.scrollTop;

    editor.value = newValue;
    editor.scrollTop = prevScrollTop;
    editor.selectionStart = editor.selectionEnd = newCursorPos;

    const renderDuration = update();
    extendEditorScrollSuppression(renderDuration + INPUT_SCROLL_SUPPRESS_DURATION);
    updateTOCHighlight();

    return true;
  }
  editor.addEventListener('keydown', event => {
    if (
      event.key === 'PageDown' ||
      event.key === 'PageUp' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      ((event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        (event.metaKey || event.ctrlKey))
    ) {
      registerEditorManualInteraction();
      return;
    }

    if (continueListOnEnter(event)) {
      return;
    }

    extendEditorScrollSuppression();
  });
  editor.addEventListener('keyup', updateTOCHighlight);
  editor.addEventListener('click', updateTOCHighlight);

  imageInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
    const base64 = reader.result;
    const filename = file.name.trim();
      imageMap[filename] = base64;

      const markdownImage = i18n.t('image.markdownTemplate', { filename });
      const cursorPos = editor.selectionStart;
      editor.value =
        editor.value.slice(0, cursorPos) + markdownImage + editor.value.slice(cursorPos);

      update();
    };
    reader.readAsDataURL(file);
  });

  exportPdfBtn.addEventListener('click', () => {
    const win = window.open('', '', 'width=800,height=600');
    if (!win) {
      return;
    }
    const cssHref = document.querySelector('link[rel="stylesheet"]').href;
    const previewTitle = i18n.t('dialogs.previewTitle');
    const langAttr =
      document.documentElement.getAttribute('lang') || i18n.getCurrentLang();
    win.document.write(
      `<!DOCTYPE html><html lang="${langAttr}"><head><meta charset="UTF-8"><title>${previewTitle}</title><link rel="stylesheet" href="${cssHref}"></head><body>${preview.innerHTML}</body></html>`
    );
    win.document.close();
    win.onload = () => {
      win.focus();
      win.print();
      win.close();
    };
  });

  saveMdBtn.addEventListener('click', () => {
    const defaultName = i18n.t('dialogs.defaultFileName');
    const trimmedName =
      typeof defaultName === 'string' && defaultName.trim()
        ? defaultName.trim()
        : 'document.md';
    const filename = trimmedName.endsWith('.md') ? trimmedName : `${trimmedName}.md`;

    const blob = new Blob([editor.value], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });

  helpBtn.addEventListener('click', () => {
    helpWindow.classList.toggle('hidden');
  });

  helpClose.addEventListener('click', () => {
    helpWindow.classList.add('hidden');
  });

}

