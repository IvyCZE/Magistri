package cz.prehled.app.sync

import cz.prehled.app.data.Prefs
import cz.prehled.app.data.SeenCategory
import cz.prehled.app.data.SeenStore
import cz.prehled.app.data.SessionState
import cz.prehled.app.data.Snapshot
import cz.prehled.app.data.SnapshotStore
import cz.prehled.app.data.StateStore
import cz.prehled.app.domain.Homework
import cz.prehled.app.domain.Lesson
import cz.prehled.app.domain.Mark
import cz.prehled.app.domain.Message
import cz.prehled.app.domain.Timetable
import cz.prehled.app.domain.selectTimetableDay
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

data class TimetableChange(val date: String, val lesson: Lesson, val hourCaption: String = "")

data class NewItems(
    val marks: List<Mark> = emptyList(),
    val messages: List<Message> = emptyList(),
    val homework: List<Homework> = emptyList(),
    val timetableChanges: List<TimetableChange> = emptyList(),
) {
    fun isEmpty() = marks.isEmpty() && messages.isEmpty() && homework.isEmpty() && timetableChanges.isEmpty()
}

sealed interface SyncOutcome {
    /** `partial` is true when some sections could not be fetched and kept their previous data. */
    data class Updated(val newItems: NewItems, val partial: Boolean) : SyncOutcome
    data class Skipped(val reason: String) : SyncOutcome
    data object SessionExpired : SyncOutcome
    data object Failed : SyncOutcome
}

/**
 * Downloads what widgets and notifications need, merges it with the data the web
 * app pushed, writes the snapshot, and reports items the user has not been told
 * about. Calls are serialised, so the worker and a manual refresh never overlap.
 */
