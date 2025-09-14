const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const divider = document.getElementById('divider');
const mainContainer = document.querySelector('main');
const imageInput = document.getElementById('imageInput');
const toc = document.getElementById('toc');
const previewContainer = document.getElementById('preview-container');
const toolbar = document.getElementById('toolbar');

let headings = [];
let tocItems = [];

// Enable drag to resize between editor and preview
let isDragging = false;

divider.addEventListener('mousedown', (e) => {
  isDragging = true;
  document.body.style.cursor = 'col-resize';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = mainContainer.getBoundingClientRect();
  const minWidth = 100;
  const dividerWidth = divider.offsetWidth;
  let newEditorWidth = e.clientX - rect.left;
  const maxWidth = rect.width - dividerWidth - minWidth;
  if (newEditorWidth < minWidth) newEditorWidth = minWidth;
  if (newEditorWidth > maxWidth) newEditorWidth = maxWidth;
  editor.style.width = `${newEditorWidth}px`;
  previewContainer.style.width = `${rect.width - newEditorWidth - dividerWidth}px`;
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
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
  updateTOCHighlight();
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
  buildTOC();
}

function buildTOC() {
  const headingElements = Array.from(preview.querySelectorAll('h1, h2, h3, h4, h5'));
  const root = document.createElement('ul');
  const stack = [root];
  let currentLevel = 1;

  headingElements.forEach(h => {
    const level = parseInt(h.tagName.substring(1));
    const text = h.textContent;
    let id = h.id;
    if (!id) {
      id = text.toLowerCase().trim().replace(/[^\w]+/g, '-');
      h.id = id;
    }

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
    item.addEventListener('click', () => {
      const target = document.getElementById(item.dataset.target);
      if (target) {
        const top = Math.max(target.offsetTop - getHeaderOffset(), 0);
        preview.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  updateTOCHighlight();
}

function updateTOCHighlight() {
  if (!headings.length) return;
  const scrollTop = preview.scrollTop + getHeaderOffset();
  let currentId = headings[0].id;
  for (const h of headings) {
    if (h.offsetTop <= scrollTop + 10) {
      currentId = h.id;
    }
  }
  tocItems.forEach(item => {
    if (item.dataset.target === currentId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Base64格納用マップ
const imageMap = {};

editor.addEventListener('input', update);
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

