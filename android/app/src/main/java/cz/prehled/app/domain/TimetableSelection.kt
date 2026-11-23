package cz.prehled.app.domain

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime

data class TimetableSelection(
    val day: Day?,
    val hours: List<Hour>,
    val isPerm: Boolean,
    val isToday: Boolean,
    val isTomorrow: Boolean,
    val isNextMonday: Boolean,
)

private fun Day.hasLessons() = lessons.isNotEmpty()

/**
 * Port of selectTimetableDay in src/domain/timetableSelection.ts.
 *
 * The web version can also look Monday up in weeks the user browsed in the app;
 * native only knows the actual, next-week and permanent timetables.
 */
fun selectTimetableDay(
    now: LocalDateTime,
    actual: Timetable,
    permanent: Timetable,
    nextWeek: Timetable?,
    lang: String,
): TimetableSelection {
    val todayJs = now.dayOfWeek.jsDay
    val isWeekend = todayJs == 0 || todayJs == 6

    fun isHolidayDay(d: Day) = getHolidayInfo(d, lang).isHoliday
    fun isValidDay(d: Day) = d.hasLessons() || isHolidayDay(d)
    val hoursList = actual.hours.ifEmpty { permanent.hours }

    fun isSchoolOverForDay(day: Day?): Boolean {
        if (day == null || day.lessons.isEmpty()) return true
        var maxEndMins = -1
        for (lesson in day.lessons) {
            val hour = hoursList.firstOrNull { it.id == lesson.hourId }
            val end = parseTimeToMinutes(hour?.endTime)
            if (end != null && end > maxEndMins) maxEndMins = end
        }
        val currentMins = now.hour * 60 + now.minute
        return if (maxEndMins > 0) currentMins >= maxEndMins else currentMins >= 15 * 60 + 30
    }

    val todayIso = now.isoDate()
    var todayDay: Day? = if (!isWeekend) {
        actual.days.firstOrNull { if (it.date.isNotEmpty()) it.date.take(10) == todayIso else it.dayOfWeek == todayJs }
    } else null
    val todayHoliday = if (todayDay != null) getHolidayInfo(todayDay, lang) else getHolidayInfoForDate(lang)
    var isPerm = false
    if (!isWeekend && !todayHoliday.isHoliday && (todayDay == null || !todayDay.hasLessons())) {
        val permDay = permanent.days.firstOrNull { it.dayOfWeek == todayJs }
        if (permDay != null && permDay.hasLessons()) {
            todayDay = permDay
            isPerm = true
        }
    }
    val todayHasLessons = todayDay != null && todayDay.hasLessons()
    val todaySchoolOver = !todayHasLessons || isSchoolOverForDay(todayDay)

    // 1) School is still ongoing or yet to start today, or today is a holiday.
    if (!isWeekend && ((todayHasLessons && !todaySchoolOver) || (todayHoliday.isHoliday && now.hour < 17))) {
        val base = todayDay ?: Day(todayJs, "", "", "", "", emptyList())
        val enriched = base.copy(
            date = if (todayDay != null && todayDay.date.isNotEmpty()) todayDay.date.take(10) else todayIso,
            dayDescription = todayDay?.dayDescription?.takeIf { it.isNotEmpty() } ?: todayHoliday.title,
        )
        return TimetableSelection(enriched, if (isPerm) permanent.hours else actual.hours, isPerm, true, false, false)
    }

    // 2) School is over today (or today is a free weekday): next valid day this week.
    if (!isWeekend && todayJs < 5) {
        val nextDayInWeek = actual.days
            .filter { isValidDay(it) && it.dayOfWeek > todayJs }
            .minByOrNull { it.dayOfWeek }
        if (nextDayInWeek != null) {
            val daysAhead = nextDayInWeek.dayOfWeek - todayJs
            val targetIso = now.toLocalDate().plusDays(daysAhead.toLong()).toString()
            val enriched = nextDayInWeek.copy(date = if (nextDayInWeek.date.isNotEmpty()) nextDayInWeek.date.take(10) else targetIso)
            return TimetableSelection(enriched, actual.hours, false, false, daysAhead == 1, false)
        }
    }

    // 3) Friday after school, weekend, or nothing left this week: next Monday.
    val daysUntilMonday = when (todayJs) {
        0 -> 1
        6 -> 2
        5 -> 3
        else -> (7 - todayJs + 1) % 7
    }
    val targetMondayIso = now.toLocalDate().plusDays(daysUntilMonday.toLong()).toString()

    fun matchesMonday(d: Day): Boolean {
        val matchesDate = if (d.date.isNotEmpty()) d.date.take(10) == targetMondayIso else (isWeekend && d.dayOfWeek == 1)
        return matchesDate && isValidDay(d)
    }

    var mondayDay = actual.days.firstOrNull { matchesMonday(it) }
    var hours = actual.hours.ifEmpty { permanent.hours }
    var isMondayPerm = false

    if (mondayDay == null && nextWeek != null && nextWeek.days.isNotEmpty()) {
        val nextMon = nextWeek.days.firstOrNull {
            val matchesDate = if (it.date.isNotEmpty()) it.date.take(10) == targetMondayIso else it.dayOfWeek == 1
            matchesDate && isValidDay(it)
        }
        if (nextMon != null) {
            mondayDay = nextMon
            hours = nextWeek.hours.ifEmpty { hours }
        }
    }

    // The permanent timetable is a fallback only when Monday is nowhere else as a valid day.
    if (mondayDay == null) {
        val permMon = permanent.days.firstOrNull { it.dayOfWeek == 1 && it.hasLessons() }
            ?: permanent.days.filter { it.hasLessons() }.minByOrNull { it.dayOfWeek }
        if (permMon != null) {
            mondayDay = permMon
            hours = permanent.hours.ifEmpty { hours }
            isMondayPerm = true
        }
    }

    if (mondayDay != null) {
        val enriched = mondayDay.copy(date = if (mondayDay.date.isNotEmpty()) mondayDay.date.take(10) else targetMondayIso)
        val isTomorrow = daysUntilMonday == 1
        return TimetableSelection(
            enriched, hours, isMondayPerm, false, isTomorrow,
            !isTomorrow && (mondayDay.dayOfWeek == 1 || daysUntilMonday <= 3),
        )
    }

    return TimetableSelection(null, actual.hours, false, false, false, false)
}

