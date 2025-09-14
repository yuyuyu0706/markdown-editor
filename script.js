const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const divider = document.getElementById('divider');
const tocDivider = document.getElementById('toc-divider');
const mainContainer = document.querySelector('main');
const imageInput = document.getElementById('imageInput');
const toc = document.getElementById('toc');
const toolbar = document.getElementById('toolbar');

let headings = [];
let tocItems = [];
let headingPositions = [];

if (window.mermaid) {
  mermaid.initialize({ startOnLoad: false });
}

marked.use({
  renderer: {
    code(code, infostring) {
      const lang = (infostring || '').trim().toLowerCase();
      if (lang === 'mermaid') {
        return `<div class="mermaid">${code}</div>`;
      }
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
  if (!isSyncingEditorScroll) {
    isSyncingPreviewScroll = true;
    syncScroll(editor, preview);
  }
  isSyncingEditorScroll = false;
});

preview.addEventListener('scroll', () => {
  if (!isSyncingPreviewScroll) {
    isSyncingEditorScroll = true;
    syncScroll(preview, editor);
  }
  isSyncingPreviewScroll = false;
});

// プレビューを更新（Base64を抽出して表示）
function update() {
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
  if (window.mermaid) {
    try {
      mermaid.run({ nodes: preview.querySelectorAll('.mermaid') });
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

editor.addEventListener('input', () => {
  update();
  updateTOCHighlight();
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

