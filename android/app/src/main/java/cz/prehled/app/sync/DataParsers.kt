package cz.prehled.app.sync

import cz.prehled.app.domain.Homework
import cz.prehled.app.domain.Mark
import cz.prehled.app.domain.Message
import cz.prehled.app.domain.SchoolEvent
import cz.prehled.app.domain.groupConsecutiveEvents
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime

/** Ports of the corresponding mappings in src/api/client.ts, reduced to the fields native code needs. */
object MarksParser {
    fun parse(root: JSONObject?, today: LocalDate): List<Mark> {
        val subjects = root?.arr("Subjects").objects()
        return subjects.flatMap { s ->
            val subject = s.obj("Subject")
            val abbrev = subject?.firstStr("Abbrev", "Name") ?: ""
            val name = subject?.firstStr("Name", "Abbrev") ?: ""
            s.arr("Marks").objects().map { m ->
                Mark(
                    id = m.str("Id"),
                    subjectAbbrev = abbrev,
                    subjectName = name,
                    markText = m.firstStr("MarkText", "Mark").ifEmpty { "-" },
                    weight = if (m.has("Weight") && m.get("Weight") is Number) m.getInt("Weight") else 1,
                    caption = m.firstStr("Caption", "Theme", "Description").ifEmpty { "Bez popisu" },
                    markDate = m.str("MarkDate").dateOnly().ifEmpty { today.toString() },
                    isNew = m.truthy("IsNew"),
                    classRankText = m.firstStr("ClassRankText", "classRankText", "ClassRank", "classRank").trim(),
                )
            }
        }
    }
}

object HomeworkParser {
    fun parse(root: JSONObject?): List<Homework> =
        root?.arr("Homeworks").objects().map { h ->
            val subject = h.obj("Subject")
            Homework(
                id = h.firstStr("ID", "Id"),
                subjectAbbrev = subject?.firstStr("Abbrev", "Name") ?: "",
                subjectName = subject?.firstStr("Name", "Abbrev") ?: "",
                content = h.str("Content"),
                date = h.str("DateStart").dateOnly(),
                deadline = h.str("DateEnd").dateOnly(),
                done = h.truthy("Done") || h.truthy("Finished"),
            )
        }
}

object EventsParser {
    fun parse(root: JSONObject?, now: LocalDateTime): List<SchoolEvent> {
        val events = ArrayList<SchoolEvent>()
        for (e in root?.arr("Events").objects()) {
            val times = e.arr("Times").objects().ifEmpty { listOf(JSONObject()) }
            for (tm in times) {
                val date = tm.str("StartTime").ifEmpty { e.str("Date") }.dateOnly()
                val endRaw = tm.str("EndTime").ifEmpty { e.str("EndDate") }.dateOnly()
                val startTime = tm.str("StartTime").substringAfter('T', "").take(5)
                val endTime = tm.str("EndTime").substringAfter('T', "").take(5)
                val intervalStart = tm.str("IntervalStartTime")
                val intervalEnd = tm.str("IntervalEndTime")
                val time = when {
                    tm.truthy("WholeDay") -> ""
                    intervalStart.isNotEmpty() && intervalEnd.isNotEmpty() ->
                        "${intervalStart.substringAfter('T', intervalStart)} – ${intervalEnd.substringAfter('T', intervalEnd)}"
                    startTime.isNotEmpty() && endTime.isNotEmpty() -> "$startTime – $endTime"
                    else -> ""
                }
                events += SchoolEvent(
                    id = "${e.str("Id")}-$date",
                    title = e.firstStr("Title", "Name").ifEmpty { "Událost" },
                    description = e.firstStr("Description", "Text"),
                    date = date,
                    endDate = endRaw.takeIf { it.isNotEmpty() && it != date },
                    time = time,
                    location = e.firstStr("Place", "Location").ifEmpty { null },
                    organizer = e.str("Organizer").ifEmpty { null },
                    isPast = isPast(tm.str("EndTime"), now),
                )
            }
        }
        return groupConsecutiveEvents(events, now)
    }

