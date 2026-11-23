package cz.prehled.app.widget

import cz.prehled.app.data.Prefs
import cz.prehled.app.data.Snapshot
import cz.prehled.app.domain.CountdownLabel
import cz.prehled.app.domain.CountdownMode
import cz.prehled.app.domain.CountdownState
import cz.prehled.app.domain.Day
import cz.prehled.app.domain.Lesson
import cz.prehled.app.domain.TestMark
import cz.prehled.app.domain.LessonChange
import cz.prehled.app.domain.computeCountdown
import cz.prehled.app.domain.Timetable
import cz.prehled.app.domain.getHolidayInfo
import cz.prehled.app.domain.parseTimeToMinutes
import cz.prehled.app.domain.TimetableSelection
import cz.prehled.app.domain.followingTimetableDays
import cz.prehled.app.domain.selectTimetableDay
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/*
 * Everything the widgets show is worked out here from the snapshot, the
 * preferences and a `now`, with no Android types, so it can be unit tested.
 * The Glance and RemoteViews code only draws these models.
 */

class WidgetText(language: String) {
    val cs = language != "en"
    val lang = if (cs) "cs" else "en"
    val locale: Locale = if (cs) Locale("cs", "CZ") else Locale.ENGLISH
    fun pick(czech: String, english: String) = if (cs) czech else english

    val signedOut get() = pick("Přihlaste se v aplikaci", "Sign in in the app")
    val sessionExpired get() = pick("Přihlášení vypršelo. Otevřete aplikaci.", "Your sign-in expired. Open the app.")
    val demo get() = pick("Demo režim: widgety ukážou data po přihlášení ke škole", "Demo mode: widgets show data after you sign in to a school")
    val loading get() = pick("Načítám data…", "Loading…")
    val noTimetable get() = pick("Rozvrh není k dispozici", "No timetable available")
    val noLessons get() = pick("V tento den se nevyučuje", "No classes this day")
    val noMarks get() = pick("Zatím žádné známky", "No marks yet")
    val noMessages get() = pick("Žádné zprávy", "No messages")
    val noHomework get() = pick("Žádné úkoly. Hurá!", "No homework. Hooray!")
    val noEvents get() = pick("Žádné nadcházející akce", "No upcoming events")
    val permanentBadge get() = pick("Stálý rozvrh", "Permanent")
    val todayTimetable get() = pick("Dnešní rozvrh", "Today's timetable")
    val tomorrowTimetable get() = pick("Zítřejší rozvrh", "Tomorrow's timetable")
    val mondayTimetable get() = pick("Rozvrh na pondělí", "Monday's timetable")
    val upcomingTimetable get() = pick("Nejbližší vyučování", "Nearest lessons")
    val today get() = pick("Dnes", "Today")
    val tomorrow get() = pick("Zítra", "Tomorrow")
    val monday get() = pick("Pondělí", "Monday")

    fun unreadMessages(n: Int) = when {
        !cs -> if (n == 1) "1 unread message" else "$n unread messages"
        n == 1 -> "1 nepřečtená zpráva"
        n in 2..4 -> "$n nepřečtené zprávy"
        else -> "$n nepřečtených zpráv"
    }

    fun moreItems(n: Int) = pick("+$n dalších", "+$n more")

    fun updatedAgo(ageMs: Long): String {
        val minutes = (ageMs / 60_000).coerceAtLeast(0)
        val span = when {
            minutes < 1 -> return pick("Aktualizováno právě teď", "Updated just now")
            minutes < 60 -> "$minutes min"
            minutes < 24 * 60 -> "${minutes / 60} h"
            else -> {
                val days = minutes / (24 * 60)
                if (cs) "$days ${if (days == 1L) "dnem" else "dny"}" else "$days d"
            }
        }
        return pick("Aktualizováno před $span", "Updated $span ago")
    }

    fun shortDate(date: LocalDate) = "${date.dayOfMonth}. ${date.monthValue}."

    fun relativeDay(date: LocalDate, today: LocalDate): String {
        val days = ChronoUnit.DAYS.between(date, today)
        return when {
            days == 0L -> pick("dnes", "today")
            days == 1L -> pick("včera", "yesterday")
            days == -1L -> pick("zítra", "tomorrow")
            days in 2..6 -> if (cs) "před $days dny" else "$days days ago"
            else -> shortDate(date)
        }
    }

