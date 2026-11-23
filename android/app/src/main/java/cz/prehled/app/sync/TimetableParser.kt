package cz.prehled.app.sync

import cz.prehled.app.domain.Day
import cz.prehled.app.domain.Hour
import cz.prehled.app.domain.Lesson
import cz.prehled.app.domain.LessonChange
import cz.prehled.app.domain.Timetable
import org.json.JSONObject
import java.time.LocalDate

/**
 * Port of the timetable mapping in `getTimetable` (src/api/client.ts), limited to
 * what widgets and notifications use. Cycle and group heuristics are left out.
 */
object TimetableParser {
    private data class Named(val abbrev: String, val name: String)

    private val HOUR_TIME = Regex("""(?:^|T|\s)(\d{1,2}):(\d{2})""")

    private val DAY_NAMES = mapOf(1 to "Pondělí", 2 to "Úterý", 3 to "Středa", 4 to "Čtvrtek", 5 to "Pátek", 6 to "Sobota", 7 to "Neděle", 0 to "Neděle")

    private val DEFAULT_HOURS = listOf(
        Hour(1, "1", "08:00", "08:45"), Hour(2, "2", "08:55", "09:40"), Hour(3, "3", "10:00", "10:45"),
        Hour(4, "4", "10:55", "11:40"), Hour(5, "5", "11:50", "12:35"), Hour(6, "6", "12:45", "13:30"),
        Hour(7, "7", "13:40", "14:25"), Hour(8, "8", "14:35", "15:20"),
    )

    private fun lookup(root: JSONObject, key: String): Map<String, Named> {
        val map = HashMap<String, Named>()
        for (item in root.arr(key).objects()) {
            val id = item.str("Id")
            if (id.isEmpty()) continue
            val abbrev = item.firstStr("Abbrev", "Name")
            val name = item.firstStr("Name", "Abbrev")
            map[id] = Named(abbrev, name)
        }
        return map
    }

    private fun formatHourTime(t: String): String {
        if (t.isEmpty()) return ""
        val m = HOUR_TIME.find(t.trim()) ?: return t
        return "${m.groupValues[1].padStart(2, '0')}:${m.groupValues[2]}"
    }

    /**
     * @param weekStart the `date` query the request used (YYYY-MM-DD), only needed to
     *   date the placeholder days when the server returns none.
     */
    fun parse(root: JSONObject?, permanent: Boolean, weekStart: String? = null): Timetable {
        if (root == null) return Timetable.EMPTY

        val subjects = lookup(root, "Subjects")
        val teachers = lookup(root, "Teachers")
        val rooms = lookup(root, "Rooms")
        val groups = lookup(root, "Groups")

        val hourItems = root.arr("Hours").objects()
        val hours = if (hourItems.isNotEmpty()) {
            hourItems.map { h ->
                val id = h.intOrNull("Id") ?: 0
                Hour(id, h.str("Caption").ifEmpty { id.toString() }, formatHourTime(h.str("BeginTime")), formatHourTime(h.str("EndTime")))
            }
        } else DEFAULT_HOURS

        val days = root.arr("Days").objects().map { d ->
            val dow = d.intOrNull("DayOfWeek") ?: 0
            Day(
                dayOfWeek = dow,
                dayOfWeekName = d.str("DayOfWeekName").ifEmpty { DAY_NAMES[dow] ?: "" },
                date = if (permanent) "" else d.str("Date").dateOnly(),
                dayDescription = d.str("DayDescription"),
                dayType = d.str("DayType").ifEmpty { d.str("Type") }.ifEmpty { "WorkDay" },
                lessons = d.arr("Atoms").objects()
                    .filter { a -> a.str("SubjectId").isNotEmpty() || a.obj("Change")?.str("TypeAbbrev")?.isNotEmpty() == true }
                    .mapIndexed { index, a -> lesson(a, subjects, teachers, rooms, groups, "${d.intOrNull("DayOfWeek")}-$index") },
            )
        }.ifEmpty { placeholderDays(weekStart) }

        return Timetable(hours, days)
    }

    private fun placeholderDays(weekStart: String?): List<Day> {
        val base = try { weekStart?.let { LocalDate.parse(it) } } catch (e: Exception) { null }
        return (1..5).map { dow ->
            Day(dow, DAY_NAMES.getValue(dow), base?.plusDays((dow - 1).toLong())?.toString() ?: "", "", "WorkDay", emptyList())
        }
    }

