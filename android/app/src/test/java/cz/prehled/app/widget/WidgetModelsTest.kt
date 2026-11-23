package cz.prehled.app.widget

import cz.prehled.app.data.Prefs
import cz.prehled.app.domain.CountdownMode
import cz.prehled.app.domain.TestMark
import cz.prehled.app.widget.WidgetTestSupport.input
import cz.prehled.app.widget.WidgetTestSupport.ms
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import cz.prehled.app.data.Snapshot

class WidgetModelsTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var snapshot: Snapshot

    @Before
    fun setUp() {
        snapshot = WidgetTestSupport.snapshot(tmp.newFolder())
    }

    @Test
    fun timetableShowsTodayWithChangeBadges() {
        val m = TimetableModel.build(input(snapshot, "2026-10-06T07:00:00"))
        assertEquals("Dnes", m.dayLabel)
        assertEquals(4, m.lessons.size)
        assertEquals(listOf(null, ChangeKind.CANCELED, ChangeKind.ROOM, ChangeKind.SUBSTITUTION), m.lessons.map { it.badgeKind })
        assertEquals("08:00–08:45", m.lessons[0].time)
        assertEquals("Matematika", m.lessons[0].subject)
        assertEquals("Odpadá", m.lessons[1].badge)
        assertTrue(m.lessons.none { it.isCurrent })
        assertNull(m.emptyText)
        assertFalse(m.isPermanent)
    }

    @Test
    fun timetableHighlightsTheCurrentLesson() {
        val m = TimetableModel.build(input(snapshot, "2026-10-06T08:10:00"))
        assertEquals(listOf(true, false, false, false), m.lessons.map { it.isCurrent })
        val gap = TimetableModel.build(input(snapshot, "2026-10-06T08:50:00"))
        assertTrue(gap.lessons.none { it.isCurrent })
    }

    @Test
    fun testMarksFlagTheMatchingHourOnTheirDateOnly() {
        val marks = listOf(TestMark("2026-10-06", 2, "Písemka z matematiky"), TestMark("2026-10-08", 1, ""))
        val m = TimetableModel.build(input(snapshot, "2026-10-06T07:00:00", testMarks = marks))
        assertEquals(listOf(false, true, false, false), m.lessons.map { it.hasTest })
        assertEquals(1, m.followingDays.flatMap { it.lessons }.count { it.hasTest })
    }

    @Test
    fun testMarksAreIgnoredWithoutAMatch() {
        val marks = listOf(TestMark("2026-10-06", 9, ""), TestMark("2026-09-01", 1, ""))
        val m = TimetableModel.build(input(snapshot, "2026-10-06T07:00:00", testMarks = marks))
        assertTrue(m.lessons.none { it.hasTest })
    }

    @Test
    fun finishedLessonsAreMarkedPast() {
        val m = TimetableModel.build(input(snapshot, "2026-10-06T08:50:00"))
        assertEquals(listOf(true, false, false, false), m.lessons.map { it.isPast })
    }

    @Test
    fun breakLineSitsBeforeTheNextLesson() {
        val during = TimetableModel.build(input(snapshot, "2026-10-06T08:50:00"))
        assertEquals(1, during.breakBeforeLesson)
        val beforeSchool = TimetableModel.build(input(snapshot, "2026-10-06T07:00:00"))
        assertEquals(0, beforeSchool.breakBeforeLesson)
    }

    @Test
    fun changedPartsAreFlaggedForHighlighting() {
        val m = TimetableModel.build(input(snapshot, "2026-10-06T07:00:00"))
        val (plain, canceled, room, substitution) = m.lessons
        assertFalse(plain.roomChanged || plain.teacherChanged || plain.subjectChanged)
        assertFalse(canceled.roomChanged || canceled.teacherChanged)
        assertTrue(room.roomChanged)
        assertFalse(room.teacherChanged)
        assertTrue(substitution.teacherChanged)
        assertFalse(substitution.roomChanged)
    }

    @Test
    fun addedLessonHighlightsTheSubject() {
        val m = TimetableModel.build(input(snapshot, "2026-10-06T07:00:00"))
        val thursday = m.followingDays[1]
        assertTrue(thursday.lessons.any { it.subjectChanged })
    }

    @Test
    fun theTwoFollowingSchoolDaysAreIncluded() {
        val m = TimetableModel.build(input(snapshot, "2026-10-06T07:00:00"))
        assertEquals(2, m.followingDays.size)
        val (wednesday, thursday) = m.followingDays
        assertEquals("Zítra", wednesday.dayLabel)
        assertEquals("Podzimní prázdniny", wednesday.holidayTitle)
        assertEquals("Čtvrtek", thursday.dayLabel)
        assertEquals(3, thursday.lessons.size)
        assertTrue(thursday.lessons.none { it.isCurrent || it.isPast })
        assertNull(thursday.breakBeforeLesson)
    }

    @Test
    fun followingDaysSkipTheWeekendAndFallBackToThePermanentTimetable() {
        val m = TimetableModel.build(input(snapshot, "2026-10-08T07:00:00"))
        assertEquals("Dnes", m.dayLabel)
        val (friday, monday) = m.followingDays
        assertEquals("Zítra", friday.dayLabel)
        assertEquals("Pondělí", monday.dayLabel)
        assertTrue(monday.isPermanent)
        assertTrue(monday.lessons.isNotEmpty())
    }

    @Test
    fun afterSchoolTheNextDaysStillFollow() {
        val m = TimetableModel.build(input(snapshot, "2026-10-08T15:00:00"))
        assertEquals("Zítra", m.dayLabel)
        assertEquals(listOf("Pondělí", "Úterý"), m.followingDays.map { it.dayLabel })
    }

    @Test
    fun afterSchoolShowsTomorrowAsAHolidayCard() {
        val m = TimetableModel.build(input(snapshot, "2026-10-06T15:00:00"))
        assertEquals("Zítra", m.dayLabel)
        assertEquals("Podzimní prázdniny", m.holidayTitle)
        assertTrue(m.lessons.isEmpty())
        assertNull(m.emptyText)
    }

    @Test
    fun englishTextFollowsThePreference() {
        val m = TimetableModel.build(input(snapshot, "2026-10-06T07:00:00", Prefs(language = "en")))
        assertEquals("Today", m.dayLabel)
        assertEquals("Cancelled", m.lessons[1].badge)
        assertEquals("Room change", m.lessons[2].badge)
    }

    @Test
    fun missingTimetableGivesAnEmptyText() {
        val m = TimetableModel.build(input(snapshot.copy(timetableActual = null), "2026-10-06T07:00:00"))
        assertEquals("Rozvrh není k dispozici", m.emptyText)
    }

    @Test
    fun marksCarryGradeBucketAndRelativeDate() {
        val m = MarksModel.build(input(snapshot, "2026-10-06T12:00:00"))
        assertEquals(3, m.rows.size)
        val first = m.rows.first()
        assertEquals(snapshot.marks.first().markText.trim(), first.mark)
        assertEquals(first.mark.first().digitToInt(), first.gradeBucket)
        assertTrue(first.dateText.isNotEmpty())
        assertEquals("dnes", MarksModel.build(input(snapshot.copy(marks = listOf(snapshot.marks.first().copy(markDate = "2026-10-06"))), "2026-10-06T12:00:00")).rows[0].dateText)
        assertEquals("včera", MarksModel.build(input(snapshot.copy(marks = listOf(snapshot.marks.first().copy(markDate = "2026-10-05"))), "2026-10-06T12:00:00")).rows[0].dateText)
        assertEquals("před 3 dny", MarksModel.build(input(snapshot.copy(marks = listOf(snapshot.marks.first().copy(markDate = "2026-10-03"))), "2026-10-06T12:00:00")).rows[0].dateText)
        assertEquals("1. 9.", MarksModel.build(input(snapshot.copy(marks = listOf(snapshot.marks.first().copy(markDate = "2026-09-01"))), "2026-10-06T12:00:00")).rows[0].dateText)
    }

    @Test
    fun marksShowTheClassRankWithAStar() {
        val rows = MarksModel.build(input(snapshot, "2026-10-06T12:00:00")).rows
        // Newest first, so the 20 September mark with a rank comes last.
        assertEquals(listOf("", "", "☆ 5. z 24"), rows.map { it.rankText })
        assertEquals("★ 1.", formatClassRank("★ 1."))
        assertEquals("", formatClassRank("  "))
    }

    @Test
    fun marksWithoutDataShowAnEmptyText() {
        assertEquals("Zatím žádné známky", MarksModel.build(input(snapshot.copy(marks = emptyList()), "2026-10-06T12:00:00")).emptyText)
    }

    @Test
    fun messagesShowUnreadCountWithCzechPlurals() {
        val m = MessagesModel.build(input(snapshot, "2026-10-06T12:00:00"))
        assertEquals(2, m.unreadCount)
        assertEquals("2 nepřečtené zprávy", m.unreadText)
        assertEquals(3, m.rows.size)
        assertEquals("1 nepřečtená zpráva", WidgetText("cs").unreadMessages(1))
        assertEquals("5 nepřečtených zpráv", WidgetText("cs").unreadMessages(5))
        assertEquals("3 unread messages", WidgetText("en").unreadMessages(3))
    }

    @Test
    fun homeworkListsActiveAssignmentsWithDeadlineText() {
        val m = HomeworkModel.build(input(snapshot, "2026-10-06T12:00:00"))
        assertEquals(1, m.total)
        assertTrue(m.rows[0].deadlineText.startsWith("do "))
        val overdue = HomeworkModel.build(input(snapshot, "2026-11-30T12:00:00"))
        assertTrue(overdue.rows[0].overdue)
    }

    @Test
    fun doneHomeworkIsHidden() {
        val m = HomeworkModel.build(input(snapshot.copy(homework = snapshot.homework.map { it.copy(done = true) }), "2026-10-06T12:00:00"))
        assertEquals("Žádné úkoly. Hurá!", m.emptyText)
    }

    @Test
    fun eventsDropPastOnesAtRenderTime() {
        val upcoming = EventsModel.build(input(snapshot, "2026-10-06T12:00:00"))
        assertEquals(2, upcoming.rows.size)
        assertEquals("9.–12. 10.", upcoming.rows[0].dateText)
        val later = EventsModel.build(input(snapshot, "2026-12-01T12:00:00"))
        assertTrue(later.rows.isEmpty())
        assertNotNull(later.emptyText)
    }

    @Test
    fun statusReflectsSignInDemoAndExpiry() {
        assertEquals(WidgetStatus.Ready, input(snapshot, "2026-10-06T12:00:00").status)
        assertEquals(WidgetStatus.Demo, input(null, "2026-10-06T12:00:00", Prefs(demo = true)).status)
        assertEquals(WidgetStatus.SignedOut, input(null, "2026-10-06T12:00:00", signedIn = false).status)
        assertEquals(WidgetStatus.Loading, input(null, "2026-10-06T12:00:00").status)
        assertEquals(WidgetStatus.SessionExpired, input(null, "2026-10-06T12:00:00", sessionExpired = true).status)
        // With old data an expired session still shows it, flagged as old.
        val withData = input(snapshot, "2026-10-06T12:00:00", sessionExpired = true)
        assertEquals(WidgetStatus.Ready, withData.status)
        assertNotNull(withData.staleNote)
    }

    @Test
    fun aSectionThatStoppedDownloadingGetsItsOwnStaleNote() {
        val stuck = snapshot.copy(fetchedAt = snapshot.fetchedAt + ("marks" to snapshot.generatedAt - 30 * 3_600_000L))
        val at = input(stuck, "2026-10-06T07:30:00")
        assertNull(at.staleNote)
        assertNull(at.staleNoteFor("homework"))
        assertEquals("Aktualizováno před 1 dnem", at.staleNoteFor("marks"))
    }

    @Test
    fun staleNoteAppearsAfterThreeHours() {
        assertNull(input(snapshot, "2026-10-06T09:00:00").staleNote)
        assertEquals("Aktualizováno před 5 h", input(snapshot, "2026-10-06T12:00:00").staleNote)
        assertEquals("Updated 5 h ago", input(snapshot, "2026-10-06T12:00:00", Prefs(language = "en")).staleNote)
    }

    @Test
    fun updatedAgoFormats() {
        val t = WidgetText("cs")
        assertEquals("Aktualizováno právě teď", t.updatedAgo(10_000))
        assertEquals("Aktualizováno před 12 min", t.updatedAgo(12 * 60_000L))
        assertEquals("Aktualizováno před 1 dnem", t.updatedAgo(25 * 3_600_000L))
        assertEquals("Aktualizováno před 3 dny", t.updatedAgo(75 * 3_600_000L))
    }

    private fun lesson(now: String) = CountdownModel.build(input(snapshot, now), CountdownMode.LESSON_TIME)
    private fun day(now: String) = CountdownModel.build(input(snapshot, now), CountdownMode.DAY_TIME)

    @Test
    fun lessonCountdownCountsToTheEndOfTheLesson() {
        val m = lesson("2026-10-06T08:10:00")
        assertEquals("Konec hodiny", m.label)
        assertEquals(ms("2026-10-06T08:45:00"), m.chronometerEndMs)
        assertFalse(m.finished)
    }

    @Test
    fun dayCountdownCountsToTheEndOfSchool() {
        val m = day("2026-10-06T08:10:00")
        assertEquals("Konec školy", m.label)
        assertEquals(ms("2026-10-06T11:40:00"), m.chronometerEndMs)
    }

    @Test
    fun progressFollowsTheLessonAndTheDay() {
        val l = lesson("2026-10-06T08:00:00")
        assertTrue(l.showProgress)
        assertEquals(0.0, l.progress, 0.001)
        assertEquals(0.5, lesson("2026-10-06T08:22:30").progress, 0.01)
        assertTrue(day("2026-10-06T09:00:00").progress > day("2026-10-06T08:10:00").progress)
    }

    @Test
    fun noProgressBarWhenThereIsNothingToCountDown() {
        assertFalse(lesson("2026-10-06T13:00:00").showProgress)
        assertFalse(day("2026-10-10T09:00:00").showProgress)
    }

    @Test
    fun countdownIsFinishedAfterSchool() {
        assertTrue(lesson("2026-10-06T13:00:00").finished)
        val m = day("2026-10-06T13:00:00")
        assertTrue(m.finished)
        assertNull(m.chronometerEndMs)
    }

    @Test
    fun countdownShowsHolidayNameOnAFreeDay() {
        val m = lesson("2026-10-07T09:00:00")
        assertEquals("Podzimní prázdniny", m.label)
        assertTrue(m.finished)
    }

    @Test
    fun countdownOnWeekendIsFree() {
        assertEquals("Víkendové volno", day("2026-10-10T09:00:00").label)
    }

    @Test
    fun countdownIconFollowsTheState() {
        assertEquals(CountdownIcon.CLOCK, lesson("2026-10-06T08:10:00").icon)
        assertEquals(CountdownIcon.COFFEE, lesson("2026-10-06T08:50:00").icon)
        assertEquals(CountdownIcon.DONE, lesson("2026-10-06T13:00:00").icon)
        assertEquals(CountdownIcon.TIMER, lesson("2026-10-10T09:00:00").icon)
    }
}
