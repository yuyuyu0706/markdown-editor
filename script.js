const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const divider = document.getElementById('divider');
const mainContainer = document.querySelector('main');
const imageInput = document.getElementById('imageInput');

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
  preview.style.width = `${rect.width - newEditorWidth - dividerWidth}px`;
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

  preview.innerHTML = marked.parse(expanded, { breaks: true });
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

