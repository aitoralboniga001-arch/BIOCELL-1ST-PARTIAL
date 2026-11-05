#!/usr/bin/env node
/**
 * Headless screenshots + console capture via the Chrome DevTools Protocol (no dependencies).
 *
 *   node scripts/shot.mjs <url> <out.png> [width=1440] [height=900] [waitMs=3500]
 *   node scripts/shot.mjs --jobs jobs.json          # [{ "url", "out", "w", "h", "wait" }, …]
 *
 * Prints every console error/warning and uncaught exception per page (exit code 1 if any error).
 * Uses Chrome (or Edge) — override with CHROME=path. Pair it with the debug params of a stage URL:
 *   http://localhost:5180/#/t/7/signal?t=0.5&paused=1
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const args = process.argv.slice(2);
let jobs;
if (args[0] === '--jobs') jobs = JSON.parse(readFileSync(args[1], 'utf8'));
else if (args.length >= 2) jobs = [{ url: args[0], out: args[1], w: Number(args[2] ?? 1440), h: Number(args[3] ?? 900), wait: Number(args[4] ?? 3500) }];
else {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [w] [h] [waitMs] | --jobs jobs.json');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'biocell-shot-'));
let chrome;
for (const exe of CANDIDATES) {
  try {
    chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
    await new Promise((res, rej) => {
      chrome.once('error', rej);
      setTimeout(res, 300);
    });
    break;
  } catch {
    chrome = null;
  }
}
if (!chrome) {
  console.error('No Chrome/Edge found (set CHROME=path).');
  process.exit(2);
}

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch {
    /* not up yet */
  }
  if (!wsUrl) await sleep(200);
}
if (!wsUrl) {
  console.error('Chrome did not start.');
  chrome.kill();
  process.exit(2);
}

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const waiters = [];
let log = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'warn', 'assert'].includes(m.params.type)) {
    log.push(`[console.${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    log.push(`[exception] ${d.exception?.description ?? d.text}`);
  } else if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
    log.push(`[${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  }
  for (const w of waiters.slice()) if (w.method === m.method) {
    waiters.splice(waiters.indexOf(w), 1);
    w.res(m.params);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const once = (method, timeout = 20000) =>
  new Promise((res) => {
    const w = { method, res };
    waiters.push(w);
    setTimeout(() => res(null), timeout);
  });

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Page.bringToFront').catch(() => {});
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

let errors = 0;
for (const j of jobs) {
  log = [];
  await send('Emulation.setDeviceMetricsOverride', { width: j.w ?? 1440, height: j.h ?? 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(150);
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: j.url });
  await loaded;
  await sleep(j.wait ?? 3500);
  if (j.eval) {
    const r = await send('Runtime.evaluate', { expression: j.eval, awaitPromise: true, returnByValue: true });
    console.log(`  eval → ${JSON.stringify(r.result?.value ?? r.exceptionDetails?.text)}`);
    await sleep(j.after ?? 1200);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const out = resolve(j.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  const bad = log.filter((l) => !l.includes('GPU stall') && !l.includes('Automatic fallback to software WebGL'));
  errors += bad.filter((l) => l.startsWith('[exception]') || l.startsWith('[console.error]') || l.startsWith('[error]')).length;
  console.log(`${out}  (${j.w ?? 1440}×${j.h ?? 900})${bad.length ? '\n  ' + bad.join('\n  ') : ''}`);
}

ws.close();
chrome.kill();
await sleep(300);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* profile still locked: ignore */
}
process.exit(errors ? 1 : 0);
