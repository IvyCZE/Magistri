import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIPv4 } from 'node:net';
import path from 'node:path';
import { SchoolDirectory, DirectoryUnavailable, schoolBase } from './school-directory.mjs';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(address, prefix, 'ipv4');

export const isPublicAddress = (address) => isIPv4(address) && !blocked.check(address, 'ipv4');

class ProxyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function proxyTarget(rawUrl) {
  // Never accept a URL supplied as an absolute request target or an encoded authority.
  if (!rawUrl?.startsWith('/') || rawUrl.includes('\\') || /[\x00-\x20\x7f]/.test(rawUrl)) throw new ProxyError(400, 'Invalid proxy URL.');
  const [pathname, ...query] = rawUrl.split('?');
  const suffix = query.length ? `?${query.join('?')}` : '';
  if (/^\/api-sluzby\/api\/v1\/municipality(?:\/[^/]+)?\/?$/.test(pathname)) {
    return new URL(`https://sluzby.bakalari.cz${pathname.slice('/api-sluzby'.length)}${suffix}`);
  }
  const match = pathname.match(/^\/api-proxy\/([a-z0-9.-]+(?::\d{1,5})?)(\/.*)$/i);
  if (!match) throw new ProxyError(400, 'Invalid proxy route.');
  const url = new URL(`https://${match[1]}${match[2]}${suffix}`);
  if ((isIPv4(url.hostname) && !isPublicAddress(url.hostname)) || !url.hostname.includes('.') || /\.(?:localhost|local)$/.test(url.hostname)) throw new ProxyError(403, 'School address is not public.');
  let decoded;
  try { decoded = decodeURIComponent(match[2]); } catch { throw new ProxyError(400, 'Invalid API path.'); }
  const segments = decoded.split('/');
  if (/[\\%?#\x00-\x1f\x7f]/.test(decoded) || segments.some((s, i) => (i > 0 && !s && i < segments.length - 1) || s === '.' || s === '..') ||
      !/^.*\/api\/(?:login\/?$|[1-9]\d*(?:\/|$))/i.test(decoded)) {
    throw new ProxyError(400, 'Only Bakaláři API paths are allowed.');
  }
  return url;
}

// Validate the actual DNS answer used for the connection, then pin the socket to
// that address. A second DNS lookup must never undo the private-network check.
export async function publicAddress(hostname, resolve = lookup) {
  const records = await resolve(hostname, { all: true, family: 4 });
  if (!records.length || records.some(({ address }) => !isPublicAddress(address))) throw new ProxyError(403, 'School address is not public.');
  return records[0].address;
}

function bodyOf(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new ProxyError(413, 'Request is too large.')); return; }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
    req.on('aborted', () => reject(new ProxyError(400, 'Request aborted.')));
  });
}

// The directory transport never accepts a caller-supplied hostname or credentials.
export function directoryJsonLoader({ resolve = lookup, request = httpsRequest } = {}) {
  let active = 0;
  const queue = [];
  return async (route) => {
    if (!/^\/api\/v1\/(?:municipality(?:\/[^/]+)?|school\/[a-z0-9_-]{1,80})$/i.test(route)) throw new DirectoryUnavailable('Invalid directory route.');
    if (active >= 8) {
      if (queue.length >= 128) throw new DirectoryUnavailable('School directory is busy.');
      await new Promise((ready) => queue.push(ready));
    } else active++;
    try {
      let dnsTimer;
      let address;
      try {
        address = await Promise.race([
          publicAddress('sluzby.bakalari.cz', resolve),
          new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new DirectoryUnavailable('Directory DNS timed out.')), 8000); }),
        ]);
      } finally { clearTimeout(dnsTimer); }
      return await new Promise((resolveDone, reject) => {
        const upstream = request({
          protocol: 'https:', hostname: 'sluzby.bakalari.cz', port: 443,
          servername: 'sluzby.bakalari.cz', path: route, method: 'GET',
          headers: { accept: 'application/json', 'accept-encoding': 'identity' },
          family: 4, agent: false, rejectUnauthorized: true,
          lookup: (_hostname, _options, callback) => callback(null, address, 4),
        }, (response) => {
          if (response.statusCode === 404) { response.destroy(); resolveDone(null); return; }
          if (response.statusCode !== 200) { response.destroy(); reject(new DirectoryUnavailable('School directory is unavailable.')); return; }
          const parts = [];
          let size = 0;
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) upstream.destroy(new Error('Directory response is too large.'));
            else parts.push(chunk);
          });
          response.on('error', reject);
          response.on('end', () => {
            try { resolveDone(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
            catch { reject(new DirectoryUnavailable('Invalid school directory response.')); }
          });
        });
        const timer = setTimeout(() => upstream.destroy(new Error('Directory request timed out.')), 10000);
        upstream.once('close', () => clearTimeout(timer));
        upstream.on('error', () => reject(new DirectoryUnavailable('School directory is unavailable.')));
        upstream.end();
      });
    } finally { const ready = queue.shift(); if (ready) ready(); else active--; }
  };
}