    private fun lesson(
        a: JSONObject,
        subjects: Map<String, Named>,
        teachers: Map<String, Named>,
        rooms: Map<String, Named>,
        groups: Map<String, Named>,
        fallbackId: String,
    ): Lesson {
        val change = a.obj("Change")
        val subjectId = a.str("SubjectId")
        val subj = if (subjectId.isNotEmpty()) subjects[subjectId] else null

        val teacherKey = a.str("TeacherId").ifEmpty { a.arr("TeacherIds")?.strings()?.firstOrNull() ?: "" }
        val teacher = if (teacherKey.isNotEmpty()) teachers[teacherKey] else null
        val roomKey = a.str("RoomId").ifEmpty { a.arr("RoomIds")?.strings()?.firstOrNull() ?: "" }
        val room = if (roomKey.isNotEmpty()) rooms[roomKey] else null
        val groupKey = a.arr("GroupIds")?.strings()?.firstOrNull() ?: ""
        val group = if (groupKey.isNotEmpty()) groups[groupKey] else null

        // Course atoms (no subject) are labelled by their change.
        val isCourse = subjectId.isEmpty() && !change?.str("TypeAbbrev").isNullOrEmpty()

        val subjectAbbrev = if (isCourse) {
            change!!.str("TypeAbbrev").ifEmpty { change.str("TypeName") }
        } else {
            a.str("SubjectAbbrev").ifEmpty { subj?.abbrev ?: "" }.ifEmpty { a.str("SubjectName") }
                .ifEmpty { subj?.name ?: "" }.ifEmpty { subjectId }
        }
        val subjectName = if (isCourse) {
            change!!.str("TypeName").ifEmpty { change.str("TypeAbbrev") }
        } else {
            a.str("SubjectName").ifEmpty { subj?.name ?: "" }.ifEmpty { a.str("SubjectAbbrev") }
                .ifEmpty { subj?.abbrev ?: "" }.ifEmpty { subjectAbbrev }
        }
        val teacherName = a.str("TeacherName").ifEmpty { teacher?.name ?: "" }.ifEmpty { teacher?.abbrev ?: "" }
        val teacherAbbrev = a.str("TeacherAbbrev").ifEmpty { teacher?.abbrev ?: "" }
        val roomAbbrev = a.str("RoomAbbrev").ifEmpty { room?.abbrev ?: "" }.ifEmpty { a.str("RoomId") }

        return Lesson(
            id = a.str("Id").ifEmpty { fallbackId },
            hourId = a.intOrNull("HourId") ?: 0,
            subjectId = if (isCourse) "" else subjectId.ifEmpty { subjectAbbrev },
            subjectAbbrev = subjectAbbrev,
            subjectName = subjectName,
            teacherName = teacherName,
            teacherAbbrev = teacherAbbrev,
            roomAbbrev = roomAbbrev,
            group = a.str("Group").ifEmpty { group?.abbrev ?: "" },
            theme = a.str("Theme"),
            change = change?.let { parseChange(it) },
        )
    }

    private fun parseChange(c: JSONObject): LessonChange {
        val rawType = c.firstStr("ChangeType", "TypeName").lowercase()
        val rawDesc = c.str("Description").lowercase()
        val summary = "$rawType $rawDesc"
        fun has(vararg needles: String) = needles.any { summary.contains(it) }

        val type = when {
            rawType == "canceled" || rawType == "removed" || has("cancel", "odpad", "vyjmut", "removed") -> "Canceled"
            rawType == "added" || has("added", "přidán", "pridan", "navíc", "navic") -> "Added"
            rawType == "roomchanged" || has("room", "místnost", "mistnost", "učebn", "ucebn", "přesun", "presun") -> "RoomChanged"
            else -> "Substitution"
        }

        val description = c.str("Description")
        val substitute = c.str("TeacherName").ifEmpty {
            Regex("""Suplov(?:ání|uje):\s*([^,]+)""", RegexOption.IGNORE_CASE).find(description)?.groupValues?.get(1)?.trim()
                ?: Regex("""Supluje\s+(.+?)\s+za\b""", RegexOption.IGNORE_CASE).find(description)?.groupValues?.get(1)?.trim()
                ?: ""
        }
        return LessonChange(
            type = type,
            description = description,
            typeName = c.str("TypeName").ifEmpty { c.str("ChangeType") }.ifEmpty { if (type == "Added") "Přidáno do rozvrhu" else "Změna" },
            typeAbbrev = c.str("TypeAbbrev").ifEmpty { null },
            substituteTeacher = substitute.ifEmpty { null },
        )
    }
}