/**
 * The next [count] school days after [after], skipping weekends and days that are neither a
 * lesson day nor a holiday. A date is looked up by its date in the actual and next-week
 * timetables; when neither has lessons or a holiday for it, the permanent timetable fills in,
 * as it does for today in [selectTimetableDay].
 */
fun followingTimetableDays(
    today: LocalDate,
    after: LocalDate,
    count: Int,
    actual: Timetable,
    permanent: Timetable,
    nextWeek: Timetable?,
    lang: String,
): List<TimetableSelection> {
    val result = mutableListOf<TimetableSelection>()
    var date = after
    // Two weeks of look-ahead is enough to pass any weekend plus a missing week of data.
    repeat(14) {
        if (result.size >= count) return result
        date = date.plusDays(1)
        if (date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY) return@repeat
        val iso = date.toString()

        fun byDate(timetable: Timetable?) = timetable?.days?.firstOrNull { it.date.isNotEmpty() && it.date.take(10) == iso }
        fun valid(day: Day) = day.hasLessons() || getHolidayInfo(day, lang).isHoliday

        val fromActual = byDate(actual)
        val fromNext = byDate(nextWeek)
        val found: Pair<Day, List<Hour>>? = when {
            fromActual != null && valid(fromActual) -> fromActual to actual.hours.ifEmpty { permanent.hours }
            fromNext != null && valid(fromNext) -> fromNext to (nextWeek?.hours.orEmpty().ifEmpty { actual.hours.ifEmpty { permanent.hours } })
            else -> null
        }
        if (found != null) {
            result += TimetableSelection(found.first.copy(date = iso), found.second, false, false, date == today.plusDays(1), false)
            return@repeat
        }
        val perm = permanent.days.firstOrNull { it.dayOfWeek == date.dayOfWeek.jsDay && it.hasLessons() } ?: return@repeat
        result += TimetableSelection(perm.copy(date = iso), permanent.hours, true, false, date == today.plusDays(1), false)
    }
    return result
}
