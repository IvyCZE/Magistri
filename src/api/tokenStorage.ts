import type { AuthTokens } from '../types/bakalari';
import { clearNativeTokens, loadNativeTokens, refreshNativeTokens, saveNativeTokens } from '../native/bridge';

const STORAGE_KEY = 'bakalari_tokens';

export interface TokenStorage {
  load(): Promise<AuthTokens | null>;
  save(tokens: AuthTokens | null): void;
  /**
   * Refreshes the tokens through the storage owner. Only storages that own the
   * refresh flow (native) implement it; others let the client call the server.
   * `staleRefreshToken` is the refresh token the caller holds, so the owner can
   * tell whether someone else already refreshed.
   */
  refresh?(staleRefreshToken: string): Promise<RefreshOutcome>;
}

/** `rejected` is true when the server refused the refresh token, false when it just could not be reached. */
export interface RefreshOutcome {
  tokens: AuthTokens | null;
  rejected: boolean;
}

export class LocalStorageTokenStorage implements TokenStorage {
  async load(): Promise<AuthTokens | null> {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch (e) {
      // V8 JSON errors quote part of the input, so never log the error message here.
      console.error('Failed to parse saved tokens:', e instanceof Error ? e.name : 'unknown error');
      return null;
    }
  }

  save(tokens: AuthTokens | null): void {
    if (tokens) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

const isDemoToken = (tokens: AuthTokens) => tokens.accessToken.startsWith('mock-');

// On Android the native layer owns the tokens (Keystore-encrypted) so the
// background sync and the WebView never hold diverging refresh tokens. The only
// thing kept in the WebView is the fake demo session, which holds no secret.
export class NativeTokenStorage implements TokenStorage {
  private readonly demoStorage = new LocalStorageTokenStorage();

  async load(): Promise<AuthTokens | null> {
    const native = await loadNativeTokens();
    if (native) return native;
    const demo = await this.demoStorage.load();
    return demo && isDemoToken(demo) ? demo : null;
  }

  save(tokens: AuthTokens | null): void {
    if (tokens && isDemoToken(tokens)) {
      this.demoStorage.save(tokens);
      return;
    }
    this.demoStorage.save(null);
    if (tokens) {
      void saveNativeTokens(tokens);
    } else {
      void clearNativeTokens();
    }
  }

  refresh(staleRefreshToken: string): Promise<RefreshOutcome> {
    return refreshNativeTokens(staleRefreshToken);
  }
}
