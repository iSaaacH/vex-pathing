import { chromium } from 'playwright-core';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Locate the downloaded chromium build.
const base = path.join(os.homedir(), '.cache', 'ms-playwright');
const dir = fs.readdirSync(base).find((d) => d.startsWith('chromium-'));
const exe = path.join(base, dir, 'chrome-linux64', 'chrome');

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4319/vex-pathing/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const out = process.argv[2] || 'app.png';
await page.screenshot({ path: out });

// Pull a few facts out of the live DOM so this is a real check, not just a picture.
const facts = await page.evaluate(() => ({
  segments: document.querySelectorAll('.segment').length,
  codeLines: document.querySelector('.code')?.textContent?.split('\n').length ?? 0,
  est: document.querySelectorAll('.summary .stat')[1]?.textContent?.trim(),
  collisions: document.querySelectorAll('.summary .stat')[2]?.textContent?.trim(),
  canvasPainted: (() => {
    const c = document.querySelector('canvas');
    if (!c) return false;
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4000) seen.add(`${d[i]},${d[i+1]},${d[i+2]}`);
    return seen.size;
  })(),
  code: document.querySelector('.code')?.textContent?.slice(0, 600),
}));

console.log(JSON.stringify(facts, null, 2));
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
