import { registerPlugin } from '@capacitor/core';
import { isNativePlatform } from './platform';
import type { AuthTokens } from '../types/bakalari';

export type NativePalette = Record<string, string>;

export interface DynamicPaletteResult {
  supported: boolean;
  light?: NativePalette;
  dark?: NativePalette;
}

interface PrehledNativePlugin {
  getDynamicPalette(): Promise<DynamicPaletteResult>;
  setWindowBackground(options: { color: string }): Promise<void>;
  getTokens(): Promise<{ tokens: AuthTokens | null }>;
  setTokens(options: { tokens: AuthTokens }): Promise<void>;
  clearTokens(): Promise<void>;
  refreshTokens(options: { refreshToken: string }): Promise<{ tokens: AuthTokens | null; rejected?: boolean }>;
  setPreferences(options: { prefs: NativePreferences }): Promise<void>;
  setLocalData(options: { data: NativeLocalData }): Promise<void>;
  syncNow(): Promise<{ status: SyncStatus }>;
  clearAll(): Promise<void>;
  getNotificationStatus(): Promise<NotificationStatus>;
  requestNotificationPermission(): Promise<NotificationStatus>;
  openSystemSettings(options: { target: 'notifications' | 'battery' }): Promise<void>;
  downloadAttachment(options: { id: string; name: string }): Promise<{ status: 'opened' | 'saved'; publicDownload: boolean }>;
  getAppIcon(): Promise<{ icon: AppIconId }>;
  setAppIcon(options: { icon: AppIconId }): Promise<void>;
}

/** `default` is the logo with the coloured shape, `classic` the original one without it. */
export type AppIconId = 'default' | 'classic';

export interface AttachmentDownloadResult {
  ok: boolean;
  /** Set when `ok`: the file was handed to another app, or only saved. */
  status?: 'opened' | 'saved';
  publicDownload?: boolean;
  /** Set when not `ok`. */
  reason?: 'session-expired' | 'not-found' | 'failed';
}

export interface NotificationStatus {
  /** Permission granted and not switched off in the Android settings. */
  enabled: boolean;
  /** Android 13+ asks with a dialog; older versions have no runtime permission. */
  runtimePermission: boolean;
}

/** What the native widgets and notifications need to know about the user's settings. */
export interface NativePreferences {
  language: 'cs' | 'en';
  countdownMode: string;
  countdownHideDecimals: boolean;
  demo: boolean;
  notifyMarks: boolean;
  notifyMessages: boolean;
  notifyTimetable: boolean;
  notifyHomework: boolean;
  nightRestEnabled: boolean;
  nightStartMinutes: number;
  nightEndMinutes: number;
  accent: string;
  themeMode: string;
  amoled: boolean;
}

/** Data that exists only in the web app and is merged into the native snapshot. */
export interface NativeLocalData {
  customHomework: Array<{
    id: string;
    subjectAbbrev: string;
    subjectName: string;
    content: string;
    date: string;
    deadline: string;
    done: boolean;
  }>;
  homeworkDone: Record<string, boolean>;
  testMarks: Array<{ date: string; hourId: number; description: string }>;
}

export type SyncStatus = 'updated' | 'partial' | 'skipped' | 'expired' | 'failed';

const PrehledNative = registerPlugin<PrehledNativePlugin>('PrehledNative');

export async function getDynamicPalette(): Promise<DynamicPaletteResult> {
  if (!isNativePlatform()) return { supported: false };
  try {
    return await PrehledNative.getDynamicPalette();
  } catch {
    return { supported: false };
  }
}

export async function setNativeWindowBackground(color: string): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await PrehledNative.setWindowBackground({ color });
  } catch {
    // Cosmetic only; the previous colour stays.
  }
}

export async function loadNativeTokens(): Promise<AuthTokens | null> {
  try {
    return (await PrehledNative.getTokens()).tokens ?? null;
  } catch {
    return null;
  }
}

export async function saveNativeTokens(tokens: AuthTokens): Promise<void> {
  try {
    await PrehledNative.setTokens({ tokens });
  } catch {
    // The in-memory copy keeps the session alive; the next save retries.
  }
}

export async function clearNativeTokens(): Promise<void> {
  try {
    await PrehledNative.clearTokens();
  } catch {
    // Nothing to clean up if the plugin is unavailable.
  }
}

export async function refreshNativeTokens(refreshToken: string): Promise<{ tokens: AuthTokens | null; rejected: boolean }> {
  try {
    const result = await PrehledNative.refreshTokens({ refreshToken });
    return { tokens: result.tokens ?? null, rejected: Boolean(result.rejected) };
  } catch {
    return { tokens: null, rejected: false };
  }
}

export async function setNativePreferences(prefs: NativePreferences): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await PrehledNative.setPreferences({ prefs });
  } catch {
    // Native keeps the previous values; the next change pushes again.
  }
}

export async function setNativeLocalData(data: NativeLocalData): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await PrehledNative.setLocalData({ data });
  } catch {
    // Same as above.
  }
}

export async function syncNativeNow(): Promise<SyncStatus | null> {
  if (!isNativePlatform()) return null;
  try {
    return (await PrehledNative.syncNow()).status;
  } catch {
    return null;
  }
}

export async function clearNativeAll(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await PrehledNative.clearAll();
  } catch {
    // Nothing to clean up if the plugin is unavailable.
  }
}

export async function getNotificationStatus(): Promise<NotificationStatus | null> {
  if (!isNativePlatform()) return null;
  try {
    return await PrehledNative.getNotificationStatus();
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<NotificationStatus | null> {
  if (!isNativePlatform()) return null;
  try {
    return await PrehledNative.requestNotificationPermission();
  } catch {
    return null;
  }
}

export async function openSystemSettings(target: 'notifications' | 'battery'): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await PrehledNative.openSystemSettings({ target });
  } catch {
    // No settings page on this device; nothing else to offer.
  }
}

/** Downloads an attachment through the native plugin, which holds the tokens and saves to the Downloads folder. */
export async function downloadNativeAttachment(id: string, name: string): Promise<AttachmentDownloadResult> {
  try {
    const result = await PrehledNative.downloadAttachment({ id, name });
    return { ok: true, status: result.status, publicDownload: Boolean(result.publicDownload) };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'SESSION_EXPIRED') return { ok: false, reason: 'session-expired' };
    if (code === 'NOT_FOUND') return { ok: false, reason: 'not-found' };
    return { ok: false, reason: 'failed' };
  }
}

/** The launcher icon in use, or null outside the Android app (or in a build without the icon aliases). */
export async function getNativeAppIcon(): Promise<AppIconId | null> {
  if (!isNativePlatform()) return null;
  try {
    return (await PrehledNative.getAppIcon()).icon;
  } catch {
    return null;
  }
}

export async function setNativeAppIcon(icon: AppIconId): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    await PrehledNative.setAppIcon({ icon });
    return true;
  } catch {
    return false;
  }
}
