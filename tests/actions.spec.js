const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = 'file://' + path.resolve(__dirname, '../index.html');
const VIEWPORT = { width: 1280, height: 1024 };
const STORAGE_IGNORE_KEYS = [
  'md:text',
  'md:settings',
  'markdown-editor-language',
  'markdown-editor-language-source',
];

async function getPaneMetrics(page) {
  return await page.evaluate(() => {
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    if (!editor || !preview) {
      throw new Error('Editor or preview pane not found');
    }
    const editorWidth = editor.offsetWidth;
    const previewWidth = preview.offsetWidth;
    const totalWidth = editorWidth + previewWidth;
    return {
      editorWidth,
      previewWidth,
      ratio: totalWidth > 0 ? editorWidth / totalWidth : 0,
    };
  });
}

async function dragDivider(page, deltaX) {
  const divider = page.locator('#divider');
  const box = await divider.boundingBox();
  if (!box) {
    throw new Error('Divider bounding box unavailable');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 10 });
  await page.mouse.up();
}

async function waitForEditorWidth(page, targetWidth, tolerance = 2) {
  await page.waitForFunction(
    ({ targetWidth, tolerance }) => {
      const editor = document.getElementById('editor');
      if (!editor) {
        return false;
      }
      return Math.abs(editor.offsetWidth - targetWidth) <= tolerance;
    },
    { targetWidth, tolerance }
  );
}

async function getStorageSnapshot(page) {
  return await page.evaluate(() => {
    const snapshot = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      snapshot[key] = window.localStorage.getItem(key);
    }
    return snapshot;
  });
}

async function waitForStorageChange(page, previousSnapshot, options = {}) {
  const { ignoreKeys = [], timeout = 5000, pollInterval = 50 } = options;
  const deadline = Date.now() + timeout;
  const previous = previousSnapshot ? { ...previousSnapshot } : {};

  while (Date.now() < deadline) {
    const snapshot = await getStorageSnapshot(page);
    const combinedKeys = new Set([
      ...Object.keys(previous),
      ...Object.keys(snapshot),
    ]);

    const changedKeys = [];
    for (const key of combinedKeys) {
      if (ignoreKeys.includes(key)) {
        continue;
      }
      if (snapshot[key] !== previous[key]) {
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0) {
      const key = changedKeys[0];
      return {
        key,
        value: snapshot[key] ?? null,
        snapshot,
        changedKeys,
      };
    }

    await page.waitForTimeout(pollInterval);
  }

  throw new Error('Timed out waiting for localStorage change');
}

test('exports PDF via button', async ({ page }) => {
  await page.goto(fileUrl);
  await page.evaluate(() => {
    const originalOpen = window.open;
    window.open = (...args) => {
      const win = originalOpen(...args);
      win.print = () => {};
      win.close = () => {};
      return win;
    };
  });
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.click('#export-pdf'),
  ]);
  await expect(popup).toHaveTitle('Preview');
  await popup.close();
  expect(popup.isClosed()).toBeTruthy();
});

test('inserts image into preview', async ({ page }) => {
  await page.goto(fileUrl);
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAE0lEQVR42mP8z/D/PwMDAwMAAAIABJACJ1gAAAAASUVORK5CYII=',
    'base64'
  );
  await page.setInputFiles('#imageInput', {
    name: 'test.png',
    mimeType: 'image/png',
    buffer,
  });
  await expect(page.locator('#editor')).toHaveValue(/\[Image: test.png\]/);
  await expect(page.locator('#preview img')).toHaveAttribute('src', /data:image\/png;base64/);
});

test('divider can move horizontally', async ({ page }) => {
  await page.goto(fileUrl);
  const editor = page.locator('#editor');
  const divider = page.locator('#divider');
  const initialWidth = await editor.evaluate(e => e.offsetWidth);
  const box = await divider.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y);
  await page.mouse.up();
  const newWidth = await editor.evaluate(e => e.offsetWidth);
  expect(newWidth).not.toBe(initialWidth);
});

