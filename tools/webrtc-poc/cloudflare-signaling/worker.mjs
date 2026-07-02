const ROOM_TTL_SECONDS = 120;
const ROOM_TTL_MS = ROOM_TTL_SECONDS * 1000;
const MAX_MESSAGES_PER_ROOM = 256;
const CACHE_ORIGIN = 'https://linkindaw-signal-cache.local';

export class SignalingRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    return handleRoomRequest(request, 'durable-object');
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return json({ ok: true });
    }

    const url = new URL(request.url);
    const match = matchMessagesPath(url.pathname);
    if (!match) {
      return json({
        ok: true,
        service: 'linkindaw-signaling',
        storage: 'cache-api-fallback',
        endpoints: [
          'POST /rooms/:roomId/messages',
          'GET /rooms/:roomId/messages?to=browser|native&after=<id>',
        ],
      });
    }

    const roomId = match[1];
    if (!/^[a-zA-Z0-9._-]{1,96}$/.test(roomId)) {
      return json({ ok: false, error: 'invalid_room' }, 400);
    }

    return handleRoomRequest(request, roomId);
  },
};

async function handleRoomRequest(request, roomId) {
  try {
    if (request.method === 'OPTIONS') {
      return json({ ok: true });
    }

    const url = new URL(request.url);
    if (request.method === 'POST') {
      return postMessage(request, roomId);
    }

    if (request.method === 'GET') {
      return getMessages(url, roomId);
    }

    return json({ ok: false, error: 'method_not_allowed' }, 405);
  } catch (error) {
    return json({ ok: false, error: 'room_exception', message: String(error?.message || error) }, 500);
  }
}

async function postMessage(request, roomId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const validation = validateMessage(body);
  if (!validation.ok) {
    return json(validation, 400);
  }

  const room = await readRoom(roomId);
  pruneRoom(room);

  const message = {
    id: room.nextId++,
    at: Date.now(),
    from: body.from,
    to: body.to,
    kind: body.kind,
  };

  if (body.sdp) message.sdp = body.sdp;
  if (body.candidate !== undefined) message.candidate = body.candidate;
  if (body.mid !== undefined) message.mid = body.mid;
  if (body.mLineIndex !== undefined) message.mLineIndex = body.mLineIndex;

  room.messages.push(message);
  if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
    room.messages.splice(0, room.messages.length - MAX_MESSAGES_PER_ROOM);
  }
  await writeRoom(roomId, room);

  return json({ ok: true, id: message.id, storage: 'cache-api-fallback' });
}

async function getMessages(url, roomId) {
  const after = Number(url.searchParams.get('after') || 0);
  const to = url.searchParams.get('to') || '';

  if (to && !isRole(to)) {
    return json({ ok: false, error: 'invalid_to' }, 400);
  }

  const room = await readRoom(roomId);
  pruneRoom(room);
  await writeRoom(roomId, room);

  const messages = room.messages.filter((entry) => {
    if (entry.id <= after) return false;
    return !to || entry.to === to;
  });

  return json({ ok: true, messages, storage: 'cache-api-fallback' });
}

async function readRoom(roomId) {
  const response = await caches.default.match(roomCacheRequest(roomId));
  if (!response) return { nextId: 1, messages: [] };
  try {
    const room = await response.json();
    if (!room || !Array.isArray(room.messages) || !Number.isFinite(room.nextId)) {
      return { nextId: 1, messages: [] };
    }
    return room;
  } catch {
    return { nextId: 1, messages: [] };
  }
}

async function writeRoom(roomId, room) {
  await caches.default.put(roomCacheRequest(roomId), new Response(JSON.stringify(room), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${ROOM_TTL_SECONDS}`,
    },
  }));
}

function roomCacheRequest(roomId) {
  return new Request(`${CACHE_ORIGIN}/rooms/${encodeURIComponent(roomId)}`);
}

function pruneRoom(room) {
  const now = Date.now();
  room.messages = room.messages.filter((entry) => now - entry.at < ROOM_TTL_MS);
}

function matchMessagesPath(pathname) {
  return pathname.match(/^(?:\/linkindaw-signal)?\/rooms\/([^/]+)\/messages$/);
}

function validateMessage(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_body' };
  if (!isRole(body.from)) return { ok: false, error: 'invalid_from' };
  if (!isRole(body.to)) return { ok: false, error: 'invalid_to' };
  if (!['offer', 'answer', 'candidate'].includes(body.kind)) {
    return { ok: false, error: 'invalid_kind' };
  }

  if ((body.kind === 'offer' || body.kind === 'answer') && typeof body.sdp !== 'string') {
    return { ok: false, error: 'missing_sdp' };
  }

  if (body.kind === 'candidate' && body.candidate === undefined) {
    return { ok: false, error: 'missing_candidate' };
  }

  return { ok: true };
}

function isRole(role) {
  return role === 'browser' || role === 'native';
}

function json(value, status = 200) {
  const body = JSON.stringify(value);
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}
