import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once, EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createProxyHandler, proxyTarget, publicAddress, isPublicAddress } from './proxy.mjs';
import { SchoolDirectory } from './school-directory.mjs';

test('parses school API routes with custom hosts, paths and ports', () => {
  const url = proxyTarget('/api-proxy/school.bakalari.cz:8443/bakaweb/api/3/marks?x=1');
  assert.equal(url.href, 'https://school.bakalari.cz:8443/bakaweb/api/3/marks?x=1');
  assert.equal(proxyTarget('/api-proxy/school.example.invalid/prefix/api/login').pathname, '/prefix/api/login');
  assert.equal(proxyTarget('/api-sluzby/api/v1/municipality/Praha').hostname, 'sluzby.bakalari.cz');
  for (const route of [
    '/api-proxy/127.0.0.1/api/3/user', '/api-proxy/localhost/api/login',
    '/api-proxy/school.bakalari.cz@evil.invalid/api/login',
    '/api-proxy/school.bakalari.cz%2f@evil.invalid/api/login',
    '/api-proxy/school.bakalari.cz/api/3/../../private',
    '/api-proxy/school.bakalari.cz/api/3/%2e%2e/private',
    '/api-proxy/school.bakalari.cz/api/3/%252e%252e/private',
    '/api-proxy/school.bakalari.cz/api/3/a%2fb%5c..',
    '/api-proxy/school.bakalari.cz/admin', '/api-sluzby/anything',
    'https://evil.invalid/api/login',
  ]) assert.throws(() => proxyTarget(route), route);

});

test('rejects nonpublic addresses, IPv6, and mixed public/private DNS answers', async () => {
  for (const address of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '169.254.169.254', '100.64.1.1', '172.16.1.1', '192.168.1.1', '198.18.1.1', '224.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  await assert.rejects(publicAddress('school.bakalari.cz', async () => [{ address: '8.8.8.8' }, { address: '10.0.0.1' }]));
  await assert.rejects(publicAddress('school.bakalari.cz', async () => []));
});

async function withProxy(options, run) {
  const schoolDirectory = {
    find: async (target) => target.hostname === 'school.bakalari.cz' ? { id: 'fixture-school', schoolUrl: target.origin } : null,
    response: async () => [],
  };
  const server = createServer(createProxyHandler({ schoolDirectory, ...options }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

const upstream = (statusCode, inspect = () => {}, responseHeaders = {}) => (options, callback) => {
  inspect(options);
  const req = new EventEmitter();
  req.setTimeout = () => {};
  req.destroy = (error) => { if (error) req.emit('error', error); req.emit('close'); };
  req.end = () => queueMicrotask(() => {
    const response = Readable.from([Buffer.from('{"ok":true}')]);
    response.statusCode = statusCode;
    response.headers = { 'content-type': 'application/json', 'set-cookie': 'private=secret', 'access-control-allow-origin': '*', location: 'https://evil.invalid', ...responseHeaders };
    response.on('close', () => req.emit('close'));
    callback(response);
  });
  return req;
};

test('pins the DNS answer, verifies TLS, and forwards only API headers', async () => {
  let lookups = 0;
  await withProxy({
    resolve: async () => { lookups++; return [{ address: '8.8.8.8', family: 4 }]; },
    request: upstream(200, (options) => {
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.servername, 'school.bakalari.cz');
      assert.equal(options.port, '8443');
      assert.equal(options.path, '/bakaweb/api/3/marks?x=1');
      assert.equal(options.headers.authorization, 'Bearer test-token');
      assert.equal(options.headers.cookie, undefined);
      assert.equal(options.headers['x-forwarded-for'], undefined);
      options.lookup('school.bakalari.cz', {}, (error, address, family) => {
        assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4);
      });
    }),
  }, async (base) => {
    const res = await fetch(`${base}/api-proxy/school.bakalari.cz:8443/bakaweb/api/3/marks?x=1`, { headers: { Authorization: 'Bearer test-token', Cookie: 'private=secret', 'X-Forwarded-For': '127.0.0.1' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
  assert.equal(lookups, 1);
});

test('never follows redirects or reflects their Location header', async () => {
  await withProxy({ resolve: async () => [{ address: '8.8.8.8' }], request: upstream(302) }, async (base) => {
    const res = await fetch(`${base}/api-proxy/school.bakalari.cz/api/login`);
    assert.equal(res.status, 502); assert.equal(res.headers.get('location'), null);
  });
});

test('downloads active upstream content instead of serving it at the app origin', async () => {
  await withProxy({ resolve: async () => [{ address: '8.8.8.8' }], request: upstream(200, () => {}, { 'content-type': 'text/html', 'content-disposition': 'inline; filename="message.html"' }) }, async (base) => {
    const res = await fetch(`${base}/api-proxy/school.bakalari.cz/api/3/komens/attachment/id-1`);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="message.html"');
    assert.equal(res.headers.get('content-security-policy'), "sandbox; default-src 'none'");
  });
});

test('rejects private DNS before opening a socket and rate limits repeated requests', async () => {
  await withProxy({ maxRequests: 1, resolve: async () => [{ address: '127.0.0.1' }], request: () => assert.fail('must not open socket') }, async (base) => {
    const route = `${base}/api-proxy/school.bakalari.cz/api/login`;
    assert.equal((await fetch(route)).status, 403);
    const limited = await fetch(route);
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  });
});

test('rejects oversized bodies and invalid methods before connecting', async () => {
  await withProxy({ request: () => assert.fail('must not open socket') }, async (base) => {
    assert.equal((await fetch(`${base}/api-proxy/school.bakalari.cz/api/login`, { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
    assert.equal((await fetch(`${base}/api-sluzby/api/v1/municipality`, { method: 'POST' })).status, 405);
  });
});

test('verifies official school IDs before forwarding credentials to a custom school', async () => {
  const school = { id: 'school-1', schoolUrl: 'https://custom-school.example.invalid:8443/bakaweb/' };
  const schoolDirectory = new SchoolDirectory({ loadJson: async (route) => {
    assert.equal(route, '/api/v1/school/school-1'); return school;
  } });
  let calls = 0;
  await withProxy({ schoolDirectory, resolve: async () => [{ address: '8.8.8.8' }], request: upstream(200, (options) => {
    calls++; assert.equal(options.hostname, 'custom-school.example.invalid');
    assert.equal(options.port, '8443'); assert.equal(options.path, '/bakaweb/api/login');
    assert.equal(options.headers['x-bakalari-school-id'], undefined);
  }) }, async (base) => {
    const options = { method: 'POST', headers: { 'X-Bakalari-School-Id': 'school-1' }, body: 'username=synthetic&password=synthetic' };
    assert.equal((await fetch(`${base}/api-proxy/custom-school.example.invalid:8443/bakaweb/api/login`, options)).status, 200);
    assert.equal((await fetch(`${base}/api-proxy/evil.invalid/bakaweb/api/login`, options)).status, 403);
  });
  assert.equal(calls, 1);
});
