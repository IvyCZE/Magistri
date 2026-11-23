import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createProxyHandler } from './proxy.mjs';

const server = createServer(createProxyHandler({ trustProxy: true }));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.maxRequestsPerSocket = 100;
server.listen(3001, '127.0.0.1', () => {
  const nginx = spawn('nginx', ['-g', 'daemon off;'], { stdio: 'inherit' });
  const stop = () => { nginx.kill('SIGTERM'); server.close(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  nginx.on('error', () => { server.close(); process.exitCode = 1; });
  nginx.on('exit', (code) => { server.close(); process.exitCode = code || 0; });
});
