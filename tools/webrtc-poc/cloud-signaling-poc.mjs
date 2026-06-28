import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const browserPath = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pageUrl = process.argv[3] || process.env.LINKINDAW_SIGNALING_PAGE_URL || 'https://dim.productions/axion/';
const nativePeerExe = process.argv[4] || 'build/webrtc-native-poc/Release/linkindaw-native-answer-peer.exe';
const signalingPort = Number(process.argv[5] || 18096);
const cdpPort = Number(process.argv[6] || 9351);
const roomId = `room-${Date.now()}`;
const envSignalingBase = process.env.LINKINDAW_SIGNALING_BASE?.replace(/\/+$/, '');
const useLocalSignaling = !envSignalingBase;
const signalingBase = envSignalingBase || `http://127.0.0.1:${signalingPort}`;

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-private-network': 'true',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function startSignalingServer(port) {
  const rooms = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const match = url.pathname.match(/^\/rooms\/([^/]+)\/messages$/);
      if (!match) return sendJson(res, 404, { ok: false, error: 'not_found' });
      const room = match[1];
      if (!rooms.has(room)) rooms.set(room, []);
      const messages = rooms.get(room);
      if (req.method === 'POST') {
        const body = JSON.parse(await readRequestBody(req) || '{}');
        const message = { id: messages.length + 1, at: Date.now(), ...body };
        messages.push(message);
        return sendJson(res, 200, { ok: true, id: message.id });
      }
      if (req.method === 'GET') {
        const after = Number(url.searchParams.get('after') || 0);
        const to = url.searchParams.get('to');
        const result = messages.filter((msg) => msg.id > after && (!to || msg.to === to || msg.to === 'all'));
        return sendJson(res, 200, { ok: true, messages: result });
      }
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: String(error?.message || error) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function postMessage(message) {
  const res = await fetch(`${signalingBase}/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`signaling POST failed ${res.status}`);
  return res.json();
}

async function pollMessages(to, afterRef, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${signalingBase}/rooms/${roomId}/messages?to=${encodeURIComponent(to)}&after=${afterRef.value}`);
    if (!res.ok) throw new Error(`signaling GET failed ${res.status}`);
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

async function cdpEval(wsUrl, expression, timeoutMs = 20000) {
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
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: true } }));
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

async function runNativeHelper(tempDir) {
  const afterRef = { value: 0 };
  const offerMsg = (await pollMessages('native', afterRef, 30000)).find((msg) => msg.kind === 'offer');
  if (!offerMsg?.sdp) throw new Error('Native helper did not receive offer');

  const offerPath = path.join(tempDir, 'offer.sdp');
  const answerPath = path.join(tempDir, 'answer.sdp');
  const resultPath = path.join(tempDir, 'result.json');
  await writeFile(offerPath, offerMsg.sdp, 'utf8');

  const nativeProc = spawn(nativePeerExe, [offerPath, answerPath, resultPath], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let nativeStdout = '';
  let nativeStderr = '';
  nativeProc.stdout.on('data', (chunk) => { nativeStdout += chunk.toString(); });
  nativeProc.stderr.on('data', (chunk) => { nativeStderr += chunk.toString(); });

  const answerSdp = await waitForFile(answerPath, 15000);
  await postMessage({ from: 'native', to: 'browser', kind: 'answer', sdp: answerSdp });

  const nativeExit = await new Promise((resolve) => nativeProc.once('exit', (code) => resolve(code)));
  let nativeResult = null;
  try { nativeResult = JSON.parse(await readFile(resultPath, 'utf8')); } catch {}
  return { nativeExit, nativeResult, nativeStdout: nativeStdout.trim(), nativeStderr: nativeStderr.trim() };
}

const tempDir = `C:/tmp/linkindaw-cloud-signaling-${Date.now()}`;
await mkdir(tempDir, { recursive: true });
let server;
let browser;
try {
  if (useLocalSignaling) {
    server = await startSignalingServer(signalingPort);
  }
  const helperPromise = runNativeHelper(tempDir);

  const profilePath = path.join(tempDir, 'chrome-profile');
  browser = spawn(browserPath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    pageUrl,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const page = await waitForPage(cdpPort);
  const actualPageUrl = await waitForNavigatedPage(page.webSocketDebuggerUrl);
  const browserExpression = `
    (async () => {
      const signalingBase = ${JSON.stringify(signalingBase)};
      const roomId = ${JSON.stringify(roomId)};
      const log = [];
      let after = 0;
      async function post(message) {
        const res = await fetch(signalingBase + '/rooms/' + roomId + '/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(message),
        });
        if (!res.ok) throw new Error('POST ' + res.status);
        return res.json();
      }
      async function poll(kind, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const res = await fetch(signalingBase + '/rooms/' + roomId + '/messages?to=browser&after=' + after);
          if (!res.ok) throw new Error('GET ' + res.status);
          const data = await res.json();
          for (const message of data.messages || []) {
            after = Math.max(after, message.id);
            if (!kind || message.kind === kind) return message;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('timeout waiting for ' + kind);
      }
      const pc = new RTCPeerConnection({ iceServers: [] });
      const dc = pc.createDataChannel('linkindaw-cloud-signaling-poc');
      dc.onopen = () => { log.push('open'); dc.send('ping-' + Date.now()); };
      dc.onmessage = (event) => log.push('rx:' + event.data);
      dc.onerror = () => log.push('error');
      dc.onclose = () => log.push('close');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') resolve();
        });
        setTimeout(resolve, 5000);
      });
      await post({ from: 'browser', to: 'native', kind: 'offer', sdp: pc.localDescription.sdp });
      const answer = await poll('answer', 15000);
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (log.some((line) => line.startsWith('rx:pong:'))) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return {
        href: location.href,
        origin: location.origin,
        secure: isSecureContext,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        channelState: dc.readyState,
        log,
      };
    })()
  `;
  const browserEval = await cdpEval(page.webSocketDebuggerUrl, browserExpression, 60000);
  if (browserEval.exceptionDetails) {
    console.error(JSON.stringify(browserEval.exceptionDetails, null, 2));
    throw new Error('Browser signaling expression failed');
  }
  const browserResult = browserEval.result?.result?.value;
  const nativeResult = await helperPromise;
  console.log(JSON.stringify({ signalingBase, useLocalSignaling, roomId, requestedPageUrl: pageUrl, actualPageUrl, browserResult, nativeResult }, null, 2));
} finally {
  if (browser) browser.kill();
  if (server) server.close();
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}