    fun weekdayName(date: LocalDate): String = date.dayOfWeek.getDisplayName(TextStyle.FULL, locale)
}

/** What a widget has to show instead of data, or nothing when there is data. */
sealed interface WidgetStatus {
    data object Ready : WidgetStatus
    data object Demo : WidgetStatus
    data object SignedOut : WidgetStatus
    data object SessionExpired : WidgetStatus
    data object Loading : WidgetStatus
}

data class WidgetInputs(
    val snapshot: Snapshot?,
    val prefs: Prefs,
    val signedIn: Boolean,
    val sessionExpired: Boolean,
    val now: LocalDateTime,
    val nowMs: Long,
    val testMarks: List<TestMark> = emptyList(),
) {
    val text = WidgetText(prefs.language)

    val status: WidgetStatus
        get() = when {
            prefs.demo -> WidgetStatus.Demo
            !signedIn -> WidgetStatus.SignedOut
            sessionExpired && snapshot == null -> WidgetStatus.SessionExpired
            snapshot == null -> WidgetStatus.Loading
            else -> WidgetStatus.Ready
        }

    /**
     * Like [staleNote], but for one section of the snapshot. A section whose download keeps failing
     * keeps its old data while the snapshot as a whole looks fresh, so the age of its own last
     * successful download is what counts.
     */
    fun staleNoteFor(section: String): String? {
        val s = snapshot ?: return null
        val fetched = s.fetchedAt[section] ?: s.generatedAt
        return if (sessionExpired || nowMs - fetched > Snapshot.STALE_AFTER_MS) text.updatedAgo(nowMs - fetched) else null
    }

    /** "Updated 2 h ago" when the data is old or the session expired, otherwise null. */
    val staleNote: String?
        get() {
            val s = snapshot ?: return null
            return if (sessionExpired || s.isStale(nowMs)) text.updatedAgo(nowMs - s.generatedAt) else null
        }
}

enum class ChangeKind { CANCELED, SUBSTITUTION, ROOM, ADDED, OTHER }

data class LessonRow(
    val hour: String,
    val time: String,
    val subject: String,
    val room: String,
    /** The substitute's code when the lesson is a substitution, otherwise the regular teacher. */
    val teacher: String,
    val badge: String?,
    val badgeKind: ChangeKind?,
    val isCurrent: Boolean,
    val isPast: Boolean = false,
    /** The parts the change touches, which the widget highlights in the theme colour. */
    val roomChanged: Boolean = false,
    val teacherChanged: Boolean = false,
    val subjectChanged: Boolean = false,
    /** The user flagged a test in this hour. */
    val hasTest: Boolean = false,
)