    private fun isPast(endTime: String, now: LocalDateTime): Boolean {
        if (endTime.isEmpty()) return false
        return try {
            OffsetDateTime.parse(endTime).toLocalDateTime().isBefore(now)
        } catch (e: Exception) {
            false
        }
    }
}

object MessagesParser {
    private fun extract(root: Any?): List<JSONObject> = when (root) {
        is JSONArray -> root.objects()
        is JSONObject -> listOf("Messages", "messages", "Items", "items").firstNotNullOfOrNull { root.arr(it) }.objects()
        else -> emptyList()
    }

    private fun personName(p: JSONObject): String =
        listOf("Degree", "FirstName", "LastName", "DegreeBehind").map { p.str(it) }.filter { it.isNotEmpty() }.joinToString(" ").trim()
            .ifEmpty { p.firstStr("FullName", "Name", "TeacherName") }

    private fun persons(root: Any?): Map<String, String> {
        if (root !is JSONObject) return emptyMap()
        val map = HashMap<String, String>()
        for (key in listOf("Persons", "persons", "Senders", "senders", "Teachers", "teachers")) {
            for (p in root.arr(key).objects()) {
                val name = personName(p)
                if (name.isEmpty()) continue
                for (idKey in listOf("Id", "PersonId", "TeacherId")) {
                    val id = p.str(idKey)
                    if (id.isNotEmpty()) map[id] = name
                }
            }
        }
        return map
    }

    private fun senderName(m: JSONObject, people: Map<String, String>, fallback: String): String {
        var id = ""
        var name = ""
        val sender = m.obj("Sender")
        if (sender != null) {
            id = sender.firstStr("Id", "PersonId", "TeacherId")
            name = personName(sender).ifEmpty { sender.firstStr("DisplayName") }
        } else {
            val s = m.str("Sender").trim()
            if (s.isNotEmpty()) {
                if (people.containsKey(s)) {
                    id = s
                    name = people.getValue(s)
                } else if (s.length > 8 || s.any { it.isWhitespace() } || Regex("""^(?:Mgr|Ing|PhDr|RNDr|doc|prof|Bc)\.?""", RegexOption.IGNORE_CASE).containsMatchIn(s)) {
                    name = s
                } else {
                    id = s
                }
            }
        }
        if (name.isEmpty()) name = m.firstStr("SenderName", "RelevantName", "TeacherName")
        if (id.isEmpty()) id = m.firstStr("SenderId", "TeacherId", "PersonId", "AuthorId")
        if ((name.isEmpty() || name == id) && id.isNotEmpty() && people.containsKey(id)) name = people.getValue(id)
        if (name.isEmpty() || name.trim().equals("vyučující", ignoreCase = true)) {
            name = if (id.isNotEmpty() && people.containsKey(id)) people.getValue(id) else name.ifEmpty { fallback }
        }
        return name.trim()
    }

    /** Received messages and the noticeboard, newest first. */
    fun parse(received: Any?, noticeboard: Any?): List<Message> {
        val people = persons(received) + persons(noticeboard)
        val out = ArrayList<Message>()
        for (m in extract(noticeboard)) {
            out += Message(m.str("Id"), "noticeboard", m.str("Title").ifEmpty { "Nástěnka" }, senderName(m, people, "Ředitelství"), m.firstStr("SentDate", "Date"), m.isUnreadMessage())
        }
        for (m in extract(received)) {
            out += Message(m.str("Id"), "received", m.str("Title").ifEmpty { "Zpráva" }, senderName(m, people, "Vyučující"), m.firstStr("SentDate", "Date"), m.isUnreadMessage())
        }
        return out.sortedByDescending { instant(it.date) }
    }

    private fun instant(date: String): Long = try {
        OffsetDateTime.parse(date).toInstant().toEpochMilli()
    } catch (e: Exception) {
        try {
            LocalDateTime.parse(date).toInstant(java.time.ZoneOffset.UTC).toEpochMilli()
        } catch (e2: Exception) {
            0L
        }
    }
}
