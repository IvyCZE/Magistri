package cz.prehled.app.sync

import cz.prehled.app.domain.FixtureSet
import cz.prehled.app.domain.Fixtures
import cz.prehled.app.domain.Fixtures.objects
import cz.prehled.app.domain.Timetable
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assume
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * Parses the raw API fixtures and compares the result with the output of the
 * TypeScript client (fixtures/bakalari/expected, written by apiParsing.test.ts).
 */
abstract class ParserFixtureChecks(private val setName: String) {
    protected val set = FixtureSet.named(setName)

    @Before
    fun requireFixtures() = Assume.assumeTrue("no fixtures named $setName", set.exists)

    private val now = LocalDateTime.parse("2026-10-06T12:00:00")

    private fun nullable(o: JSONObject, key: String): String? = if (o.isNull(key)) null else o.getString(key)

    private fun assertTimetable(name: String, parsed: Timetable) {
        val expected = set.obj("expected/$name")
        val hours = expected.getJSONArray("hours").objects()
        assertEquals("$name hours", hours.size, parsed.hours.size)
        hours.forEachIndexed { i, h ->
            val p = parsed.hours[i]
            assertEquals(h.getInt("id"), p.id)
            assertEquals(h.getString("caption"), p.caption)
            assertEquals(h.getString("beginTime"), p.beginTime)
            assertEquals(h.getString("endTime"), p.endTime)
        }
        val days = expected.getJSONArray("days").objects()
        assertEquals("$name days", days.size, parsed.days.size)
        days.forEachIndexed { i, d ->
            val p = parsed.days[i]
            val label = "$name day ${d.getInt("dayOfWeek")}"
            assertEquals(label, d.getInt("dayOfWeek"), p.dayOfWeek)
            assertEquals(label, d.getString("dayOfWeekName"), p.dayOfWeekName)
            assertEquals(label, d.getString("date"), p.date)
            assertEquals(label, d.getString("dayDescription"), p.dayDescription)
            assertEquals(label, d.getString("dayType"), p.dayType)
            val lessons = d.getJSONArray("lessons").objects()
            assertEquals("$label lessons", lessons.size, p.lessons.size)
            lessons.forEachIndexed { j, l ->
                val pl = p.lessons[j]
                val ll = "$label lesson $j"
                assertEquals(ll, l.getInt("hourId"), pl.hourId)
                assertEquals(ll, l.getString("subjectId"), pl.subjectId)
                assertEquals(ll, l.getString("subjectAbbrev"), pl.subjectAbbrev)
                assertEquals(ll, l.getString("subjectName"), pl.subjectName)
                assertEquals(ll, l.getString("teacherName"), pl.teacherName)
                assertEquals(ll, l.getString("teacherAbbrev"), pl.teacherAbbrev)
                assertEquals(ll, l.getString("roomAbbrev"), pl.roomAbbrev)
                if (l.isNull("change")) {
                    assertEquals(ll, null, pl.change)
                } else {
                    val c = l.getJSONObject("change")
                    val pc = pl.change!!
                    assertEquals(ll, c.getString("type"), pc.type)
                    assertEquals(ll, c.getString("description"), pc.description)
                    assertEquals(ll, nullable(c, "typeName"), pc.typeName)
                    assertEquals(ll, nullable(c, "typeAbbrev"), pc.typeAbbrev)
                    assertEquals(ll, nullable(c, "substituteTeacher"), pc.substituteTeacher)
                }
            }
        }
    }

    @Test
    fun actualTimetable() = assertTimetable("timetable-actual.json", TimetableParser.parse(set.obj("raw/timetable-actual.json"), false, "2026-10-05"))

    @Test
    fun permanentTimetable() = assertTimetable("timetable-permanent.json", TimetableParser.parse(set.obj("raw/timetable-permanent.json"), true))

    @Test
    fun marks() {
        val expected = set.array("expected/marks.json").objects()
        val parsed = MarksParser.parse(set.obj("raw/marks.json"), LocalDate.parse("2026-10-06"))
        assertEquals(expected.size, parsed.size)
        expected.forEachIndexed { i, e ->
            val p = parsed[i]
            assertEquals(e.getString("id"), p.id)
            assertEquals(e.getString("subjectAbbrev"), p.subjectAbbrev)
            assertEquals(e.getString("subjectName"), p.subjectName)
            assertEquals(e.getString("markText"), p.markText)
            assertEquals(e.getInt("weight"), p.weight)
            assertEquals(e.getString("caption"), p.caption)
            assertEquals(e.getString("markDate"), p.markDate)
            assertEquals(e.getBoolean("isNew"), p.isNew)
        }
    }

