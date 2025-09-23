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

  const LAYOUT_STORAGE_KEY = 'md:layout:editorWidthRatio';
  const MIN_EDITOR_WIDTH = 100;
  let storedEditorWidthRatio = null;

  const updateDocumentTitle = () => {
    document.title = i18n.t('app.title');
  };

  updateDocumentTitle();

  if (langSwitch) {
    langSwitch.value = i18n.getCurrentLang();
    langSwitch.addEventListener('change', event => {
      const nextLang = event.target.value;
      i18n.setLang(nextLang);
      AppState.setSetting('lang', nextLang);
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

        AppState.setText(result, 'editor');
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
        Bus.emit('preview:manual-reset');

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

        AppState.setText(text, 'editor');
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
        Bus.emit('preview:manual-reset');
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
    AppState.setSetting('lang', i18n.getCurrentLang());
    updateDocumentTitle();
    if (langSwitch) {
      langSwitch.value = i18n.getCurrentLang();
    }
    if (templateBtn && templateOptions) {
      closeTemplateMenu();
      buildTemplateOptions();
    }
    adjustTOCPosition();
  });

  let headings = [];
  let tocItems = [];
  let headingPositions = [];

  Preview.init();
  adjustTOCPosition();

  const readStoredEditorRatio = () => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (raw === null) {
        return null;
      }
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  };

  const writeStoredEditorRatio = ratio => {
    if (!Number.isFinite(ratio)) {
      return;
    }
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, ratio.toFixed(6));
    } catch (error) {
      // Ignore persistence errors, such as disabled storage.
    }
  };

  const getEditorHorizontalPadding = () => {
    const styles = window.getComputedStyle(editor);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    return paddingLeft + paddingRight;
  };

  const getAvailableEditorWidth = () => {
    const rect = mainContainer.getBoundingClientRect();
    const tocWidth = toc ? toc.offsetWidth : 0;
    const tocDividerWidth = tocDivider ? tocDivider.offsetWidth : 0;
    const dividerWidth = divider ? divider.offsetWidth : 0;
    const available = rect.width - tocWidth - tocDividerWidth - dividerWidth;
    return Number.isFinite(available) ? available : 0;
  };

  const setEditorOuterWidth = width => {
    if (!Number.isFinite(width)) {
      return;
    }
    const padding = getEditorHorizontalPadding();
    const minContentWidth = Math.max(0, MIN_EDITOR_WIDTH);
    const minOuterWidth = MIN_EDITOR_WIDTH + padding;
    const normalizedWidth = Math.max(minOuterWidth, Math.round(width));
    const contentWidth = Math.max(normalizedWidth - padding, minContentWidth);
    editor.style.width = `${contentWidth}px`;
  };

  const clampEditorWidth = (width, totalAvailable) => {
    const padding = getEditorHorizontalPadding();
    const minOuterWidth = MIN_EDITOR_WIDTH + padding;
    const maxWidth = Math.max(minOuterWidth, totalAvailable - minOuterWidth);
    if (!Number.isFinite(width)) {
      return minOuterWidth;
    }
    if (width < minOuterWidth) {
      return minOuterWidth;
    }
    if (width > maxWidth) {
      return maxWidth;
    }
    return width;
  };

  const measureEditorRatio = () => {
    const totalAvailable = getAvailableEditorWidth();
    if (!Number.isFinite(totalAvailable) || totalAvailable <= 0) {
      return null;
    }
    const width = clampEditorWidth(
      editor.getBoundingClientRect().width,
      totalAvailable
    );
    const ratio = width / totalAvailable;
    return Number.isFinite(ratio) ? ratio : null;
  };

  const applyEditorRatio = ratio => {
    if (!Number.isFinite(ratio)) {
      return false;
    }
    const totalAvailable = getAvailableEditorWidth();
    if (!Number.isFinite(totalAvailable) || totalAvailable <= 0) {
      return false;
    }
    const padding = getEditorHorizontalPadding();
    const minOuterWidth = MIN_EDITOR_WIDTH + padding;
    const maxOuterWidth = Math.max(minOuterWidth, totalAvailable - minOuterWidth);
    const minRatio = Math.min(minOuterWidth / totalAvailable, 1);
    const maxRatio = Math.max(minRatio, Math.min(maxOuterWidth / totalAvailable, 1));
    const safeRatio = Math.min(Math.max(ratio, minRatio), maxRatio);
    const desiredWidth = clampEditorWidth(
      Math.round(safeRatio * totalAvailable),
      totalAvailable
    );
    setEditorOuterWidth(desiredWidth);
    return true;
  };

  const persistEditorWidthRatio = () => {
    const ratio = measureEditorRatio();
    if (ratio === null) {
      return;
    }
    storedEditorWidthRatio = ratio;
    writeStoredEditorRatio(ratio);
  };

  const restoreEditorWidthRatio = () => {
    const stored = readStoredEditorRatio();
    if (stored !== null && applyEditorRatio(stored)) {
      storedEditorWidthRatio = stored;
    } else {
      storedEditorWidthRatio = measureEditorRatio();
    }
  };

  restoreEditorWidthRatio();

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
    const minWidth = MIN_EDITOR_WIDTH;
    if (isDraggingEditor) {
      const tocWidth =
        (toc ? toc.offsetWidth : 0) + (tocDivider ? tocDivider.offsetWidth : 0);
      const dividerWidth = divider.offsetWidth;
      const totalAvailable = rect.width - tocWidth - dividerWidth;
      if (!Number.isFinite(totalAvailable) || totalAvailable <= 0) {
        return;
      }
      const proposedWidth =
        e.clientX - rect.left - tocWidth - dividerWidth / 2;
      const clampedWidth = clampEditorWidth(proposedWidth, totalAvailable);
      setEditorOuterWidth(clampedWidth);
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
    const wasDraggingEditor = isDraggingEditor;
    if (isDraggingEditor || isDraggingTOC) {
      isDraggingEditor = false;
      isDraggingTOC = false;
      document.body.style.cursor = '';
    }
    if (wasDraggingEditor) {
      persistEditorWidthRatio();
    }
  });

  function getHeaderOffset() {
    return toolbar ? toolbar.offsetHeight : 0;
  }

  function adjustTOCPosition() {
    const offset = getHeaderOffset();
    document.documentElement.style.setProperty('--header-offset', offset + 'px');
  }

  window.addEventListener('resize', () => {
    adjustTOCPosition();
    if (storedEditorWidthRatio !== null && !isDraggingEditor) {
      applyEditorRatio(storedEditorWidthRatio);
    }
  });

  // Update preview and expand stored Base64 images
  function handleTextStateChange(event) {
    if (!event || typeof event.text !== 'string') {
      return;
    }

    const { text, source } = event;
    const prevSelectionStart = editor.selectionStart;
    const prevSelectionEnd = editor.selectionEnd;
    const prevScrollTop = editor.scrollTop;

    if (source !== 'editor' && editor.value !== text) {
      editor.value = text;
      if (source === 'init') {
        editor.selectionStart = editor.selectionEnd = 0;
        editor.scrollTop = 0;
      } else {
        editor.selectionStart = prevSelectionStart;
        editor.selectionEnd = prevSelectionEnd;
        editor.scrollTop = prevScrollTop;
      }
    }
    Preview.render(text);
    buildTOC();
    updateTOCHighlight();
  }

  function buildTOC() {
    const raw = AppState.getText();
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
        const targetId = item.dataset.target;
        if (!targetId) {
          return;
        }

        Bus.emit('toc:jump', { id: targetId });

        const hp = headingPositions.find(h => h.id === targetId);
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

  editor.addEventListener('input', () => {
    AppState.setText(editor.value, 'editor');
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

    AppState.setText(editor.value, 'editor');

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
      return;
    }

    if (continueListOnEnter(event)) {
      return;
    }
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
      if (typeof base64 === 'string' && filename) {
        Bus.emit('preview:image', { filename, data: base64 });
      }

      const markdownImage = i18n.t('image.markdownTemplate', { filename });
      const cursorPos = editor.selectionStart;
      const currentValue = AppState.getText();
      const newValue =
        currentValue.slice(0, cursorPos) +
        markdownImage +
        currentValue.slice(cursorPos);
      editor.value = newValue;

      AppState.setText(newValue, 'editor');
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

    const blob = new Blob([AppState.getText()], { type: 'text/markdown' });
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

  Bus.on('text:changed', handleTextStateChange);

  Bus.on('toc:jump', event => {
    if (!event || typeof event.id !== 'string') {
      return;
    }
    Preview.scrollToHeading(event.id);
  });

  Bus.on('settings:changed', event => {
    if (!event || event.key !== 'lang') {
      return;
    }
    if (langSwitch && typeof event.value === 'string') {
      langSwitch.value = event.value;
    }
  });

  AppState.init({
    text: editor.value,
    settings: { lang: i18n.getCurrentLang() }
  });

}