export function createProxyHandler({
  schoolDirectory,
  resolve = lookup,
  request = httpsRequest,
  trustProxy = false,
  maxRequests = 240,
} = {}) {
  const clients = new Map();
  const schools = schoolDirectory || new SchoolDirectory({
    loadJson: directoryJsonLoader({ resolve, request }),
    cacheFile: path.resolve(process.cwd(), '.cache/school-directory.json'),
  });
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    try {
      const now = Date.now();
      const key = trustProxy ? String(req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
      if (clients.size >= 10000) for (const [ip, state] of clients) if (state.until <= now) clients.delete(ip);
      let state = clients.get(key);
      if (!state || state.until <= now) {
        if (clients.size >= 10000 && !state) throw new ProxyError(429, 'Too many requests.');
        state = { until: now + 60000, count: 0 }; clients.set(key, state);
      }
      if (++state.count > maxRequests) { res.setHeader('Retry-After', '60'); throw new ProxyError(429, 'Too many requests.'); }
      if (req.url?.startsWith('/api-school/resolve?')) {
        if (req.method !== 'GET') throw new ProxyError(405, 'Method is not allowed.');
        const source = new URL(req.url, 'http://localhost').searchParams.get('url');
        const base = source && source.length <= 2048 ? schoolBase(source) : null;
        if (!base) throw new ProxyError(400, 'Invalid school URL.');
        const checked = new URL(base);
        const target = proxyTarget(`/api-proxy/${checked.host}${checked.pathname.replace(/\/$/, '')}/api/login`);
        const school = await schools.find(target);
        if (!school) throw new ProxyError(403, 'School is not in the Bakaláři directory.');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ id: school.id, schoolUrl: school.schoolUrl }));
        return;
      }
      const target = proxyTarget(req.url);
      const directory = req.url.startsWith('/api-sluzby/');
      const methods = directory ? ['GET'] : ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); throw new ProxyError(405, 'Method is not allowed.'); }
      const body = await bodyOf(req, 1024 * 1024);
      if (directory) {
        const data = await schools.response(target.pathname.replace(/\/$/, ''));
        if (data === null) throw new ProxyError(404, 'School directory entry not found.');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
        return;
      }
      if (!await schools.find(target, req.headers['x-bakalari-school-id'])) throw new ProxyError(403, 'School is not in the Bakaláři directory.');
      let dnsTimer;
      let address;
      try {
        address = await Promise.race([
          publicAddress(target.hostname, resolve),
          new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new ProxyError(504, 'DNS lookup timed out.')), 8000); }),
        ]);
      } finally { clearTimeout(dnsTimer); }
      if (res.destroyed) return;
      const headers = {};
      for (const name of ['accept', 'accept-language', 'content-type']) if (req.headers[name]) headers[name] = req.headers[name];
      if (!directory && req.headers.authorization) headers.authorization = req.headers.authorization;
      if (body.length) headers['content-length'] = String(body.length);
      await new Promise((resolveDone, reject) => {
        const upstream = request({
          protocol: 'https:', hostname: target.hostname, port: target.port || 443,
          servername: target.hostname, path: target.pathname + target.search,
          method: req.method, headers, family: 4, agent: false, rejectUnauthorized: true,
          lookup: (_hostname, _options, callback) => callback(null, address, 4),
        }, (response) => {
          // Redirects must not forward a login or token to a different host.
          if (response.statusCode >= 300 && response.statusCode < 400) {
            response.destroy(); reject(new ProxyError(502, 'School redirects are not allowed.')); return;
          }
          res.statusCode = response.statusCode || 502;
          // Never let an upstream HTML/SVG document execute at the app's origin.
          // Fetching an attachment still works; browser navigation downloads it.
          const json = /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:;|$)/i.test(response.headers['content-type'] || '');
          res.setHeader('Content-Type', json ? 'application/json; charset=utf-8' : 'application/octet-stream');
          if (!json) {
            const disposition = response.headers['content-disposition'] || '';
            res.setHeader('Content-Disposition', /^\s*(?:inline|attachment)\b/i.test(disposition) ? disposition.replace(/^\s*(?:inline|attachment)\b/i, 'attachment') : 'attachment');
          }
          if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
          let received = 0;
          response.on('data', (chunk) => {
            received += chunk.length;
            if (received > 50 * 1024 * 1024) upstream.destroy(new Error('Response too large.'));
          });
          response.on('error', reject);
          response.on('end', resolveDone);
          response.pipe(res);
        });
        const timer = setTimeout(() => upstream.destroy(new ProxyError(504, 'School request timed out.')), 60000);
        const cancel = () => { if (!res.writableFinished) upstream.destroy(); };
        res.on('close', cancel);
        upstream.once('close', () => { clearTimeout(timer); res.off('close', cancel); });
        upstream.on('error', reject);
        upstream.setTimeout(25000, () => upstream.destroy(new ProxyError(504, 'School request timed out.')));
        upstream.end(body);
      });
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      res.statusCode = error instanceof ProxyError ? error.status : error instanceof DirectoryUnavailable ? 503 : 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      // Do not put upstream errors, URLs, request bodies, or credentials in logs/responses.
      res.end(error instanceof ProxyError ? error.message : 'School proxy request failed.');
    }
  };
}
