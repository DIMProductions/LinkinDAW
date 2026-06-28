import http from 'node:http';
import { spawn } from 'node:child_process';

const offerBrowser = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const answerBrowser = process.argv[3] || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const offerUrl = process.argv[4] || 'https://dim.productions/axion/';
const offerCdpPort = Number(process.argv[5] || 9331);
const answerCdpPort = Number(process.argv[6] || 9332);

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
    } catch (error) {
      lastError = error;
    }
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
    params: {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    },
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

const offerProfile = `C:/tmp/linkindaw-webrtc-offer-${Date.now()}`;
const answerProfile = `C:/tmp/linkindaw-webrtc-answer-${Date.now()}`;
const offerProc = spawn(offerBrowser, [
  `--remote-debugging-port=${offerCdpPort}`,
  `--user-data-dir=${offerProfile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--headless=new',
  offerUrl,
], { stdio: ['ignore', 'ignore', 'pipe'] });
const answerProc = spawn(answerBrowser, [
  `--remote-debugging-port=${answerCdpPort}`,
  `--user-data-dir=${answerProfile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--headless=new',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

try {
  const offerPage = await waitForPage(offerCdpPort);
  const answerPage = await waitForPage(answerCdpPort);
  const actualOfferUrl = await waitForHttps(offerPage.webSocketDebuggerUrl);

  const setupAnswer = String.raw`
    (async () => {
      window.__linkindawAnswerPc = new RTCPeerConnection({ iceServers: [] });
      window.__linkindawAnswerLog = [];
      window.__linkindawAnswerPc.ondatachannel = (event) => {
        const channel = event.channel;
        window.__linkindawAnswerChannel = channel;
        window.__linkindawAnswerLog.push('datachannel:' + channel.label);
        channel.onmessage = (message) => {
          window.__linkindawAnswerLog.push('rx:' + message.data);
          channel.send('pong:' + message.data);
        };
        channel.onopen = () => window.__linkindawAnswerLog.push('open');
        channel.onerror = () => window.__linkindawAnswerLog.push('error');
        channel.onclose = () => window.__linkindawAnswerLog.push('close');
      };
      return { href: location.href, secure: isSecureContext, rtc: typeof RTCPeerConnection };
    })()
  `;
  const answerSetupValue = (await cdpEval(answerPage.webSocketDebuggerUrl, setupAnswer)).result?.result?.value;

  const createOffer = String.raw`
    (async () => {
      window.__linkindawOfferPc = new RTCPeerConnection({ iceServers: [] });
      window.__linkindawOfferLog = [];
      window.__linkindawOfferChannel = window.__linkindawOfferPc.createDataChannel('linkindaw-poc');
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
        setTimeout(resolve, 3000);
      });
      return { href: location.href, origin: location.origin, secure: isSecureContext, sdp: window.__linkindawOfferPc.localDescription.sdp };
    })()
  `;
  const offerValue = (await cdpEval(offerPage.webSocketDebuggerUrl, createOffer, 30000)).result?.result?.value;
  const offerSdp = JSON.stringify(offerValue.sdp);

  const createAnswer = `
    (async () => {
      await window.__linkindawAnswerPc.setRemoteDescription({ type: 'offer', sdp: ${offerSdp} });
      const answer = await window.__linkindawAnswerPc.createAnswer();
      await window.__linkindawAnswerPc.setLocalDescription(answer);
      await new Promise((resolve) => {
        if (window.__linkindawAnswerPc.iceGatheringState === 'complete') return resolve();
        window.__linkindawAnswerPc.addEventListener('icegatheringstatechange', () => {
          if (window.__linkindawAnswerPc.iceGatheringState === 'complete') resolve();
        });
        setTimeout(resolve, 3000);
      });
      return { href: location.href, secure: isSecureContext, sdp: window.__linkindawAnswerPc.localDescription.sdp };
    })()
  `;
  const answerValue = (await cdpEval(answerPage.webSocketDebuggerUrl, createAnswer, 30000)).result?.result?.value;
  const answerSdp = JSON.stringify(answerValue.sdp);

  const applyAnswer = `
    (async () => {
      await window.__linkindawOfferPc.setRemoteDescription({ type: 'answer', sdp: ${answerSdp} });
      const deadline = Date.now() + 10000;
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
  const finalOffer = (await cdpEval(offerPage.webSocketDebuggerUrl, applyAnswer, 30000)).result?.result?.value;
  const finalAnswer = (await cdpEval(answerPage.webSocketDebuggerUrl, `({ connectionState: window.__linkindawAnswerPc.connectionState, iceConnectionState: window.__linkindawAnswerPc.iceConnectionState, channelState: window.__linkindawAnswerChannel?.readyState, log: window.__linkindawAnswerLog })`, 5000)).result?.result?.value;

  console.log(JSON.stringify({
    offerBrowser,
    answerBrowser,
    requestedOfferUrl: offerUrl,
    actualOfferUrl,
    answerSetup: answerSetupValue,
    offer: finalOffer,
    answer: finalAnswer,
  }, null, 2));
} finally {
  offerProc.kill();
  answerProc.kill();
}
