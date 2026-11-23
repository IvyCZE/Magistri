import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  FileEdit,
  Radio,
  CheckCircle2,
  CheckCheck,
  Clock,
  User,
  Search,
  Plus,
  PenSquare,
  AlertCircle,
  Paperclip,
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useKeyboardOpen } from '../native/keyboard';
import { KomensMessage } from '../types/bakalari';
import { formatCzechDate, sortByDateDesc } from '../utils/dateUtils';
import { groupRadius } from '../utils/groupRadius';

const MESSAGE_TABS = ['received', 'unread', 'infochannel', 'sent', 'drafts'] as const;
type MessagesTab = typeof MESSAGE_TABS[number];
const LAST_TAB_KEY = 'b_messages_tab';
const TAB_ALIASES = new Map<string, MessagesTab>([
  ...MESSAGE_TABS.map((tab) => [tab, tab] as const),
  ['odeslane', 'sent'], ['infokanal', 'infochannel'], ['new', 'unread'], ['nove', 'unread'],
]);

function readMessagesTab(initialTab?: MessagesTab): MessagesTab {
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const requestedTab = TAB_ALIASES.get(params.get('tab') ?? '') ?? initialTab;
  if (requestedTab) return requestedTab;
  try {
    return TAB_ALIASES.get(localStorage.getItem(LAST_TAB_KEY) ?? '') ?? 'received';
  } catch {
    return 'received';
  }
}

interface MessagesPageProps {
  initialTab?: MessagesTab;
}

