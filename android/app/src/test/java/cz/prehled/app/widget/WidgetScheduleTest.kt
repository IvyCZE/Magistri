package cz.prehled.app.widget

import cz.prehled.app.data.Prefs
import cz.prehled.app.widget.WidgetTestSupport.input
import cz.prehled.app.widget.WidgetTestSupport.ms
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import cz.prehled.app.data.Snapshot

class WidgetScheduleTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var snapshot: Snapshot

    @Before
    fun setUp() {
        snapshot = WidgetTestSupport.snapshot(tmp.newFolder())
    }

    private fun next(now: String, prefs: Prefs = Prefs()) = WidgetSchedule.nextUpdateMs(input(snapshot, now, prefs))

    @Test
    fun beforeSchoolWaitsForTheFirstLesson() {
        // The hour cap is 60 minutes, so 07:30 still sees the 08:00 boundary.
        assertEquals(ms("2026-10-06T08:00:01"), next("2026-10-06T07:30:00"))
    }

    @Test
    fun duringALessonRedrawsTheProgressBarEveryMinute() {
        assertEquals(ms("2026-10-06T08:11:01"), next("2026-10-06T08:10:00"))
    }

    @Test
    fun theLessonEndComesBeforeTheNextMinuteNearTheBoundary() {
        assertEquals(ms("2026-10-06T08:45:01"), next("2026-10-06T08:44:30"))
    }

    @Test
    fun noMinuteTickOnceSchoolIsOver() {
        assertEquals(ms("2026-10-06T14:00:01"), next("2026-10-06T13:00:00"))
    }

    @Test
    fun neverWaitsMoreThanAnHour() {
        assertEquals(ms("2026-10-06T21:00:01"), next("2026-10-06T20:00:00"))
    }

    @Test
    fun midnightComesBeforeTheHourCapNearTheEndOfTheDay() {
        assertEquals(ms("2026-10-07T00:00:01"), next("2026-10-06T23:30:00"))
    }

    @Test
    fun worksWithoutAnySnapshot() {
        val t = WidgetSchedule.nextUpdateMs(input(null, "2026-10-06T12:00:00"))
        assertEquals(ms("2026-10-06T13:00:01"), t)
    }
}
