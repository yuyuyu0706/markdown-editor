const { test, expect } = require('@playwright/test');
const path = require('path');

const fileUrl = 'file://' + path.resolve(__dirname, '../index.html');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.addInitScript(() => {
    try {
      window.localStorage && window.localStorage.clear();
      window.sessionStorage && window.sessionStorage.clear();
    } catch (error) {
      // Ignore storage access errors in test environment.
    }
    window.__lastPreviewScrollTarget = null;
  });
  await page.goto(fileUrl);
  await page.addStyleTag({
    content: `html, body, #preview { scroll-behavior: auto !important; }`,
  });
});

test('initial page renders welcome note in preview', async ({ page }) => {
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#preview')).toContainText('Welcome to Markdown Editor Blue');
});

test('initial language defaults to English', async ({ page }) => {
  await expect(page.locator('#lang-switch')).toHaveValue('en');
  await expect(page.locator('#open-md')).toHaveText('📂 Open');
  await expect(page.locator('#help-btn')).toHaveText('❔ Help');
});

test('open button loads selected markdown file', async ({ page }) => {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('#open-md'),
  ]);

  await fileChooser.setFiles({
    name: 'render-open.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Render Test Open\n\n- item 1\n- item 2', 'utf-8'),
  });

  await expect(page.locator('#editor')).toHaveValue('# Render Test Open\n\n- item 1\n- item 2');
  await expect(page.locator('#preview h1')).toHaveText('Render Test Open');
  await expect(page.locator('#preview li')).toHaveCount(2);
});

test('language switch cycles English → Japanese → English', async ({ page }) => {
  const openButton = page.locator('#open-md');
  const helpButton = page.locator('#help-btn');

  await expect(openButton).toHaveText('📂 Open');
  await page.selectOption('#lang-switch', 'ja');
  await expect(openButton).toHaveText('📂 開く');
  await expect(helpButton).toHaveText('❔ ヘルプ');

  await page.selectOption('#lang-switch', 'en');
  await expect(openButton).toHaveText('📂 Open');
  await expect(helpButton).toHaveText('❔ Help');
});

test('preview retains manual scroll position while editing', async ({ page }) => {
  const longMarkdown = ['# Scroll Test'];
  for (let i = 1; i <= 40; i += 1) {
    longMarkdown.push(`\n## Section ${i}\n\nContent paragraph ${i}.`);
  }
  await page.fill('#editor', longMarkdown.join('\n'));
  const preview = page.locator('#preview');

  await preview.waitFor();
  await page.evaluate(() => {
    const previewEl = document.getElementById('preview');
    previewEl.scrollTop = previewEl.scrollHeight;
    previewEl.dispatchEvent(new Event('wheel', { bubbles: true }));
  });

  const initialScrollTop = await preview.evaluate(el => el.scrollTop);

  await page.type('#editor', '\nNew line');

  const finalScrollTop = await preview.evaluate(el => el.scrollTop);
  expect(Math.abs(finalScrollTop - initialScrollTop)).toBeLessThan(10);
});

test('table of contents navigation scrolls to selected section', async ({ page }) => {
  const markdown = ['# TOC Test'];
  for (let i = 1; i <= 20; i += 1) {
    markdown.push(
      `\n## Jump Section ${i}\n\n` +
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(8) +
        '\n\n' +
        'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(6)
    );
  }
  await page.fill('#editor', markdown.join('\n'));

  const targetLabel = 'Jump Section 15';
  const targetSlug = targetLabel
    .toLowerCase()
    .trim()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');

  await page.waitForFunction(slug => {
    return document.querySelector(`#toc .toc-item[data-target="${slug}"]`);
  }, targetSlug);

  const tocItem = page.locator(`#toc .toc-item[data-target="${targetSlug}"]`).first();
  await expect(tocItem).toBeVisible();
  await tocItem.click();

  const tolerance = 10;
  await page.waitForFunction(({ slug, tolerance: tol }) => {
    const previewEl = document.getElementById('preview');
    const toolbar = document.getElementById('toolbar');
    if (!previewEl || !toolbar) {
      return false;
    }
    const heading = previewEl.querySelector(`#${slug}`);
    if (!heading) {
      return false;
    }
    const paddingTop = parseFloat(getComputedStyle(previewEl).paddingTop || '0') || 0;
    const expectedOffset = toolbar.offsetHeight + paddingTop;
    const previewRect = previewEl.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const relativeTop = headingRect.top - previewRect.top;
    const scrollInfo = window.__lastPreviewScrollTarget;
    if (!scrollInfo || scrollInfo.id !== slug) {
      return false;
    }
    return Math.abs(relativeTop - expectedOffset) <= tol;
  }, { slug: targetSlug, tolerance });
});

test('help window can be opened and closed', async ({ page }) => {
  const helpWindow = page.locator('#help-window');
  await expect(helpWindow).toBeHidden();

  await page.click('#help-btn');
  await expect(helpWindow).toBeVisible();

  await page.click('#help-close');
  await expect(helpWindow).toBeHidden();
});

test('template menu opens and lists templates', async ({ page }) => {
  const templateMenu = page.locator('#template-options');
  await expect(templateMenu).toBeHidden();

  await page.click('#template-btn');
  await expect(templateMenu).toBeVisible();
  await expect(templateMenu.locator('.template-option')).toHaveCount(5);
});
