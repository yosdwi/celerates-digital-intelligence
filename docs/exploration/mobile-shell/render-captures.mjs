// Renders wireframes.html (doc 18) to PNG captures, using apps/erp's Playwright:
//   node docs/exploration/mobile-shell/render-captures.mjs
// Uses the pre-installed Chromium when ERP_BROWSER_EXECUTABLE is set. Exploration tooling only.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, '..', '..', '..', 'apps', 'erp', 'package.json'))('playwright');
const out = path.join(here, '..', 'evidence', 'mobile-shell');
const browser = await chromium.launch({ executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 1.5 });
await page.goto(pathToFileURL(path.join(here, 'wireframes.html')).href);
for (const [id, name] of [['A', 'direction-a-app-home-tabs'], ['B', 'direction-b-launcher-universal-bar'], ['C', 'direction-c-work-queue-home'], ['common', 'common-record-and-capture']]) {
  await page.locator(`section#${id}`).screenshot({ path: path.join(out, `${name}.png`) });
  console.log('wrote', name);
}
await browser.close();
