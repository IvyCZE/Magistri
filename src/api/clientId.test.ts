// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAKALARI_CLIENT_ID } from './client';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Bakaláři client id', () => {
  it('is the same in the web client, the Android client and the capture script', () => {
    const kotlin = read('android/app/src/main/java/cz/prehled/app/auth/LoginEndpoint.kt');
    const script = read('scripts/capture-fixtures.mjs');

    expect(kotlin).toContain(`const val CLIENT_ID = "${BAKALARI_CLIENT_ID}"`);
    expect(script).toContain(`const CLIENT_ID = '${BAKALARI_CLIENT_ID}'`);
  });

  it('is not repeated as a literal anywhere else in the web client', () => {
    expect(read('src/api/client.ts').match(/client_id: '/g)).toBeNull();
  });
});
