package cz.prehled.app.data

import cz.prehled.app.domain.Day
import cz.prehled.app.domain.Homework
import cz.prehled.app.domain.Hour
import cz.prehled.app.domain.Lesson
import cz.prehled.app.domain.LessonChange
import cz.prehled.app.domain.Mark
import cz.prehled.app.domain.Message
import cz.prehled.app.domain.SchoolEvent
import cz.prehled.app.domain.Timetable
import cz.prehled.app.sync.arr
import cz.prehled.app.sync.obj
import cz.prehled.app.sync.objects
import cz.prehled.app.sync.str
import org.json.JSONArray
import org.json.JSONObject

/**
 * What widgets and notifications read. Only Kotlin writes it. Timetables are kept
 * whole (not pre-selected) because the shown day and countdown depend on the time
 * of rendering, which is later than the time of the sync.
 */
data class Snapshot(
    val schemaVersion: Int = SCHEMA_VERSION,
    /** Epoch ms of the last sync that fetched anything. */
    val generatedAt: Long,
    val language: String,
    val timetableActual: Timetable?,
    val timetableNext: Timetable?,
    val timetablePermanent: Timetable?,
    val marks: List<Mark>,
    val homework: List<Homework>,
    val unreadMessages: Int,
    val messages: List<Message>,
    val events: List<SchoolEvent>,
    /** Epoch ms of the last successful fetch per section, so one failing endpoint does not hide the others. */
    val fetchedAt: Map<String, Long>,
) {
    fun isStale(nowMs: Long, maxAgeMs: Long = STALE_AFTER_MS): Boolean = nowMs - generatedAt > maxAgeMs

    companion object {
        const val SCHEMA_VERSION = 1
        const val STALE_AFTER_MS = 3 * 60 * 60 * 1000L
    }
}

object SnapshotJson {
    fun toJson(s: Snapshot): JSONObject = JSONObject().apply {
        put("schemaVersion", s.schemaVersion)
        put("generatedAt", s.generatedAt)
        put("language", s.language)
        s.timetableActual?.let { put("timetableActual", timetable(it)) }
        s.timetableNext?.let { put("timetableNext", timetable(it)) }
        s.timetablePermanent?.let { put("timetablePermanent", timetable(it)) }
        put("marks", JSONArray(s.marks.map(::mark)))
        put("homework", JSONArray(s.homework.map(::homework)))
        put("unreadMessages", s.unreadMessages)
        put("messages", JSONArray(s.messages.map(::message)))
        put("events", JSONArray(s.events.map(::event)))
        put("fetchedAt", JSONObject(s.fetchedAt))
    }

    /** Returns null for a corrupt file or another schema version, so the next sync starts clean. */
    fun fromJson(o: JSONObject): Snapshot? = try {
        if (o.optInt("schemaVersion", -1) != Snapshot.SCHEMA_VERSION) null else Snapshot(
            generatedAt = o.getLong("generatedAt"),
            language = o.str("language").ifEmpty { "cs" },
            timetableActual = o.obj("timetableActual")?.let(::timetable),
            timetableNext = o.obj("timetableNext")?.let(::timetable),
            timetablePermanent = o.obj("timetablePermanent")?.let(::timetable),
            marks = o.arr("marks").objects().map(::mark),
            homework = o.arr("homework").objects().map(::homework),
            unreadMessages = o.optInt("unreadMessages", 0),
            messages = o.arr("messages").objects().map(::message),
            events = o.arr("events").objects().map(::event),
            fetchedAt = o.obj("fetchedAt")?.let { f -> f.keys().asSequence().associateWith { f.getLong(it) } } ?: emptyMap(),
        )
    } catch (e: Exception) {
        null
    }

    private fun JSONObject.putOpt2(key: String, value: String?): JSONObject = if (value != null) put(key, value) else this

    private fun timetable(t: Timetable) = JSONObject().apply {
        put("hours", JSONArray(t.hours.map { h -> JSONObject().put("id", h.id).put("caption", h.caption).put("begin", h.beginTime).put("end", h.endTime) }))
        put("days", JSONArray(t.days.map(::day)))
    }

    private fun timetable(o: JSONObject) = Timetable(
        hours = o.arr("hours").objects().map { Hour(it.getInt("id"), it.str("caption"), it.str("begin"), it.str("end")) },
        days = o.arr("days").objects().map(::day),
    )

