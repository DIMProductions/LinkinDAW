const ROUTE_PREFIXES = ['/linkindaw-axion-probe', '/axion-webrtc'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    for (const prefix of ROUTE_PREFIXES) {
      if (url.pathname === prefix || url.pathname === `${prefix}/`) {
        url.pathname = '/index.html';
        return env.ASSETS.fetch(new Request(url, request));
      }
      if (url.pathname.startsWith(`${prefix}/`)) {
        url.pathname = url.pathname.slice(prefix.length) || '/index.html';
        return env.ASSETS.fetch(new Request(url, request));
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
