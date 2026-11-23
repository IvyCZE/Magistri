import {
  AuthTokens,
  UserProfile,
  SubjectMarks,
  TimetableData,
  Homework,
  BakalariAttachment,
  KomensMessage,
  SchoolEvent,
  AbsenceSummary,
  AbsenceRecord,
  AbsencePerSubjectItem,
  SubstitutionItem,
  SubjectDetail,
  Municipality,
  SchoolInfo,
  StudentItem,
  KomensMessageTypeInfo,
  TeachingTopic,
  LessonChange,
} from '../types/bakalari';
import { isMessageUnread } from '../domain/messageState';
import { shiftIsoDate, toIsoDate } from '../domain/time';
import {
  buildAbsenceRecords,
  checkedDayHours,
  counterOf,
  hoursFromStudentTimetable,
  lessonsOfDay,
  resolveDayHours,
  weekStart,
  type DayHours,
} from '../domain/absenceRecords';

/**
 * The OAuth client id Bakaláři's own Android app sends, and the only one the servers are known to
 * accept for a password login. Android code (`LoginEndpoint.CLIENT_ID`) and
 * `scripts/capture-fixtures.mjs` repeat it; `clientId.test.ts` fails if they drift apart.
 */
export const BAKALARI_CLIENT_ID = 'ANDR';
import {
  MOCK_USER,
  MOCK_SUBJECTS_MARKS,
  MOCK_TIMETABLE,
  MOCK_PERMANENT_TIMETABLE,
  MOCK_HOMEWORKS,
  MOCK_MESSAGES,
  MOCK_EVENTS,
  MOCK_ABSENCE_SUMMARY,
  MOCK_ABSENCE_RECORDS,
  MOCK_SUBSTITUTIONS,
  MOCK_SUBJECTS_LIST,
  MOCK_POPULAR_SCHOOLS,
  MOCK_STUDENTS,
  MOCK_MESSAGE_TYPES,
  MOCK_TEACHING_TOPICS,
} from './mockData';
import { sortByDateDesc } from '../utils/dateUtils';
import { isNativePlatform } from '../native/platform';
import { LocalStorageTokenStorage, NativeTokenStorage, TokenStorage } from './tokenStorage';
import { cleanHtmlToPlainText, hasHtmlMarkup, sanitizeMessageHtml, cleanLessonGroup } from '../utils/textUtils';
import { groupConsecutiveEvents } from '../utils/eventUtils';
import { rememberDirectorySchools, schoolDirectoryHeaders } from './schoolDirectory';
import { getSavedStudentName, isClassLikeName } from '../utils/userUtils';

export function normalizeSchoolUrl(url: string): string {
  let cleaned = (url || '').trim();
  if (!cleaned) return '';
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  // Strip trailing slashes, /login, /login.aspx, /api/login, /next, /3, etc.
  cleaned = cleaned.replace(/\/+(login(\.aspx)?|api(\/login)?|next(\/.*)?|3(\/.*)?)*$/i, '').replace(/\/+$/, '');
  return cleaned;
}

/** Komens and homework use the same attachment shape and download endpoint. */
export function parseAttachments(raw: unknown): BakalariAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a: any) => a && (typeof a.Id === 'string' || typeof a.Id === 'number') && String(a.Id) !== '')
    .map((a: any) => ({
      id: String(a.Id),
      name: a.Name || a.FileName || 'Příloha',
      size: typeof a.Size === 'number' ? a.Size : undefined,
      ...(typeof a.Type === 'string' && a.Type ? { mimeType: a.Type } : {}),
    }));
}

export const DEFAULT_MUNICIPALITIES: Municipality[] = [
  { name: 'Praha', schoolCount: 42 },
  { name: 'Brno', schoolCount: 28 },
  { name: 'Ostrava', schoolCount: 22 },
  { name: 'Plzeň', schoolCount: 16 },
  { name: 'Liberec', schoolCount: 14 },
  { name: 'Olomouc', schoolCount: 14 },
  { name: 'České Budějovice', schoolCount: 12 },
  { name: 'Hradec Králové', schoolCount: 15 },
  { name: 'Pardubice', schoolCount: 12 },
  { name: 'Zlín', schoolCount: 10 },
  { name: 'Havířov', schoolCount: 8 },
  { name: 'Kladno', schoolCount: 21 },
  { name: 'Most', schoolCount: 7 },
  { name: 'Opava', schoolCount: 7 },
  { name: 'Frýdek-Místek', schoolCount: 6 },
  { name: 'Karviná', schoolCount: 6 },
  { name: 'Jihlava', schoolCount: 8 },
  { name: 'Teplice', schoolCount: 6 },
  { name: 'Děčín', schoolCount: 5 },
  { name: 'Karlovy Vary', schoolCount: 7 },
  { name: 'Chomutov', schoolCount: 5 },
  { name: 'Jablonec nad Nisou', schoolCount: 5 },
  { name: 'Mladá Boleslav', schoolCount: 6 },
  { name: 'Prostějov', schoolCount: 5 },
  { name: 'Přerov', schoolCount: 5 },
  { name: 'Česká Lípa', schoolCount: 4 },
  { name: 'Třebíč', schoolCount: 4 },
  { name: 'Tábor', schoolCount: 4 },
  { name: 'Znojmo', schoolCount: 4 },
  { name: 'Příbram', schoolCount: 4 },
  { name: 'Cheb', schoolCount: 3 },
  { name: 'Kolín', schoolCount: 4 },
  { name: 'Trutnov', schoolCount: 4 },
  { name: 'Písek', schoolCount: 3 },
  { name: 'Kroměříž', schoolCount: 4 },
  { name: 'Šumperk', schoolCount: 3 },
  { name: 'Vsetín', schoolCount: 3 },
  { name: 'Valašské Meziříčí', schoolCount: 3 },
  { name: 'Litoměřice', schoolCount: 3 },
  { name: 'Uherské Hradiště', schoolCount: 4 },
  { name: 'Hodonín', schoolCount: 3 },
  { name: 'Břeclav', schoolCount: 3 },
];

class BakalariApiClient {
  private isMockMode: boolean = false;
  private tokens: AuthTokens | null = null;
  private tokenStorage: TokenStorage = isNativePlatform() ? new NativeTokenStorage() : new LocalStorageTokenStorage();
  private corsProxyUrl: string = ''; // Optional custom CORS proxy for web deployment
  private teachersCache: Map<string, { id: string; name: string; abbrev?: string; email?: string }> = new Map();
  private refreshPromise: Promise<boolean> | null = null;
  private serverOutage: boolean = false;
  private serverOutageMessage: string = '';
  private onOutageChange?: (isDown: boolean, message: string) => void;
  private cachedKomensMessageTypes: KomensMessageTypeInfo[] = [];
  private sessionExpired: boolean = false;
  private sessionListeners = new Set<(expired: boolean) => void>();

  /** True once the server has refused the refresh token (password changed, access revoked). */
  public isSessionExpired(): boolean {
    return this.sessionExpired;
  }

  public setSessionExpired(expired: boolean) {
    if (this.sessionExpired === expired) return;
    this.sessionExpired = expired;
    this.sessionListeners.forEach((fn) => {
      try {
        fn(expired);
      } catch (err) {
        console.warn('Error in session listener:', err);
      }
    });
  }

  public onSessionExpiredChange(fn: (expired: boolean) => void): () => void {
    this.sessionListeners.add(fn);
    return () => this.sessionListeners.delete(fn);
  }

  public isServerOutage(): boolean {
    return this.serverOutage;
  }

  public setOnOutageChange(fn: (isDown: boolean, message: string) => void) {
    this.onOutageChange = fn;
  }

  public setServerOutage(isDown: boolean, message: string = '') {
    this.serverOutage = isDown;
    this.serverOutageMessage = message;
    if (this.onOutageChange) {
      try {
        this.onOutageChange(isDown, message);
      } catch (err) {
        console.warn('Error in onOutageChange callback:', err);
      }
    }
  }

  public isTokenExpired(): boolean {
    if (!this.tokens) return false;
    if (this.tokens.obtainedAt && this.tokens.expiresIn) {
      const expirationMs = this.tokens.obtainedAt + (this.tokens.expiresIn * 1000);
      return Date.now() >= expirationMs - 60000;
    }
    return false;
  }


  /**
   * Loads the saved tokens. Must be awaited before anything reads auth state
   * (see main.tsx), because on Android the tokens live in native storage.
   */
  public async init(): Promise<void> {
    this.tokens = await this.tokenStorage.load();
    this.rememberUserId();
  }

  // The user id is not a secret. Keeping it in localStorage lets utils that run
  // without the client (and without access to native-owned tokens) use it.
  private rememberUserId() {
    if (this.tokens?.userId) localStorage.setItem('b_user_id', this.tokens.userId);
  }

  constructor() {
    // Restore a user-configured CORS proxy. The auto-saved default
    // 'https://corsproxy.io/?url=' is discarded: it now requires an API key and
    // breaks schools whose /api/3 endpoints need a concrete Accept-Language.
    const savedCorsProxy = localStorage.getItem('bakalari_cors_proxy');
    if (savedCorsProxy && savedCorsProxy !== 'https://corsproxy.io/?url=') {
      this.corsProxyUrl = savedCorsProxy;
    } else {
      localStorage.removeItem('bakalari_cors_proxy');
    }

    const savedMockMode = localStorage.getItem('bakalari_mock_mode');
    this.isMockMode = savedMockMode === 'true';
  }

  public setMockMode(enabled: boolean) {
    this.isMockMode = enabled;
    localStorage.setItem('bakalari_mock_mode', String(enabled));
  }

  public getIsMockMode(): boolean {
    return this.isMockMode;
  }

  public setTokens(tokens: AuthTokens | null) {
    this.tokens = tokens;
    this.tokenStorage.save(tokens);
    this.rememberUserId();
    this.setMockMode(false);
    this.setSessionExpired(false);
  }

  public getTokens(): AuthTokens | null {
    return this.tokens;
  }

  /**
   * Removes fake ("mock") tokens left behind by an old bug, without switching
   * the client into demo mode. The user is then sent to the login screen.
   */
  public clearStaleAuth() {
    this.tokens = null;
    this.tokenStorage.save(null);
    this.setMockMode(false);
    this.setSessionExpired(false);
  }

  public setCorsProxy(url: string) {
    this.corsProxyUrl = (url || '').trim();
    localStorage.setItem('bakalari_cors_proxy', this.corsProxyUrl);
  }

  public getCorsProxy(): string {
    return this.corsProxyUrl;
  }

  private async schoolProxyHeaders(schoolUrl: string): Promise<Record<string, string>> {
    return isNativePlatform() || this.corsProxyUrl ? {} : schoolDirectoryHeaders(normalizeSchoolUrl(schoolUrl));
  }

  private getUrl(schoolUrl: string, path: string, customProxy?: string): string {
    const cleanBase = normalizeSchoolUrl(schoolUrl);
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = `${cleanBase}${cleanPath}`;
    
    const proxy = customProxy !== undefined ? customProxy : this.corsProxyUrl;
    if (proxy) {
      if (proxy.includes('?url=')) {
        return `${proxy}${encodeURIComponent(fullUrl)}`;
      } else if (proxy.endsWith('?') || proxy.endsWith('/')) {
        return `${proxy}${encodeURIComponent(fullUrl)}`;
      }
      return `${proxy}?url=${encodeURIComponent(fullUrl)}`;
    }

    // When running on web (not native Capacitor), route via reverse proxy to avoid browser CORS issues
    const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (!isNative && cleanBase) {
      const hostOnly = cleanBase.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      return `/api-proxy/${hostOnly}${cleanPath}`;
    }

    return fullUrl;
  }