data class TimetableModel(
    val dayLabel: String,
    val dateText: String,
    val isPermanent: Boolean,
    val permanentBadge: String?,
    val holidayTitle: String?,
    val holidayBadge: String?,
    val lessons: List<LessonRow>,
    val emptyText: String?,
    /** Index in [lessons] of the lesson the "you are here" line sits in front of, during a break. */
    val breakBeforeLesson: Int? = null,
    /** The school days after this one, each built the same way (they never have a current lesson). */
    val followingDays: List<TimetableModel> = emptyList(),
) {
    companion object {
        /** Days shown after the first one. */
        const val FOLLOWING_DAYS = 2

        fun build(input: WidgetInputs): TimetableModel {
            val t = input.text
            val s = input.snapshot
            val actual = s?.timetableActual
            if (actual == null) return TimetableModel("", "", false, null, null, null, emptyList(), t.noTimetable)

            val permanent = s.timetablePermanent ?: Timetable.EMPTY
            val selection = selectTimetableDay(input.now, actual, permanent, s.timetableNext, t.lang)
            val day = selection.day ?: return TimetableModel("", "", false, null, null, null, emptyList(), t.noTimetable)

            val first = forDay(input, selection, day)
            val date = runCatching { LocalDate.parse(day.date.take(10)) }.getOrNull() ?: return first
            val following = followingTimetableDays(input.now.toLocalDate(), date, FOLLOWING_DAYS, actual, permanent, s.timetableNext, t.lang)
                .mapNotNull { next -> next.day?.let { forDay(input, next, it) } }
            return first.copy(followingDays = following)
        }

        private fun forDay(input: WidgetInputs, selection: TimetableSelection, day: Day): TimetableModel {
            val t = input.text
            val date = runCatching { LocalDate.parse(day.date.take(10)) }.getOrNull()
            val label = when {
                selection.isToday -> t.today
                selection.isTomorrow -> t.tomorrow
                selection.isNextMonday -> t.monday
                date != null -> t.weekdayName(date).replaceFirstChar { it.uppercase() }
                else -> day.dayOfWeekName
            }
            val dateText = date?.let { "${t.weekdayName(it)} ${t.shortDate(it)}" } ?: ""
            val holiday = getHolidayInfo(day, t.lang).takeIf { it.isHoliday }
            val perm = selection.isPerm.takeIf { it }?.let { t.permanentBadge }

            if (holiday != null && day.lessons.isEmpty()) {
                return TimetableModel(label, dateText, selection.isPerm, perm, holiday.title, holiday.badgeLabel, emptyList(), null)
            }

            val nowMin = input.now.hour * 60 + input.now.minute
            val rows = day.lessons
                .map { lesson -> lesson to selection.hours.firstOrNull { it.id == lesson.hourId } }
                .sortedBy { (_, hour) -> parseTimeToMinutes(hour?.beginTime) ?: 0 }
                .map { (lesson, hour) ->
                    val begin = parseTimeToMinutes(hour?.beginTime)
                    val end = parseTimeToMinutes(hour?.endTime)
                    val (badge, kind) = badgeFor(lesson, t)
                    val change = lesson.change
                    val substitute = if (change?.type == "Substitution") substituteCode(change) else null
                    val test = if (selection.isPerm) null
                        else input.testMarks.firstOrNull { it.hourId == lesson.hourId && it.date == day.date.take(10) }
                    LessonRow(
                        hour = hour?.caption.orEmpty(),
                        time = if (hour == null) "" else "${hour.beginTime}–${hour.endTime}",
                        subject = lesson.subjectName.ifEmpty { lesson.subjectAbbrev },
                        room = lesson.roomAbbrev,
                        teacher = substitute ?: lesson.teacherAbbrev.ifEmpty { lesson.teacherName },
                        badge = badge,
                        badgeKind = kind,
                        isCurrent = selection.isToday && begin != null && end != null && nowMin in begin until end,
                        isPast = selection.isToday && end != null && nowMin >= end,
                        roomChanged = kind == ChangeKind.ROOM && lesson.roomAbbrev.isNotEmpty(),
                        teacherChanged = kind == ChangeKind.SUBSTITUTION,
                        subjectChanged = kind == ChangeKind.ADDED,
                        hasTest = test != null,
                    )
                }

            val ongoing = selection.isToday && rows.any { it.isCurrent }
            val beginOf = day.lessons
                .map { lesson -> selection.hours.firstOrNull { it.id == lesson.hourId } }
                .sortedBy { parseTimeToMinutes(it?.beginTime) ?: 0 }
                .map { parseTimeToMinutes(it?.beginTime) }
            val breakBeforeLesson = if (!selection.isToday || ongoing) null
                else beginOf.indexOfFirst { it != null && it > nowMin }.takeIf { it >= 0 }

            return TimetableModel(label, dateText, selection.isPerm, perm, null, null, rows, if (rows.isEmpty()) t.noLessons else null, breakBeforeLesson)
        }

        private val TITLES = Regex("^(Mgr\\.?|PhDr\\.?|Ing\\.?|RNDr\\.?|Bc\\.?|BcA\\.?|doc\\.?|prof\\.?|PaedDr\\.?|MUDr\\.?|JUDr\\.?)\\s+", RegexOption.IGNORE_CASE)

        private fun surname(name: String): String =
            name.replace(TITLES, "").trim().split(Regex("\\s+")).lastOrNull().orEmpty()

        private fun substituteCode(change: LessonChange): String? {
            Regex("\\(([A-Za-zÀ-ž0-9]{2,5})(?:,[^)]*)?\\)").find(change.description)?.let { return it.groupValues[1] }
            return change.substituteTeacher?.let { surname(it.substringBefore(',')) }?.takeIf { it.isNotEmpty() }
        }

        private fun badgeFor(lesson: Lesson, t: WidgetText): Pair<String?, ChangeKind?> {
            val change = lesson.change ?: return null to null
            return when (change.type) {
                "Canceled", "Removed" -> t.pick("Odpadá", "Cancelled") to ChangeKind.CANCELED
                "Substitution" -> t.pick("Suplování", "Substitution") to ChangeKind.SUBSTITUTION
                "RoomChanged" -> t.pick("Změna učebny", "Room change") to ChangeKind.ROOM
                "Added" -> t.pick("Přidáno", "Added") to ChangeKind.ADDED
                else -> (change.typeName?.takeIf { it.isNotEmpty() } ?: t.pick("Změna", "Change")) to ChangeKind.OTHER
            }
        }
    }
}

