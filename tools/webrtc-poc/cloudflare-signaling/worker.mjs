export class SignalingRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return json({ ok: true });
    }

    const url = new URL(request.url);
    const match = matchMessagesPath(url.pathname);
    if (!match) {
      return json({ ok: false, error: 'not_found' }, 404);
    }

    if (request.method === 'POST') {
      return this.postMessage(request);
    }

    if (request.method === 'GET') {
      return this.getMessages(url);
    }

    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  async postMessage(request) {
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

    const nextId = ((await this.state.storage.get('nextId')) || 1);
    const message = {
      id: nextId,
      at: Date.now(),
      from: body.from,
      to: body.to,
      kind: body.kind,
    };

    if (body.sdp) message.sdp = body.sdp;
    if (body.candidate !== undefined) message.candidate = body.candidate;
    if (body.mid !== undefined) message.mid = body.mid;
    if (body.mLineIndex !== undefined) message.mLineIndex = body.mLineIndex;

    const messages = ((await this.state.storage.get('messages')) || [])
      .filter((entry) => Date.now() - entry.at < 2 * 60 * 1000);
    messages.push(message);

    await this.state.storage.put('messages', messages);
    await this.state.storage.put('nextId', nextId + 1);

    return json({ ok: true, id: message.id });
  }

  async getMessages(url) {
    const after = Number(url.searchParams.get('after') || 0);
    const to = url.searchParams.get('to') || '';

    if (to && !isRole(to)) {
      return json({ ok: false, error: 'invalid_to' }, 400);
    }

    const now = Date.now();
    const messages = ((await this.state.storage.get('messages')) || [])
      .filter((entry) => now - entry.at < 2 * 60 * 1000);

    const result = messages.filter((entry) => {
      if (entry.id <= after) return false;
      return !to || entry.to === to;
    });

    return json({ ok: true, messages: result });
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

    const id = env.SIGNALING_ROOM.idFromName(roomId);
    const room = env.SIGNALING_ROOM.get(id);
    return room.fetch(request);
  },
};

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
