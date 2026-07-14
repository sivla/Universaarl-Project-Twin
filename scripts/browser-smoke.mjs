#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const urls = process.argv.slice(2); if (!urls.length) throw new Error('Mindestens eine Twin-Adresse fehlt.');
const candidates = process.platform === 'win32' ? ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'] : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] : ['/usr/bin/google-chrome', '/usr/bin/chromium'];
const browser = candidates.find((candidate) => fs.existsSync(candidate)); if (!browser) throw new Error('Für den verpflichtenden Browser-Smoke ist kein unterstützter lokaler Chromium-Browser vorhanden.');
const profile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.runtime', 'browser-smoke-profile');
fs.rmSync(profile, { recursive: true, force: true }); fs.mkdirSync(profile, { recursive: true });
try {
  for (const url of urls) { const result = spawnSync(browser, ['--headless', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=5000', '--dump-dom', url], { encoding: 'utf8', windowsHide: true, timeout: 30_000 }); if (result.status !== 0 || !result.stdout.includes('<main')) throw new Error(`Der Browser-Smoke ist für ${url} fehlgeschlagen (${result.status ?? 'ohne Exitcode'}): ${result.stderr.trim().slice(0, 240) || 'kein Browserfehlertext'}`); }
} finally { fs.rmSync(profile, { recursive: true, force: true }); }
process.stdout.write(JSON.stringify({ status: 'bestanden', browser: process.platform, routes: urls.length }));
