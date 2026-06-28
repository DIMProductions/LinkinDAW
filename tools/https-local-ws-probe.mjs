import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const browserPath = process.argv[2];
const pageUrl = process.argv[3] || 'https://example.com/';
const wsPort = Number(process.argv[4] || 18091);
const cdpPort = Number(process.argv[5] || 9223);
let accepted = 0;
const server = net.createServer((socket) => {
  socket.once('data', (chunk) => {
    const key = chunk.toString('utf8').match(/^Sec-WebSocket-Key:\s*(.+)$/im)?.[1]?.trim();
    if (!key) return socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade',`Sec-WebSocket-Accept: ${accept}`,'\r\n'].join('\r\n'));
    accepted += 1;
  });
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(wsPort, '127.0.0.1', resolve); });

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { let body = ''; res.on('data', c => body += c); res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } }); });
    req.setTimeout(500, () => req.destroy(new Error('timeout'))); req.on('error', reject);
  });
}
async function waitList() {
  const until = Date.now() + 12000; let last;
  while (Date.now() < until) { try { return await getJson(`http://127.0.0.1:${cdpPort}/json/list`); } catch(e) { last=e; await new Promise(r => setTimeout(r, 200)); } }
  throw last;
}
async function evalCdp(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once:true}); ws.addEventListener('error', reject, {once:true}); });
  const id = Math.floor(Math.random()*1e9);
  const p = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('eval timeout')), 7000);
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { clearTimeout(t); resolve(m); } });
  });
  ws.send(JSON.stringify({ id, method:'Runtime.evaluate', params:{ expression, awaitPromise:true, returnByValue:true, userGesture:true }}));
  return p.finally(() => ws.close());
}
const userData = `C:/tmp/linkindaw-probe-${Date.now()}`;
const browser = spawn(browserPath, [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${userData}`, '--no-first-run', '--no-default-browser-check', '--headless=new', pageUrl], {stdio:['ignore','ignore','pipe']});
let err = ''; browser.stderr.on('data', c => err += c.toString());
try {
  const pages = await waitList();
  const page = pages.find(p => p.type === 'page') || pages[0];
  const until = Date.now() + 12000; let href = '';
  while (Date.now() < until) {
    const r = await evalCdp(page.webSocketDebuggerUrl, 'location.href');
    href = r.result?.result?.value || '';
    if (href.startsWith('https://')) break;
    await new Promise(r => setTimeout(r, 300));
  }
  const expr = `new Promise(resolve=>{const startedAt=performance.now();const ws=new WebSocket('ws://127.0.0.1:${wsPort}');const done=(result, extra={})=>resolve({href:location.href,origin:location.origin,isSecureContext, result, readyState:ws.readyState, elapsedMs:Math.round(performance.now()-startedAt), ...extra});const timer=setTimeout(()=>done('timeout'),4000);ws.onopen=()=>{clearTimeout(timer);ws.close();done('open')};ws.onerror=()=>{clearTimeout(timer);done('error')};ws.onclose=e=>{if(ws.readyState!==WebSocket.OPEN){clearTimeout(timer);done('close',{code:e.code,reason:e.reason,wasClean:e.wasClean})}}})`;
  const result = await evalCdp(page.webSocketDebuggerUrl, expr);
  console.log(JSON.stringify({browserPath,pageUrl,wsUrl:`ws://127.0.0.1:${wsPort}`,hrefBeforeProbe:href,acceptedConnections:accepted,result:result.result?.result?.value}, null, 2));
} finally {
  browser.kill();
  server.close();
}
