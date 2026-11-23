import { useEffect, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { bakalariApi } from '../../api/client';
import { attachmentImageBlob, canPreviewAttachment } from '../../domain/attachmentPreview';
import { useBackDismiss } from '../../native/backDismiss';
import { useSettingsStore } from '../../stores/settingsStore';
import type { BakalariAttachment } from '../../types/bakalari';
import { AttachmentRow } from './AttachmentRow';
import { MaterialMorphingLoader } from './MaterialMorphingLoader';

function ImagePreview({ attachment, onClose }: { attachment: BakalariAttachment; onClose: () => void }) {
  const { t } = useSettingsStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useBackDismiss(true, onClose);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let mounted = true;
    let imageUrl: string | undefined;
    void bakalariApi.downloadAttachmentBlob(attachment.id).then(attachmentImageBlob).then((image) => {
      if (!mounted) return;
      imageUrl = URL.createObjectURL(image);
      setUrl(imageUrl);
    }).catch(() => {
      if (mounted) setFailed(true);
    });
    return () => {
      mounted = false;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [attachment.id]);

  return (
    <dialog
      ref={dialog}
      aria-label={`${t('previewAttachment')}: ${attachment.name}`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="w-[calc(100%-2rem)] max-w-3xl max-h-[90dvh] p-0 rounded-m3-2xl bg-m3-surface-container-high text-m3-on-surface shadow-2xl backdrop:bg-black/60"
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="min-w-0 truncate font-bold" title={attachment.name}>{attachment.name}</span>
          <button type="button" autoFocus onClick={onClose} aria-label={t('close')} className="grid place-items-center size-10 shrink-0 rounded-full bg-m3-surface-container m3-pressable">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {failed ? (
          <p role="alert" className="py-5 text-center text-sm text-m3-error">{t('attachmentPreviewFailed')}</p>
        ) : url ? (
          <img src={url} alt={attachment.name} onError={() => setFailed(true)} className="mx-auto max-h-[72dvh] max-w-full object-contain" />
        ) : (
          <p role="status" className="flex items-center justify-center gap-2 py-8 text-center text-sm text-m3-on-surface-variant">
            <MaterialMorphingLoader size={20} className="shrink-0 text-m3-primary" />
            <span>{t('attachmentPreviewLoading')}</span>
          </p>
        )}
      </div>
    </dialog>
  );
}

export function MessageAttachments({ attachments }: { attachments: BakalariAttachment[] }) {
  const { t } = useSettingsStore();
  const row = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [preview, setPreview] = useState<BakalariAttachment>();

  const updateScrollEnd = () => {
    const viewport = scroller.current;
    if (viewport) setCanScrollRight(viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 1);
  };

  useEffect(() => {
    const measure = () => {
      if (row.current && content.current) setHasOverflow(content.current.scrollWidth > row.current.clientWidth);
      updateScrollEnd();
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [row.current, scroller.current, content.current]) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={row} className="flex min-w-0 items-start gap-2 select-none">
      <div ref={scroller} onScroll={updateScrollEnd} role="region" aria-label={t('attachmentsWithCount', { count: attachments.length })} tabIndex={hasOverflow ? 0 : undefined} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
        <div ref={content} className="flex w-max items-start gap-2">
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              id={attachment.id}
              name={attachment.name}
              inline
              onPreview={canPreviewAttachment(attachment) ? () => setPreview(attachment) : undefined}
              className="max-w-[min(16rem,calc(100vw-8rem))] shrink-0"
            />
          ))}
        </div>
      </div>
      {hasOverflow && (
        <button
          type="button"
          aria-label={t('scrollToLastAttachment')}
          title={t('scrollToLastAttachment')}
          disabled={!canScrollRight}
          onClick={() => {
            const viewport = scroller.current;
            viewport?.scrollTo({ left: viewport.scrollWidth, behavior: 'smooth' });
          }}
          className="grid h-11 w-9 shrink-0 place-items-center rounded-full bg-m3-surface-container-high text-m3-on-surface m3-pressable disabled:opacity-60"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      )}
      {preview && <ImagePreview attachment={preview} onClose={() => setPreview(undefined)} />}
    </div>
  );
}
