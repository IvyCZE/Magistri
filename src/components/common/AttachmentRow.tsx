import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { bakalariApi } from '../../api/client';
import { downloadNativeAttachment } from '../../native/bridge';
import { isNativePlatform } from '../../native/platform';
import { useSettingsStore } from '../../stores/settingsStore';
import type { translations } from '../../i18n/translations';

type TranslationKey = keyof typeof translations.cs;

interface AttachmentRowProps {
  id: string;
  name: string;
  className?: string;
}

type Feedback = { kind: 'info' | 'error'; textKey: TranslationKey } | null;

function saveBlobInBrowser(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The browser starts reading the blob asynchronously; revoking right away can cancel the save.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** A downloadable attachment (message or homework). The native app saves and opens the file; the web build downloads it. */
export const AttachmentRow: React.FC<AttachmentRowProps> = ({ id, name, className = '' }) => {
  const { t } = useSettingsStore();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    let next: Feedback = null;
    try {
      if (isNativePlatform()) {
        const result = await downloadNativeAttachment(id, name);
        if (!result.ok) {
          next = {
            kind: 'error',
            textKey:
              result.reason === 'session-expired'
                ? 'attachmentSessionExpired'
                : result.reason === 'not-found'
                  ? 'attachmentNotFound'
                  : 'attachmentFailed',
          };
        } else if (result.status === 'saved') {
          next = {
            kind: 'info',
            textKey: result.publicDownload ? 'attachmentSavedToDownloads' : 'attachmentNoApp',
          };
        }
      } else {
        saveBlobInBrowser(await bakalariApi.downloadAttachmentBlob(id), name);
      }
    } catch {
      next = { kind: 'error', textKey: 'attachmentFailed' };
    }
    if (!mounted.current) return;
    setBusy(false);
    setFeedback(next);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        title={t('downloadAttachment')}
        aria-label={`${t('downloadAttachment')}: ${name}`}
        className="flex items-center justify-between gap-2 p-3 rounded-m3-xl bg-m3-surface-container-high text-xs text-left m3-pressable disabled:opacity-70"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <FileText className="w-4 h-4 text-m3-primary shrink-0" />
          <span className="font-bold text-m3-on-surface font-display truncate">{name}</span>
        </span>
        <span className="p-1.5 rounded-full bg-m3-surface-container text-m3-primary shrink-0">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        </span>
      </button>
      {(busy || feedback) && (
        <span
          role={feedback?.kind === 'error' ? 'alert' : 'status'}
          className={`px-3 text-[11px] font-semibold ${
            feedback?.kind === 'error' ? 'text-m3-error' : 'text-m3-on-surface-variant'
          }`}
        >
          {busy ? t('attachmentDownloading') : feedback ? t(feedback.textKey) : ''}
        </span>
      )}
    </div>
  );
};
