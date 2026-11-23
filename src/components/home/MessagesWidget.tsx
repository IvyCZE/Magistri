import React from 'react';
import { ChevronRight, MessageSquare, Plus, MailOpen, AlertCircle } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { sortByDateDesc } from '../../utils/dateUtils';

export const MessagesWidget: React.FC = () => {
  const { messages, markMessageAsRead, setSelectedMessageId } = useDataStore();
  const { setActiveScreen, t } = useSettingsStore();

  const pendingConfirmMessages = sortByDateDesc(
    messages.filter((m) => (m.type === 'received' || m.type === 'noticeboard') && m.requireConfirmation && !m.confirmed)
  );
  const unreadMessages = sortByDateDesc(messages.filter((m) => m.unread));

  // Prioritize messages awaiting user's confirmation so they are never missed on dashboard
  const prioritized = Array.from(
    new Map([...pendingConfirmMessages, ...unreadMessages].map((m) => [m.id, m])).values()
  );
  const displayMessages = prioritized.slice(0, 2);
  const remainingCount = Math.max(0, prioritized.length - 2);

  return (
    <div className="w-full flex flex-col gap-2.5 h-full">
      {/* Top Header Row */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base sm:text-lg font-bold font-display text-m3-on-surface flex items-center gap-2 truncate">
          <span className="truncate">{t('unreadMessages')}</span>
          {unreadMessages.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-black rounded-full bg-m3-primary text-m3-on-primary font-display shrink-0">
              {unreadMessages.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setActiveScreen('messages')}
          className="text-xs font-bold text-m3-primary hover:underline flex items-center gap-1 font-display m3-pressable"
        >
          <span>{t('showAllMessages')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Column Container */}
      <div className="p-3 sm:p-4 rounded-m3-2xl bg-m3-surface-container flex flex-col gap-2.5 flex-1 justify-between">
        <div className="flex flex-col gap-2.5">
          {displayMessages.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center gap-2 text-m3-on-surface-variant">
              <MailOpen className="w-8 h-8 text-m3-on-surface-variant/40" />
              <span className="text-xs font-bold text-m3-on-surface-variant font-display">
                {t('noUnreadMessages')}
              </span>
            </div>
          ) : (
            displayMessages.map((msg) => {
              const isUnconfirmedIncoming = (msg.type === 'received' || msg.type === 'noticeboard') && msg.requireConfirmation && !msg.confirmed;
              return (
                <div
                  key={msg.id}
                  onClick={() => {
                    markMessageAsRead(msg.id);
                    setSelectedMessageId(msg.id);
                    setActiveScreen(`message-detail?id=${msg.id}`);
                  }}
                  className={`p-3 rounded-m3-xl flex flex-col gap-1 cursor-pointer transition-all m3-pressable ${
                    isUnconfirmedIncoming
                      ? 'bg-amber-500/10 hover:bg-amber-500/15'
                      : 'bg-m3-surface-container-high hover:bg-m3-surface-container-highest'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-extrabold text-m3-on-surface font-display truncate">
                      {msg.sender.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isUnconfirmedIncoming && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center gap-1 font-display">
                          <AlertCircle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                          <span>{t('tabToConfirm')}</span>
                        </span>
                      )}
                      {msg.type === 'noticeboard' && (
                        <span className="text-[10px] text-m3-primary font-bold px-1.5 py-0.2 rounded-full bg-m3-primary-container">
                          {t('tabInfochannel')}
                        </span>
                      )}
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-m3-on-surface line-clamp-1">
                    {msg.title}
                  </h4>

                  <p className="text-[11px] text-m3-on-surface-variant line-clamp-2">
                    {msg.text}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* 3rd item: Persistent '+N unread messages' button if more exist, or 'View All' */}
        {remainingCount > 0 ? (
          <button
            onClick={() => setActiveScreen('messages')}
            className="w-full py-2.5 px-3 rounded-m3-xl bg-m3-primary-container/70 hover:bg-m3-primary-container text-m3-on-primary-container font-extrabold text-xs flex items-center justify-center gap-1.5 m3-pressable transition-all font-display"
          >
            <Plus className="w-4 h-4" />
            <span>{t('moreUnread', { count: remainingCount })}</span>
          </button>
        ) : (
          <button
            onClick={() => setActiveScreen('messages')}
            className="w-full py-2 px-3 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-primary text-xs font-bold flex items-center justify-center gap-1.5 m3-pressable transition-all font-display"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t('showAllMessages')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
