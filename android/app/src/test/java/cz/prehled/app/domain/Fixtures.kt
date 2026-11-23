package cz.prehled.app.domain

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** One folder of raw responses and expected output, e.g. `fixtures/bakalari` or the optional `fixtures/bakalari-real`. */
class FixtureSet(private val dir: File?) {
    val exists get() = dir?.isDirectory == true && File(dir, "raw").isDirectory
    fun json(relative: String): String = File(dir!!, relative).readText()
    fun array(relative: String) = JSONArray(json(relative))
    fun obj(relative: String) = JSONObject(json(relative))

    companion object {
        fun named(name: String) = FixtureSet(
            generateSequence(File("").absoluteFile) { it.parentFile }.map { File(it, "fixtures/$name") }.firstOrNull { it.isDirectory },
        )
    }
}

/** Shared fixtures live in the repo root so the TypeScript tests read the same files. */
object Fixtures {
    private val root: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "fixtures/bakalari") }
        .first { it.isDirectory }

    fun json(relative: String): String = File(root, relative).readText()
    fun array(relative: String) = JSONArray(json(relative))
    fun obj(relative: String) = JSONObject(json(relative))

    private fun JSONObject.str(key: String): String? = if (isNull(key) || !has(key)) null else getString(key)

    fun timetable(o: JSONObject) = Timetable(
        hours = o.getJSONArray("hours").objects().map { Hour(it.getInt("id"), it.getString("caption"), it.getString("beginTime"), it.getString("endTime")) },
        days = o.getJSONArray("days").objects().map { d ->
            Day(
                dayOfWeek = d.getInt("dayOfWeek"),
                dayOfWeekName = d.optString("dayOfWeekName"),
                date = d.optString("date"),
                dayDescription = d.optString("dayDescription"),
                dayType = d.optString("dayType"),
                lessons = d.getJSONArray("atoms").objects().map { a ->
                    val c = if (a.isNull("change")) null else a.optJSONObject("change")
                    Lesson(
                        id = a.getString("id"), hourId = a.getInt("hourId"), subjectId = a.optString("subjectId"),
                        subjectAbbrev = a.optString("subjectAbbrev"), subjectName = a.optString("subjectName"),
                        teacherName = a.optString("teacherName"), teacherAbbrev = a.optString("teacherAbbrev"),
                        roomAbbrev = a.optString("roomAbbrev"), group = a.optString("group"), theme = a.optString("theme"),
                        change = c?.let { LessonChange(it.getString("changeType"), it.optString("description"), it.str("typeName"), it.str("typeAbbrev"), it.str("substituteTeacher")) },
                    )
                },
            )
        },
    )

    fun event(o: JSONObject) = SchoolEvent(
        id = o.getString("id"), title = o.getString("title"), description = o.optString("description"),
        date = o.getString("date"), endDate = o.str("endDate"), time = o.str("time"),
        location = o.str("location"), organizer = o.str("organizer"),
        isPast = if (o.has("isPast")) o.getBoolean("isPast") else null,
    )

    fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
}