/** Grade colour bucket, as in the web GradeBadge: 1 to 5, anything else is neutral (0). */
data class MarkRow(
    val subject: String,
    val mark: String,
    val weight: Int,
    val dateText: String,
    val gradeBucket: Int,
    /** Place in the class, with the star the app puts in front of it; empty when the school sends none. */
    val rankText: String = "",
)

/** Same as formatClassRankText in the web app: a star in front unless the text has one. */
internal fun formatClassRank(text: String): String {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return ""
    return if (trimmed.startsWith("☆") || trimmed.startsWith("★")) trimmed else "☆ $trimmed"
}

data class MarksModel(val rows: List<MarkRow>, val emptyText: String?) {
    companion object {
        fun build(input: WidgetInputs): MarksModel {
            val t = input.text
            val today = input.now.toLocalDate()
            val rows = input.snapshot?.marks.orEmpty().map { m ->
                val date = runCatching { LocalDate.parse(m.markDate.take(10)) }.getOrNull()
                MarkRow(
                    m.subjectName.ifEmpty { m.subjectAbbrev },
                    m.markText.trim(),
                    m.weight,
                    date?.let { t.relativeDay(it, today) } ?: "",
                    m.markText.trim().firstOrNull()?.digitToIntOrNull()?.takeIf { it in 1..5 } ?: 0,
                    formatClassRank(m.classRankText),
                )
            }
            return MarksModel(rows, if (rows.isEmpty()) t.noMarks else null)
        }
    }
}

data class MessageRow(val id: String, val type: String, val sender: String, val title: String, val dateText: String, val unread: Boolean)

data class MessagesModel(val unreadText: String, val unreadCount: Int, val rows: List<MessageRow>, val emptyText: String?) {
    companion object {
        fun build(input: WidgetInputs): MessagesModel {
            val t = input.text
            val s = input.snapshot
            val today = input.now.toLocalDate()
            val rows = s?.messages.orEmpty().map { m ->
                val date = runCatching { LocalDate.parse(m.date.take(10)) }.getOrNull()
                MessageRow(m.id, m.type, m.senderName, m.title, date?.let { t.relativeDay(it, today) } ?: "", m.unread)
            }
            val unread = s?.unreadMessages ?: 0
            return MessagesModel(t.unreadMessages(unread), unread, rows, if (rows.isEmpty()) t.noMessages else null)
        }
    }
}

data class HomeworkRow(val subject: String, val content: String, val deadlineText: String, val overdue: Boolean)

data class HomeworkModel(val rows: List<HomeworkRow>, val total: Int, val emptyText: String?) {
    companion object {
        fun build(input: WidgetInputs): HomeworkModel {
            val t = input.text
            val today = input.now.toLocalDate()
            val all = input.snapshot?.homework.orEmpty().filter { !it.done }
            val rows = all.map { h ->
                val deadline = runCatching { LocalDate.parse(h.deadline.take(10)) }.getOrNull()
                HomeworkRow(
                    h.subjectName.ifEmpty { h.subjectAbbrev },
                    h.content.trim().replace(Regex("\\s+"), " "),
                    deadline?.let { t.pick("do ", "due ") + t.relativeDay(it, today) } ?: "",
                    deadline != null && deadline.isBefore(today),
                )
            }
            return HomeworkModel(rows, rows.size, if (rows.isEmpty()) t.noHomework else null)
        }
    }
}