class SyncEngine(
    private val api: ApiSource,
    private val snapshots: SnapshotStore,
    private val seen: SeenStore,
    private val state: StateStore,
    private val clock: () -> LocalDateTime = { LocalDateTime.now() },
    private val zone: ZoneId = ZoneId.systemDefault(),
) {
    private val lock = Any()

    fun sync(force: Boolean = false): SyncOutcome = synchronized(lock) {
        val now = clock()
        val prefs = state.prefs()
        if (prefs.demo) return SyncOutcome.Skipped("demo")
        if (!force && isNightWindow(now, prefs)) return SyncOutcome.Skipped("night")

        val previous = snapshots.load()
        val nowMs = now.atZone(zone).toInstant().toEpochMilli()
        val fetchedAt = HashMap(previous?.fetchedAt ?: emptyMap())
        var failures = 0

        fun fetch(section: String, path: String, komens: Boolean = false): Any? {
            val result = if (komens) api.komens(path) else api.get(path)
            return when (result) {
                is ApiResult.Ok -> {
                    fetchedAt[section] = nowMs
                    result.body ?: JSONObject()
                }
                ApiResult.SessionExpired -> throw SessionGone()
                ApiResult.Failure -> {
                    failures++
                    null
                }
            }
        }

        val nextMonday = now.toLocalDate().with(TemporalAdjusters.next(DayOfWeek.MONDAY)).toString()
        try {
            val actualRaw = fetch("timetableActual", "/api/3/timetable/actual") as? JSONObject
            val nextRaw = fetch("timetableNext", "/api/3/timetable/actual?date=$nextMonday") as? JSONObject
            val permanentRaw = fetch("timetablePermanent", "/api/3/timetable/permanent") as? JSONObject
            val marksRaw = fetch("marks", "/api/3/marks") as? JSONObject
            val homeworkRaw = fetch("homework", "/api/3/homeworks") as? JSONObject
            val receivedRaw = fetch("messagesReceived", "/api/3/komens/messages/received", komens = true)
            val noticeboardRaw = fetch("messagesNoticeboard", "/api/3/komens/messages/noticeboard", komens = true)
            val eventsRaw = fetch("events", "/api/3/events") as? JSONObject

            if (failures == 8) return SyncOutcome.Failed

            state.setSessionState(SessionState.OK)
            val local = state.localData()
            val today = now.toLocalDate()

            val actual = actualRaw?.let { TimetableParser.parse(it, false, today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString()) } ?: previous?.timetableActual
            val next = nextRaw?.let { TimetableParser.parse(it, false, nextMonday) } ?: previous?.timetableNext
            val permanent = permanentRaw?.let { TimetableParser.parse(it, true) } ?: previous?.timetablePermanent

            val allMarks = marksRaw?.let { MarksParser.parse(it, today) }
            val allApiHomework = homeworkRaw?.let { HomeworkParser.parse(it) }
            val allMessages = if (receivedRaw != null || noticeboardRaw != null) MessagesParser.parse(receivedRaw, noticeboardRaw) else null
            val events = eventsRaw?.let { EventsParser.parse(it, now) }

            val homework = allApiHomework?.let { api ->
                (local.customHomework + api.map { it.copy(done = local.homeworkDone[it.id] ?: it.done) })
                    .filter { !it.done }
                    .sortedWith(compareBy({ it.deadline.isEmpty() }, { it.deadline }))
                    .take(MAX_HOMEWORK)
            }

            val snapshot = Snapshot(
                generatedAt = nowMs,
                language = prefs.language,
                timetableActual = actual,
                timetableNext = next,
                timetablePermanent = permanent,
                marks = allMarks?.sortedByDescending { it.markDate }?.take(MAX_MARKS) ?: previous?.marks ?: emptyList(),
                homework = homework ?: previous?.homework ?: emptyList(),
                unreadMessages = allMessages?.count { it.unread } ?: previous?.unreadMessages ?: 0,
                messages = allMessages?.take(MAX_MESSAGES) ?: previous?.messages ?: emptyList(),
                events = events?.filter { it.isPast != true }?.take(MAX_EVENTS) ?: previous?.events ?: emptyList(),
                fetchedAt = fetchedAt,
            )
            snapshots.save(snapshot)

            val newItems = NewItems(
                marks = allMarks?.let { list -> diff(SeenCategory.MARKS, list.map { it.id }).let { ids -> list.filter { it.id in ids } } } ?: emptyList(),
                messages = allMessages?.let { list -> diff(SeenCategory.MESSAGES, list.map { it.id }).let { ids -> list.filter { it.id in ids && it.unread } } } ?: emptyList(),
                homework = allApiHomework?.let { list -> diff(SeenCategory.HOMEWORK, list.map { it.id }).let { ids -> list.filter { it.id in ids && !(local.homeworkDone[it.id] ?: it.done) } } } ?: emptyList(),
                timetableChanges = timetableChanges(now, actual, permanent, next, prefs.language),
            )
            return SyncOutcome.Updated(newItems, partial = failures > 0)
        } catch (e: SessionGone) {
            state.setSessionState(SessionState.EXPIRED)
            return SyncOutcome.SessionExpired
        }
    }

    private class SessionGone : RuntimeException()

    private fun diff(category: SeenCategory, ids: List<String>): Set<String> = seen.recordAndDiff(category, ids).toSet()

    // Changes in the day the home screen shows (today, or the next school day).
    private fun timetableChanges(now: LocalDateTime, actual: Timetable?, permanent: Timetable?, next: Timetable?, lang: String): List<TimetableChange> {
        if (actual == null) return emptyList()
        val day = selectTimetableDay(now, actual, permanent ?: Timetable.EMPTY, next, lang).day ?: return emptyList()
        val hours = listOfNotNull(actual, next, permanent).flatMap { it.hours }
        val changes = day.lessons.filter { it.change != null }
            .map { l -> TimetableChange(day.date, l, hours.firstOrNull { it.id == l.hourId }?.caption.orEmpty()) }
        val fresh = seen.recordAndDiff(SeenCategory.TIMETABLE, changes.map { signature(it) }).toSet()
        return changes.filter { signature(it) in fresh }
    }

    private fun signature(c: TimetableChange) = "${c.date}|${c.lesson.hourId}|${c.lesson.change?.type}|${c.lesson.change?.description}"

    companion object {
        const val MAX_MARKS = 15
        const val MAX_HOMEWORK = 30
        const val MAX_MESSAGES = 10
        const val MAX_EVENTS = 8

        // Nobody reads the phone at night, and the school server does not need the traffic.
        fun isNightWindow(now: LocalDateTime, prefs: Prefs = Prefs()): Boolean {
            if (!prefs.nightRestEnabled) return false
            val minutes = now.hour * 60 + now.minute
            val start = prefs.nightStartMinutes
            val end = prefs.nightEndMinutes
            return when {
                start == end -> false
                start < end -> minutes in start until end
                else -> minutes >= start || minutes < end
            }
        }
    }
}