test('divider persists width ratio after reload', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto(fileUrl);
  await page.waitForLoadState('load');
  await page.evaluate(() => {
    try {
      window.localStorage && window.localStorage.clear();
      window.sessionStorage && window.sessionStorage.clear();
    } catch (error) {
      // Ignore storage access errors in non-standard environments.
    }
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#divider');

  const initialMetrics = await getPaneMetrics(page);
  const initialStorage = await getStorageSnapshot(page);

  const moveRightBy = Math.min(
    220,
    Math.max(120, Math.floor(initialMetrics.previewWidth / 2))
  );
  await dragDivider(page, moveRightBy);

  const widenedMetrics = await getPaneMetrics(page);
  expect(widenedMetrics.editorWidth).toBeGreaterThan(
    initialMetrics.editorWidth + 40
  );
  expect(Math.abs(widenedMetrics.ratio - initialMetrics.ratio)).toBeGreaterThan(0.04);

  const firstPersist = await waitForStorageChange(page, initialStorage, {
    ignoreKeys: STORAGE_IGNORE_KEYS,
  });
  expect(firstPersist.changedKeys.length).toBeGreaterThanOrEqual(1);
  const ratioKey = firstPersist.key;
  const ratioValue = firstPersist.value;
  expect(typeof ratioKey).toBe('string');
  expect(ratioValue).not.toBeNull();

  await page.reload({ waitUntil: 'load' });
  await waitForEditorWidth(page, widenedMetrics.editorWidth, 2);

  const reloadedMetrics = await getPaneMetrics(page);
  expect(Math.abs(reloadedMetrics.editorWidth - widenedMetrics.editorWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(reloadedMetrics.ratio - widenedMetrics.ratio)).toBeLessThanOrEqual(0.01);

  const storageAfterReload = await getStorageSnapshot(page);
  expect(storageAfterReload[ratioKey]).toBe(ratioValue);

  const moveLeftBy = -Math.min(
    220,
    Math.max(120, Math.floor(widenedMetrics.editorWidth / 2))
  );
  await dragDivider(page, moveLeftBy);

  const narrowedMetrics = await getPaneMetrics(page);
  expect(widenedMetrics.editorWidth - narrowedMetrics.editorWidth).toBeGreaterThan(40);
  expect(Math.abs(narrowedMetrics.ratio - widenedMetrics.ratio)).toBeGreaterThan(0.04);

  const secondPersist = await waitForStorageChange(page, storageAfterReload, {
    ignoreKeys: STORAGE_IGNORE_KEYS,
  });
  expect(secondPersist.changedKeys).toContain(ratioKey);
  expect(secondPersist.key).toBe(ratioKey);
  expect(secondPersist.value).not.toBeNull();
  expect(secondPersist.value).not.toBe(ratioValue);

  await page.reload({ waitUntil: 'load' });
  await waitForEditorWidth(page, narrowedMetrics.editorWidth, 2);

  const finalMetrics = await getPaneMetrics(page);
  expect(Math.abs(finalMetrics.editorWidth - narrowedMetrics.editorWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(finalMetrics.ratio - narrowedMetrics.ratio)).toBeLessThanOrEqual(0.01);

  const finalStorage = await getStorageSnapshot(page);
  expect(finalStorage[ratioKey]).toBe(secondPersist.value);
});

test('saves markdown to file', async ({ page }) => {
  await page.goto(fileUrl);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#save-md'),
  ]);
  expect(download.suggestedFilename()).toBe('document.md');
});

test('opens markdown file into editor', async ({ page }) => {
  await page.goto(fileUrl);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('#open-md'),
  ]);
  await fileChooser.setFiles({
    name: 'opened.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 開いたファイル', 'utf-8'),
  });
  await expect(page.locator('#editor')).toHaveValue('# 開いたファイル');
  await expect(page.locator('#preview h1')).toHaveText('開いたファイル');
});

test('renders mermaid diagram in preview', async ({ page }) => {
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.mermaid);
  await page.fill('#editor', '```mermaid\nflowchart LR\nA-->B\n```');
  await page.waitForSelector('#preview .mermaid svg');
  await expect(page.locator('#preview .mermaid svg')).toBeVisible();
});
