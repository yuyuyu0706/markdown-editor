const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = 'file://' + path.resolve(__dirname, '../index.html');

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
  await expect(page.locator('#editor')).toHaveValue(/\[画像: test.png\]/);
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

test('saves markdown to file', async ({ page }) => {
  await page.goto(fileUrl);
  const filename = 'testfile.md';
  page.once('dialog', dialog => dialog.accept(filename));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#save-md'),
  ]);
  expect(download.suggestedFilename()).toBe(filename);
});

test('opens markdown file into editor', async ({ page }) => {
  await page.goto(fileUrl);
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('#open-md'),
  ]);
  page.once('dialog', dialog => dialog.accept());
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
