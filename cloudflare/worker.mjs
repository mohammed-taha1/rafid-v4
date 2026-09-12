const DEFAULT_API_ORIGIN = "https://rafid-v4.onrender.com";
const API_PREFIX = "/api/rafid/";
const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE", "OPTIONS"]);

function apiOrigin(value) {
  const parsed = new URL(String(value || DEFAULT_API_ORIGIN));
  if (parsed.protocol !== "https:") throw new Error("RAFID_API_ORIGIN must use HTTPS.");
  return parsed.origin;
}

function isBackendRoute(pathname) {
  return pathname === "/health" || pathname.startsWith(API_PREFIX);
}

function proxyHeaders(source) {
  const headers = new Headers(source);
  const clientIp = headers.get("cf-connecting-ip");
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  // Never trust a browser-supplied forwarding chain. Render receives only the
  // address authenticated by Cloudflare, which keeps rate limiting meaningful.
  headers.delete("x-forwarded-for");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  headers.set("x-rafid-edge", "cloudflare");
  return headers;
}

async function proxyToRafid(request, env) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed." }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", Allow: [...ALLOWED_METHODS].join(", ") },
    });
  }

  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, apiOrigin(env.RAFID_API_ORIGIN));
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const requestInit = {
    method: request.method,
    headers: proxyHeaders(request.headers),
    body: hasBody ? request.body : undefined,
    redirect: "manual",
  };
  // Node's Web Request implementation requires this for streaming bodies;
  // Workers safely ignores the otherwise-standard extension.
  if (hasBody) requestInit.duplex = "half";
  const upstreamRequest = new Request(upstream, requestInit);
  const response = await fetch(upstreamRequest);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.delete("server");
  headers.delete("x-powered-by");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isBackendRoute(url.pathname)) return proxyToRafid(request, env);
    return env.ASSETS.fetch(request);
  },
};

export { apiOrigin, isBackendRoute, proxyToRafid };
