package cz.prehled.app.domain

import cz.prehled.app.domain.Fixtures.objects
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class DomainFixturesTest {
    private val timetables = Fixtures.obj("domain/timetables.json")
    private val actual = Fixtures.timetable(timetables.getJSONObject("actual"))
    private val permanent = Fixtures.timetable(timetables.getJSONObject("permanent"))
    private val nextWeek = Fixtures.timetable(timetables.getJSONObject("nextWeek"))

    @Test
    fun selectionAndCountdownMatchSharedCases() {
        val cases = Fixtures.array("domain/cases.json").objects()
        assertEquals(15, cases.size)
        for (c in cases) {
            val name = c.getString("name")
            val now = LocalDateTime.parse(c.getString("now"))
            val selection = selectTimetableDay(now, actual, permanent, if (c.getBoolean("nextWeekLoaded")) nextWeek else null, "cs")
            val es = c.getJSONObject("selection")
            assertEquals("$name date", if (es.isNull("date")) null else es.getString("date"), selection.day?.date)
            assertEquals("$name dayOfWeek", if (es.isNull("dayOfWeek")) null else es.getInt("dayOfWeek"), selection.day?.dayOfWeek)
            assertEquals("$name isPerm", es.getBoolean("isPerm"), selection.isPerm)
            assertEquals("$name isToday", es.getBoolean("isToday"), selection.isToday)
            assertEquals("$name isTomorrow", es.getBoolean("isTomorrow"), selection.isTomorrow)
            assertEquals("$name isNextMonday", es.getBoolean("isNextMonday"), selection.isNextMonday)
            assertEquals("$name lessonCount", es.getInt("lessonCount"), selection.day?.lessons?.size ?: 0)

            val countdown = computeCountdown(now, actual, permanent, CountdownMode.fromKey(c.getString("mode")), c.getBoolean("hideDecimals"), "cs")
            val ec = c.getJSONObject("countdown")
            assertEquals("$name state", ec.getString("state"), countdown.state.key)
            assertEquals("$name label", ec.getString("labelKey"), countdown.label.key)
            assertEquals("$name holiday", if (ec.isNull("holidayLabel")) null else ec.getString("holidayLabel"), countdown.holidayLabel)
            assertEquals("$name counter", ec.getString("counterValue"), countdown.counterValue)
            assertEquals("$name progress", ec.getDouble("progress"), countdown.progress, 0.00006)
        }
    }

    @Test
    fun phaseBoundariesAreAbsolute() {
        val zone = ZoneId.of("Europe/Prague")
        val now = LocalDateTime.parse("2026-10-06T08:20:00")
        val r = computeCountdown(now, actual, permanent, CountdownMode.LESSON_TIME, false, "cs", zone)
        assertEquals(LocalDateTime.parse("2026-10-06T08:00:00").atZone(zone).toInstant().toEpochMilli(), r.phaseStartMs)
        assertEquals(LocalDateTime.parse("2026-10-06T08:45:00").atZone(zone).toInstant().toEpochMilli(), r.phaseEndMs)
    }

    @Test
    fun holidayInfoMatchesSharedCases() {
        val cases = Fixtures.array("domain/holiday-cases.json").objects()
        assertEquals(32, cases.size)
        for (c in cases) {
            val input = c.getJSONObject("input")
            val e = c.getJSONObject("expected")
            val label = "${input.optString("dayType")}|${input.optString("dayDescription")}|${input.getInt("atomsCount")}|${c.getString("lang")}"
            val r = getHolidayInfo(input.optString("dayType"), input.optString("dayDescription"), input.getInt("atomsCount"), c.getString("lang"))
            assertEquals("$label isHoliday", e.getBoolean("isHoliday"), r.isHoliday)
            assertEquals("$label isPublic", e.getBoolean("isPublicHoliday"), r.isPublicHoliday)
            assertEquals("$label type", if (e.isNull("type")) null else e.getString("type"), r.type)
            assertEquals("$label title", e.getString("title"), r.title)
            assertEquals("$label badge", e.getString("badgeLabel"), r.badgeLabel)
            assertEquals("$label short", e.getString("shortBadgeLabel"), r.shortBadgeLabel)
            assertEquals("$label description", if (e.has("description")) e.getString("description") else null, r.description)
        }
    }

    @Test
    fun eventGroupingMatchesSharedCases() {
        val cases = Fixtures.array("domain/event-cases.json").objects()
        assertNotNull(cases)
        for (c in cases) {
            val name = c.getString("name")
            val input = c.getJSONArray("input").objects().map(Fixtures::event)
            val expected = c.getJSONArray("expected").objects().map(Fixtures::event)
            val actualOut = groupConsecutiveEvents(input, LocalDateTime.parse(c.getString("now")))
            assertEquals("$name", expected, actualOut)
        }
    }
}
