package cz.prehled.app.notify

import cz.prehled.app.data.Prefs
import cz.prehled.app.domain.Homework
import cz.prehled.app.domain.Lesson
import cz.prehled.app.domain.LessonChange
import cz.prehled.app.domain.Mark
import cz.prehled.app.domain.Message
import cz.prehled.app.sync.NewItems
import cz.prehled.app.sync.TimetableChange
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class NotificationPlannerTest {
    private val noon = LocalDateTime.parse("2026-10-06T12:00:00")

    private fun mark(id: String, subject: String = "Matematika", text: String = "1", weight: Int = 3) =
        Mark(id, subject.take(2), subject, text, weight, "", "2026-10-06", true)

    private fun message(id: String, sender: String = "Jana Nováková", title: String = "Výlet", type: String = "received") =
        Message(id, type, title, sender, "2026-10-06T08:00:00+0200", true)

    private fun homework(id: String, deadline: String = "2026-10-09T00:00:00+0200") =
        Homework(id, "Čj", "Český jazyk", "Napsat   sloh\nna téma léto", "2026-10-06", deadline, false)

    private fun change(type: String, date: String = "2026-10-06", hour: String = "3", room: String = "A12", sub: String? = null) =
        TimetableChange(
            date,
            Lesson("l1", 3, "s1", "Fy", "Fyzika", "T", "T", room, "", "", LessonChange(type, "", null, null, sub)),
            hour,
        )

    @Test
    fun singleMarkMentionsSubjectMarkAndWeight() {
        val specs = NotificationPlanner.plan(NewItems(marks = listOf(mark("m1"))), Prefs(), noon)
        val spec = specs.single()
        assertEquals(NotifyCategory.MARKS, spec.category)
        assertEquals("Nová známka: Matematika", spec.title)
        assertEquals("1 · váha 3", spec.text)
        assertEquals("prehled://open/marks", spec.deepLink)
        assertTrue(spec.lines.isEmpty())
    }

    @Test
    fun severalMarksAreGroupedIntoOneNotification() {
        val specs = NotificationPlanner.plan(NewItems(marks = listOf(mark("1"), mark("2", "Fyzika", "2"))), Prefs(), noon)
        val spec = specs.single()
        assertEquals("Nové známky (2)", spec.title)
        assertEquals(listOf("Matematika: 1", "Fyzika: 2"), spec.lines)
    }

    @Test
    fun englishTextFollowsTheAppLanguageNotTheSystem() {
        val specs = NotificationPlanner.plan(NewItems(marks = listOf(mark("m1"))), Prefs(language = "en"), noon)
        assertEquals("New mark: Matematika", specs.single().title)
        assertEquals("1 · weight 3", specs.single().text)
    }

    @Test
    fun receivedMessageDeepLinksToItsDetail() {
        val spec = NotificationPlanner.plan(NewItems(messages = listOf(message("a b/1"))), Prefs(), noon).single()
        assertEquals("Nová zpráva od Jana Nováková", spec.title)
        assertEquals("Výlet", spec.text)
        assertEquals("prehled://open/message-detail?id=a+b%2F1", spec.deepLink)
    }

    @Test
    fun noticeboardPostOpensTheMessageList() {
        val spec = NotificationPlanner.plan(NewItems(messages = listOf(message("n1", type = "noticeboard"))), Prefs(), noon).single()
        assertEquals("prehled://open/messages", spec.deepLink)
    }

    @Test
    fun homeworkShowsDeadlineAndCollapsesWhitespace() {
        val spec = NotificationPlanner.plan(NewItems(homework = listOf(homework("h1"))), Prefs(), noon).single()
        assertEquals("Nový úkol: Český jazyk", spec.title)
        assertEquals("Napsat sloh na téma léto (do 9. 10.)", spec.text)
    }

    @Test
    fun longHomeworkTextIsClipped() {
        val long = homework("h1").copy(content = "x".repeat(400))
        val spec = NotificationPlanner.plan(NewItems(homework = listOf(long)), Prefs(), noon).single()
        assertTrue(spec.text.length <= 160)
        assertTrue(spec.text.contains("…"))
    }

    @Test
    fun timetableChangesAreOneSummaryForTheDay() {
        val items = NewItems(timetableChanges = listOf(change("Canceled"), change("RoomChanged", hour = "4", room = "B3"), change("Substitution", hour = "5", sub = "Novák")))
        val spec = NotificationPlanner.plan(items, Prefs(), noon).single()
        assertEquals("Změny v rozvrhu (dnes)", spec.title)
        assertEquals(listOf("3. Fy: odpadá", "4. Fy: změna učebny → B3", "5. Fy: suplování (Novák)"), spec.lines)
    }

    @Test
    fun timetableDayLabelIsTomorrowOrDate() {
        val tomorrow = NotificationPlanner.plan(NewItems(timetableChanges = listOf(change("Added", date = "2026-10-07"))), Prefs(language = "en"), noon).single()
        assertEquals("Timetable changes (tomorrow)", tomorrow.title)
        assertEquals("3. Fy: added", tomorrow.text)
        val monday = NotificationPlanner.plan(NewItems(timetableChanges = listOf(change("Added", date = "2026-10-12"))), Prefs(), noon).single()
        assertEquals("Změny v rozvrhu (12. 10.)", monday.title)
    }

    @Test
    fun disabledCategoriesProduceNothing() {
        val items = NewItems(marks = listOf(mark("m")), messages = listOf(message("a")), homework = listOf(homework("h")), timetableChanges = listOf(change("Canceled")))
        val prefs = Prefs(notifyMarks = false, notifyMessages = false, notifyTimetable = false, notifyHomework = true)
        assertEquals(listOf(NotifyCategory.HOMEWORK), NotificationPlanner.plan(items, prefs, noon).map { it.category })
    }

    @Test
    fun emptyItemsProduceNothing() {
        assertTrue(NotificationPlanner.plan(NewItems(), Prefs(), noon).isEmpty())
    }

    @Test
    fun sessionExpiredNoticeIsLocalised() {
        assertEquals("Přihlaste se znovu", NotificationPlanner.sessionExpired(Prefs(), noon).title)
        assertEquals("Sign in again", NotificationPlanner.sessionExpired(Prefs(language = "en"), noon).title)
        assertEquals(NotifyCategory.ACCOUNT, NotificationPlanner.sessionExpired(Prefs(), noon).category)
    }
}
