import type { IncomingMessage, ServerResponse } from 'node:http';
export function createProxyHandler(options?: { trustProxy?: boolean }): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
