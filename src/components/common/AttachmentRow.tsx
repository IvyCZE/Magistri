import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image } from 'lucide-react';
import { bakalariApi } from '../../api/client';
import { downloadNativeAttachment } from '../../native/bridge';
import { isNativePlatform } from '../../native/platform';
import { useSettingsStore } from '../../stores/settingsStore';
import type { translations } from '../../i18n/translations';
import { MaterialMorphingLoader } from './MaterialMorphingLoader';

type TranslationKey = keyof typeof translations.cs;

interface AttachmentRowProps {
  id: string;
  name: string;
  className?: string;
  inline?: boolean;
  onPreview?: () => void;
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
export const AttachmentRow: React.FC<AttachmentRowProps> = ({ id, name, className = '', inline = false, onPreview }) => {
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

  const FileIcon = onPreview ? Image : FileText;
  const fileLabel = (
    <span className="flex items-center gap-2.5 min-w-0" title={name}>
      <FileIcon aria-hidden="true" className="w-4 h-4 text-m3-primary shrink-0" />
      <span className="font-bold text-m3-on-surface font-display truncate">{name}</span>
    </span>
  );
  const downloadIcon = busy
    ? <MaterialMorphingLoader size={20} />
    : <Download aria-hidden="true" className="w-3.5 h-3.5" />;
  const downloadProps = {
    type: 'button' as const,
    onClick: download,
    disabled: busy,
    title: t('downloadAttachment'),
    'aria-label': `${t('downloadAttachment')}: ${name}`,
    'aria-busy': busy,
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {inline ? (
        <div className="flex items-center justify-between gap-2 pl-3 pr-1 py-1 rounded-m3-xl bg-m3-surface-container-high text-xs">
          {onPreview ? (
            <button
              type="button"
              onClick={onPreview}
              aria-label={`${t('previewAttachment')}: ${name}`}
              className="min-w-0 py-2.5 rounded-m3-sm text-left m3-pressable"
            >
              {fileLabel}
            </button>
          ) : fileLabel}
          <button {...downloadProps} className="grid place-items-center size-9 rounded-full bg-m3-surface-container text-m3-primary shrink-0 m3-pressable disabled:opacity-70">
            {downloadIcon}
          </button>
        </div>
      ) : (
        <button {...downloadProps} className="flex items-center justify-between gap-2 p-3 rounded-m3-xl bg-m3-surface-container-high text-xs text-left m3-pressable disabled:opacity-70">
          {fileLabel}
          <span className="grid size-[26px] place-items-center rounded-full bg-m3-surface-container text-m3-primary shrink-0">{downloadIcon}</span>
        </button>
      )}
      {feedback && (
        <span
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`px-3 text-[11px] font-semibold ${
            feedback.kind === 'error' ? 'text-m3-error' : 'text-m3-on-surface-variant'
          }`}
        >
          {t(feedback.textKey)}
        </span>
      )}
    </div>
  );
};