export const MessagesPage: React.FC<MessagesPageProps> = ({ initialTab }) => {
  const { messages, isRefreshing, isServerDown, markMessageAsRead, setSelectedMessageId, setReplyToMessageId, fetchAllData, confirmMessage } = useDataStore();
  const { setActiveScreen, t } = useSettingsStore();
  const keyboardOpen = useKeyboardOpen();

  // Trigger fetch on mount if messages are empty
  useEffect(() => {
    if (messages.length === 0) {
      fetchAllData(false);
    }
  }, [fetchAllData, messages.length]);

  // Automatic interval polling for messages and confirmations while on Komens
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  const [activeTab, setActiveTab] = useState(() => readMessagesTab(initialTab));

  useEffect(() => {
    try {
      localStorage.setItem(LAST_TAB_KEY, activeTab);
    } catch { /* The current tab still works when browser storage is blocked. */ }
  }, [activeTab]);

  useEffect(() => {
    const updateTabFromHash = () => {
      const route = window.location.hash.split('?')[0];
      if (/^#\/?(?:messages|infochannel)$/.test(route)) setActiveTab(readMessagesTab(initialTab));
    };
    window.addEventListener('hashchange', updateTabFromHash);
    return () => window.removeEventListener('hashchange', updateTabFromHash);
  }, [initialTab]);

  const selectTab = (tab: MessagesTab) => {
    const [route, query] = window.location.hash.split('?');
    if (/^#\/?(?:messages|infochannel)$/.test(route)) {
      const params = new URLSearchParams(query);
      params.set('tab', tab);
      // Keep the tab on this history entry so Back from a message restores it.
      history.replaceState(history.state, '', `${route}?${params}`);
    }
    setActiveTab(tab);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [confirmFailedId, setConfirmFailedId] = useState<string | null>(null);
  const [confirmingMessageId, setConfirmingMessageId] = useState<string | null>(null);

  // Clear the confirmation failure notice after a moment
  useEffect(() => {
    if (!confirmFailedId) return;
    const timer = setTimeout(() => setConfirmFailedId(null), 8000);
    return () => clearTimeout(timer);
  }, [confirmFailedId]);

  const unreadCount = messages.filter((m) => m.unread).length;
  const infochannelUnreadCount = messages.filter((m) => m.type === 'noticeboard' && m.unread).length;

  // Filter and sort messages based on active tab and search (freshest / newest first)
  const filteredMessages = sortByDateDesc(
    messages.filter((m) => {
      // Tab filter
      if (activeTab === 'unread' && !m.unread) return false;
      if (activeTab === 'infochannel' && m.type !== 'noticeboard') return false;
      if (activeTab === 'sent' && m.type !== 'sent') return false;
      if (activeTab === 'drafts' && m.type !== 'draft') return false;
      if (activeTab === 'received' && (m.type === 'sent' || m.type === 'draft' || m.type === 'noticeboard')) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.title.toLowerCase().includes(q) ||
          m.text.toLowerCase().includes(q) ||
          m.sender.name.toLowerCase().includes(q)
        );
      }
      return true;
    })
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-5">
      {/* Page Header with Nová zpráva button */}
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
          {t('messages')}
        </h1>

        <button
          onClick={() => {
            setReplyToMessageId(null);
            setActiveScreen('new-message');
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary text-xs sm:text-sm font-bold font-display shadow-xs m3-pressable transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('newMessage')}</span>
        </button>
      </div>

      {/* Tabs: Received, To Confirm, Nové (Unread), Infokanál, Sent, Drafts */}
      <div className="flex items-center p-1.5 rounded-full bg-m3-surface-container gap-1 self-start max-w-full overflow-x-auto no-scrollbar">
        <button
          onClick={() => selectTab('received')}
          aria-pressed={activeTab === 'received'}
          className={`px-4 py-2 rounded-full text-xs font-bold font-display transition-all m3-pressable shrink-0 ${
            activeTab === 'received'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          {t('tabReceived')}
        </button>

        <button
          onClick={() => selectTab('unread')}
          aria-pressed={activeTab === 'unread'}
          className={`px-4 py-2 rounded-full text-xs font-bold font-display transition-all m3-pressable shrink-0 flex items-center gap-1.5 ${
            activeTab === 'unread'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          <span>{t('tabUnread')}</span>
          {unreadCount > 0 && (
            <span className={`px-1.5 py-0.2 text-[10px] font-black rounded-full ${
              activeTab === 'unread' ? 'bg-m3-on-primary/20 text-m3-on-primary' : 'bg-m3-primary text-m3-on-primary'
            }`}>
              {unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => selectTab('infochannel')}
          aria-pressed={activeTab === 'infochannel'}
          className={`px-4 py-2 rounded-full text-xs font-bold font-display transition-all m3-pressable shrink-0 flex items-center gap-1.5 ${
            activeTab === 'infochannel'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          <span>{t('tabInfochannel')}</span>
          {infochannelUnreadCount > 0 && (
            <span className={`px-1.5 py-0.2 text-[10px] font-black rounded-full ${
              activeTab === 'infochannel' ? 'bg-m3-on-primary/20 text-m3-on-primary' : 'bg-m3-primary text-m3-on-primary'
            }`}>
              {infochannelUnreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => selectTab('sent')}
          aria-pressed={activeTab === 'sent'}
          className={`px-4 py-2 rounded-full text-xs font-bold font-display transition-all m3-pressable shrink-0 ${
            activeTab === 'sent'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          {t('tabSent')}
        </button>

        <button
          onClick={() => selectTab('drafts')}
          aria-pressed={activeTab === 'drafts'}
          className={`px-4 py-2 rounded-full text-xs font-bold font-display transition-all m3-pressable shrink-0 ${
            activeTab === 'drafts'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          {t('tabDrafts')}
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-m3-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchMessagesPlaceholder')}
          className="w-full pl-10 pr-4 py-2.5 rounded-full bg-m3-surface-container text-m3-on-surface text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-m3-primary/50"
        />
      </div>

      {/* Messages List */}
      <div className="flex flex-col gap-1.5">
        {filteredMessages.length === 0 ? (
          isRefreshing && messages.length === 0 ? (
            <div className="flex flex-col gap-1.5">
              {[1, 2, 3].map((i, idx) => (
                <div key={i} className={`p-4 ${groupRadius(idx, 3)} bg-m3-surface-container animate-pulse flex flex-col gap-3`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-m3-surface-container-highest" />
                      <div className="flex flex-col gap-1.5">
                        <div className="w-24 h-3 bg-m3-surface-container-highest rounded-full" />
                        <div className="w-16 h-2 bg-m3-surface-container-highest rounded-full" />
                      </div>
                    </div>
                    <div className="w-14 h-4 bg-m3-surface-container-highest rounded-full" />
                  </div>
                  <div className="w-3/4 h-3 bg-m3-surface-container-highest rounded-full" />
                </div>
              ))}
            </div>
          ) : isServerDown && messages.length === 0 ? (
            <div className="py-10 px-4 flex flex-col items-center justify-center text-center gap-3 rounded-m3-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-10 h-10 text-amber-500" />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold font-display">
                  Zprávy se nepodařilo načíst
                </span>
                <span className="text-xs opacity-80">
                  Bakaláři mají výpadek serveru nebo neodpovídají.
                </span>
              </div>
              <button
                type="button"
                onClick={() => fetchAllData(false)}
                className="px-4 py-2 rounded-full bg-amber-500 text-white text-xs font-bold font-display shadow-xs hover:bg-amber-600 transition-colors m3-pressable"
              >
                Zkusit znovu
              </button>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-2 rounded-m3-2xl bg-m3-surface-container text-m3-on-surface-variant">
              {activeTab === 'infochannel' ? (
                <Radio className="w-10 h-10 text-m3-on-surface-variant/40" />
              ) : (
                <Mail className="w-10 h-10 text-m3-on-surface-variant/40" />
              )}
              <span className="text-sm font-bold font-display text-m3-on-surface">
                {activeTab === 'infochannel'
                  ? t('noNoticeboardMessages')
                  : activeTab === 'unread'
                  ? t('noUnreadMessages')
                  : t('noCategoryMessages')}
              </span>
            </div>
          )
        ) : (
          filteredMessages.map((msg, msgIndex) => {
            const attachmentCount = msg.attachments?.length ?? 0;
            const isSent = msg.type === 'sent';
            const isDraft = msg.type === 'draft';
            const isUnconfirmedIncoming = !isSent && !isDraft && msg.requireConfirmation && !msg.confirmed;
            const displayName = isDraft
              ? (msg.recipientName ? t('recipientPrefix', { name: msg.recipientName }) : t('noRecipient'))
              : (isSent && msg.recipientName ? t('recipientPrefix', { name: msg.recipientName }) : msg.sender.name);
            const initials = (isSent && msg.recipientName ? msg.recipientName : msg.sender.name)
              .replace(/^(?:Mgr|Ing|PhDr|RNDr|doc|prof|Bc)\.?\s*/i, '')
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={msg.id}
                onClick={() => {
                  if (msg.type === 'draft') {
                    setActiveScreen(`new-message?draftId=${msg.id}`);
                    return;
                  }
                  markMessageAsRead(msg.id);
                  setSelectedMessageId(msg.id);
                  setActiveScreen(`message-detail?id=${msg.id}`);
                }}
                className={`p-4 ${groupRadius(msgIndex, filteredMessages.length)} transition-all cursor-pointer m3-pressable flex flex-col gap-2.5 shadow-xs bg-m3-surface-container hover:bg-m3-surface-container-high`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-m3-surface-container-highest flex items-center justify-center text-m3-primary font-bold text-xs shrink-0 font-display">
                      {msg.type === 'noticeboard' ? (
                        <Radio className="w-4 h-4 text-m3-primary" />
                      ) : isDraft ? (
                        <FileEdit className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      ) : (
                        initials || 'ZP'
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-m3-on-surface font-display truncate block">
                        {displayName}
                      </span>
                      {isSent ? (
                        <span className="text-[10px] text-m3-on-surface-variant">
                          {t('sentByYou')}
                        </span>
                      ) : isDraft ? null : msg.sender.role ? (
                        <span className="text-[10px] text-m3-on-surface-variant">
                          {msg.sender.role}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {msg.unread && (
                      <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-m3-primary text-m3-on-primary font-display shadow-xs">
                        {t('unreadBadge')}
                      </span>
                    )}
                    {isDraft && (
                      <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 font-display">
                        Koncept
                      </span>
                    )}
                    {!isDraft && msg.requireConfirmation && (() => {
                      if (isUnconfirmedIncoming) {
                        return (
                          <button
                            type="button"
                            disabled={confirmingMessageId === msg.id}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirmingMessageId === msg.id) return;
                              setConfirmingMessageId(msg.id);
                              setConfirmFailedId(null);
                              const ok = await confirmMessage(msg.id);
                              if (!ok) {
                                setConfirmFailedId(msg.id);
                              }
                              setConfirmingMessageId(null);
                            }}
                            className="px-2.5 py-1 rounded-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[11px] font-extrabold font-display shadow-2xs flex items-center gap-1 m3-pressable shrink-0 transition-all"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{confirmingMessageId === msg.id ? t('sending') : t('confirmReadBtn')}</span>
                          </button>
                        );
                      }

                      const recs = msg.recipients;
                      const hasRecs = recs && recs.length > 0;
                      const confirmedCount = hasRecs ? recs.filter((r) => r.confirmed).length : 0;
                      const totalCount = hasRecs ? recs.length : 1;
                      const isFullyConfirmed = Boolean(msg.confirmed || (hasRecs && confirmedCount === totalCount));
                      const isPartiallyConfirmed = !isFullyConfirmed && hasRecs && confirmedCount > 0;

                      if (isFullyConfirmed) {
                        return (
                          <span
                            title={msg.confirmedDate ? `${t('confirmed')} ${formatCzechDate(msg.confirmedDate, 'withTime')}` : t('readConfirmed')}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-display"
                          >
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>{t('confirmed')}</span>
                          </span>
                        );
                      }
                      if (isPartiallyConfirmed) {
                        return (
                          <span
                            title={t('confirmedByCount', { confirmed: confirmedCount, total: totalCount })}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/25 shadow-2xs"
                          >
                            <CheckCheck className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                            <span>{confirmedCount}/{totalCount}</span>
                          </span>
                        );
                      }
                      return (
                        <span
                          title={t('readPendingNotice')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 shadow-2xs"
                        >
                          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>{t('pendingConfirmation')}</span>
                        </span>
                      );
                    })()}
                    <span className="text-[11px] text-m3-on-surface-variant font-medium">
                      {formatCzechDate(msg.date, 'short')}
                    </span>
                  </div>
                </div>

                {confirmFailedId === msg.id && (
                  <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-[11px] font-bold font-display px-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('confirmFailedNotice')}</span>
                  </div>
                )}

                <div>
                  <h3 className="flex items-center gap-2 text-sm sm:text-base font-bold font-display text-m3-on-surface">
                    <span className="min-w-0 truncate">{msg.title}</span>
                    {attachmentCount > 0 && (
                      <span
                        role="img"
                        aria-label={t('attachmentsWithCount', { count: attachmentCount })}
                        className="inline-flex shrink-0 items-center gap-1 text-xs text-m3-primary"
                      >
                        {attachmentCount}
                        <Paperclip aria-hidden="true" className="size-3.5" />
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-m3-on-surface-variant line-clamp-2 mt-0.5 leading-relaxed">
                    {msg.text}
                  </p>
                </div>

                {/* Sent message confirmation status for recipients */}
                {isSent && msg.requireConfirmation && (() => {
                  const recs = msg.recipients;
                  const hasRecs = recs && recs.length > 0;
                  const confirmedCount = hasRecs ? recs.filter((r) => r.confirmed).length : 0;
                  const totalCount = hasRecs ? recs.length : 1;
                  const isFullyConfirmed = Boolean(msg.confirmed || (hasRecs && confirmedCount === totalCount));
                  if (isFullyConfirmed) return null;
                  const isPartiallyConfirmed = hasRecs && confirmedCount > 0;

                  return (
                    <div className="mt-0.5 pt-2 border-t border-m3-outline-variant/15 flex items-center justify-between text-xs font-medium">
                      {isPartiallyConfirmed ? (
                        <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-semibold font-display">
                          <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {t('partiallyConfirmedNotice', { confirmed: confirmedCount, total: totalCount })}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold font-display">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {t('waitingForConfirmNotice')}
                          </span>
                        </div>
                      )}
                      {hasRecs && totalCount > 1 && (
                        <span className="text-[11px] text-m3-on-surface-variant font-medium">
                          {t('confirmedByCount', { confirmed: confirmedCount, total: totalCount })}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button (FAB) for mobile quick compose */}
      {!keyboardOpen && (
        <button
          onClick={() => {
            setReplyToMessageId(null);
            setActiveScreen('new-message');
          }}
          className="fab-bottom-right fixed sm:hidden z-20 flex items-center justify-center w-12 h-12 rounded-full bg-m3-primary text-m3-on-primary shadow-lg m3-pressable"
          aria-label={t('newMessage')}
        >
          <PenSquare className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
