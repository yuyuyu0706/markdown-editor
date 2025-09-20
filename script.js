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
const helpBtn = document.getElementById('help-btn');
const helpWindow = document.getElementById('help-window');
const helpClose = document.getElementById('help-close');
const templateBtn = document.getElementById('template-btn');
const templateOptions = document.getElementById('template-options');

const templates = [
  { label: '議事録', path: 'template/meeting-notes.md' },
  { label: 'システム変更概要', path: 'template/system-change-overview.md' },
  { label: 'システム変更チェックリスト', path: 'template/system-change-checklist.md' },
  { label: 'Readme', path: 'template/readme.md' },
  { label: 'リリースノート', path: 'template/release-notes.md' }
];

if (insertImageBtn && imageInput) {
  insertImageBtn.addEventListener('click', () => {
    imageInput.click();
  });
}

if (templateBtn && templateOptions) {
  const templateButtons = [];

  templates.forEach(({ label, path }) => {
    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = 'template-option';
    optionBtn.textContent = label;
    optionBtn.dataset.path = path;
    optionBtn.setAttribute('role', 'menuitem');
    templateOptions.appendChild(optionBtn);
    templateButtons.push(optionBtn);
  });

  let currentTemplateIndex = -1;

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

  const closeTemplateMenu = () => {
    if (templateOptions.hidden) return;
    templateOptions.hidden = true;
    templateBtn.setAttribute('aria-expanded', 'false');
    currentTemplateIndex = -1;
  };

  const applyTemplate = async templatePath => {
    if (!templatePath) return;

    if (editor.value.trim() && !confirm('現在の内容をテンプレートで置き換えます。よろしいですか？')) {
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
    } catch (error) {
      console.error('テンプレートの読み込みに失敗しました', error);
      alert('テンプレートの読み込みに失敗しました。テンプレートファイルの配置を確認してください。');
    }
  };

  templateBtn.addEventListener('click', () => {
    if (templateOptions.hidden) {
      openTemplateMenu();
    } else {
      closeTemplateMenu();
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
      closeTemplateMenu();
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
        closeTemplateMenu();
        templateBtn.focus();
        break;
      case 'Tab':
        closeTemplateMenu();
        break;
      default:
        break;
    }
  });

  templateOptions.addEventListener('click', event => {
    const option = event.target.closest('.template-option');
    if (!option) return;
    event.stopPropagation();
    closeTemplateMenu();
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
    closeTemplateMenu();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !templateOptions.hidden) {
      closeTemplateMenu();
      templateBtn.focus();
    }
  });
}

let headings = [];
let tocItems = [];
let headingPositions = [];

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

function getHeaderOffset() {
  return toolbar ? toolbar.offsetHeight : 0;
}

function adjustTOCPosition() {
  const offset = getHeaderOffset();
  document.documentElement.style.setProperty('--header-offset', offset + 'px');
}

window.addEventListener('load', adjustTOCPosition);
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

  if (now < editorScrollSuppressUntil || now < previewScrollSuppressUntil) {
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

// プレビューを更新（Base64を抽出して表示）
function update() {
  previewScrollSuppressUntil =
    performance.now() + PREVIEW_RENDER_SCROLL_SUPPRESS_DURATION;

  const raw = editor.value;

  // Markdownにある <!-- image:filename --> ～ <!-- /image --> を展開
  const expanded = raw.replace(/<!-- image:(.*?) -->\s*\n\[画像: .*?\]\s*\n<!-- \/image -->/g, (match, filename) => {
    const matchBase64 = imageMap[filename.trim()];
    if (matchBase64) {
      return `![${filename}](${matchBase64})`;
    } else {
      return `[画像: ${filename}]`; // 念のため fallback
    }
  });

  preview.innerHTML = marked.parse(expanded, { breaks: true, mangle: false });

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
      if (target) {
        const top =
          target.getBoundingClientRect().top -
          preview.getBoundingClientRect().top +
          preview.scrollTop -
          getHeaderOffset();
        preview.scrollTo({ top, behavior: 'smooth' });
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

// Base64格納用マップ
const imageMap = {};

editor.addEventListener('beforeinput', () => {
  editorScrollSuppressUntil = performance.now() + INPUT_SCROLL_SUPPRESS_DURATION;
});

editor.addEventListener('input', () => {
  editorScrollSuppressUntil = performance.now() + INPUT_SCROLL_SUPPRESS_DURATION;
  update();
  updateTOCHighlight();
});

const clearPreviewScrollSuppression = () => {
  previewScrollSuppressUntil = 0;
};

preview.addEventListener('wheel', clearPreviewScrollSuppression, { passive: true });
preview.addEventListener('touchmove', clearPreviewScrollSuppression, {
  passive: true,
});
preview.addEventListener('touchstart', clearPreviewScrollSuppression, {
  passive: true,
});
preview.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0) return;
  const rect = preview.getBoundingClientRect();
  if (event.clientX >= rect.right - 20) {
    clearPreviewScrollSuppression();
  }
});

const clearEditorScrollSuppression = () => {
  editorScrollSuppressUntil = 0;
  clearPreviewScrollSuppression();
};

editor.addEventListener('wheel', clearEditorScrollSuppression, { passive: true });
editor.addEventListener('touchmove', clearEditorScrollSuppression, {
  passive: true,
});
editor.addEventListener('touchstart', clearEditorScrollSuppression, {
  passive: true,
});
editor.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0) return;
  const rect = editor.getBoundingClientRect();
  if (event.clientX >= rect.right - 20) {
    clearEditorScrollSuppression();
  }
});
editor.addEventListener('keyup', updateTOCHighlight);
editor.addEventListener('click', updateTOCHighlight);
window.addEventListener('load', update);

imageInput.addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result;
    const filename = file.name;
    imageMap[filename] = base64;

    const markdownImage =
      `\n<!-- image:${filename} -->\n[画像: ${filename}]\n<!-- /image -->\n`;
    const cursorPos = editor.selectionStart;
    editor.value =
      editor.value.slice(0, cursorPos) + markdownImage + editor.value.slice(cursorPos);

    update();
  };
  reader.readAsDataURL(file);
});

exportPdfBtn.addEventListener('click', () => {
  const win = window.open('', '', 'width=800,height=600');
  const cssHref = document.querySelector('link[rel="stylesheet"]').href;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Preview</title><link rel="stylesheet" href="${cssHref}"></head><body>${preview.innerHTML}</body></html>`);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
    win.close();
  };
});

saveMdBtn.addEventListener('click', () => {
  const filename = prompt('保存するファイル名を入力してください', 'document.md');
  if (filename) {
    const blob = new Blob([editor.value], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
});

helpBtn.addEventListener('click', () => {
  helpWindow.classList.toggle('hidden');
});

helpClose.addEventListener('click', () => {
  helpWindow.classList.add('hidden');
});

