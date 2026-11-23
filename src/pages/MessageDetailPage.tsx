import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Reply,
  Radio,
  Clock,
  FileEdit,
  Trash2,
  CheckCircle2,
  CheckCheck,
  AlertCircle,
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { formatCzechDate } from '../utils/dateUtils';
import { MaterialWavyDivider } from '../components/common/MaterialWavyDivider';
import { MessageAttachments } from '../components/common/MessageAttachments';
import { sanitizeMessageHtml } from '../utils/textUtils';

export const MessageDetailPage: React.FC = () => {
  const {
    messages,
    selectedMessageId,
    markMessageAsRead,
    setReplyToMessageId,
    confirmMessage,
    confirmSentMessage,
    checkMessageConfirmation,
    deleteMessage,
    teachers,
    students,
  } = useDataStore();
  const { setActiveScreen, t } = useSettingsStore();
  const { user } = useAuthStore();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmFailed, setConfirmFailed] = useState(false);
  const [checkStatusNotice, setCheckStatusNotice] = useState<string | null>(null);

  // Retrieve message either from selectedMessageId or URL query param
  const queryId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.hash.split('?')[1] || '').get('id')
    : null;

  const messageId = selectedMessageId || queryId;
  const message = messages.find((m) => m.id === messageId) || messages[0];
  // Cached HTML from older app versions must pass the current policy too.
  const safeHtml = useMemo(() => sanitizeMessageHtml(message?.html || ''), [message?.html]);

  useEffect(() => {
    if (message && message.unread) {
      markMessageAsRead(message.id);
    }
  }, [message, markMessageAsRead]);

  // If viewing an unconfirmed sent message, check status from server on interval
  useEffect(() => {
    if (message && message.type === 'sent' && message.requireConfirmation && !message.confirmed) {
      checkMessageConfirmation(message.id);
      const interval = setInterval(() => {
        checkMessageConfirmation(message.id);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [message?.id, message?.type, message?.requireConfirmation, message?.confirmed, checkMessageConfirmation]);

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setActiveScreen('messages');
    }
  };

  const handleReply = () => {
    if (!message) return;
    setReplyToMessageId(message.id);
    setActiveScreen(`new-message?replyTo=${message.id}`);
  };

  const handleManualConfirm = async (recipientId?: string) => {
    if (!message) return;
    await confirmSentMessage(message.id, recipientId);
    setCheckStatusNotice(t('markConfirmedStatusNotice'));
  };

  if (!message) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-8 flex flex-col items-center justify-center gap-4">
        <p className="text-sm font-bold text-m3-on-surface-variant font-display">
          {t('messageNotFound')}
        </p>
        <button
          onClick={() => setActiveScreen('messages')}
          className="px-5 py-2.5 rounded-full bg-m3-primary text-m3-on-primary font-bold text-xs font-display m3-pressable"
        >
          {t('backToMessages')}
        </button>
      </div>
    );
  }

  const isNoticeboard = message.type === 'noticeboard';
  const isSent = message.type === 'sent';
  const isDraft = message.type === 'draft';

  const recipients = message.recipients || [];
  const confirmedRecipientsCount = recipients.filter((r) => r.confirmed).length;
  const totalRecipientsCount = recipients.length > 0 ? recipients.length : 1;
  const isFullyConfirmed = Boolean(
    message.confirmed || (recipients.length > 0 && confirmedRecipientsCount === totalRecipientsCount)
  );
  const isPartiallyConfirmed = !isFullyConfirmed && confirmedRecipientsCount > 0;

  // Target person displayed in the header (recipient for sent messages, sender for incoming messages)
  const rawTargetName = isSent && message.recipientName ? message.recipientName : message.sender.name;
  const rawDisplayName = isSent && message.recipientName ? `Pro: ${message.recipientName}` : message.sender.name;

  // Match target person against students directory
  const studentMatch = React.useMemo(() => {
    if (!rawTargetName) return null;
    const clean = rawTargetName.replace(/^(?:Pro|Od):\s*/i, '').trim();
    const cleanNoClass = clean
      .replace(/(?:,\s*|\s*-\s*)[1-9]\.[A-Z0-9]+(?:\s*[a-z]+)?\b/gi, '')
      .replace(/\s*\([1-9]\.[A-Z0-9]+\)/gi, '')
      .trim();

    return (
      students.find(
        (s) =>
          s.name.toLowerCase() === cleanNoClass.toLowerCase() ||
          s.name.toLowerCase() === clean.toLowerCase() ||
          (isSent && message.recipientIds?.includes(s.id))
      ) || null
    );
  }, [rawTargetName, students, isSent, message.recipientIds]);

  // Detect class from name, recipient, role, or group
  const detectedClass = React.useMemo(() => {
    // 1. From recipientName or sender name (e.g. "Jan Novák, 3.B", "Celá třída (3.B)", "Adam Černý 3.B")
    const nameToScan = `${message.recipientName || ''} ${message.sender.name || ''}`;
    const nameMatch = nameToScan.match(/(?:,\s*|\s*\(|\s*-\s*|\s+)([1-9]\.[A-Z0-9]+)\b/i);
    if (nameMatch) return nameMatch[1].toUpperCase();

    // 2. From student match in store
    if (studentMatch?.className) return studentMatch.className;

    // 3. From role of sender if received
    const roleMatch = (!isSent ? message.sender.role : '')?.match(/\b([1-9]\.[A-Z0-9]+)\b/i);
    if (roleMatch) return roleMatch[1].toUpperCase();

    // 4. From recipient group if applicable
    if (message.recipientGroup === 'students_class' && user?.className) {
      return user.className;
    }

    // 5. If sent to a student or group of students, default to user's class if student
    if (isSent) {
      const isStudentRecipient = Boolean(
        studentMatch ||
        (message.recipientType && (/^Z/i.test(message.recipientType) || /student/i.test(message.recipientType))) ||
        (message.recipientGroup && /student/i.test(message.recipientGroup))
      );
      if (isStudentRecipient && user?.className) {
        return user.className;
      }
    }

    // 6. If incoming from explicitly a student/classmate or user themselves
    if (!isSent) {
      const isSenderStudent = Boolean(
        studentMatch ||
        (message.sender.role && /student|žák/i.test(message.sender.role)) ||
        message.sender.id === 'me' ||
        message.sender.id === user?.id
      );
      if (isSenderStudent && user?.className) {
        return user.className;
      }
    }

    return null;
  }, [message.recipientName, message.sender.name, message.sender.role, message.recipientGroup, message.recipientType, isSent, studentMatch, user?.id, user?.className]);

  // Clean displayName to remove any class suffix so it's not shown in the name
  const displayName = React.useMemo(() => {
    let clean = rawDisplayName || '';
    clean = clean
      .replace(/(?:,\s*|\s*-\s*)[1-9]\.[A-Z0-9]+(?:\s*[a-z]+)?\b/gi, '')
      .replace(/\s*\([1-9]\.[A-Z0-9]+\)/gi, '')
      .replace(/\s+[1-9]\.[A-Z0-9]+$/gi, '')
      .trim();

    if (detectedClass) {
      clean = clean
        .replace(new RegExp(`\\s*\\(?${detectedClass}\\)?`, 'gi'), '')
        .replace(/(?:,\s*|\s*-\s*)$/, '')
        .trim();
    }
    return clean || rawDisplayName;
  }, [rawDisplayName, detectedClass]);

  const personName = React.useMemo(() => {
    let clean = rawTargetName || '';
    clean = clean
      .replace(/(?:,\s*|\s*-\s*)[1-9]\.[A-Z0-9]+(?:\s*[a-z]+)?\b/gi, '')
      .replace(/\s*\([1-9]\.[A-Z0-9]+\)/gi, '')
      .replace(/\s+[1-9]\.[A-Z0-9]+$/gi, '')
      .trim();
    if (detectedClass) {
      clean = clean
        .replace(new RegExp(`\\s*\\(?${detectedClass}\\)?`, 'gi'), '')
        .replace(/(?:,\s*|\s*-\s*)$/, '')
        .trim();
    }
    return clean || rawTargetName;
  }, [rawTargetName, detectedClass]);

  const cleanSenderName = React.useMemo(() => {
    let s = message.sender.name || '';
    return s
      .replace(/(?:,\s*|\s*-\s*)[1-9]\.[A-Z0-9]+(?:\s*[a-z]+)?\b/gi, '')
      .replace(/\s*\([1-9]\.[A-Z0-9]+\)/gi, '')
      .replace(/\s+[1-9]\.[A-Z0-9]+$/gi, '')
      .trim() || message.sender.name;
  }, [message.sender.name]);

  const initials = React.useMemo(() => {
    if (!personName) return 'ZP';
    const cleaned = personName.replace(/^(?:Mgr|Ing|PhDr|RNDr|doc|prof|Bc|MUDr|MVDr|PaedDr)\.?\s*/gi, '').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase() || 'ZP';
  }, [personName]);

  // Determine whether the displayed person is a teacher, noticeboard, or student
  const isPersonTeacher = React.useMemo(() => {
    if (isNoticeboard) return false;

    // 1. Explicitly identified student is NEVER a teacher!
    if (studentMatch) return false;
    if (isSent) {
      if (message.recipientType && (/^Z/i.test(message.recipientType) || /student|žák/i.test(message.recipientType))) {
        return false;
      }
      if (typeof message.recipientGroup === 'string' && /student|class/i.test(message.recipientGroup)) {
        return false;
      }
    } else {
      if (message.sender.role && /student|žák|spolužák/i.test(message.sender.role)) {
        return false;
      }
      if (message.sender.id === 'me' || message.sender.id === user?.id) {
        if (user?.userType === 'student') return false;
      }
    }

    // 2. Academic titles in Czech exclusively belong to teachers/staff
    // ONLY check personName / target name (NEVER the sender when isSent!)
    const DEGREE_REGEX = /^(?:Mgr|Ing|PhDr|RNDr|doc|prof|Bc|MUDr|MVDr|PaedDr|JUDr|ThDr|MgA|BcA)\.?\b/i;
    if (DEGREE_REGEX.test(personName) || DEGREE_REGEX.test(rawTargetName)) {
      return true;
    }

    // 3. Check role of the target person
    if (!isSent) {
      if (
        message.sender.role &&
        /(učitel|učitelka|vyučující|profesor|profesorka|ředitel|ředitelka|vedení|zástupce|poradce|pedagog|lektor)/i.test(
          message.sender.role
        )
      ) {
        return true;
      }
    } else {
      if (message.recipientType && (/^U/i.test(message.recipientType) || /teacher|učitel|vyučující/i.test(message.recipientType))) {
        return true;
      }
      if (typeof message.recipientGroup === 'string' && /teacher|učitel/i.test(message.recipientGroup)) {
        return true;
      }
    }

    // 4. Check against teachers list from store (strictly by full name or ID)
    const isTargetInTeachers = teachers.some((t) => {
      if (!t) return false;
      if (isSent) {
        if (message.recipientIds && message.recipientIds.includes(t.id)) return true;
      } else {
        if (message.sender.id && t.id === message.sender.id) return true;
      }
      const cleanT = t.name.replace(/^(?:Mgr|Ing|PhDr|RNDr|doc|prof|Bc|MUDr|MVDr|PaedDr)\.?\s*/gi, '').trim().toLowerCase();
      const cleanP = personName.toLowerCase();
      return cleanT === cleanP || t.name.toLowerCase() === cleanP;
    });
    if (isTargetInTeachers) {
      return true;
    }

    // 5. Incoming messages from unknown adult staff/teachers (unless sender is a student)
    if (!isSent && message.sender.id !== 'me' && message.sender.id !== user?.id && !detectedClass) {
      return true;
    }

    return false;
  }, [
    isNoticeboard,
    studentMatch,
    personName,
    rawTargetName,
    isSent,
    message.recipientType,
    message.recipientGroup,
    message.recipientIds,
    message.sender.role,
    message.sender.id,
    teachers,
    user?.id,
    user?.userType,
    detectedClass,
  ]);

  // Single header badge:
  // - Noticeboard: "Nástěnka"
  // - Teacher: "Učitel" (replaces the class)
  // - Student: class abbreviation (e.g. "3.B"), with "student" removed
  const headerBadge = React.useMemo(() => {
    if (isNoticeboard) return t('noticeboardBadge');
    if (isPersonTeacher) return t('teacherBadge');
    if (detectedClass) return detectedClass;
    return null;
  }, [isNoticeboard, isPersonTeacher, detectedClass, t]);

  return (
    <div className="w-full flex-1 flex flex-col -mb-24 sm:-mb-8 animate-in fade-in duration-200">
      {/* Top Navigation Bar / Breadcrumb */}
      <div className="w-full max-w-5xl mx-auto px-4 py-5 shrink-0">
        <div className="flex items-center justify-between gap-3 px-1">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface text-xs sm:text-sm font-bold font-display transition-colors m3-pressable shadow-xs shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('backToMessages')}</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Category Pill (only for special categories like Infokanál, Odeslané, Koncepty) */}
            {(isNoticeboard || isSent || isDraft) && (
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-extrabold font-display uppercase tracking-wider shadow-xs ${
                  isNoticeboard
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : isSent
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                }`}
              >
                {isNoticeboard
                  ? t('tabInfochannel')
                  : isSent
                  ? t('tabSent')
                  : t('tabDrafts')}
              </span>
            )}

            {isDraft && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    deleteMessage(message.id);
                    handleBack();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-bold font-display shadow-xs m3-pressable transition-all cursor-pointer shrink-0"
                  title="Smazat koncept"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Smazat</span>
                </button>

                <button
                  onClick={() => setActiveScreen(`new-message?draftId=${message.id}`)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 active:scale-95 text-m3-on-primary text-xs sm:text-sm font-bold font-display shadow-xs m3-pressable transition-all cursor-pointer shrink-0"
                >
                  <FileEdit className="w-4 h-4 shrink-0" />
                  <span>Upravit koncept</span>
                </button>
              </div>
            )}

            {!isNoticeboard && !isSent && !isDraft && (
              <button
                onClick={handleReply}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 active:scale-95 text-m3-on-primary text-xs sm:text-sm font-bold font-display shadow-xs m3-pressable transition-all cursor-pointer shrink-0"
              >
                <Reply className="w-4 h-4 shrink-0" />
                <span>{t('reply')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Message Backdrop: 100% width, extended to bottom, rounded top only */}
      <div className="w-full flex-1 bg-m3-surface-container text-m3-on-surface rounded-t-m3-3xl rounded-b-none shadow-sm pb-28 sm:pb-16 pt-6 sm:pt-8">
        {/* Inner Content - max-w-4xl mx-auto with generous padding */}
        <div className="w-full max-w-4xl mx-auto px-6 sm:px-10 md:px-12 flex flex-col gap-6">
          {/* Sender Header: Initials circle on the left, two rows, and confirmation button on the right */}
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              {/* Avatar circle (w-12 h-12) */}
              <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center font-black font-display text-sm shrink-0 shadow-2xs">
                {isNoticeboard ? (
                  <Radio className="w-5 h-5 text-m3-primary" />
                ) : (
                  initials
                )}
              </div>

              {/* Two rows */}
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                {/* Row 1: Name and Badge (Class for students, "Učitel" for teachers) */}
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-base sm:text-lg font-bold font-display text-m3-on-surface truncate">
                    {displayName}
                  </span>

                  {headerBadge && (
                    <span className="text-[11px] font-extrabold font-display px-2.5 py-0.5 rounded-full bg-m3-surface-container-highest text-m3-on-surface-variant shrink-0">
                      {headerBadge}
                    </span>
                  )}
                </div>

                {/* Row 2: Time and Date */}
                <div className="flex items-center gap-1.5 text-xs text-m3-on-surface-variant font-medium">
                  <Clock className="w-3.5 h-3.5 text-m3-on-surface-variant/70 shrink-0" />
                  <span>{formatCzechDate(message.date, 'withTime')}</span>
                  {isSent && (
                    <span className="text-m3-on-surface-variant/70 ml-1 truncate">
                      (Od: {cleanSenderName})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Confirmation button / status right next to name and date for received messages */}
            {!isSent && message.requireConfirmation && (
              message.confirmed ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold font-display shrink-0">
                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Potvrzeno</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  {confirmFailed && (
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 font-display flex items-center gap-1" title={t('confirmFailedNotice')}>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    </span>
                  )}
                  <button
                    disabled={isConfirming}
                    onClick={async () => {
                      setIsConfirming(true);
                      setConfirmFailed(false);
                      const ok = await confirmMessage(message.id);
                      setConfirmFailed(!ok);
                      setIsConfirming(false);
                    }}
                    className="px-3.5 sm:px-4 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs sm:text-sm font-bold font-display shadow-2xs m3-pressable flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>{isConfirming ? t('sending') : 'Potvrdit'}</span>
                  </button>
                </div>
              )
            )}
          </div>

          {/* Material squiggly/wavy line between sender header and title */}
          <MaterialWavyDivider />

        {/* Title Header */}
        <div className="flex flex-col gap-2.5">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black font-display text-m3-on-surface tracking-tight leading-snug">
            {message.title}
          </h1>

          {/* Confirmation Status for Sent Messages (under heading) */}
          {isSent && message.requireConfirmation && (
            <div className="flex flex-col gap-2 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap text-sm font-bold font-display">
                {isFullyConfirmed ? (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCheck className="w-4 h-4 shrink-0" />
                    <span>
                      {recipients.length > 1
                        ? t('allConfirmedNotice')
                        : t('readConfirmedNotice')}
                    </span>
                    {message.confirmedDate && (
                      <span className="text-xs font-normal text-m3-on-surface-variant/70">
                        ({formatCzechDate(message.confirmedDate, 'withTime')})
                      </span>
                    )}
                  </div>
                ) : isPartiallyConfirmed ? (
                  <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                    <CheckCheck className="w-4 h-4 shrink-0" />
                    <span>
                      {t('partiallyConfirmedNotice', { confirmed: confirmedRecipientsCount, total: totalRecipientsCount })}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>
                      {recipients.length > 1
                        ? t('confirmedByCount', { confirmed: confirmedRecipientsCount, total: totalRecipientsCount })
                        : t('waitingForConfirmNotice')}
                    </span>
                  </div>
                )}
              </div>

              {/* Recipient breakdown if multiple recipients */}
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {recipients.map((rec, idx) => (
                    <div
                      key={rec.id || idx}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        rec.confirmed
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {rec.confirmed ? (
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                      <span>{rec.name}</span>
                      {rec.confirmed && rec.confirmedDate && (
                        <span className="text-[10px] opacity-75">
                          ({formatCzechDate(rec.confirmedDate, 'short')})
                        </span>
                      )}
                      {!rec.confirmed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManualConfirm(rec.id);
                          }}
                          className="ml-1 px-1.5 py-0.5 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-900 dark:text-amber-200 text-[10px] font-bold transition-colors cursor-pointer"
                          title={t('markRecipientConfirmedTitle')}
                        >
                          {t('confirmRead')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {checkStatusNotice && (
                <div className="px-3 py-1.5 rounded-xl bg-sky-500/15 text-sky-900 dark:text-sky-200 text-xs font-medium w-fit">
                  {checkStatusNotice}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Body Content */}
        <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6 rounded-m3-2xl bg-m3-surface-container-low text-sm sm:text-base text-m3-on-surface leading-relaxed font-sans select-text">
          {message.attachments && message.attachments.length > 0 && (
            <MessageAttachments key={message.id} attachments={message.attachments} />
          )}
          {message.html ? (
            <div className="komens-message-content" dangerouslySetInnerHTML={{ __html: safeHtml }} />
          ) : (
            <div className="whitespace-pre-wrap">{message.text}</div>
          )}
        </div>

        </div>
      </div>
    </div>
  );
};
