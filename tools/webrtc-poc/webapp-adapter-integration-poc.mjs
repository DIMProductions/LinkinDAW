import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const browserPath = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const basePageUrl = process.argv[3] || process.env.LINKINDAW_SIGNALING_PAGE_URL || 'https://dim.productions/axion/';
const nativePeerExe = process.argv[4] || 'build/webrtc-native-poc/Release/linkindaw-native-bridge-probe.exe';
const cdpPortBase = Number(process.argv[5] || 9371);
const signalingBase = (process.env.LINKINDAW_SIGNALING_BASE || 'https://dim.productions/linkindaw-signal').replace(/\/+$/, '');

async function postMessage(roomId, message) {
  const res = await fetch(`${signalingBase}/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`signaling POST failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pollMessages(roomId, to, afterRef, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${signalingBase}/rooms/${roomId}/messages?to=${encodeURIComponent(to)}&after=${afterRef.value}`);
    if (!res.ok) throw new Error(`signaling GET failed ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.messages?.length) {
      afterRef.value = Math.max(afterRef.value, ...data.messages.map((msg) => msg.id));
      return data.messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for signaling message to ${to}`);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.setTimeout(500, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function waitForPage(port) {
  const deadline = Date.now() + 12000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const pages = await getJson(`http://127.0.0.1:${port}/json/list`);
      const page = pages.find((entry) => entry.type === 'page') || pages[0];
      if (page?.webSocketDebuggerUrl) return page;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError || new Error(`CDP page not found on ${port}`);
}

async function cdpEval(wsUrl, expression, timeoutMs = 30000) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const id = Math.floor(Math.random() * 1e9);
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP Runtime.evaluate timeout')), timeoutMs);
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        clearTimeout(timer);
        resolve(data);
      }
    });
  });
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  return result.finally(() => ws.close());
}

async function waitForNavigatedPage(wsUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const href = (await cdpEval(wsUrl, 'location.href', 2000)).result?.result?.value || '';
    if (href.startsWith('https://') || href.startsWith('http://')) return href;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Offer page did not finish navigation');
}

async function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await readFile(filePath, 'utf8');
      if (value.trim()) return value;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out waiting for ${filePath}`);
}

async function runNativeBridgeProbe(tempDir, roomId, round) {
  const afterRef = { value: 0 };
  const offerMsg = (await pollMessages(roomId, 'native', afterRef, 30000)).find((msg) => msg.kind === 'offer');
  if (!offerMsg?.sdp) throw new Error(`Native bridge probe round ${round} did not receive offer`);

  const offerPath = path.join(tempDir, `adapter-offer-${round}.sdp`);
  const answerPath = path.join(tempDir, `adapter-answer-${round}.sdp`);
  const resultPath = path.join(tempDir, `adapter-result-${round}.json`);
  await writeFile(offerPath, offerMsg.sdp, 'utf8');

  const nativeProc = spawn(nativePeerExe, [offerPath, answerPath, resultPath], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let nativeStdout = '';
  let nativeStderr = '';
  nativeProc.stdout.on('data', (chunk) => { nativeStdout += chunk.toString(); });
  nativeProc.stderr.on('data', (chunk) => { nativeStderr += chunk.toString(); });

  const answerSdp = await waitForFile(answerPath, 15000);
  await postMessage(roomId, { from: 'native', to: 'browser', kind: 'answer', sdp: answerSdp });

  const nativeExit = await new Promise((resolve) => nativeProc.once('exit', (code) => resolve(code)));
  let nativeResult = null;
  try { nativeResult = JSON.parse(await readFile(resultPath, 'utf8')); } catch {}
  return { nativeExit, nativeResult, nativeStdout: nativeStdout.trim(), nativeStderr: nativeStderr.trim() };
}

function pageUrlForRoom(roomId) {
  const url = new URL(basePageUrl);
  url.searchParams.set('linkindaw', 'webrtc');
  url.searchParams.set('room', roomId);
  url.searchParams.set('linkindawSignal', signalingBase);
  return url.toString();
}

async function runRound(tempDir, round) {
  const roomId = `linkindaw-adapter-${Date.now()}-${round}`;
  const pageUrl = pageUrlForRoom(roomId);
  const cdpPort = cdpPortBase + round - 1;
  const profilePath = path.join(tempDir, `chrome-profile-${round}`);
  const nativePromise = runNativeBridgeProbe(tempDir, roomId, round);
  const browser = spawn(browserPath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    pageUrl,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  try {
    const page = await waitForPage(cdpPort);
    const actualPageUrl = await waitForNavigatedPage(page.webSocketDebuggerUrl);
    const nativeResult = await nativePromise;
    const adapterState = (await cdpEval(page.webSocketDebuggerUrl, 'window.__linkinDawWebRTCAdapter?.state || null', 5000)).result?.result?.value || null;
    return { roomId, requestedPageUrl: pageUrl, actualPageUrl, adapterState, nativeResult };
  } finally {
    browser.kill();
  }
}

const tempDir = `C:/tmp/linkindaw-webapp-adapter-${Date.now()}`;
await mkdir(tempDir, { recursive: true });
try {
  const rounds = [];
  for (let round = 1; round <= 2; round += 1) {
    rounds.push(await runRound(tempDir, round));
  }
  const ok = rounds.every((round) => round.adapterState?.enabled && round.nativeResult?.nativeExit === 0 && round.nativeResult?.nativeResult?.ok);
  console.log(JSON.stringify({ ok, signalingBase, basePageUrl, rounds }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
