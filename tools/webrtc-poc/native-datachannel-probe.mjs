import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const browserPath = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const offerUrl = process.argv[3] || 'https://dim.productions/axion/';
const nativePeerExe = process.argv[4] || 'build/webrtc-native-poc/Release/linkindaw-native-answer-peer.exe';
const cdpPort = Number(process.argv[5] || 9341);

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
  ws.send(JSON.stringify({
    id,
    method: 'Runtime.evaluate',
    params: { expression, awaitPromise: true, returnByValue: true, userGesture: true },
  }));
  return result.finally(() => ws.close());
}

async function waitForHttps(wsUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const href = (await cdpEval(wsUrl, 'location.href', 2000)).result?.result?.value || '';
    if (href.startsWith('https://')) return href;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Offer page did not reach HTTPS URL');
}

function getFirstLocalIPv4() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function patchMdnsCandidates(sdp) {
  const ip = getFirstLocalIPv4();
  return {
    ip,
    sdp: sdp.replace(/ ([a-z0-9-]+\.local) /gi, ` ${ip} `),
  };
}

async function waitForExitOrKill(proc, timeoutMs) {
  if (proc.exitCode !== null) return proc.exitCode;
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve(null);
    }, timeoutMs);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
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

const tempDir = `C:/tmp/linkindaw-native-webrtc-${Date.now()}`;
await mkdir(tempDir, { recursive: true });
const offerPath = path.join(tempDir, 'offer.sdp');
const answerPath = path.join(tempDir, 'answer.sdp');
const resultPath = path.join(tempDir, 'result.json');
const profilePath = path.join(tempDir, 'chrome-profile');

const browser = spawn(browserPath, [
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profilePath}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--headless=new',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
  offerUrl,
], { stdio: ['ignore', 'ignore', 'pipe'] });

let browserErr = '';
browser.stderr.on('data', (chunk) => { browserErr += chunk.toString(); });

let nativeProc;
try {
  console.error('[probe] waiting for CDP page');
  const page = await waitForPage(cdpPort);
  console.error('[probe] waiting for HTTPS navigation');
  const actualOfferUrl = await waitForHttps(page.webSocketDebuggerUrl);
  console.error('[probe] HTTPS page ready: ' + actualOfferUrl);

  const createOffer = String.raw`
    (async () => {
      window.__linkindawOfferPc = new RTCPeerConnection({ iceServers: [] });
      window.__linkindawOfferLog = [];
      window.__linkindawOfferChannel = window.__linkindawOfferPc.createDataChannel('linkindaw-native-poc');
      window.__linkindawOfferChannel.onopen = () => {
        window.__linkindawOfferLog.push('open');
        window.__linkindawOfferChannel.send('ping-' + Date.now());
      };
      window.__linkindawOfferChannel.onmessage = (event) => window.__linkindawOfferLog.push('rx:' + event.data);
      window.__linkindawOfferChannel.onerror = () => window.__linkindawOfferLog.push('error');
      window.__linkindawOfferChannel.onclose = () => window.__linkindawOfferLog.push('close');
      const offer = await window.__linkindawOfferPc.createOffer();
      await window.__linkindawOfferPc.setLocalDescription(offer);
      await new Promise((resolve) => {
        if (window.__linkindawOfferPc.iceGatheringState === 'complete') return resolve();
        window.__linkindawOfferPc.addEventListener('icegatheringstatechange', () => {
          if (window.__linkindawOfferPc.iceGatheringState === 'complete') resolve();
        });
        setTimeout(resolve, 5000);
      });
      return { href: location.href, origin: location.origin, secure: isSecureContext, sdp: window.__linkindawOfferPc.localDescription.sdp };
    })()
  `;
  console.error('[probe] creating browser offer');
  const offerValue = (await cdpEval(page.webSocketDebuggerUrl, createOffer, 30000)).result?.result?.value;
  console.error('[probe] browser offer created');
  let offerSdp = offerValue.sdp;
  let patchedMdnsIp = null;
  if (process.env.LINKINDAW_PATCH_MDNS === '1') {
    const patched = patchMdnsCandidates(offerSdp);
    offerSdp = patched.sdp;
    patchedMdnsIp = patched.ip;
    console.error('[probe] patched mDNS candidates to ' + patchedMdnsIp);
  }
  await writeFile(offerPath, offerSdp, 'utf8');

  console.error('[probe] starting native peer');
  nativeProc = spawn(nativePeerExe, [offerPath, answerPath, resultPath], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let nativeOut = '';
  let nativeErr = '';
  nativeProc.stdout.on('data', (chunk) => { nativeOut += chunk.toString(); });
  nativeProc.stderr.on('data', (chunk) => { nativeErr += chunk.toString(); });

  console.error('[probe] waiting for native answer SDP');
  const answerSdp = await waitForFile(answerPath, 15000);
  console.error('[probe] native answer SDP received');
  const answerJson = JSON.stringify(answerSdp);
  const applyAnswer = `
    (async () => {
      await window.__linkindawOfferPc.setRemoteDescription({ type: 'answer', sdp: ${answerJson} });
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (window.__linkindawOfferLog.some((line) => line.startsWith('rx:pong:'))) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return {
        href: location.href,
        origin: location.origin,
        secure: isSecureContext,
        connectionState: window.__linkindawOfferPc.connectionState,
        iceConnectionState: window.__linkindawOfferPc.iceConnectionState,
        channelState: window.__linkindawOfferChannel.readyState,
        log: window.__linkindawOfferLog,
      };
    })()
  `;
  console.error('[probe] applying answer and waiting for pong');
  const finalOffer = (await cdpEval(page.webSocketDebuggerUrl, applyAnswer, 35000)).result?.result?.value;
  console.error('[probe] browser wait complete');

  console.error('[probe] waiting briefly for native peer exit');
  const nativeExit = await waitForExitOrKill(nativeProc, 5000);
  console.error('[probe] native peer exit/kill result: ' + nativeExit);
  let nativeResult = null;
  try { nativeResult = JSON.parse(await readFile(resultPath, 'utf8')); } catch {}

  console.log(JSON.stringify({
    browserPath,
    requestedOfferUrl: offerUrl,
    actualOfferUrl,
    nativePeerExe,
    patchedMdnsIp,
    offer: finalOffer,
    nativeExit,
    nativeResult,
    nativeStdout: nativeOut.trim(),
    nativeStderr: nativeErr.trim(),
  }, null, 2));
} finally {
  browser.kill();
  if (nativeProc && nativeProc.exitCode === null) nativeProc.kill();
  if (browserErr.trim()) console.error(browserErr.trim().split(/\r?\n/).slice(-5).join('\n'));
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}