    private fun day(d: Day) = JSONObject()
        .put("dow", d.dayOfWeek).put("name", d.dayOfWeekName).put("date", d.date)
        .put("desc", d.dayDescription).put("type", d.dayType)
        .put("lessons", JSONArray(d.lessons.map(::lesson)))

    private fun day(o: JSONObject) = Day(
        dayOfWeek = o.getInt("dow"), dayOfWeekName = o.str("name"), date = o.str("date"),
        dayDescription = o.str("desc"), dayType = o.str("type"), lessons = o.arr("lessons").objects().map(::lesson),
    )

    private fun lesson(l: Lesson) = JSONObject()
        .put("id", l.id).put("hour", l.hourId).put("subjectId", l.subjectId).put("abbrev", l.subjectAbbrev)
        .put("subject", l.subjectName).put("teacher", l.teacherName).put("teacherAbbrev", l.teacherAbbrev)
        .put("room", l.roomAbbrev).put("group", l.group).put("theme", l.theme)
        .also { o -> l.change?.let { c -> o.put("change", change(c)) } }

    private fun lesson(o: JSONObject) = Lesson(
        id = o.str("id"), hourId = o.getInt("hour"), subjectId = o.str("subjectId"), subjectAbbrev = o.str("abbrev"),
        subjectName = o.str("subject"), teacherName = o.str("teacher"), teacherAbbrev = o.str("teacherAbbrev"),
        roomAbbrev = o.str("room"), group = o.str("group"), theme = o.str("theme"),
        change = o.obj("change")?.let { c ->
            LessonChange(c.str("type"), c.str("description"), c.str("typeName").ifEmpty { null }, c.str("typeAbbrev").ifEmpty { null }, c.str("substitute").ifEmpty { null })
        },
    )

    private fun change(c: LessonChange) = JSONObject().put("type", c.type).put("description", c.description)
        .putOpt2("typeName", c.typeName).putOpt2("typeAbbrev", c.typeAbbrev).putOpt2("substitute", c.substituteTeacher)

    private fun mark(m: Mark) = JSONObject().put("id", m.id).put("abbrev", m.subjectAbbrev).put("subject", m.subjectName)
        .put("text", m.markText).put("weight", m.weight).put("caption", m.caption).put("date", m.markDate).put("new", m.isNew).put("rank", m.classRankText)

    private fun mark(o: JSONObject) = Mark(o.str("id"), o.str("abbrev"), o.str("subject"), o.str("text"), o.optInt("weight", 1), o.str("caption"), o.str("date"), o.optBoolean("new"), o.str("rank"))

    private fun homework(h: Homework) = JSONObject().put("id", h.id).put("abbrev", h.subjectAbbrev).put("subject", h.subjectName)
        .put("content", h.content).put("date", h.date).put("deadline", h.deadline).put("done", h.done).put("closed", h.closed)

    private fun homework(o: JSONObject) = Homework(o.str("id"), o.str("abbrev"), o.str("subject"), o.str("content"), o.str("date"), o.str("deadline"), o.optBoolean("done"), o.optBoolean("closed"))

    private fun message(m: Message) = JSONObject().put("id", m.id).put("type", m.type).put("title", m.title)
        .put("sender", m.senderName).put("date", m.date).put("unread", m.unread)

    private fun message(o: JSONObject) = Message(o.str("id"), o.str("type"), o.str("title"), o.str("sender"), o.str("date"), o.optBoolean("unread"))

    private fun event(e: SchoolEvent) = JSONObject().put("id", e.id).put("title", e.title).put("description", e.description)
        .put("date", e.date).putOpt2("endDate", e.endDate).putOpt2("time", e.time).putOpt2("location", e.location)
        .putOpt2("organizer", e.organizer).also { o -> e.isPast?.let { o.put("past", it) } }

    private fun event(o: JSONObject) = SchoolEvent(
        o.str("id"), o.str("title"), o.str("description"), o.str("date"),
        o.str("endDate").ifEmpty { null }, o.str("time").ifEmpty { null }, o.str("location").ifEmpty { null },
        o.str("organizer").ifEmpty { null }, if (o.has("past")) o.getBoolean("past") else null,
    )
}
