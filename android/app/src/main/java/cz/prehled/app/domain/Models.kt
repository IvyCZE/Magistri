package cz.prehled.app.domain

import java.time.LocalDate

data class Hour(val id: Int, val caption: String, val beginTime: String, val endTime: String)

data class LessonChange(
    /** Canceled, Added, Removed, RoomChanged or Substitution. */
    val type: String,
    val description: String,
    val typeName: String?,
    val typeAbbrev: String?,
    val substituteTeacher: String?,
)

data class Lesson(
    val id: String,
    val hourId: Int,
    val subjectId: String,
    val subjectAbbrev: String,
    val subjectName: String,
    val teacherName: String,
    val teacherAbbrev: String,
    val roomAbbrev: String,
    val group: String,
    val theme: String,
    val change: LessonChange?,
)

data class Day(
    /** 1 = Monday ... 5 = Friday, as the API sends it. */
    val dayOfWeek: Int,
    val dayOfWeekName: String,
    /** YYYY-MM-DD, empty for the permanent timetable. */
    val date: String,
    val dayDescription: String,
    val dayType: String,
    val lessons: List<Lesson>,
)

data class Timetable(val hours: List<Hour>, val days: List<Day>) {
    companion object {
        val EMPTY = Timetable(emptyList(), emptyList())
    }
}

data class SchoolEvent(
    val id: String,
    val title: String,
    val description: String,
    /** YYYY-MM-DD or an ISO timestamp, as the API sends it. */
    val date: String,
    val endDate: String?,
    val time: String?,
    val location: String?,
    val organizer: String?,
    val isPast: Boolean?,
)

data class Mark(
    val id: String,
    val subjectAbbrev: String,
    val subjectName: String,
    val markText: String,
    val weight: Int,
    val caption: String,
    /** YYYY-MM-DD */
    val markDate: String,
    val isNew: Boolean,
    /** The school's place-in-class text such as "5. z 24" or "1. - 13. (∑ 30, ø 1,43)"; empty when it sends none. */
    val classRankText: String = "",
)

/** A "test is written in this hour" flag the user set in the web app; it never comes from the school server. */
data class TestMark(val date: String, val hourId: Int, val description: String)

data class Homework(
    val id: String,
    val subjectAbbrev: String,
    val subjectName: String,
    val content: String,
    val date: String,
    val deadline: String,
    val done: Boolean,
    val closed: Boolean = false,
) {
    val deadlineDate: LocalDate?
        get() = runCatching { LocalDate.parse(deadline.take(10)) }.getOrNull()

    fun isUpcoming(today: LocalDate) = !closed && deadlineDate?.isBefore(today) != true
}

data class Message(
    val id: String,
    /** received or noticeboard */
    val type: String,
    val title: String,
    val senderName: String,
    /** The API's timestamp, unchanged. */
    val date: String,
    val unread: Boolean,
)
