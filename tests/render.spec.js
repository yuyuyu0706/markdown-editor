const { test, expect } = require('@playwright/test');
const path = require('path');

test('initial page renders markdown', async ({ page }) => {
  const fileUrl = 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(fileUrl);
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#preview')).toContainText('Markdownエディタ');
});