    @Test
    fun homeworks() {
        val expected = set.array("expected/homeworks.json").objects()
        val parsed = HomeworkParser.parse(set.obj("raw/homeworks.json"))
        assertEquals(expected.size, parsed.size)
        expected.forEachIndexed { i, e ->
            val p = parsed[i]
            assertEquals(e.getString("id"), p.id)
            assertEquals(e.getString("subjectAbbrev"), p.subjectAbbrev)
            assertEquals(e.getString("subjectName"), p.subjectName)
            assertEquals(e.getString("content"), p.content)
            assertEquals(e.getString("date"), p.date)
            assertEquals(e.getString("deadline"), p.deadline)
            assertEquals(e.getBoolean("done"), p.done)
        }
    }

    @Test
    fun events() {
        val expected = set.array("expected/events.json").objects()
        val parsed = EventsParser.parse(set.obj("raw/events.json"), now)
        assertEquals(expected.size, parsed.size)
        expected.forEachIndexed { i, e ->
            val p = parsed[i]
            assertEquals(e.getString("id"), p.id)
            assertEquals(e.getString("title"), p.title)
            assertEquals(e.getString("description"), p.description)
            assertEquals(e.getString("date"), p.date)
            assertEquals(nullable(e, "endDate"), p.endDate?.ifEmpty { null })
            assertEquals(nullable(e, "time"), p.time?.ifEmpty { null })
            assertEquals(nullable(e, "location"), p.location)
            assertEquals(nullable(e, "organizer"), p.organizer)
            assertEquals(e.getBoolean("isPast"), p.isPast)
        }
    }

    @Test
    fun messages() {
        val expected = set.array("expected/messages.json").objects()
        val parsed = MessagesParser.parse(set.obj("raw/komens-received.json"), set.obj("raw/komens-noticeboard.json"))
        assertEquals(expected.size, parsed.size)
        expected.forEachIndexed { i, e ->
            val p = parsed[i]
            assertEquals(e.getString("id"), p.id)
            assertEquals(e.getString("type"), p.type)
            assertEquals(e.getString("title"), p.title)
            assertEquals(e.getString("senderName"), p.senderName)
            assertEquals(e.getString("date"), p.date)
            assertEquals(e.getBoolean("unread"), p.unread)
        }
    }

}

/** The synthetic fixtures in the repo, plus the cases only they can express. */
class ParserFixturesTest : ParserFixtureChecks("bakalari") {
    @Test
    fun emptyDaysGetPlaceholderWeek() {
        val t = TimetableParser.parse(JSONObject("""{"Hours":[],"Days":[]}"""), false, "2026-10-12")
        assertEquals(8, t.hours.size)
        assertEquals(listOf("2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"), t.days.map { it.date })
    }

    @Test
    fun marksKeepTheClassRankText() {
        val parsed = MarksParser.parse(Fixtures.obj("raw/marks.json"), LocalDate.parse("2026-10-06"))
        assertEquals(listOf("", "5. z 24", ""), parsed.map { it.classRankText }.take(3))
    }

    @Test
    fun messagesAcceptABareArray() {
        val parsed = MessagesParser.parse(JSONArray("""[{"Id":"A","Title":"T","SentDate":"2026-10-01T10:00:00+02:00","Unread":true}]"""), null)
        assertEquals("Vyučující", parsed.single().senderName)
    }

    @Test
    fun theReadFlagOfRealServersDecidesWhatIsUnread() {
        val parsed = MessagesParser.parse(
            JSONArray(
                """[
                {"Id":"A","Title":"A","SentDate":"2026-10-03T10:00:00+02:00","Read":false},
                {"Id":"B","Title":"B","SentDate":"2026-10-02T10:00:00+02:00","Read":true},
                {"Id":"C","Title":"C","SentDate":"2026-10-01T10:00:00+02:00","Read":true,"Unread":true}
                ]""",
            ),
            null,
        )
        assertEquals(listOf(true, false, false), parsed.map { it.unread })
    }
}

/** Anonymised captures of a real school; skipped unless `fixtures/bakalari-real` exists (see scripts/capture-fixtures.mjs). */
class RealParserFixturesTest : ParserFixtureChecks("bakalari-real")
