// The README screenshots: the webview in Chrome with the preview's fake host and its ?demo workspace
// (scripts/preview). Run `npm run screenshots`; the images go to media/screenshots/.
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'media/screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };

// The repository root over HTTP: the page loads dist/ and Monaco's worker by relative URLs.
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, path.endsWith('/') ? `${path}index.html` : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/scripts/preview/`;

// Installed Chrome, or Playwright's own Chromium (npx playwright install chromium) where there is none.
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
await mkdir(out, { recursive: true });

/** Opens the demo workspace, runs its query and waits for the rows and the scan estimate. */
async function openDemo(theme = 'dark') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}?demo${theme === 'light' ? '&theme=light' : ''}`);
  await page.getByRole('button', { name: /Run query/ }).click();
  await page.getByText('2,000 of 4,213 matched logs').waitFor();
  await page.getByText(/≈ 1\.\d GB · \$/).first().waitFor();
  // Away from the button and the histogram, whose tooltips would show; the button's fades out.
  await page.mouse.move(1000, 30);
  await page.waitForTimeout(600);
  return page;
}

const shot = (page, name, clip) => page.screenshot({ path: join(out, `${name}.png`), clip });

{
  const page = await openDemo();
  await shot(page, 'overview');

  // Values of a column with their counts, and what the filter does to the rows, the histogram and the editor.
  await page.getByRole('button', { name: 'Column menu for level' }).click();
  for (const level of ['info', 'debug']) {
    await page.locator('label', { hasText: new RegExp(`^${level}`) }).locator('input').uncheck();
  }
  await page.waitForTimeout(300);
  await shot(page, 'filters');
  await page.keyboard.press('Escape');

  // A whole log event as a JSON tree, with the query hidden so the table gets the page.
  await page.getByRole('button', { name: 'Expand results' }).click();
  const row = page.locator('tbody tr').filter({ hasText: 'upstream timeout' }).first();
  await row.locator('button').first().click();
  await row.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.move(1000, 30);
  await page.waitForTimeout(300);
  await shot(page, 'log-details');
  await page.close();
}

{
  // Autocomplete in the editor, with the fields CloudWatch found in the selected log groups.
  const page = await openDemo();
  // The end of the fields line: the query stays valid while the list is open.
  await page.locator('.monaco-editor .view-line', { hasText: 'fields' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(', u');
  await page.keyboard.press('Control+Space');
  await page.locator('.suggest-widget.visible').waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'editor', { x: 0, y: 0, width: 1440, height: 390 });
  await page.close();
}

{
  const page = await openDemo('light');
  await shot(page, 'overview-light');
  await page.close();
}

await browser.close();
server.close();
