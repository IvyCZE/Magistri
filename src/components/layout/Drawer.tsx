import { APP_NAME } from '../../config/app';
import { AppLogo } from '../common/AppLogo';
import React from 'react';
import {
  X,
  Home,
  GraduationCap,
  Calendar,
  CheckSquare,
  MessageSquare,
  Sparkles,
  UserX,
  ArrowRightLeft,
  BookMarked,
  Layers,
  ShieldCheck,
  FileText,
  HelpCircle,
  Library,
  Settings,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore, getSavedStudentName } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { MaterialWavyDivider } from '../common/MaterialWavyDivider';
import { TestNotice } from '../common/TestNotice';
import { dismissTestNotice, useTestNoticeDismissed } from '../../utils/testNotice';
import { schoolModuleUrl, schoolWebUrl } from '../../utils/schoolWebUrl';

const DRAWER_ANIMATION_MS = 250;

interface DrawerProps {
  onOpenExternalModal?: (type: string, title: string) => void;
}

export const Drawer: React.FC<DrawerProps> = ({ onOpenExternalModal }) => {
  const {
    isDrawerOpen,
    setDrawerOpen,
    activeScreen,
    setActiveScreen,
    t,
  } = useSettingsStore();

  const { user, currentSchool, isMockMode } = useAuthStore();
  const { getActiveHomeworksCount, getUnreadMessagesCount } = useDataStore();

  const scrollableRef = React.useRef<HTMLDivElement>(null);
  const noticeDismissed = useTestNoticeDismissed();

  // The panel stays mounted while it slides out. Its position is driven here (not by CSS classes), so a
  // slide always starts from where the panel is, also when it is interrupted or dragged by the finger.
  const [mounted, setMounted] = React.useState(isDrawerOpen);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const animationsRef = React.useRef<Animation[]>([]);
  const dragRef = React.useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    velocity: number;
    active: boolean;
  } | null>(null);
  const suppressClickRef = React.useRef(false);

  /** Share of the panel that is visible: 0 closed, 1 open. */
  const getProgress = () => {
    const panel = panelRef.current;
    if (!panel || !panel.offsetWidth) return 0;
    const x = new DOMMatrixReadOnly(getComputedStyle(panel).transform).m41;
    return Math.min(1, Math.max(0, 1 + x / panel.offsetWidth));
  };

  const applyProgress = (progress: number) => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (panel) panel.style.transform = `translateX(${(progress - 1) * 100}%)`;
    if (backdrop) backdrop.style.opacity = String(progress);
  };

  /** Stops a running slide where it is (cancelling alone would snap the panel back to where the slide began). */
  const freeze = () => {
    if (!animationsRef.current.length) return;
    applyProgress(getProgress());
    animationsRef.current.forEach((a) => a.cancel());
    animationsRef.current = [];
  };

  /** Slides from the current position to `target`, taking time in proportion to the distance left. */
  const slideTo = (target: 0 | 1, onDone?: () => void) => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !backdrop) {
      onDone?.();
      return;
    }
    const from = getProgress();
    freeze();
    applyProgress(from);
    const duration = Math.round(DRAWER_ANIMATION_MS * Math.abs(target - from));
    if (duration < 16 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyProgress(target);
      onDone?.();
      return;
    }
    const options: KeyframeAnimationOptions = { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' };
    const panelAnimation = panel.animate(
      [{ transform: `translateX(${(from - 1) * 100}%)` }, { transform: `translateX(${(target - 1) * 100}%)` }],
      options,
    );
    const backdropAnimation = backdrop.animate([{ opacity: from }, { opacity: target }], options);
    animationsRef.current = [panelAnimation, backdropAnimation];
    // Finish only counts when this slide was not replaced by another one.
    panelAnimation.onfinish = () => {
      applyProgress(target);
      animationsRef.current = [];
      panelAnimation.cancel();
      backdropAnimation.cancel();
      onDone?.();
    };
  };

  React.useEffect(() => {
    if (isDrawerOpen) setMounted(true);
  }, [isDrawerOpen]);

  // Runs once the panel exists: opening starts off screen, closing slides out and then unmounts.
  React.useLayoutEffect(() => {
    if (!mounted) return;
    if (isDrawerOpen) {
      if (!animationsRef.current.length && getProgress() === 0) applyProgress(0);
      slideTo(1);
    } else {
      slideTo(0, () => setMounted(false));
    }
    return freeze;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawerOpen, mounted]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressClickRef.current = false;
    dragRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastT: e.timeStamp, velocity: 0, active: false };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      // A mostly vertical move is the list scrolling; only a clear move to the left starts the drag.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      if (dx > -10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      drag.active = true;
      suppressClickRef.current = true;
      freeze();
      panel.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientX - drag.lastX) / dt;
    drag.lastX = e.clientX;
    drag.lastT = e.timeStamp;
    applyProgress(Math.min(1, Math.max(0, 1 + dx / panel.offsetWidth)));
  };

  const endDrag = (e: React.PointerEvent, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    if (!drag.active) return;
    // Closes when pulled over a third of the way, or flicked to the left.
    if (!cancelled && (getProgress() < 0.67 || drag.velocity < -0.5)) setDrawerOpen(false);
    else slideTo(1);
  };

  // Lock body scroll and isolate all scrolling when drawer is open
  React.useEffect(() => {
    if (!isDrawerOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverscroll = document.body.style.overscrollBehavior;
    const originalHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';

    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!scrollableRef.current) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      const target = e.target as Node;
      const isInsideScrollable = scrollableRef.current.contains(target);

      if (!isInsideScrollable) {
        // Touches on backdrop, header, footer, beta notice, etc.
        if (e.cancelable) e.preventDefault();
        return;
      }

      // Inside scrollable area: prevent overscroll chaining to window
      const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
      if (scrollHeight <= clientHeight) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      if (e.touches && e.touches.length > 0) {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;

        // Pulling down at top boundary
        if (scrollTop <= 0 && deltaY > 0) {
          if (e.cancelable) e.preventDefault();
          return;
        }

        // Pulling up at bottom boundary
        if (scrollTop + clientHeight >= scrollHeight && deltaY < 0) {
          if (e.cancelable) e.preventDefault();
          return;
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!scrollableRef.current) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      const target = e.target as Node;
      const isInsideScrollable = scrollableRef.current.contains(target);

      if (!isInsideScrollable) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
      if (scrollHeight <= clientHeight) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      const isScrollingUp = e.deltaY < 0;
      const isScrollingDown = e.deltaY > 0;

      if (isScrollingUp && scrollTop <= 0) {
        if (e.cancelable) e.preventDefault();
      } else if (isScrollingDown && scrollTop + clientHeight >= scrollHeight - 1) {
        if (e.cancelable) e.preventDefault();
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overscrollBehavior = originalBodyOverscroll;
      document.documentElement.style.overscrollBehavior = originalHtmlOverscroll;

      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [isDrawerOpen]);

  if (!mounted) return null;

  const activeHomeworkCount = getActiveHomeworksCount();
  const unreadMessageCount = getUnreadMessagesCount();

  const mainNavItems = [
    { id: 'home', label: t('home'), icon: Home },
    { id: 'marks', label: t('marks'), icon: GraduationCap },
    { id: 'timetable', label: t('timetable'), icon: Calendar },
    { id: 'homework', label: t('homework'), icon: CheckSquare, badge: activeHomeworkCount > 0 ? activeHomeworkCount : null },
    { id: 'messages', label: t('messages'), icon: MessageSquare, badge: unreadMessageCount > 0 ? unreadMessageCount : null },
    { id: 'events', label: t('events'), icon: Sparkles },
  ];

  const schoolWeb = schoolWebUrl(currentSchool?.schoolUrl, user?.schoolUrl);

  const extraNavItems = [
    { id: 'schoolWeb', label: t('openSchoolWeb'), icon: Globe, isInternal: false, url: schoolWeb },
    { id: 'absence', label: t('absence'), icon: UserX, isInternal: true },
    { id: 'substitutions', label: t('substitutions'), icon: ArrowRightLeft, isInternal: true },
    { id: 'subjects', label: t('subjects'), icon: BookMarked, isInternal: true },
    { id: 'teaching', label: t('teaching'), icon: Layers, isInternal: true },
    { id: 'gdpr', label: t('gdpr'), icon: ShieldCheck, isInternal: false, url: schoolModuleUrl(schoolWeb, 'gdpr') },
    { id: 'documents', label: t('documents'), icon: FileText, isInternal: false, url: schoolModuleUrl(schoolWeb, 'documents') },
    { id: 'questionnaires', label: t('questionnaires'), icon: HelpCircle, isInternal: false, url: schoolModuleUrl(schoolWeb, 'questionnaires') },
    { id: 'eduResources', label: t('eduResources'), icon: Library, isInternal: false, url: schoolModuleUrl(schoolWeb, 'eduResources') },
  ];

  const handleNavClick = (item: any) => {
    if (item.isInternal !== false) {
      setActiveScreen(item.id);
    } else {
      if (item.id === 'schoolWeb') {
        if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
      } else if (onOpenExternalModal) {
        onOpenExternalModal(item.id, item.label);
      } else if (item.url) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
      setDrawerOpen(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex overscroll-contain select-none ${isDrawerOpen ? '' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/60 touch-none overscroll-contain"
        style={{ opacity: 0 }}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Drawer Container */}
      <div
        ref={panelRef}
        className="relative w-full max-w-[320px] sm:max-w-[340px] h-full bg-m3-surface-container-low text-m3-on-surface shadow-2xl flex flex-col z-10 safe-top safe-bottom rounded-r-m3-2xl sm:rounded-r-m3-3xl overflow-hidden overscroll-contain touch-pan-y will-change-transform"
        style={{ transform: 'translateX(-100%)' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            e.stopPropagation();
            e.preventDefault();
            suppressClickRef.current = false;
          }
        }}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 flex items-center justify-between bg-m3-surface-container-low shrink-0 select-none touch-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <AppLogo className="h-9 w-9" />
            <h2 className="font-extrabold font-display text-xl tracking-tight leading-normal text-m3-on-surface truncate">
              {APP_NAME}
            </h2>
          </div>

          <button
            onClick={() => setDrawerOpen(false)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:bg-m3-surface-container-high m3-pressable"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Nav List (Scrollable) */}
        <div ref={scrollableRef} className="flex-1 overflow-y-auto no-scrollbar px-3 py-4 space-y-3.5 overscroll-contain touch-pan-y">
          {/* Main Screens */}
          <div className="space-y-1.5">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeScreen === item.id ||
                (item.id === 'messages' && (activeScreen === 'message-detail' || activeScreen === 'new-message'));
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className={`group w-full flex items-center justify-between p-1.5 pr-3.5 sm:pr-4 rounded-full text-sm font-semibold transition-all m3-pressable ${
                    isActive
                      ? 'bg-m3-primary-container text-m3-on-primary-container shadow-xs font-bold'
                      : 'bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface shadow-2xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isActive
                          ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                          : 'bg-white dark:bg-m3-surface-container-highest text-m3-on-surface shadow-xs group-hover:scale-105'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-m3-primary text-m3-on-primary font-display shadow-xs">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Wavy Divider between main nav and extra modules */}
          <div className="px-2 py-1">
            <MaterialWavyDivider />
          </div>

          {/* Secondary & Extra Bakalari Modules */}
          <div className="space-y-1">
            {extraNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-full text-xs font-medium transition-all m3-pressable ${
                    isActive
                      ? 'bg-m3-primary-container text-m3-on-primary-container font-bold'
                      : 'text-m3-on-surface-variant hover:bg-m3-surface-container hover:text-m3-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-m3-on-surface-variant" />
                    <span>{item.label}</span>
                  </div>

                  {!item.isInternal && (
                    <ExternalLink className="w-3.5 h-3.5 text-m3-on-surface-variant/60" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Beta Notice & Feedback in Drawer */}
        {!noticeDismissed && (
          <div className="px-3 pb-2 pt-1 shrink-0 select-none">
            <TestNotice variant="drawer" onDismiss={dismissTestNotice} className="bg-m3-surface-container-high" />
          </div>
        )}

        {/* Drawer Footer */}
        {(() => {
          const isClassLike = (val?: string | null) => Boolean(val && /^\d\.[A-Za-z]/i.test(val.trim()));
          const isInvalidClass = (val?: string | null) => !val || val === 'Třída' || val.trim() === '';

          let displayName = user?.name?.trim() || getSavedStudentName();
          let displayClass = user?.className?.trim() || '';

          if (isClassLike(displayName)) {
            if (isInvalidClass(displayClass)) {
              displayClass = displayName;
            }
            displayName = '';
          }

          if (isInvalidClass(displayClass)) {
            displayClass = '';
          }

          const finalName = displayName || (isMockMode ? 'Demo Student' : 'Student');
          const initials = finalName.split(' ').map(n => n[0]).join('').slice(0, 2) || (displayClass || 'ST');

          return (
            <div className="p-3 sm:p-4 bg-m3-surface-container-low flex items-center justify-between gap-3 shrink-0 select-none">
              {/* User Info */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center font-bold text-xs font-display shrink-0 shadow-xs">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs sm:text-sm truncate font-display text-m3-on-surface leading-tight">
                    {finalName}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-m3-on-surface-variant truncate leading-tight mt-0.5">
                    {displayClass ? `${displayClass} • ` : ''}{isMockMode ? t('mockProfile') : (currentSchool?.name || user?.schoolName || '')}
                  </div>
                </div>
              </div>

              {/* Round Settings Button */}
              <button
                onClick={() => {
                  setActiveScreen('settings');
                  setDrawerOpen(false);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all m3-pressable ${
                  activeScreen === 'settings'
                    ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                    : 'bg-m3-surface-container-high text-m3-on-surface hover:bg-m3-surface-container-highest'
                }`}
                title={t('settings')}
                aria-label={t('settings')}
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