  /**
   * Parses a Bakaláři API response body. Action endpoints (mark-as-read,
   * mark-as-confirmed, ...) reply with 204 No Content or an empty body, so an
   * empty response is a success and must not fail JSON parsing.
   */
  private async parseBody<T>(response: Response, asBlob = false): Promise<T> {
    if (asBlob) {
      return (await response.blob()) as T;
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        this.setServerOutage(true, 'Server školy vrátil neplatnou odpověď (výpadek systému)');
      }
      throw new Error(`Invalid JSON response from Bakaláři API (${response.status})`);
    }
  }

  private async request<T>(path: string, options: RequestInit & { skipOutageFlag?: boolean; asBlob?: boolean } = {}): Promise<T> {
    if (this.isMockMode || !this.tokens) {
      throw new Error('API client is running in mock mode or not authenticated.');
    }

    // Proactive token refresh if token expired or about to expire in <= 60s
    if (this.isTokenExpired() && this.tokens.refreshToken) {
      await this.refreshToken();
    }

    const { skipOutageFlag, asBlob, ...fetchOptions } = options;
    // Attachments can be several megabytes, so the file download gets longer to start answering.
    const timeoutMs = asBlob ? 60000 : 12000;

    let url = this.getUrl(this.tokens.schoolUrl, path);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      // Some Bakaláři servers return HTTP 500 for
      // /api/3/* endpoints unless the request carries a concrete Accept-Language.
      'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      'Authorization': `Bearer ${this.tokens.accessToken}`,
      ...(fetchOptions.headers as Record<string, string> || {}),
      ...await this.schoolProxyHeaders(this.tokens.schoolUrl),
    };


    let response: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: fetchOptions.signal || controller.signal,
      });
    } catch (err: any) {
      const isClientOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      // If mobile network socket had a transient glitch on waking up, retry once after 400ms
      if (err.name !== 'AbortError' && isClientOnline) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        try {
          response = await fetch(url, {
            ...fetchOptions,
            headers,
            signal: fetchOptions.signal || controller.signal,
          });
        } catch (retryErr: any) {
          if (retryErr.name === 'AbortError') {
            throw new Error(`Požadavek na server školy vypršel (${path}, timeout 12s).`);
          }
          if (!skipOutageFlag && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
            this.setServerOutage(true, 'Server školy neodpovídá nebo je offline');
          }
          throw new Error(`Chyba připojení k API školy (${retryErr?.message || 'Network error'}). Zkontrolujte internetové připojení.`);
        }
      } else {
        if (err.name === 'AbortError') {
          throw new Error(`Požadavek na server školy vypršel (${path}, timeout 12s).`);
        }
        if (!skipOutageFlag && isClientOnline) {
          this.setServerOutage(true, 'Server školy neodpovídá nebo je offline');
        }
        throw new Error(`Chyba připojení k API školy (${err?.message || 'Network error'}). Zkontrolujte internetové připojení.`);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle token expiration
    if (response.status === 401 && !this.tokens.refreshToken) {
      this.setSessionExpired(true);
    }
    if (response.status === 401 && this.tokens.refreshToken) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
        url = this.getUrl(this.tokens.schoolUrl, path);
        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutMs);
        try {
          const retryResponse = await fetch(url, {
            ...fetchOptions,
            headers,
            signal: fetchOptions.signal || retryController.signal,
          });
          if (!retryResponse.ok) {
            if (!skipOutageFlag && (retryResponse.status === 502 || retryResponse.status === 503 || retryResponse.status === 504)) {
              this.setServerOutage(true, `Server školy vrátil chybu ${retryResponse.status}`);
            }
            throw new Error(`Bakaláři API error: ${retryResponse.statusText}`);
          }
          if (!skipOutageFlag) {
            this.setServerOutage(false, '');
          }
          this.setSessionExpired(false);
          return this.parseBody<T>(retryResponse, asBlob);
        } finally {
          clearTimeout(retryTimeoutId);
        }
      }
    }

    if (!skipOutageFlag && (response.status === 502 || response.status === 503 || response.status === 504)) {
      this.setServerOutage(true, `Server školy vrátil chybu ${response.status}`);
      throw new Error(`Bakaláři API error: ${response.statusText} (${response.status})`);
    }

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorJson = await response.clone().json();
        errorDetail = errorJson?.message || errorJson?.Message || errorJson?.error_description || errorJson?.error || '';
      } catch {
        // Body is not JSON
      }
      throw new Error(errorDetail ? `Bakaláři: ${errorDetail}` : `Bakaláři API error: ${response.statusText} (${response.status})`);
    }

    if (!skipOutageFlag) {
      this.setServerOutage(false, '');
    }
    this.setSessionExpired(false);
    return this.parseBody<T>(response, asBlob);
  }


  private getSluzbyUrl(path: string): string {
    const targetUrl = `https://sluzby.bakalari.cz${path}`;
    if (this.corsProxyUrl) {
      return `${this.corsProxyUrl}${encodeURIComponent(targetUrl)}`;
    }
    // When running on web (not native Capacitor), always use proxy to avoid CORS
    const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (!isNative) {
      return `/api-sluzby${path}`;
    }
    return targetUrl;
  }

  // School directory search
  public async searchMunicipalities(): Promise<Municipality[]> {
    try {
      const url = this.getSluzbyUrl('/api/v1/municipality');
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error('Municipality fetch failed');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
      return DEFAULT_MUNICIPALITIES;
    } catch {
      return DEFAULT_MUNICIPALITIES;
    }
  }

  public async getSchoolsByMunicipality(municipality: string): Promise<SchoolInfo[]> {
    try {
      const encoded = encodeURIComponent(municipality);
      const url = this.getSluzbyUrl(`/api/v1/municipality/${encoded}`);
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error('Schools fetch failed');
      const data = await res.json();
      if (data && Array.isArray(data.schools) && data.schools.length > 0) {
        rememberDirectorySchools(data.schools.map((school: SchoolInfo) => ({ ...school, schoolUrl: normalizeSchoolUrl(school.schoolUrl) })));
        return data.schools;
      }
      return MOCK_POPULAR_SCHOOLS.filter(s => 
        s.name.toLowerCase().includes(municipality.toLowerCase()) || 
        municipality.length <= 2
      );
    } catch {
      return MOCK_POPULAR_SCHOOLS.filter(s => 
        s.name.toLowerCase().includes(municipality.toLowerCase()) || 
        municipality.length <= 2
      );
    }
  }

  // Authentication
  public async login(schoolUrl: string, username: string, password: string): Promise<AuthTokens> {
    const cleanUrl = normalizeSchoolUrl(schoolUrl);
    if (!cleanUrl) {
      throw new Error('Zadejte platnou adresu školy (např. https://skola.bakalari.cz)');
    }

    if (username === 'demo' || username === 'student') {
      const mockTokens: AuthTokens = {
        accessToken: 'mock-access-token-demo',
        refreshToken: 'mock-refresh-token-demo',
        expiresIn: 3600,
        tokenType: 'Bearer',
        userId: 'STU-2024-8841',
        schoolUrl: cleanUrl,
        obtainedAt: Date.now(),
      };
      this.setTokens(mockTokens);
      return mockTokens;
    }

    const body = new URLSearchParams({
      client_id: BAKALARI_CLIENT_ID,
      grant_type: 'password',
      username: username.trim(),
      password: password,
    });

    let response: Response | null = null;

    try {
      const url = this.getUrl(cleanUrl, '/api/login');
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
          ...await this.schoolProxyHeaders(cleanUrl),
        },
        body: body.toString(),
      });
    } catch (err: any) {
      throw new Error('Nelze se spojit se serverem školy. Server má možná výpadek, nebo zkontrolujte připojení k internetu.');
    }

    if (!response || !response.ok) {
      const status = response?.status;

      if (status === 503 || status === 502 || status === 504) {
        throw new Error('Přihlášení se nezdařilo. Server školy nebo systém Bakaláři je momentálně nedostupný (výpadek systému). Zkuste to prosím za chvíli, nebo nahlaste chybu, pokud se to děje opakovaně.');
      }

      if (status === 500) {
        throw new Error('Server školy vrátil vnitřní chybu (500). Zkuste to prosím za chvíli, nebo nahlaste chybu, pokud se to děje opakovaně.');
      }

      if (status === 404) {
        throw new Error('Na zadané adrese nebyl nalezen systém Bakaláři (404). Zkontrolujte adresu školy.');
      }

      let errorMsg = 'Neplatné přihlašovací jméno nebo heslo.';
      try {
        const err = await response.json();
        errorMsg = err.error_description || err.error || err.message || errorMsg;
      } catch {
        if (response) {
          errorMsg = `Chyba přihlášení (${response.status}). Zkontrolujte přihlašovací údaje nebo to zkuste za chvíli.`;
        }
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const tokens: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 3600,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
      userId: data['bak:UserId'] || data.userId || '',
      schoolUrl: cleanUrl,
      obtainedAt: Date.now(),
    };

    this.setTokens(tokens);
    return tokens;
  }

  public async refreshToken(): Promise<boolean> {
    if (!this.tokens || !this.tokens.refreshToken) return false;
    if (this.isMockMode) return true;

    // Mutex single-flight: if already refreshing, reuse in-flight promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        if (this.tokenStorage.refresh) {
          const { tokens: refreshed, rejected } = await this.tokenStorage.refresh(this.tokens!.refreshToken);
          if (!refreshed) {
            // Rejected means the server refused the token for good; anything else (offline, outage) may pass.
            if (rejected) this.setSessionExpired(true);
            return false;
          }
          this.tokens = refreshed;
          this.setSessionExpired(false);
          return true;
        }

        const url = this.getUrl(this.tokens!.schoolUrl, '/api/login');
        const body = new URLSearchParams({
          client_id: BAKALARI_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: this.tokens!.refreshToken!,
        });

        const schoolHeaders = await this.schoolProxyHeaders(this.tokens!.schoolUrl);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json',
              'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
              ...schoolHeaders,
            },
            body: body.toString(),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          console.warn('Refresh token failed with status:', response.status);
          if (response.status === 400 || response.status === 401) this.setSessionExpired(true);
          return false;
        }

        const data = await response.json();
        if (!data || !data.access_token) return false;

        this.tokens = {
          ...this.tokens!,
          accessToken: data.access_token,
          refreshToken: data.refresh_token || this.tokens!.refreshToken,
          expiresIn: data.expires_in || 3600,
          obtainedAt: Date.now(),
        };
        this.tokenStorage.save(this.tokens);
        this.setSessionExpired(false);
        return true;
      } catch (err) {
        // Parse errors from V8 quote part of the body, which here holds tokens: log the type only.
        console.error('Refresh token error:', err instanceof Error ? err.name : 'unknown error');
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }


  // Data Fetching Methods
  public async getUserProfile(): Promise<UserProfile> {
    if (this.isMockMode) return MOCK_USER;

    // Fallback extraction from JWT access token
    let jwtName = '';
    let jwtClass = '';
    let jwtRole = 'student';
    try {
      if (this.tokens?.accessToken) {
        const payloadStr = this.tokens.accessToken.split('.')[1];
        if (payloadStr) {
          const base64 = payloadStr.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = atob(base64);
          const payload = JSON.parse(decoded);
          const rawName = payload.name || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || '';
          const rawGiven = payload.given_name || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] || '';
          const rawFamily = payload.family_name || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] || '';
          const rawUnique = payload.unique_name || '';

          if (rawGiven && rawFamily) {
            jwtName = `${rawGiven} ${rawFamily}`.trim();
          } else if (rawName) {
            jwtName = rawName.split(',')[0].trim();
          } else if (rawUnique) {
            // Some tokens store the class code in unique_name.
            if (/^\d\.[A-Za-z]/i.test(rawUnique.trim())) {
              jwtClass = rawUnique.trim();
            } else {
              jwtName = rawUnique.trim();
            }
          }

          if (payload.class || payload.class_name || payload.classId) {
            jwtClass = payload.class || payload.class_name || payload.classId;
          }

          // Move a class code out of the name field.
          if (jwtName && /^\d\.[A-Za-z]/i.test(jwtName)) {
            if (!jwtClass) jwtClass = jwtName;
            jwtName = '';
          }

          jwtRole = payload.role || payload.typ || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || 'student';
        }
      }
    } catch (e) {
      console.warn('Failed to parse JWT for fallback user profile data:', e instanceof Error ? e.name : 'unknown error');
    }

    try {
      const data: any = await this.request('/api/3/user');
      const fullName = (data.FullName || data.Name || `${data.UserFirstName || ''} ${data.UserLastName || ''}`.trim() || jwtName || '').split(',')[0].trim();
      const resolvedClass = data.Class?.Abbrev || data.Class?.Name || data.Class || data.ClassName || jwtClass || '';
      
      let classTeacherName: string | undefined = undefined;
      let classTeacherId: string | undefined = undefined;
      const ct = data.ClassTeacher || data.Class?.Teacher || data.Class?.ClassTeacher || data.Teacher;
      if (ct) {
        if (typeof ct === 'string') {
          classTeacherName = ct;
        } else if (typeof ct === 'object') {
          classTeacherName = ct.DisplayName || ct.Name || `${ct.FirstName || ''} ${ct.LastName || ''}`.trim() || undefined;
          classTeacherId = ct.Code || ct.Id || undefined;
        }
      }

      const profile: UserProfile = {
        id: data.UserUID || data.Id || data.UserUid || this.tokens?.userId || 'unknown',
        name: fullName,
        userType: (data.UserType?.toLowerCase() || jwtRole.toLowerCase() || 'student') as 'teacher' | 'student' | 'parent',
        className: resolvedClass,
        schoolName: data.SchoolName || data.SchoolOrganizationName || this.tokens?.schoolUrl || 'Škola',
        schoolUrl: this.tokens?.schoolUrl || '',
        email: data.Email,
        classTeacherName,
        classTeacherId,
      };

      // Only save if valid name (not a class code)
      if (profile.name && !isClassLikeName(profile.name)) {
        localStorage.setItem('bakalari_user_profile', JSON.stringify(profile));
        localStorage.setItem('b_user_display_name', profile.name);
      }
      return profile;
    } catch (e) {
      console.warn('Failed to fetch user profile, checking cached profile:', e);

      const recoveredName = getSavedStudentName();
      let cachedProfile: Partial<UserProfile> = {};
      try {
        const cached = localStorage.getItem('bakalari_user_profile');
        if (cached) cachedProfile = JSON.parse(cached);
      } catch {}

      return {
        id: this.tokens?.userId || cachedProfile.id || 'student',
        name: recoveredName || cachedProfile.name || jwtName || '',
        userType: (jwtRole.toLowerCase() || cachedProfile.userType || 'student') as 'teacher' | 'student' | 'parent',
        className: cachedProfile.className || jwtClass || '',
        schoolName: cachedProfile.schoolName || this.tokens?.schoolUrl || 'Bakaláři škola',
        schoolUrl: this.tokens?.schoolUrl || '',
        classTeacherName: cachedProfile.classTeacherName,
        classTeacherId: cachedProfile.classTeacherId,
      };
    }
  }

  public async getMarks(): Promise<SubjectMarks[]> {
    if (this.isMockMode) return MOCK_SUBJECTS_MARKS;
    try {
      const data: any = await this.request('/api/3/marks');
      if (!data || !data.Subjects || !Array.isArray(data.Subjects)) return [];

      return data.Subjects.map((s: any) => ({
        subjectId: s.Subject?.Id || s.Subject?.Abbrev || 'SUBJ',
        subjectAbbrev: s.Subject?.Abbrev || s.Subject?.Name || 'PŘEDMĚT',
        subjectName: s.Subject?.Name || s.Subject?.Abbrev || 'Předmět',
        teacherName: s.Subject?.Teacher || '',
        averageText: s.AverageText || (typeof s.WeightedAverage === 'number' ? s.WeightedAverage.toFixed(2) : '-'),
        average: typeof s.WeightedAverage === 'number' ? s.WeightedAverage : (parseFloat(s.AverageText) || 0),
        temporaryMark: s.TemporaryMark,
        predictedMark: s.PredictedMark,
        marks: (s.Marks || []).map((m: any) => {
          const rawClassRank = m.ClassRankText ?? m.classRankText ?? m.ClassRank ?? m.classRank;
          const classRankText = typeof rawClassRank === 'string' && rawClassRank.trim().length > 0
            ? rawClassRank.trim()
            : undefined;

          return {
            id: m.Id || Math.random().toString(),
            markText: m.MarkText || m.Mark || '-',
            weight: typeof m.Weight === 'number' ? m.Weight : 1,
            subjectId: s.Subject?.Id || s.Subject?.Abbrev || 'SUBJ',
            subjectAbbrev: s.Subject?.Abbrev || s.Subject?.Name || '',
            subjectName: s.Subject?.Name || s.Subject?.Abbrev || '',
            caption: m.Caption || m.Theme || m.Description || 'Bez popisu',
            theme: m.Theme,
            markDate: m.MarkDate ? m.MarkDate.split('T')[0] : new Date().toISOString().split('T')[0],
            teacherName: m.TeacherName || s.Subject?.Teacher || '',
            isNew: Boolean(m.IsNew),
            classRankText,
          };
        }),
      }));
    } catch (e) {
      console.error('Failed to get marks:', e);
      throw e;
    }
  }

  public async getTimetable(date?: string, permanent: boolean = false): Promise<TimetableData> {
    if (this.isMockMode) {
      if (permanent) return MOCK_PERMANENT_TIMETABLE;
      if (date) {
        // Brief delay in mock mode so week transition animations/spinners can be appreciated
        await new Promise((resolve) => setTimeout(resolve, 250));
        const base = new Date(date);
        if (!isNaN(base.getTime())) {
          return {
            ...MOCK_TIMETABLE,
            days: MOCK_TIMETABLE.days.map((d, i) => {
              const target = new Date(base);
              target.setDate(base.getDate() + i);
              const y = target.getFullYear();
              const m = String(target.getMonth() + 1).padStart(2, '0');
              const dayNum = String(target.getDate()).padStart(2, '0');
              const dateStr = `${y}-${m}-${dayNum}`;
              return {
                ...d,
                date: dateStr,
              };
            }),
          };
        }
      }
      return MOCK_TIMETABLE;
    }
    try {
      const endpoint = permanent 
        ? '/api/3/timetable/permanent' 
        : `/api/3/timetable/actual${date ? `?date=${date}` : ''}`;
      const data: any = await this.request(endpoint);
      if (!data) return { hours: [], days: [] };

      // Build dictionary maps for v3 schema (Root Subjects, Teachers, Rooms, Groups)
      const subjectsMap = new Map<string, { abbrev: string; name: string }>();
      (data.Subjects || []).forEach((s: any) => {
        if (s && s.Id) {
          subjectsMap.set(s.Id, { abbrev: s.Abbrev || s.Name || '', name: s.Name || s.Abbrev || '' });
        }
      });

      const teachersMap = new Map<string, { abbrev: string; name: string }>();
      (data.Teachers || []).forEach((t: any) => {
        if (t && t.Id) {
          teachersMap.set(t.Id, { abbrev: t.Abbrev || t.Name || '', name: t.Name || t.Abbrev || '' });
        }
      });

      const roomsMap = new Map<string, { abbrev: string; name: string }>();
      (data.Rooms || []).forEach((r: any) => {
        if (r && r.Id) {
          roomsMap.set(r.Id, { abbrev: r.Abbrev || r.Name || '', name: r.Name || r.Abbrev || '' });
        }
      });

      const groupsMap = new Map<string, { abbrev: string; name: string }>();
      (data.Groups || []).forEach((g: any) => {
        if (g && g.Id) {
          groupsMap.set(g.Id, { abbrev: g.Abbrev || g.Name || '', name: g.Name || g.Abbrev || '' });
        }
      });

      const cyclesMap = new Map<string, { abbrev: string; name: string }>();
      (data.Cycles || []).forEach((c: any) => {
        if (c && c.Id) {
          cyclesMap.set(c.Id, { abbrev: c.Abbrev || c.Name || '', name: c.Name || c.Abbrev || '' });
        }
      });

      const classesMap = new Map<string, { abbrev: string; name: string }>();
      (data.Classes || []).forEach((cl: any) => {
        if (cl && cl.Id) {
          classesMap.set(cl.Id, { abbrev: cl.Abbrev || cl.Name || '', name: cl.Name || cl.Abbrev || '' });
        }
      });
      const rootClass = (data.Classes && data.Classes[0]) ? (data.Classes[0].Abbrev || data.Classes[0].Name || '') : '';

      const formatHourTime = (t?: string) => {
        if (!t) return '';
        const match = String(t).trim().match(/(?:^|T|\s)(\d{1,2}):(\d{2})/);
        if (!match) return t;
        return `${match[1].padStart(2, '0')}:${match[2]}`;
      };

      const hours = (data.Hours && data.Hours.length > 0)
        ? data.Hours.map((h: any) => ({
            id: h.Id,
            caption: h.Caption || String(h.Id),
            beginTime: formatHourTime(h.BeginTime),
            endTime: formatHourTime(h.EndTime),
          }))
        : [
            { id: 1, caption: '1', beginTime: '08:00', endTime: '08:45' },
            { id: 2, caption: '2', beginTime: '08:55', endTime: '09:40' },
            { id: 3, caption: '3', beginTime: '10:00', endTime: '10:45' },
            { id: 4, caption: '4', beginTime: '10:55', endTime: '11:40' },
            { id: 5, caption: '5', beginTime: '11:50', endTime: '12:35' },
            { id: 6, caption: '6', beginTime: '12:45', endTime: '13:30' },
            { id: 7, caption: '7', beginTime: '13:40', endTime: '14:25' },
            { id: 8, caption: '8', beginTime: '14:35', endTime: '15:20' },
          ];

      const days = (data.Days || []).map((d: any) => {
        return {
          dayOfWeek: d.DayOfWeek,
          dayOfWeekName: d.DayOfWeekName || getDayName(d.DayOfWeek),
          date: permanent ? '' : (d.Date ? d.Date.split('T')[0] : ''),
          dayDescription: d.DayDescription || '',
          dayType: d.DayType || (d.Type ? String(d.Type) : undefined) || 'WorkDay',
          atoms: (d.Atoms || [])
          // Drop placeholder atoms for removed lessons that carry no subject
          // (e.g. "Vyjmuto z rozvrhu"): the official app renders nothing for them.
          .filter((a: any) => a.SubjectId || a.Change?.TypeAbbrev)
          .map((a: any) => {
          const subjLookup = a.SubjectId ? subjectsMap.get(a.SubjectId) : undefined;
          const teacherLookup = (a.TeacherId || a.TeacherIds?.[0]) ? teachersMap.get(a.TeacherId || a.TeacherIds?.[0]) : undefined;
          const roomLookup = (a.RoomId || a.RoomIds?.[0]) ? roomsMap.get(a.RoomId || a.RoomIds?.[0]) : undefined;
          const groupLookup = (a.GroupIds && a.GroupIds[0]) ? groupsMap.get(a.GroupIds[0]) : undefined;
          const classLookup = (a.ClassId || a.ClassIds?.[0]) ? classesMap.get(a.ClassId || a.ClassIds?.[0]) : undefined;
          const lessonClass = classLookup?.abbrev || classLookup?.name || rootClass;

          // Course/event atoms (e.g. language course week "kurz") carry no subject;
          // the display label lives in the Change (TypeAbbrev/TypeName).
          const isCourseAtom = !a.SubjectId && Boolean(a.Change?.TypeAbbrev);

          const subjectAbbrev = isCourseAtom
            ? (a.Change.TypeAbbrev || a.Change.TypeName || '')
            : (a.SubjectAbbrev || subjLookup?.abbrev || a.SubjectName || subjLookup?.name || a.SubjectId || '');
          const subjectName = isCourseAtom
            ? (a.Change.TypeName || a.Change.TypeAbbrev || '')
            : (a.SubjectName || subjLookup?.name || a.SubjectAbbrev || subjLookup?.abbrev || subjectAbbrev || '');
          const teacherName = a.TeacherName || teacherLookup?.name || teacherLookup?.abbrev || '';
          const teacherAbbrev = a.TeacherAbbrev || teacherLookup?.abbrev || '';
          const roomAbbrev = a.RoomAbbrev || roomLookup?.abbrev || a.RoomId || '';
          const roomId = a.RoomId || roomLookup?.abbrev || '';
          const rawGroup = a.Group || (groupLookup ? groupLookup.abbrev : '');
          const group = cleanLessonGroup(rawGroup, lessonClass);

          // Resolve cycle (odd / even / both)
          const rawCycleIds: string[] = a.CycleIds || (a.CycleId ? [a.CycleId] : []);
          let cycle: 'odd' | 'even' | 'both' = 'both';

          if (rawCycleIds.length > 0 && cyclesMap.size > 0) {
            const resolvedCycles = rawCycleIds.map((id) => cyclesMap.get(id)).filter(Boolean);
            const hasOdd = resolvedCycles.some((c) => {
              const s = `${c?.name || ''} ${c?.abbrev || ''}`.toLowerCase();
              return s.includes('lich') || s === 'l' || s === '1' || s.includes('týden 1') || s.includes('tyden 1');
            });
            const hasEven = resolvedCycles.some((c) => {
              const s = `${c?.name || ''} ${c?.abbrev || ''}`.toLowerCase();
              return s.includes('sud') || s === 's' || s === '2' || s.includes('týden 2') || s.includes('tyden 2');
            });
            if (hasOdd && !hasEven) cycle = 'odd';
            else if (hasEven && !hasOdd) cycle = 'even';
          } else if (rawCycleIds.length > 0) {
            const hasOdd = rawCycleIds.some((id) => {
              const s = String(id).toLowerCase().trim();
              return s === '1' || s === 'l' || s.includes('lich');
            });
            const hasEven = rawCycleIds.some((id) => {
              const s = String(id).toLowerCase().trim();
              return s === '2' || s === 's' || s.includes('sud');
            });
            if (hasOdd && !hasEven) cycle = 'odd';
            else if (hasEven && !hasOdd) cycle = 'even';
          } else {
            const textToScan = `${group} ${a.Theme || ''} ${subjectName} ${subjectAbbrev}`.toLowerCase();
            const isOdd = /\b(lich[ýé]|lich|odd)\b|\((?:l|1)\)|-(?:l|1)\b/i.test(textToScan);
            const isEven = /\b(sud[ýé]|sud|even)\b|\((?:s|2)\)|-(?:s|2)\b/i.test(textToScan);
            if (isOdd && !isEven) cycle = 'odd';
            else if (isEven && !isOdd) cycle = 'even';
          }

          return {
            id: a.Id || Math.random().toString(),
            hourId: a.HourId,
            subjectId: isCourseAtom ? '' : (a.SubjectId || subjectAbbrev),
            subjectAbbrev: subjectAbbrev,
            subjectName: subjectName,
            teacherName: teacherName,
            teacherAbbrev: teacherAbbrev,
            roomId: roomId,
            roomAbbrev: roomAbbrev,
            group: group,
            theme: a.Theme || '',
            cycle: cycle,
            cycleIds: rawCycleIds,
            hasChange: Boolean(a.Change),
            change: a.Change ? (() => {
              const rawType = String(a.Change.ChangeType || a.Change.TypeName || '').toLowerCase();
              const rawDesc = String(a.Change.Description || '').toLowerCase();
              const fullSummary = `${rawType} ${rawDesc}`;

              let normChangeType: LessonChange['changeType'] = 'Substitution';
              if (
                rawType === 'canceled' ||
                rawType === 'removed' ||
                fullSummary.includes('cancel') ||
                fullSummary.includes('odpad') ||
                fullSummary.includes('vyjmut') ||
                fullSummary.includes('removed')
              ) {
                normChangeType = 'Canceled';
              } else if (
                rawType === 'added' ||
                fullSummary.includes('added') ||
                fullSummary.includes('přidán') ||
                fullSummary.includes('pridan') ||
                fullSummary.includes('navíc') ||
                fullSummary.includes('navic')
              ) {
                normChangeType = 'Added';
              } else if (
                rawType === 'roomchanged' ||
                fullSummary.includes('room') ||
                fullSummary.includes('místnost') ||
                fullSummary.includes('mistnost') ||
                fullSummary.includes('učebn') ||
                fullSummary.includes('ucebn') ||
                fullSummary.includes('přesun') ||
                fullSummary.includes('presun')
              ) {
                normChangeType = 'RoomChanged';
              } else if (
                rawType === 'substitution' ||
                fullSummary.includes('substitut') ||
                fullSummary.includes('supl')
              ) {
                normChangeType = 'Substitution';
              }

              return {
                changeType: normChangeType,
                description: a.Change.Description || '',
                typeName: a.Change.TypeName || a.Change.ChangeType || (normChangeType === 'Added' ? 'Přidáno do rozvrhu' : 'Změna'),
                time: a.Change.Time || undefined,
                typeAbbrev: a.Change.TypeAbbrev || undefined,
                substituteTeacher: (a.Change as Record<string, unknown>).TeacherName
                  ? String((a.Change as Record<string, unknown>).TeacherName)
                  : (a.Change.Description || '').match(/Suplov(?:ání|uje):\s*([^,]+)/i)?.[1]?.trim()
                    || (a.Change.Description || '').match(/Supluje\s+(.+?)\s+za\b/i)?.[1]?.trim()
                    || undefined,
              };
            })() : null,
          };
        }),
      };
    });

      // Ensure at least Monday to Friday exist if days list is empty
      if (days.length === 0) {
        const baseDate = date ? new Date(date) : null;
        for (let dow = 1; dow <= 5; dow++) {
          let dateStr = '';
          if (baseDate && !isNaN(baseDate.getTime())) {
            const d = new Date(baseDate);
            d.setDate(baseDate.getDate() + (dow - 1));
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dayNum = String(d.getDate()).padStart(2, '0');
            dateStr = `${y}-${m}-${dayNum}`;
          }
          days.push({
            dayOfWeek: dow,
            dayOfWeekName: getDayName(dow),
            date: dateStr,
            dayDescription: '',
            dayType: 'WorkDay',
            atoms: [],
          });
        }
      }

      const teachers = (data.Teachers || [])
        .map((t: any) => ({
          id: t.Id || '',
          name: t.Name || t.Abbrev || '',
          abbrev: t.Abbrev || '',
        }))
        .filter((t: any) => t.name);

      const cycles = (data.Cycles || []).map((c: any) => ({
        id: c.Id || '',
        name: c.Name || c.Caption || '',
        abbrev: c.Abbrev || '',
      }));

      return { hours, days, teachers, cycles };
    } catch (e) {
      console.error('Failed to get timetable:', e);
      throw e;
    }
  }

  /** Fetches bytes for an image preview or a browser download. Android saves files through PrehledNative. */
  public async downloadAttachmentBlob(id: string): Promise<Blob> {
    if (this.isMockMode) {
      return new Blob(['Demo attachment'], { type: 'text/plain' });
    }
    return this.request<Blob>(`/api/3/komens/attachment/${encodeURIComponent(id)}`, {
      asBlob: true,
      headers: { Accept: '*/*' },
    });
  }

  public async getHomeworks(): Promise<Homework[]> {
    if (this.isMockMode) return MOCK_HOMEWORKS;
    try {
      const today = toIsoDate(new Date());
      const range = new URLSearchParams({ from: shiftIsoDate(today, -365), to: shiftIsoDate(today, 90) });
      const data: any = await this.request(`/api/3/homeworks?${range}`);
      if (!Array.isArray(data?.Homeworks)) throw new Error('Invalid homework response from Bakaláři API');

      return data.Homeworks.map((h: any) => {
        const attachments = parseAttachments(h.Attachments);
        return {
          id: h.ID || h.Id || Math.random().toString(),
          subjectId: h.Subject?.Id || '',
          subjectAbbrev: h.Subject?.Abbrev || h.Subject?.Name || '',
          subjectName: h.Subject?.Name || h.Subject?.Abbrev || '',
          teacherName: h.Teacher?.Name || h.Teacher?.Abbrev || '',
          content: h.Content || '',
          date: h.DateStart ? h.DateStart.split('T')[0] : '',
          deadline: h.DateEnd ? h.DateEnd.split('T')[0] : '',
          done: Boolean(h.Done || h.Finished),
          closed: h.Closed === true,
          attachments,
          attachmentName: attachments[0]?.name ?? h.AttachmentName,
        };
      });
    } catch (e) {
      console.error('Failed to get homeworks:', e);
      throw e;
    }
  }

  public async getMessages(): Promise<KomensMessage[]> {
    if (this.isMockMode) return sortByDateDesc(MOCK_MESSAGES);
    try {
      // Komens message endpoints require POST with an (empty) JSON filter body.
      const komensOptions: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      };

      const fetchKomens = async (path: string) => {
        try {
          return await this.request(path, komensOptions);
        } catch (e1) {
          try {
            return await this.request(path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: '',
            });
          } catch (e2) {
            return await this.request(path, { method: 'GET' });
          }
        }
      };

      let receivedErr: any = null;
      let noticeboardErr: any = null;
      let sentErr: any = null;

      const [received, noticeboard, sent]: any[] = await Promise.all([
        fetchKomens('/api/3/komens/messages/received').catch((e) => {
          receivedErr = e;
          return null;
        }),
        fetchKomens('/api/3/komens/messages/noticeboard').catch((e) => {
          noticeboardErr = e;
          return null;
        }),
        fetchKomens('/api/3/komens/messages/sent').catch((e) => {
          sentErr = e;
          return null;
        }),
        this.teachersCache.size === 0 ? this.getTeachers().catch(() => []) : Promise.resolve([]),
      ]);

      // If all three message endpoints failed or if received failed due to outage/network:
      if (!received && !noticeboard && !sent) {
        throw receivedErr || noticeboardErr || sentErr || new Error('Nepodařilo se načíst zprávy Komens');
      }

      const extractMessages = (data: any): any[] => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.Messages)) return data.Messages;
        if (Array.isArray(data.messages)) return data.messages;
        if (Array.isArray(data.Items)) return data.Items;
        if (Array.isArray(data.items)) return data.items;
        return [];
      };

      const extractPersons = (data: any): any[] => {
        if (!data || typeof data !== 'object') return [];
        return [
          ...(Array.isArray(data.Persons) ? data.Persons : (Array.isArray(data.persons) ? data.persons : [])),
          ...(Array.isArray(data.Senders) ? data.Senders : (Array.isArray(data.senders) ? data.senders : [])),
          ...(Array.isArray(data.Teachers) ? data.Teachers : (Array.isArray(data.teachers) ? data.teachers : [])),
        ];
      };

      // Build unified lookup map for sender/person resolution from Persons, Senders, Teachers in responses
      const personsMap = new Map<string, { name: string; role?: string }>();

      const rawPersons = [
        ...extractPersons(received),
        ...extractPersons(noticeboard),
        ...extractPersons(sent),
      ];

      rawPersons.forEach((p: any) => {
        const pName = [p.Degree, p.FirstName, p.LastName, p.DegreeBehind].filter(Boolean).join(' ').trim() ||
          p.FullName || p.Name || p.TeacherName || '';
        const pRole = p.Role || p.TypeName || p.UserType || p.Type;
        if (pName) {
          if (p.Id) personsMap.set(p.Id, { name: pName, role: pRole });
          if (p.PersonId) personsMap.set(p.PersonId, { name: pName, role: pRole });
          if (p.TeacherId) personsMap.set(p.TeacherId, { name: pName, role: pRole });
        }
      });

      // Populate from teachersCache as well
      this.teachersCache.forEach((t, id) => {
        if (!personsMap.has(id)) {
          personsMap.set(id, { name: t.name, role: 'Vyučující' });
        }
      });

      const resolveSender = (m: any, defaultFallbackName: string, defaultRole?: string) => {
        let senderId = '';
        let senderName = '';
        let senderRole = '';

        // 1. Check m.Sender if it is an object
        if (m.Sender && typeof m.Sender === 'object') {
          senderId = m.Sender.Id || m.Sender.PersonId || m.Sender.TeacherId || '';
          senderName = [m.Sender.Degree, m.Sender.FirstName, m.Sender.LastName, m.Sender.DegreeBehind].filter(Boolean).join(' ').trim() ||
            m.Sender.Name || m.Sender.FullName || m.Sender.TeacherName || m.Sender.DisplayName || '';
          senderRole = m.Sender.Role || m.Sender.TypeName || m.Sender.Type || m.Sender.UserType || '';
        } else if (typeof m.Sender === 'string' && m.Sender.trim()) {
          const s = m.Sender.trim();
          if (personsMap.has(s)) {
            senderId = s;
            senderName = personsMap.get(s)!.name;
            senderRole = personsMap.get(s)!.role || '';
          } else if (s.length > 8 || /\s/.test(s) || /^(?:Mgr|Ing|PhDr|RNDr|doc|prof|Bc)\.?/i.test(s)) {
            senderName = s;
          } else {
            senderId = s;
          }
        }

        // 2. Check direct properties if senderName is still not found
        if (!senderName) {
          senderName = m.SenderName ||
            m.RelevantName ||
            m.TeacherName ||
            (m.Teacher && typeof m.Teacher === 'object' ? (m.Teacher.Name || m.Teacher.FullName) : (typeof m.Teacher === 'string' ? m.Teacher : '')) ||
            (m.Author && typeof m.Author === 'object' ? (m.Author.Name || m.Author.FullName) : (typeof m.Author === 'string' ? m.Author : '')) ||
            (m.From && typeof m.From === 'object' ? (m.From.Name || m.From.FullName) : (typeof m.From === 'string' ? m.From : '')) ||
            '';
        }

        // 3. Check direct senderId properties if senderId is still empty
        if (!senderId) {
          senderId = m.SenderId || m.TeacherId || m.PersonId || m.AuthorId || '';
        }

        // 4. Look up in personsMap if senderName is missing or equals ID
        if ((!senderName || senderName === senderId) && senderId && personsMap.has(senderId)) {
          const match = personsMap.get(senderId)!;
          senderName = match.name;
          if (!senderRole) senderRole = match.role || '';
        }

        // 5. Determine role if not set
        if (!senderRole) {
          const rawRole = m.RelevantPersonType || m.SenderType || m.UserType || defaultRole || '';
          if (rawRole === 'teacher' || rawRole === 'učitel') senderRole = 'Vyučující';
          else if (rawRole === 'administrator' || rawRole === 'vedení') senderRole = 'Vedení školy';
          else if (rawRole === 'student' || rawRole === 'žák') senderRole = 'Student';
          else if (rawRole === 'parent' || rawRole === 'rodič') senderRole = 'Zákonný zástupce';
          else senderRole = rawRole;
        }

        if (senderRole.toLowerCase() === 'teacher') senderRole = 'Vyučující';

        // 6. Clean up or fall back
        if (!senderName || senderName.trim().toLowerCase() === 'vyučující') {
          // If we had a match in personsMap for senderId, prefer that
          if (senderId && personsMap.has(senderId)) {
            senderName = personsMap.get(senderId)!.name;
          } else {
            senderName = senderName || defaultFallbackName;
          }
        }

        return {
          id: senderId,
          name: senderName.trim(),
          role: senderRole.trim() || undefined,
        };
      };

      const noticeboardList = extractMessages(noticeboard);
      const receivedList = extractMessages(received);
      const sentList = extractMessages(sent);

      // Cache student name if found in received messages
      receivedList.forEach((m: any) => {
        const rel = m.RelevantName || m.StudentName || m.Student?.Name;
        if (
          rel &&
          typeof rel === 'string' &&
          rel.trim() &&
          !isClassLikeName(rel) &&
          !rel.includes('Mgr.') &&
          !rel.includes('Ing.') &&
          !rel.includes('PhDr.') &&
          !rel.includes('RNDr.')
        ) {
          try {
            if (!localStorage.getItem('b_student_name_cache')) {
              localStorage.setItem('b_student_name_cache', rel.trim());
            }
            if (!localStorage.getItem('b_user_display_name')) {
              localStorage.setItem('b_user_display_name', rel.trim());
            }
          } catch {}
        }
      });

      const all: KomensMessage[] = [];

      noticeboardList.forEach((m: any) => {
        const canConfirm = Boolean(m.CanConfirm === true || m.CanConfirm === 1 || m.CanConfirm === 'true');
        const isToConfirmLifetime = typeof m.LifeTime === 'string' && m.LifeTime.toLowerCase().includes('confirm');
        const isExplicitReq = Boolean(
          (m.RequireConfirmation ??
          m.RequiresConfirmation ??
          m.NeedConfirmation ??
          m.NeedsConfirmation ??
          m.ShowConfirmation ??
          m.ConfirmationRequired ??
          m.Confirmation ??
          m.VyzadovatPotvrzeni ??
          m.MustConfirm) ||
          (typeof m.Type === 'string' && m.Type.toUpperCase().includes('CONFIRM')) ||
          (typeof m.MessageType === 'string' && m.MessageType.toUpperCase().includes('CONFIRM'))
        );
        const requireConfirmation = Boolean(canConfirm || isToConfirmLifetime || isExplicitReq);

        const hasConfirmedFlag = Boolean(
          m.Confirmed === true ||
          m.Confirmed === 1 ||
          m.Confirmed === 'true' ||
          m.Confirmed === 'True' ||
          m.IsConfirmed === true ||
          m.IsConfirmed === 1 ||
          m.IsConfirmed === 'true' ||
          m.ConfirmedDate ||
          m.ConfirmationDate ||
          m.ConfirmDate ||
          m.DateConfirmed ||
          m.ReadConfirmed ||
          m.IsReadConfirmed ||
          m.Potvrzeno ||
          m.Precteno
        );
        const confirmed = Boolean(hasConfirmedFlag || (requireConfirmation && !canConfirm));

        const rawContent = m.Text || m.Content || '';
        all.push({
          id: m.Id || Math.random().toString(),
          type: 'noticeboard',
          title: m.Title || 'Nástěnka',
          text: cleanHtmlToPlainText(rawContent),
          html: hasHtmlMarkup(rawContent) ? sanitizeMessageHtml(rawContent) : undefined,
          sender: resolveSender(m, 'Ředitelství', 'Nástěnka'),
          date: m.SentDate || m.Date || new Date().toISOString(),
          unread: isMessageUnread(m),
          canConfirm,
          requireConfirmation,
          confirmed,
          confirmedDate: m.ConfirmedDate || m.ConfirmationDate || m.ConfirmDate || undefined,
          attachments: parseAttachments(m.Attachments),
        });
      });

      receivedList.forEach((m: any) => {
        const canConfirm = Boolean(m.CanConfirm === true || m.CanConfirm === 1 || m.CanConfirm === 'true');
        const isToConfirmLifetime = typeof m.LifeTime === 'string' && m.LifeTime.toLowerCase().includes('confirm');
        const isExplicitReq = Boolean(
          (m.RequireConfirmation ??
          m.RequiresConfirmation ??
          m.NeedConfirmation ??
          m.NeedsConfirmation ??
          m.ShowConfirmation ??
          m.ConfirmationRequired ??
          m.Confirmation ??
          m.VyzadovatPotvrzeni ??
          m.MustConfirm) ||
          (typeof m.Type === 'string' && m.Type.toUpperCase().includes('CONFIRM')) ||
          (typeof m.MessageType === 'string' && m.MessageType.toUpperCase().includes('CONFIRM'))
        );
        const requireConfirmation = Boolean(canConfirm || isToConfirmLifetime || isExplicitReq);

        const hasConfirmedFlag = Boolean(
          m.Confirmed === true ||
          m.Confirmed === 1 ||
          m.Confirmed === 'true' ||
          m.Confirmed === 'True' ||
          m.IsConfirmed === true ||
          m.IsConfirmed === 1 ||
          m.IsConfirmed === 'true' ||
          m.ConfirmedDate ||
          m.ConfirmationDate ||
          m.ConfirmDate ||
          m.DateConfirmed ||
          m.ReadConfirmed ||
          m.IsReadConfirmed ||
          m.Potvrzeno ||
          m.Precteno
        );
        const confirmed = Boolean(hasConfirmedFlag || (requireConfirmation && !canConfirm));

        const rawContent = m.Text || m.Content || '';
        all.push({
          id: m.Id || Math.random().toString(),
          type: 'received',
          title: m.Title || 'Zpráva',
          text: cleanHtmlToPlainText(rawContent),
          html: hasHtmlMarkup(rawContent) ? sanitizeMessageHtml(rawContent) : undefined,
          sender: resolveSender(m, 'Vyučující', 'Vyučující'),
          date: m.SentDate || m.Date || new Date().toISOString(),
          unread: isMessageUnread(m),
          canConfirm,
          requireConfirmation,
          confirmed,
          confirmedDate: m.ConfirmedDate || m.ConfirmedTime || m.ConfirmationDate || m.ConfirmDate || undefined,
          attachments: parseAttachments(m.Attachments),
        });
      });

      // Proactively fetch details for unconfirmed sent messages that require confirmation
      // so we get authoritative, real-time confirmation info directly from Bakalari
      const sentDetailsMap = new Map<string, any>();
      if (!this.isMockMode && Array.isArray(sentList) && sentList.length > 0) {
        const candidateIds = sentList
          .filter((m: any) => {
            const isToConfirm = typeof m.LifeTime === 'string' && m.LifeTime.toLowerCase().includes('confirm');
            const req = Boolean(isToConfirm || m.RequireConfirmation || m.CanConfirm);
            const isConf = Boolean(m.Confirmed === true || m.Read === true);
            return req && !isConf && m.Id;
          })
          .map((m: any) => m.Id)
          .slice(0, 5);

        if (candidateIds.length > 0) {
          try {
            const detailResults = await Promise.allSettled(
              candidateIds.map((id: string) => this.getSentMessageDetail(id))
            );
            detailResults.forEach((res, idx) => {
              if (res.status === 'fulfilled' && res.value) {
                sentDetailsMap.set(candidateIds[idx], res.value);
              }
            });
          } catch {}
        }
      }

      sentList.forEach((m: any) => {
        const detail = m.Id ? sentDetailsMap.get(m.Id) : undefined;
        const msgSource = detail || m;

        const isLifeTimeToConfirm = typeof msgSource.LifeTime === 'string' && (
          msgSource.LifeTime.toLowerCase().includes('confirm') ||
          msgSource.LifeTime === 'ToConfirm'
        );
        const requireConfirmation = Boolean(
          isLifeTimeToConfirm ||
          (msgSource.RequireConfirmation ??
          msgSource.RequiresConfirmation ??
          msgSource.NeedConfirmation ??
          msgSource.ShowConfirmation ??
          msgSource.ConfirmationRequired ??
          msgSource.Confirmation ??
          msgSource.VyzadovatPotvrzeni ??
          msgSource.IsConfirmationRequired ??
          msgSource.CanConfirm)
        );

        // Persons lookup from detail if available
        const personsMap = new Map<string, string>();
        if (Array.isArray(msgSource.Persons)) {
          msgSource.Persons.forEach((p: any) => {
            const name = [p.Degree, p.FirstName, p.LastName, p.DegreeBehind].filter(Boolean).join(' ').trim() ||
              p.FullName || p.Name || '';
            if (p.Id && name) personsMap.set(p.Id, name);
            if (p.PersonId && name) personsMap.set(p.PersonId, name);
          });
        }

        // Processed recipients (who actually confirmed)
        const processedList: any[] = Array.isArray(msgSource.RecipientsProcessed)
          ? msgSource.RecipientsProcessed
          : [];
        const processedIds = new Set(processedList.map((p: any) => p.RecipientId || p.Id).filter(Boolean));
        const processedDatesMap = new Map<string, string>();
        processedList.forEach((p: any) => {
          const id = p.RecipientId || p.Id;
          const dt = p.ActionDate || p.ConfirmedDate || p.Date;
          if (id && dt) processedDatesMap.set(id, dt);
        });

        // Bakalari API can store recipients in Recipients, Receivers, Receiver, Students, Users, Confirmations, Addressees
        const rawRecipientsList = Array.isArray(msgSource.Recipients) && msgSource.Recipients.length > 0
          ? msgSource.Recipients
          : Array.isArray(msgSource.Receivers) && msgSource.Receivers.length > 0
          ? msgSource.Receivers
          : Array.isArray(msgSource.Users) && msgSource.Users.length > 0
          ? msgSource.Users
          : Array.isArray(msgSource.Students) && msgSource.Students.length > 0
          ? msgSource.Students
          : Array.isArray(msgSource.Confirmations) && msgSource.Confirmations.length > 0
          ? msgSource.Confirmations
          : processedList.length > 0
          ? processedList
          : msgSource.Receiver
          ? [msgSource.Receiver]
          : msgSource.Recipient
          ? [msgSource.Recipient]
          : undefined;

        const recipients = Array.isArray(rawRecipientsList)
          ? rawRecipientsList.map((r: any) => {
              const recId = r.Id || r.RecipientId || r.Code || r.ReceiverId || r.StudentId || r.UserId;
              const isProcessed = recId ? processedIds.has(recId) : false;
              const isRecConfirmed = Boolean(
                isProcessed ||
                r.Confirmed === true ||
                r.Confirmed === 1 ||
                r.Confirmed === 'true' ||
                r.Confirmed === 'True' ||
                r.IsConfirmed === true ||
                r.IsConfirmed === 1 ||
                r.IsConfirmed === 'true' ||
                r.ConfirmedDate ||
                r.ConfirmationDate ||
                r.ConfirmDate ||
                r.DateConfirmed ||
                (r.Read && requireConfirmation) ||
                (r.IsRead && requireConfirmation) ||
                (r.ReadDate && requireConfirmation) ||
                (r.ReadTime && requireConfirmation) ||
                r.State === 'Confirmed' ||
                r.State === 'Read' ||
                r.Status === 'Confirmed' ||
                r.Status === 'Read' ||
                r.Potvrzeno ||
                r.Precteno
              );
              const recConfirmedDate = (recId ? processedDatesMap.get(recId) : undefined) ||
                r.ActionDate || r.ConfirmedDate || r.ConfirmationDate || r.ConfirmDate || r.DateConfirmed ||
                r.ReadDate || r.ReadTime || r.DatumPotvrzeni || r.DatumPrecteni || undefined;

              const resolvedName = (recId ? personsMap.get(recId) : undefined) ||
                r.Name || r.DisplayName || r.ReceiverName || r.FullName || r.Text || '';

              return {
                id: recId,
                name: resolvedName,
                confirmed: isRecConfirmed,
                confirmedDate: recConfirmedDate,
              };
            })
          : undefined;

        const anyRecConfirmed = Boolean(recipients && recipients.length > 0 && recipients.some((r: any) => r.confirmed));
        const allRecConfirmed = Boolean(recipients && recipients.length > 0 && recipients.every((r: any) => r.confirmed));
        const hasProcessedRecipients = processedList.length > 0;

        const confirmed = Boolean(
          msgSource.Confirmed === true ||
          msgSource.Confirmed === 1 ||
          msgSource.Confirmed === 'true' ||
          msgSource.Confirmed === 'True' ||
          msgSource.IsConfirmed === true ||
          msgSource.IsConfirmed === 1 ||
          msgSource.IsConfirmed === 'true' ||
          msgSource.ConfirmedDate ||
          msgSource.ConfirmationDate ||
          msgSource.ConfirmDate ||
          msgSource.DateConfirmed ||
          msgSource.ReadConfirmed ||
          msgSource.IsReadConfirmed ||
          (msgSource.Read === true && isLifeTimeToConfirm) ||
          (msgSource.IsRead === true && isLifeTimeToConfirm) ||
          hasProcessedRecipients ||
          (msgSource.ConfirmedCount != null && Number(msgSource.ConfirmedCount) > 0 && (!recipients || Number(msgSource.ConfirmedCount) >= recipients.length)) ||
          (msgSource.ReadCount != null && Number(msgSource.ReadCount) > 0 && (!recipients || Number(msgSource.ReadCount) >= recipients.length)) ||
          msgSource.Potvrzeno ||
          msgSource.Precteno ||
          allRecConfirmed ||
          (recipients && recipients.length === 1 && anyRecConfirmed)
        );

        const confirmedDate = msgSource.ConfirmedDate || msgSource.ConfirmationDate || msgSource.ConfirmDate ||
          msgSource.DateConfirmed || msgSource.ConfirmedTime || msgSource.ReadDate ||
          (processedList.length > 0 ? processedList[0].ActionDate : undefined) ||
          (recipients ? recipients.find((r: any) => r.confirmedDate)?.confirmedDate : undefined);

        const recipientName = msgSource.RelevantName || msgSource.RecipientName || msgSource.ReceiverName ||
          (recipients && recipients.length > 0 ? recipients.map((r: any) => r.name).filter(Boolean).join(', ') : '');

        const rawContent = msgSource.Text || msgSource.Content || m.Text || m.Content || '';
        all.push({
          id: msgSource.Id || m.Id || Math.random().toString(),
          type: 'sent',
          title: msgSource.Title || m.Title || 'Odeslaná zpráva',
          text: cleanHtmlToPlainText(rawContent),
          html: hasHtmlMarkup(rawContent) ? sanitizeMessageHtml(rawContent) : undefined,
          sender: { id: 'me', name: 'Já' },
          recipientName: recipientName || undefined,
          date: msgSource.SentDate || msgSource.Date || m.SentDate || m.Date || new Date().toISOString(),
          unread: false,
          requireConfirmation,
          confirmed,
          confirmedDate,
          recipients,
          attachments: parseAttachments(
            Array.isArray(msgSource.Attachments) && msgSource.Attachments.length > 0
              ? msgSource.Attachments
              : m.Attachments,
          ),
        });
      });

      return sortByDateDesc(all);
    } catch (e) {
      console.error('Failed to get messages:', e);
      throw e;
    }
  }

  public async getEvents(): Promise<SchoolEvent[]> {
    if (this.isMockMode) return groupConsecutiveEvents(MOCK_EVENTS);
    try {
      const data: any = await this.request('/api/3/events');
      if (!data || !data.Events || !Array.isArray(data.Events)) return [];

      // v3 events carry a Times[] array (multi-day events expand to one entry per day).
      const events: SchoolEvent[] = [];
      (data.Events as any[]).forEach((e: any) => {
        const times: any[] = Array.isArray(e.Times) && e.Times.length > 0 ? e.Times : [{}];
        times.forEach((tm: any) => {
          const date = (tm.StartTime || e.Date || '').split('T')[0] || '';
          const endDate = (tm.EndTime || e.EndDate || '').split('T')[0] || undefined;
          const startTime = tm.StartTime ? String(tm.StartTime).split('T')[1]?.substring(0, 5) : '';
          const endTime = tm.EndTime ? String(tm.EndTime).split('T')[1]?.substring(0, 5) : '';
          events.push({
            id: `${e.Id || Math.random().toString()}-${date}`,
            title: e.Title || e.Name || 'Událost',
            description: e.Description || e.Text || '',
            date: date,
            endDate: endDate && endDate !== date ? endDate : undefined,
            time: tm.WholeDay
              ? ''
              : (tm.IntervalStartTime && tm.IntervalEndTime
                  ? `${String(tm.IntervalStartTime).split('T')[1] || tm.IntervalStartTime} – ${String(tm.IntervalEndTime).split('T')[1] || tm.IntervalEndTime}`
                  : startTime && endTime
                    ? `${startTime} – ${endTime}`
                    : ''),
            location: e.Place || e.Location,
            organizer: e.Organizer,
            isPast: tm.EndTime ? new Date(tm.EndTime) < new Date() : false,
          });
        });
      });
      return groupConsecutiveEvents(events);
    } catch (e) {
      console.error('Failed to get events:', e);
      throw e;
    }
  }

  /** Keys start with the student id for exact answers and with `-` for the counter-based fallback. */
  private absenceHoursCache = new Map<string, DayHours>();
  private absenceWeekCache = new Map<string, any>();
  private lessonStudentId: { key: string; id: string } | null = null;

  /** Bakaláři's own app asks for lessons with the last 5 characters of `UserUID` as the student id. */
  private async getLessonStudentId(): Promise<string | null> {
    const key = this.tokens?.userId || '';
    if (this.lessonStudentId?.key === key) return this.lessonStudentId.id;
    try {
      const user = await this.request<any>('/api/3/user', { skipOutageFlag: true });
      const uid = String(user?.UserUID || '');
      if (uid.length < 5) return null;
      this.lessonStudentId = { key, id: uid.slice(-5) };
      return this.lessonStudentId.id;
    } catch (e) {
      console.warn('Student id for absence lessons not available', e);
      return null;
    }
  }

  private hourDefinitions: { key: string; hours: any[] } | null = null;

  /** The school's hour definitions (id, number shown to the student, start); the lesson answer refers to the id. */
  private async getHourDefinitions(): Promise<any[]> {
    const key = this.tokens?.userId || '';
    if (this.hourDefinitions?.key === key) return this.hourDefinitions.hours;
    try {
      const timetable = await this.request<any>('/api/3/timetable/permanent', { skipOutageFlag: true });
      const hours: any[] = Array.isArray(timetable?.Hours) ? timetable.Hours : [];
      if (hours.length > 0) this.hourDefinitions = { key, hours };
      return hours;
    } catch (e) {
      console.warn('Hour definitions for absence lessons not available', e);
      return [];
    }
  }

  /**
   * Asks for the lessons of the days in windows of at most a month (the server answers every day of
   * the range). Days the server does not answer for are left out of `result`.
   */
  private async resolveAbsenceHoursByLessons(
    studentId: string,
    hourDefinitions: any[],
    pending: Array<{ raw: any; date: string }>,
    result: Map<string, DayHours>,
  ): Promise<void> {
    const sorted = [...pending].sort((a, b) => a.date.localeCompare(b.date));
    const windows: Array<typeof sorted> = [];
    for (const day of sorted) {
      const current = windows[windows.length - 1];
      const spanDays = current ? (Date.parse(day.date) - Date.parse(current[0].date)) / 86_400_000 : Infinity;
      if (current && spanDays <= 31) current.push(day);
      else windows.push([day]);
    }

    const queue = [...windows];
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const from = next[0].date;
          const to = next[next.length - 1].date;
          try {
            const doc = await this.request<any>(
              `/api/3/timetable/student/${encodeURIComponent(studentId)}?fromDate=${from}&toDate=${to}`,
              { skipOutageFlag: true },
            );
            const byDate = hoursFromStudentTimetable(doc, hourDefinitions);
            for (const { raw, date } of next) {
              const found = byDate.get(date);
              if (!found) continue;
              const hours = checkedDayHours(raw, found);
              this.absenceHoursCache.set(`${studentId}|${date}|${JSON.stringify(raw)}`, hours);
              result.set(date, hours);
            }
          } catch (e) {
            console.warn('Absence lessons not loaded for', from, to, e);
          }
        }
      }),
    );
  }

  /**
   * The server lists absences per day only. The lessons come from the student's own timetable, which
   * marks the absence on every lesson. If that is not available, they are found by asking for one day
   * at a time (the per-subject part then names the subjects) and matching them with the day's
   * timetable. A day that cannot be resolved keeps its counters, so failures here never hide an absence.
   */
  private async resolveAbsenceHours(rawAbsences: any[]): Promise<Map<string, DayHours>> {
    const result = new Map<string, DayHours>();
    let days = rawAbsences
      .map((a) => ({ raw: a, date: typeof a?.Date === 'string' ? a.Date.split('T')[0] : '' }))
      .filter(({ raw, date }) => date && Object.values(raw).some((v) => typeof v === 'number' && v > 0));

    const studentId = await this.getLessonStudentId();
    if (studentId) {
      const pending: typeof days = [];
      for (const day of days) {
        const cached = this.absenceHoursCache.get(`${studentId}|${day.date}|${JSON.stringify(day.raw)}`);
        if (cached) result.set(day.date, cached);
        else pending.push(day);
      }
      if (pending.length > 0) {
        const hourDefinitions = await this.getHourDefinitions();
        if (hourDefinitions.length > 0) await this.resolveAbsenceHoursByLessons(studentId, hourDefinitions, pending, result);
      }
      days = pending.filter(({ date }) => !result.has(date));
    }

    const resolveDay = async ({ raw, date }: { raw: any; date: string }) => {
      const key = `-|${date}|${JSON.stringify(raw)}`;
      let hours = this.absenceHoursCache.get(key);
      if (!hours) {
        try {
          const week = weekStart(date);
          let timetable = this.absenceWeekCache.get(week);
          const [single, fetchedTimetable] = await Promise.all([
            this.request<any>(`/api/3/absence/student?from=${date}&to=${date}`, { skipOutageFlag: true }),
            timetable ? Promise.resolve(timetable) : this.request<any>(`/api/3/timetable/actual?date=${week}`, { skipOutageFlag: true }),
          ]);
          timetable = fetchedTimetable;
          this.absenceWeekCache.set(week, timetable);
          hours = resolveDayHours(raw, single?.AbsencesPerSubject || [], lessonsOfDay(timetable, date));
          this.absenceHoursCache.set(key, hours);
        } catch (e) {
          console.warn('Absence hours not resolved for', date, e);
          return;
        }
      }
      result.set(date, hours);
    };

    const queue = [...days];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await resolveDay(next);
      }),
    );
    return result;
  }

  public async getAbsence(): Promise<{ summary: AbsenceSummary; records: AbsenceRecord[] }> {
    if (this.isMockMode) {
      return { summary: MOCK_ABSENCE_SUMMARY, records: MOCK_ABSENCE_RECORDS };
    }
    try {
      const data: any = await this.request('/api/3/absence/student');
      if (!data) {
        return {
          summary: { excusedHours: 0, unexcusedHours: 0, lateArrivals: 0, schoolEvents: 0, percentage: 100 },
          records: [],
        };
      }

      const rawAbsences: any[] = Array.isArray(data.Absences)
        ? data.Absences
        : Array.isArray(data.Absence)
        ? data.Absence
        : [];

      const rawSubjects: any[] = Array.isArray(data.AbsencesPerSubject)
        ? data.AbsencesPerSubject
        : Array.isArray(data.Subjects)
        ? data.Subjects
        : [];

      let totalOk = 0;
      let totalMissed = 0;
      let totalUnsolved = 0;
      let totalLate = 0;
      let totalSoon = 0;
      let totalSchool = 0;
      let totalDistance = 0;

      rawAbsences.forEach((a: any) => {
        totalOk += counterOf(a, ['Ok', 'AOk']);
        totalMissed += counterOf(a, ['Missed', 'AMiss']);
        totalUnsolved += counterOf(a, ['Unsolved', 'A']);
        totalLate += counterOf(a, ['Late', 'ALate']);
        totalSoon += counterOf(a, ['Soon', 'ASoon']);
        totalSchool += counterOf(a, ['School', 'ASchool']);
        totalDistance += counterOf(a, ['DistanceTeaching', 'DistanceLearning']);
      });

      const excusedHours = data.ExcusedHours != null
        ? Number(data.ExcusedHours)
        : totalOk;

      const unexcusedHours = data.UnexcusedHours != null
        ? Number(data.UnexcusedHours)
        : (totalMissed + totalUnsolved);

      const lateArrivals = data.LateArrivals != null
        ? Number(data.LateArrivals)
        : (totalLate + totalSoon);

      const schoolEvents = data.SchoolEvents != null
        ? Number(data.SchoolEvents)
        : totalSchool;

      let totalLessonsCount = 0;
      let totalBaseMissed = 0;

      const subjects: AbsencePerSubjectItem[] = rawSubjects.map((s: any) => {
        const lessonsCount = Number(s.LessonsCount || s.Oduceno || 0);
        const base = Number(s.Base || s.AbsBase || s.Missed || 0);
        totalLessonsCount += lessonsCount;
        totalBaseMissed += base;
        const pct = lessonsCount > 0 ? Math.round((base / lessonsCount) * 1000) / 10 : 0;
        return {
          subjectName: s.SubjectName || s.Nazev || '',
          lessonsCount,
          base,
          late: Number(s.Late || s.AbsLate || 0),
          soon: Number(s.Soon || s.AbsSoon || 0),
          school: Number(s.School || s.AbsSchool || 0),
          distanceTeaching: Number(s.DistanceTeaching || 0),
          percentage: pct,
        };
      });

      let percentage = 100.0;
      if (data.Percentage != null) {
        percentage = Number(data.Percentage);
      } else if (totalLessonsCount > 0) {
        percentage = Math.max(0, Math.min(100, Math.round((1 - (totalBaseMissed / totalLessonsCount)) * 1000) / 10));
      }

      const threshold = data.PercentageThreshold != null ? Number(data.PercentageThreshold) : undefined;

      const records: AbsenceRecord[] = buildAbsenceRecords(rawAbsences, await this.resolveAbsenceHours(rawAbsences));

      return {
        summary: {
          excusedHours,
          unexcusedHours,
          lateArrivals,
          schoolEvents,
          percentage,
          threshold,
          subjects,
        },
        records,
      };
    } catch (e) {
      console.error('Failed to get absence:', e);
      throw e;
    }
  }

  public async getSubstitutions(): Promise<SubstitutionItem[]> {
    if (this.isMockMode) return MOCK_SUBSTITUTIONS;
    try {
      const data: any = await this.request('/api/3/substitutions');
      if (!data || !data.Changes || !Array.isArray(data.Changes)) return [];

      // v3 shape: { From, To, Changes: [{ Day, Hours, Time, ChangeType, TypeName, Description, ... }] }
      return data.Changes.map((c: any, idx: number) => {
        let changeType = c.TypeName || c.ChangeType || 'Suplování';
        const rawTypeLower = (c.ChangeType || c.TypeName || '').toLowerCase();
        const rawDescLower = (c.Description || '').toLowerCase();
        const full = `${rawTypeLower} ${rawDescLower}`;
        if (rawTypeLower === 'roomchanged' || full.includes('učebn') || full.includes('místnost') || full.includes('přesun')) changeType = 'Změna místnosti';
        else if (rawTypeLower === 'canceled' || full.includes('odpad') || full.includes('vyjmut')) changeType = 'Odpadlá hodina';
        else if (rawTypeLower === 'removed') changeType = 'Vyjmuto z rozvrhu';
        else if (rawTypeLower === 'added' || full.includes('přidán') || full.includes('pridan') || full.includes('navíc')) changeType = 'Přidáno do rozvrhu';
        else if (rawTypeLower === 'substitution' || full.includes('supl')) changeType = 'Suplování';

        return {
          id: c.Id || `sub-${idx}-${(c.Day || '').split('T')[0]}-${c.Hours || ''}`,
          date: c.Day ? c.Day.split('T')[0] : '',
          hour: c.Hours || c.Hour || '',
          period: c.Time || c.Period || '',
          className: c.Class || c.ClassName || '',
          subjectAbbrev: c.ChangeSubject?.Abbrev || c.ChangeSubject?.Name || c.SubjectAbbrev || '',
          teacher: c.ChangeSubject?.TeacherName || c.Teacher || '',
          substituteTeacher: c.SubstituteTeacher || '-',
          room: c.Room || c.ChangeSubject?.Room || '',
          changeType,
          description: c.Description || '',
        };
      });
    } catch (e) {
      console.error('Failed to get substitutions:', e);
      throw e;
    }
  }

  public async getSubjects(): Promise<SubjectDetail[]> {
    if (this.isMockMode) return MOCK_SUBJECTS_LIST;
    try {
      const data: any = await this.request('/api/3/subjects');
      if (!data || !data.Subjects || !Array.isArray(data.Subjects)) return [];

      return data.Subjects.map((s: any) => {
        const id = String(s.SubjectID || s.SubjectId || s.Id || s.SubjectAbbrev || s.Abbrev || '').trim();
        const abbrev = String(s.SubjectAbbrev || s.Abbrev || s.SubjectName || s.Name || '').trim();
        const name = String(s.SubjectName || s.Name || s.SubjectAbbrev || s.Abbrev || '').trim();
        const teacherId = s.TeacherID || s.TeacherId || s.Teacher?.Id;
        const teacherName = String(s.TeacherName || s.Teacher?.Name || (typeof s.Teacher === 'string' ? s.Teacher : '') || '').trim();
        const teacherAbbrev = String(s.TeacherAbbrev || s.Teacher?.Abbrev || '').trim();
        const teacherEmail = (s.TeacherEmail || s.Email || s.Teacher?.Email || '').trim() || undefined;
        const teacherPhone = (s.TeacherMobilePhone || s.TeacherSchoolPhone || s.TeacherPhone || s.Phone || '').trim() || undefined;
        const teacherWeb = (s.TeacherWeb || s.Web || '').trim() || undefined;
        const classroom = (s.Classroom || s.Room || s.RoomName || '').trim() || undefined;

        return {
          id: id || abbrev || name,
          abbrev: abbrev || name || 'PŘ',
          name: name || abbrev || 'Předmět',
          teacherId: teacherId ? String(teacherId) : undefined,
          teacherName,
          teacherAbbrev: teacherAbbrev || undefined,
          teacherEmail,
          teacherPhone,
          teacherWeb,
          classroom,
        };
      });
    } catch (e) {
      console.error('Failed to get subjects:', e);
      throw e;
    }
  }

  public async getTeachers(): Promise<{ id: string; name: string; abbrev?: string; email?: string }[]> {
    if (this.isMockMode) {
      return MOCK_SUBJECTS_LIST.map((s) => ({
        id: s.id,
        name: s.teacherName,
        email: s.teacherEmail,
        abbrev: s.abbrev,
      }));
    }
    try {
      const data: any = await this.request('/api/3/teachers');
      if (data && data.Teachers && Array.isArray(data.Teachers)) {
        const teachers = data.Teachers.map((t: any) => ({
          id: t.Id || '',
          name: t.Name || t.Abbrev || '',
          abbrev: t.Abbrev || '',
          email: t.Email || t.TeacherEmail || '',
        })).filter((t: any) => t.name);
        teachers.forEach((t: any) => {
          if (t.id && t.name) this.teachersCache.set(t.id, t);
        });
        return teachers;
      }
    } catch {}
    return [];
  }

  public async getSubjectThemes(subjectId: string): Promise<TeachingTopic[]> {
    if (this.isMockMode) {
      return MOCK_TEACHING_TOPICS.filter((t) => t.subjectId === subjectId || t.subjectAbbrev === subjectId);
    }
    try {
      const data: any = await this.request(`/api/3/subjects/themes/${encodeURIComponent(subjectId)}`);
      if (!data || !data.Themes || !Array.isArray(data.Themes)) return [];

      const subj = data.Subject || {};
      const subjectAbbrev = subj.Abbrev || subj.Name || subjectId;
      const subjectName = subj.Name || subj.Abbrev || subjectId;

      return data.Themes.map((item: any, idx: number) => ({
        id: `${subjectId}-${item.Date || idx}-${idx}`,
        date: item.Date ? item.Date.split('T')[0] : '',
        hour: item.HourCaption || (item.LessonLabel ? `${item.LessonLabel}. hod` : `${idx + 1}. hod`),
        subjectId: subj.Id || subjectId,
        subjectAbbrev: subjectAbbrev,
        subjectName: subjectName,
        topic: item.Theme || item.Topic || 'Bez názvu tématu',
        teacher: item.TeacherName || item.Teacher || '',
        note: item.Note || undefined,
        lessonLabel: item.LessonLabel ? String(item.LessonLabel) : undefined,
      }));
    } catch {
      return [];
    }
  }

  public async getClassbook(): Promise<TeachingTopic[]> {
    if (this.isMockMode) return MOCK_TEACHING_TOPICS;
    try {
      const data: any = await this.request('/api/3/classbook');
      if (!data) return [];
      const items = Array.isArray(data) ? data : (data.Lessons || data.Classbook || data.Items || []);
      if (!Array.isArray(items)) return [];

      return items.map((item: any, idx: number) => ({
        id: item.Id || `cb-${idx}`,
        date: item.Date ? item.Date.split('T')[0] : '',
        hour: item.HourCaption || (item.Hour ? `${item.Hour}. hod` : ''),
        subjectId: item.SubjectId || item.Subject?.Id || '',
        subjectAbbrev: item.SubjectAbbrev || item.Subject?.Abbrev || '',
        subjectName: item.SubjectName || item.Subject?.Name || '',
        topic: item.Theme || item.Topic || item.Description || '',
        teacher: item.TeacherName || item.Teacher?.Name || '',
        note: item.Note || undefined,
      }));
    } catch {
      return [];
    }
  }

  public async getTeachingTopics(subjects?: SubjectDetail[]): Promise<TeachingTopic[]> {
    if (this.isMockMode) return MOCK_TEACHING_TOPICS;

    const topicsMap = new Map<string, TeachingTopic>();

    // 1. Try classbook endpoint first
    try {
      const classbookTopics = await this.getClassbook();
      classbookTopics.forEach((t) => {
        if (t.topic && t.topic.trim()) {
          const key = `${t.date}-${t.subjectAbbrev || t.subjectName}-${t.hour}-${t.topic}`;
          topicsMap.set(key, t);
        }
      });
    } catch {}

    // 2. Query /api/3/subjects/themes/{id} for known subjects
    const subjsToQuery = subjects && subjects.length > 0 ? subjects : await this.getSubjects();
    const validSubjs = subjsToQuery.filter((s) => s.id || s.abbrev);

    const chunkSize = 5;
    for (let i = 0; i < validSubjs.length; i += chunkSize) {
      const chunk = validSubjs.slice(i, i + chunkSize);
      const settled = await Promise.allSettled(
        chunk.map(async (subj) => {
          const id = subj.id || subj.abbrev;
          const themes = await this.getSubjectThemes(id);
          return themes.map((t) => ({
            ...t,
            subjectAbbrev: subj.abbrev || t.subjectAbbrev,
            subjectName: subj.name || t.subjectName,
            teacher: t.teacher || subj.teacherName,
          }));
        })
      );

      settled.forEach((res) => {
        if (res.status === 'fulfilled') {
          res.value.forEach((t) => {
            if (t.topic && t.topic.trim()) {
              const key = `${t.date}-${t.subjectAbbrev}-${t.hour}-${t.topic}`;
              if (!topicsMap.has(key)) {
                topicsMap.set(key, t);
              }
            }
          });
        }
      });
    }

    return Array.from(topicsMap.values()).sort((a, b) => {
      const da = new Date(a.date).getTime() || 0;
      const db = new Date(b.date).getTime() || 0;
      return db - da;
    });
  }

  public async getKomensReceivers(): Promise<{ id: string; name: string; role?: string; email?: string }[]> {
    if (this.isMockMode) return [];
    try {
      const data: any = await this.request('/api/3/komens/receivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const receivers = data?.Receivers || data?.Teachers || [];
      if (Array.isArray(receivers) && receivers.length > 0) {
        const mapped = receivers.map((r: any) => ({
          id: r.Id || r.TeacherId || '',
          name: r.Name || r.TeacherName || '',
          role: r.Role || r.TypeName || '',
          email: r.Email || '',
        })).filter((r: any) => r.name);
        mapped.forEach((r: any) => {
          if (r.id && r.name && !this.teachersCache.has(r.id)) {
            this.teachersCache.set(r.id, { id: r.id, name: r.name, email: r.email });
          }
        });
        return mapped;
      }
    } catch {}
    return [];
  }

  public async getKomensMessageTypes(): Promise<{
    messageTypes: KomensMessageTypeInfo[];
    apiStudents: StudentItem[];
    apiTeachers: { id: string; name: string; role?: string; email?: string }[];
  }> {
    if (this.isMockMode) {
      return {
        messageTypes: MOCK_MESSAGE_TYPES,
        apiStudents: MOCK_STUDENTS,
        apiTeachers: [],
      };
    }

    try {
      const data: any = await this.request('/api/3/komens/message-types', { skipOutageFlag: true });
      if (data && data.MessageTypes && Array.isArray(data.MessageTypes)) {
        const messageTypes: KomensMessageTypeInfo[] = data.MessageTypes.map((mt: any) => ({
          abbreviation: mt.Abbreviation || '',
          name: mt.Name || '',
          superType: mt.SuperType || 'Message',
          showConfirmation: mt.ShowConfirmation !== false,
          hasTitle: mt.HasTitle !== false,
          recipientsTypes: Array.isArray(mt.RecipientsTypes)
            ? mt.RecipientsTypes.map((rt: any) => ({
                code: rt.Code || '',
                name: rt.Name || '',
                typeOfSelection: (rt.TypeOfSelection as 'ONE' | 'ZERO' | 'MULTIPLE' | 'FREE') || 'ONE',
                recipients: Array.isArray(rt.Recipients)
                  ? rt.Recipients.map((r: any) => ({
                      code: r.Code || r.Id || '',
                      name: r.Name || r.DisplayName || '',
                      displayName: r.DisplayName || r.Name || '',
                      abbreviation: r.Abbreviation || '',
                      isDefault: !!r.IsDefault,
                    }))
                  : [],
              }))
            : [],
        }));

        this.cachedKomensMessageTypes = messageTypes;

        // Extract student and teacher lists from RecipientsTypes and data.Recipients
        const apiStudentsMap = new Map<string, StudentItem>();
        const apiTeachersMap = new Map<string, { id: string; name: string; role?: string; email?: string }>();

        // Check nested recipients in RecipientsTypes
        data.MessageTypes.forEach((mt: any) => {
          if (Array.isArray(mt.RecipientsTypes)) {
            mt.RecipientsTypes.forEach((rt: any) => {
              const code = (rt.Code || '').toUpperCase();
              const isStudentGroup = code.startsWith('Z'); // 'Z', 'ZT', 'ZV', 'ZVV' = Žáci/Studenti
              const isTeacherGroup = code.startsWith('U'); // 'U', 'US', 'UV', 'UVV' = Učitelé

              if (Array.isArray(rt.Recipients)) {
                rt.Recipients.forEach((r: any) => {
                  const id = r.Code || r.Id || '';
                  const name = r.DisplayName || r.Name || '';
                  if (!name) return;

                  if (isStudentGroup) {
                    apiStudentsMap.set(id || name, {
                      id: id || `student-${name}`,
                      name,
                      className: r.ClassAbbreviation || '',
                      email: r.Email || '',
                    });
                  } else if (isTeacherGroup) {
                    const isAbsence = (mt.Abbreviation || '').toUpperCase() === 'OMLUVENKA';
                    apiTeachersMap.set(id || name, {
                      id: id || `teacher-${name}`,
                      name,
                      role: isAbsence ? 'Třídní učitel' : (rt.Name || 'Vyučující'),
                      email: r.Email || '',
                    });
                  }
                });
              }
            });
          }
        });

        // Also check global Recipients array if present
        if (Array.isArray(data.Recipients)) {
          data.Recipients.forEach((r: any) => {
            const id = r.Code || r.Id || '';
            const name = r.DisplayName || r.Name || '';
            if (!name) return;
            const userType = (r.UserType || '').toLowerCase();
            const role = (r.Role || r.TypeName || '').toLowerCase();

            if (userType === 'student' || userType === 'žák' || userType === 'pupil' || role === 'žák' || role === 'student' || r.ClassAbbreviation) {
              apiStudentsMap.set(id || name, {
                id: id || `student-${name}`,
                name,
                className: r.ClassAbbreviation || '',
                email: r.Email || '',
              });
            } else if (userType === 'teacher' || userType === 'učitel' || userType === 'employee') {
              apiTeachersMap.set(id || name, {
                id: id || `teacher-${name}`,
                name,
                role: 'Vyučující',
                email: r.Email || '',
              });
            } else {
              // Fallback based on name title (teachers usually have titles)
              if (name.includes('Mgr.') || name.includes('Ing.') || name.includes('PhDr.') || name.includes('RNDr.') || name.includes('Bc.')) {
                apiTeachersMap.set(id || name, {
                  id: id || `teacher-${name}`,
                  name,
                  role: 'Vyučující',
                  email: r.Email || '',
                });
              }
            }
          });
        }

        return {
          messageTypes,
          apiStudents: Array.from(apiStudentsMap.values()),
          apiTeachers: Array.from(apiTeachersMap.values()),
        };
      }
    } catch (e) {
      console.warn('Failed to fetch /api/3/komens/message-types:', e);
    }

    return {
      messageTypes: this.isMockMode ? MOCK_MESSAGE_TYPES : [
        {
          abbreviation: 'OBECNA',
          name: 'Běžná zpráva',
          superType: 'Message',
          showConfirmation: true,
          hasTitle: true,
          recipientsTypes: [
            { code: 'U', name: 'uživatel', typeOfSelection: 'ONE' }
          ]
        },
        {
          abbreviation: 'OMLUVENKA',
          name: 'Omluvení absence',
          superType: 'Message',
          showConfirmation: false,
          hasTitle: false,
          recipientsTypes: [
            { code: 'U', name: 'uživatel', typeOfSelection: 'ONE' }
          ]
        }
      ],
      apiStudents: [],
      apiTeachers: [],
    };
  }

  public async sendMessage(
    msgOrRecipientId:
      | string
      | {
          recipientType?: string;
          recipients?: string[];
          recipientName: string;
          title: string;
          text: string;
          category?: string;
          messageType?: string;
          requireConfirmation?: boolean;
          isAllDay?: boolean;
          dateFrom?: string;
          dateTo?: string;
          hourFrom?: number | null;
          hourTo?: number | null;
          emailNotification?: boolean;
        },
    maybeRecipientName?: string,
    maybeTitle?: string,
    maybeText?: string
  ): Promise<boolean> {
    if (this.isMockMode) return true;

    let payload: {
      recipientType?: string;
      recipients?: string[];
      recipientName: string;
      title: string;
      text: string;
      category?: string;
      messageType?: string;
      requireConfirmation?: boolean;
      isAllDay?: boolean;
      dateFrom?: string;
      dateTo?: string;
      hourFrom?: number | null;
      hourTo?: number | null;
      emailNotification?: boolean;
    };

    if (typeof msgOrRecipientId === 'string') {
      payload = {
        recipientType: 'U',
        recipients: msgOrRecipientId ? [msgOrRecipientId] : [],
        recipientName: maybeRecipientName || '',
        title: maybeTitle || '',
        text: maybeText || '',
        messageType: 'OBECNA',
        requireConfirmation: false,
      };
    } else {
      payload = msgOrRecipientId;
    }

    const isAbsence = payload.category === 'absence' || payload.messageType === 'OMLUVENKA';
    const isAllDay = Boolean(payload.isAllDay);

    // Clean recipient IDs (strip any UI prefix like "indiv:")
    let cleanedRecipients = (payload.recipients || [])
      .map((r) => (typeof r === 'string' ? r.replace(/^indiv:/, '').trim() : ''))
      .filter(Boolean);

    // If it's an absence message, ensure we have a valid Bakalari teacher code
    if (isAbsence) {
      if (this.cachedKomensMessageTypes.length === 0) {
        try {
          await this.getKomensMessageTypes();
        } catch {}
      }

      const omluvenkaType = this.cachedKomensMessageTypes.find(
        (mt) => (mt.abbreviation || '').toUpperCase() === 'OMLUVENKA'
      );
      const omluvenkaRecipients = (omluvenkaType?.recipientsTypes || []).flatMap((rt) => rt.recipients || []);
      const defaultCode = omluvenkaRecipients[0]?.code;

      const resolved = cleanedRecipients.map((recId) => {
        if (!recId.startsWith('teacher-') && !recId.startsWith('custom:')) {
          return recId;
        }
        const cleanName = recId.replace(/^teacher-/, '').replace(/^custom:/, '').toLowerCase();
        const match = omluvenkaRecipients.find((r) => {
          const rName = (r.displayName || r.name || '').toLowerCase();
          const rCode = (r.code || '').toLowerCase();
          return rName === cleanName || rCode === cleanName;
        });
        return match?.code || defaultCode || '';
      }).filter(Boolean);

      if (resolved.length > 0) {
        cleanedRecipients = resolved;
      } else if (defaultCode) {
        cleanedRecipients = [defaultCode];
      }
    }

    const formatIsoDate = (d?: string, isEnd = false) => {
      if (!d) return undefined;
      if (d.includes('T')) return d;
      return isEnd ? `${d}T23:59:59` : `${d}T00:00:00`;
    };

    const modernBody: Record<string, any> = {
      MessageType: payload.messageType || (isAbsence ? 'OMLUVENKA' : 'OBECNA'),
      Title: payload.title || (isAbsence ? 'Omluvení absence' : ''),
      Text: payload.text,
      RecipientType: payload.recipientType || (cleanedRecipients.length > 0 ? 'U' : 'UV'),
      Recipients: cleanedRecipients,
      RequireConfirmation: isAbsence ? false : !!payload.requireConfirmation,
      CopyForClassTeacher: false,
      CopyForParent: false,
      EmailNotification: Boolean(payload.emailNotification),
    };

    if (isAbsence) {
      modernBody.WholeDay = isAllDay;
      modernBody.AllDay = isAllDay;
      modernBody.IsAllDay = isAllDay;
      if (payload.dateFrom) {
        const dFrom = formatIsoDate(payload.dateFrom, false);
        modernBody.DateFrom = dFrom;
        modernBody.From = dFrom;
      }
      if (payload.dateTo) {
        const dTo = formatIsoDate(payload.dateTo, true);
        modernBody.DateTo = dTo;
        modernBody.To = dTo;
      }
      if (!isAllDay) {
        if (payload.hourFrom !== undefined && payload.hourFrom !== null) {
          modernBody.HourFrom = Number(payload.hourFrom);
          modernBody.FromHour = Number(payload.hourFrom);
          modernBody.LessonFrom = Number(payload.hourFrom);
        }
        if (payload.hourTo !== undefined && payload.hourTo !== null) {
          modernBody.HourTo = Number(payload.hourTo);
          modernBody.ToHour = Number(payload.hourTo);
          modernBody.LessonTo = Number(payload.hourTo);
        }
      }
    }

    // Modern Bakalari API v3 endpoint: POST /api/3/komens/message
    try {
      await this.request('/api/3/komens/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modernBody),
        skipOutageFlag: true,
      });
      return true;
    } catch (err: any) {
      console.error('Bakalari /api/3/komens/message error:', err);
      throw err;
    }
  }

  public async getSentMessageDetail(id: string): Promise<any | null> {
    if (this.isMockMode) return null;
    try {
      const data: any = await this.request(`/api/3/komens/messages/sent/${id}`);
      return data?.Message || data;
    } catch {
      try {
        const data: any = await this.request(`/api/3/komens/message/${id}`);
        return data?.Message || data;
      } catch (e) {
        console.warn(`Failed to fetch sent message detail for ${id}:`, e);
        return null;
      }
    }
  }

  public async confirmMessage(id: string): Promise<boolean> {
    if (this.isMockMode) return true;

    // Real confirmation endpoint of the Bakaláři API v3 (used by the official app;
    // not present in the community docs, verified to exist on school servers as a
    // PUT-only route - GET/POST return 405, other /confirm routes return 404).
    // The server replies with 204 No Content on success.
    try {
      await this.request(`/api/3/komens/message/${encodeURIComponent(id)}/mark-as-confirmed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
        skipOutageFlag: true,
      });
      return true;
    } catch (e) {
      console.warn('PUT /api/3/komens/message/:id/mark-as-confirmed failed:', e);
      return false;
    }
  }

  /**
   * Marks a message as read on the server (the `Read` flag, independent of
   * read confirmation). Documented endpoint: PUT /api/3/komens/message/:id/mark-as-read
   * (returns 204 No Content).
   */
  public async markMessageAsRead(id: string): Promise<boolean> {
    if (this.isMockMode) return true;

    try {
      await this.request(`/api/3/komens/message/${encodeURIComponent(id)}/mark-as-read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
        skipOutageFlag: true,
      });
      return true;
    } catch (e) {
      console.warn('PUT /api/3/komens/message/:id/mark-as-read failed:', e);
      return false;
    }
  }
}

function getDayName(dayOfWeek: number): string {
  switch (dayOfWeek) {
    case 1: return 'Pondělí';
    case 2: return 'Úterý';
    case 3: return 'Středa';
    case 4: return 'Čtvrtek';
    case 5: return 'Pátek';
    case 6: return 'Sobota';
    case 7: return 'Neděle';
    default: return '';
  }
}

export const bakalariApi = new BakalariApiClient();