data class EventRow(val title: String, val dateText: String, val detail: String)

data class EventsModel(val rows: List<EventRow>, val emptyText: String?) {
    companion object {
        fun build(input: WidgetInputs): EventsModel {
            val t = input.text
            val today = input.now.toLocalDate()
            val rows = input.snapshot?.events.orEmpty().mapNotNull { e ->
                val start = runCatching { LocalDate.parse(e.date.take(10)) }.getOrNull() ?: return@mapNotNull null
                val end = e.endDate?.takeIf { it.isNotEmpty() }?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: start
                // The snapshot can be a day old, so past events are dropped again at render time.
                if (end.isBefore(today)) return@mapNotNull null
                val dateText = if (end == start) t.shortDate(start) else "${start.dayOfMonth}.–${t.shortDate(end)}"
                val detail = listOfNotNull(e.time?.takeIf { it.isNotEmpty() }, e.location?.takeIf { it.isNotEmpty() }).joinToString(" · ")
                EventRow(e.title, dateText, detail)
            }
            return EventsModel(rows, if (rows.isEmpty()) t.noEvents else null)
        }
    }
}

/** Same icons as the in-app countdown: a clock while school runs, a coffee cup on a break. */
enum class CountdownIcon { CLOCK, COFFEE, DONE, TIMER }

data class CountdownModel(
    val label: String,
    /** Text shown when there is nothing to count down to; a running phase uses a chronometer instead. */
    val counter: String,
    /** How far through the lesson, break or school day we are, 0..1. */
    val progress: Double,
    /** Epoch ms the chronometer counts down to, or null when the text counter is used. */
    val chronometerEndMs: Long?,
    val showProgress: Boolean,
    val finished: Boolean,
    val icon: CountdownIcon = CountdownIcon.CLOCK,
) {
    companion object {
        /** [mode] is [CountdownMode.LESSON_TIME] or [CountdownMode.DAY_TIME]; the percent modes are not offered by widgets. */
        fun build(input: WidgetInputs, mode: CountdownMode): CountdownModel {
            val t = input.text
            val s = input.snapshot
            val actual = s?.timetableActual ?: return CountdownModel(t.noTimetable, "", 0.0, null, false, true)
            val result = computeCountdown(input.now, actual, s.timetablePermanent ?: Timetable.EMPTY, mode, true, t.lang)

            val label = when (result.label) {
                CountdownLabel.WEEKEND_FREE -> t.pick("Víkendové volno", "Weekend off")
                CountdownLabel.DAY_OFF -> t.pick("Volný den", "Day off")
                CountdownLabel.HOLIDAY -> result.holidayLabel.orEmpty()
                CountdownLabel.SCHOOL_ENDS -> t.pick("Konec školy", "School ends")
                CountdownLabel.SCHOOL_STARTS -> t.pick("Začátek školy", "School starts")
                CountdownLabel.LESSON_STARTS -> t.pick("Začátek hodiny", "Lesson starts")
                CountdownLabel.LESSON_ENDS -> t.pick("Konec hodiny", "Lesson ends")
                CountdownLabel.BREAK_ENDS -> t.pick("Konec přestávky", "Break ends")
            }
            val finished = result.state == CountdownState.SCHOOL_OVER || result.state == CountdownState.WEEKEND_OR_FREE
            val end = result.phaseEndMs
            val chrono = if (!finished && end != null && end > input.nowMs) end else null
            val icon = when (result.state) {
                CountdownState.SCHOOL_OVER -> CountdownIcon.DONE
                CountdownState.BREAK -> CountdownIcon.COFFEE
                CountdownState.WEEKEND_OR_FREE -> CountdownIcon.TIMER
                else -> CountdownIcon.CLOCK
            }
            return CountdownModel(label, result.counterValue, result.progress, chrono, !finished, finished, icon)
        }
    }
}
