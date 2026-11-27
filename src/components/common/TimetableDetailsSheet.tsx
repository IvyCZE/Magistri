import { useId, useLayoutEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useBackDismiss } from '../../native/backDismiss';
import { useSettingsStore } from '../../stores/settingsStore';

type Drag = { id: number; x: number; y: number; startedAt: number };

interface TimetableDetailsSheetProps {
  label?: ReactNode;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function TimetableDetailsSheet({ label, title, onClose, children }: TimetableDetailsSheetProps) {
  const { t } = useSettingsStore();
  const headingId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const gesture = useRef<Drag | null>(null);
  const backdropPointer = useRef<number | undefined>(undefined);
  const animation = useRef<Animation | undefined>(undefined);
  const closing = useRef(false);

  const dismiss = () => {
    const element = dialog.current;
    if (!element || closing.current) return;
    closing.current = true;
    const finish = () => {
      if (dialog.current !== element) return;
      element.close();
      onClose();
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    const from = getComputedStyle(element).transform;
    animation.current?.cancel();
    element.dataset.closing = '';
    animation.current = element.animate(
      [{ transform: from }, { transform: 'translateY(100%)' }],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    void animation.current.finished.then(finish, () => {});
  };

  useBackDismiss(true, dismiss);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    closing.current = false;
    element.showModal();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation.current = element.animate(
        [{ transform: 'translateY(100%)' }, { transform: 'none' }],
        { duration: 280, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      );
    }
    return () => {
      animation.current?.cancel();
      element.close();
    };
  }, []);

  const dragDistance = (event: PointerEvent, start: Drag) => {
    const dy = event.clientY - start.y;
    return dy > Math.abs(event.clientX - start.x) ? dy : 0;
  };

  const resetDrag = (pointerId: number) => {
    if (gesture.current?.id !== pointerId) return;
    gesture.current = null;
    const element = dialog.current;
    if (element) {
      delete element.dataset.dragging;
      element.style.transform = '';
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || closing.current) return;
        const target = event.target as Element;
        if (target === event.currentTarget) {
          backdropPointer.current = event.pointerId;
          return;
        }
        if (target.closest('button, [data-sheet-swipe-disabled]')) return;
        const scroller = content.current;
        if (scroller && scroller.scrollTop > 0 && scroller.contains(target)) return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: event.timeStamp };
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId || closing.current) return;
        const element = event.currentTarget;
        const offset = dragDistance(event, start);
        if (!element.hasPointerCapture(event.pointerId)) {
          if (offset < 6) return;
          animation.current?.cancel();
          element.dataset.dragging = '';
          element.setPointerCapture(event.pointerId);
        }
        element.style.transform = `translateY(${offset}px)`;
      }}
      onPointerUp={(event) => {
        if (backdropPointer.current === event.pointerId) {
          backdropPointer.current = undefined;
          if (event.target === event.currentTarget) dismiss();
          return;
        }
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const offset = dragDistance(event, start);
        const fastSwipe = offset >= 30 && offset / Math.max(1, event.timeStamp - start.startedAt) > 0.65;
        if (offset >= 80 || fastSwipe) {
          gesture.current = null;
          dismiss();
        } else {
          resetDrag(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        if (backdropPointer.current === event.pointerId) backdropPointer.current = undefined;
        resetDrag(event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        if (event.target === event.currentTarget) resetDrag(event.pointerId);
      }}
      className="timetable-details-sheet fixed inset-x-0 bottom-0 top-auto mx-auto my-0 w-full max-w-xl max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top,0px)-0.5rem))] p-0 overflow-hidden rounded-t-m3-3xl bg-m3-surface-container text-m3-on-surface shadow-2xl open:flex flex-col"
    >
      <div className="shrink-0 touch-none select-none cursor-grab active:cursor-grabbing px-4 sm:px-6 pb-3">
        <div aria-hidden="true" className="grid h-8 place-items-center">
          <span className="h-1 w-9 rounded-full bg-m3-on-surface-variant/40" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 pl-3">
            {label && (
              <div className="text-xs font-extrabold text-m3-primary font-display uppercase tracking-wider">
                {label}
              </div>
            )}
            <h2 id={headingId} className="mt-0.5 break-words text-xl font-black font-display">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t('close')}
            onClick={dismiss}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-m3-surface-container-high text-m3-on-surface-variant m3-pressable"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      <div
        ref={content}
        onScroll={({ currentTarget }) => currentTarget.toggleAttribute('data-scrolled', currentTarget.scrollTop > 0)}
        className="timetable-details-content min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 sheet-safe-bottom space-y-3"
      >
        {children}
      </div>
    </dialog>
  );
}
