import React from 'react';
import {
  Home,
  GraduationCap,
  Calendar,
  CheckSquare,
  MessageSquare,
  Sparkles,
  UserX,
  ArrowRightLeft,
} from 'lucide-react';
import { useSettingsStore, BottomNavItemKey } from '../../stores/settingsStore';
import { useDataStore } from '../../stores/dataStore';
import { useNavigationMode } from '../../hooks/useNavigationMode';
import { useKeyboardOpen } from '../../native/keyboard';

export const NavigationBar: React.FC = () => {
  const { activeScreen, setActiveScreen, t, bottomNavOrder, bottomNavEnabled } = useSettingsStore();
  const { getActiveHomeworksCount, getUnreadMessagesCount } = useDataStore();
  const navMode = useNavigationMode();
  const keyboardOpen = useKeyboardOpen();

  const activeHomeworkCount = getActiveHomeworksCount();
  const unreadMessageCount = getUnreadMessagesCount();

  const ALL_NAV_ITEMS: Record<BottomNavItemKey, { label: string; icon: React.FC<{ className?: string }>; getBadge?: () => number | null }> = {
    home: { label: t('home'), icon: Home },
    marks: { label: t('marks'), icon: GraduationCap },
    timetable: { label: t('timetable'), icon: Calendar },
    homework: { label: t('homework'), icon: CheckSquare, getBadge: () => (activeHomeworkCount > 0 ? activeHomeworkCount : null) },
    messages: { label: t('messages'), icon: MessageSquare, getBadge: () => (unreadMessageCount > 0 ? unreadMessageCount : null) },
    events: { label: t('events'), icon: Sparkles },
    absence: { label: t('absence'), icon: UserX },
    substitutions: { label: t('substitutions'), icon: ArrowRightLeft },
  };

  const visibleNavItems = bottomNavOrder
    .filter((key) => bottomNavEnabled[key])
    .map((key) => {
      const item = ALL_NAV_ITEMS[key];
      return {
        id: key,
        label: item.label,
        icon: item.icon,
        badge: item.getBadge ? item.getBadge() : null,
      };
    });

  const isItemActive = (id: BottomNavItemKey) => {
    if (activeScreen === id) return true;
    if (id === 'messages' && (activeScreen === 'message-detail' || activeScreen === 'new-message')) return true;
    return false;
  };

  if (keyboardOpen) return null;

  // 1. Right Floating Vertical Rail (for landscape screens with space on left & right)
  if (navMode === 'rail-right') {
    return (
      <nav
        aria-label="Navigace"
        className="rail-right fixed top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5 py-3 px-1.5 sm:px-2 rounded-full bg-m3-surface-container/95 dark:bg-m3-surface-container/90 backdrop-blur-xl shadow-2xl transition-all duration-300 max-h-[88vh] overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-right-4 duration-200"
      >
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.id);

          return (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              title={item.label}
              className={`relative flex flex-col items-center justify-center p-1 sm:p-1.5 rounded-full transition-all m3-pressable group w-14 sm:w-16 ${
                isActive
                  ? 'text-m3-on-primary-container font-extrabold'
                  : 'text-m3-on-surface-variant hover:text-m3-on-surface'
              }`}
            >
              {/* Active pill background indicator */}
              <div className="relative flex items-center justify-center">
                <div
                  className={`w-11 sm:w-12 h-7 sm:h-8 rounded-full flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-m3-primary-container shadow-xs'
                      : 'bg-transparent group-hover:bg-m3-surface-container-high/60'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 transition-transform ${
                      isActive
                        ? 'text-m3-on-primary-container scale-105'
                        : 'text-m3-on-surface-variant group-hover:text-m3-on-surface'
                    }`}
                  />
                </div>

                {item.badge && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-m3-primary text-m3-on-primary text-[9px] font-black flex items-center justify-center shadow-xs font-display pointer-events-none">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className="text-[9px] sm:text-[10px] font-display font-bold mt-0.5 tracking-tight truncate max-w-full text-center block w-full leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

  // 2. Bottom Floating Horizontal Bar (for large screens in portrait or narrower landscape)
  if (navMode === 'bottom-floating') {
    return (
      <nav
        aria-label="Navigace"
        className="dock-bottom fixed z-30 left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] sm:w-auto max-w-xl mx-auto px-3 sm:px-4 py-2 rounded-full bg-m3-surface-container/95 dark:bg-m3-surface-container/90 backdrop-blur-xl shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="flex items-center justify-between sm:justify-center gap-1 sm:gap-2.5 w-full">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item.id);

            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                title={item.label}
                className={`relative flex flex-col items-center justify-center py-1 px-1.5 sm:px-3 rounded-full transition-all m3-pressable flex-1 sm:flex-initial min-w-0 sm:min-w-[64px] group ${
                  isActive
                    ? 'text-m3-on-primary-container font-extrabold'
                    : 'text-m3-on-surface-variant hover:text-m3-on-surface'
                }`}
              >
                {/* Active pill background indicator */}
                <div className="relative flex items-center justify-center">
                  <div
                    className={`w-12 sm:w-14 h-7 sm:h-8 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-m3-primary-container shadow-xs'
                        : 'bg-transparent group-hover:bg-m3-surface-container-high/60'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 transition-transform ${
                        isActive
                          ? 'text-m3-on-primary-container scale-105'
                          : 'text-m3-on-surface-variant group-hover:text-m3-on-surface'
                      }`}
                    />
                  </div>

                  {item.badge && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-m3-primary text-m3-on-primary text-[9px] font-black flex items-center justify-center shadow-xs font-display pointer-events-none">
                      {item.badge}
                    </span>
                  )}
                </div>

                <span className="text-[10px] sm:text-[11px] font-display font-bold mt-0.5 tracking-tight truncate max-w-full text-center block w-full leading-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // 3. Bottom Mobile Edge-to-Edge Bar (for small phone screens in portrait)
  return (
    <nav
      aria-label="Navigace"
      className="fixed bottom-0 left-0 right-0 z-30 bg-m3-surface-container/95 backdrop-blur-xl px-1 sm:px-2 py-1.5 safe-bottom safe-x shadow-lg w-full max-w-full overflow-hidden transition-all duration-300"
    >
      <div className="flex items-center justify-between w-full max-w-md mx-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.id);

          return (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-full transition-all m3-pressable flex-1 min-w-0 max-w-full ${
                isActive
                  ? 'text-m3-on-primary-container font-extrabold'
                  : 'text-m3-on-surface-variant hover:text-m3-on-surface'
              }`}
            >
              {/* Active pill background indicator */}
              <div className="relative flex items-center justify-center">
                <div
                  className={`w-12 h-7 rounded-full flex items-center justify-center transition-all ${
                    isActive ? 'bg-m3-primary-container shadow-xs' : 'bg-transparent'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? 'text-m3-on-primary-container' : 'text-m3-on-surface-variant'
                    }`}
                  />
                </div>

                {item.badge && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-m3-primary text-m3-on-primary text-[9px] font-black flex items-center justify-center shadow-xs font-display pointer-events-none">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className="text-[10px] font-display font-bold mt-0.5 tracking-tight truncate max-w-full text-center block w-full leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
