package cz.prehled.app.domain

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

private val DAY_INDICATOR_1 = Regex("""[\s–\-(]+(?:\d+\.?\s*den|den\s*\d+(?:/\d+)?|\d+\.?\s*část)\s*\)?$""", RegexOption.IGNORE_CASE)
private val DAY_INDICATOR_2 = Regex("""[\s–\-(]+\d+/\d+\s*\)?$""", RegexOption.IGNORE_CASE)

/** Strips trailing day markers such as " - 1. den" or " (den 2/5)". */
fun normalizeEventTitle(rawTitle: String): String {
    if (rawTitle.isEmpty()) return ""
    return rawTitle.trim().replace(DAY_INDICATOR_1, "").replace(DAY_INDICATOR_2, "").trim()
}

private fun parseDate(value: String): LocalDate? = try {
    LocalDate.parse(value.substringBefore('T'))
} catch (e: Exception) {
    null
}

fun getDayDifference(a: String, b: String): Int {
    val da = parseDate(a) ?: return 0
    val db = parseDate(b) ?: return 0
    return ChronoUnit.DAYS.between(da, db).toInt()
}

/** Same day, consecutive days, or Friday/Saturday to the following Sunday/Monday. */
fun areDatesAdjacent(endA: String, startB: String): Boolean {
    if (endA.isEmpty() || startB.isEmpty()) return false
    val diff = getDayDifference(endA, startB)
    if (diff in 0..1) return true
    if (diff in 2..3) {
        val dowA = parseDate(endA)?.dayOfWeek
        val dowB = parseDate(startB)?.dayOfWeek
        if ((dowA == DayOfWeek.FRIDAY && (dowB == DayOfWeek.SUNDAY || dowB == DayOfWeek.MONDAY)) ||
            (dowA == DayOfWeek.SATURDAY && dowB == DayOfWeek.MONDAY)
        ) return true
    }
    if (diff < 0 && -diff <= 1) return true
    return false
}

private fun isPast(finalEnd: String, now: LocalDateTime): Boolean {
    val end = parseDate(finalEnd) ?: return false
    return end.atTime(23, 59, 59).isBefore(now)
}

private fun SchoolEvent.lastDate(): String = endDate?.takeIf { it.isNotEmpty() } ?: date

/** Port of groupConsecutiveEvents in src/domain/eventGrouping.ts. */
fun groupConsecutiveEvents(events: List<SchoolEvent>, now: LocalDateTime): List<SchoolEvent> {
    if (events.isEmpty()) return emptyList()
    val sorted = events.sortedBy { parseDate(it.date)?.toEpochDay() ?: 0L }
    val grouped = mutableListOf<SchoolEvent>()

    for (ev in sorted) {
        val normTitle = normalizeEventTitle(ev.title)
        val index = grouped.indexOfFirst { grp ->
            normalizeEventTitle(grp.title).lowercase() == normTitle.lowercase() &&
                (areDatesAdjacent(grp.lastDate(), ev.date) || areDatesAdjacent(ev.lastDate(), grp.date))
        }

        if (index >= 0) {
            var grp = grouped[index]
            if (ev.date < grp.date) grp = grp.copy(date = ev.date)
            val candidateEnd = ev.lastDate()
            val currentEnd = grp.lastDate()
            if (candidateEnd > currentEnd) grp = grp.copy(endDate = candidateEnd)
            if (normTitle.isNotEmpty() && normTitle.length < grp.title.length) grp = grp.copy(title = normTitle)
            if (grp.description.isEmpty() || (ev.description.isNotEmpty() && ev.description.length > grp.description.length)) {
                grp = grp.copy(description = ev.description)
            }
            if (grp.location.isNullOrEmpty() && !ev.location.isNullOrEmpty()) grp = grp.copy(location = ev.location)
            if (grp.organizer.isNullOrEmpty() && !ev.organizer.isNullOrEmpty()) grp = grp.copy(organizer = ev.organizer)
            if (grp.time.isNullOrEmpty() && !ev.time.isNullOrEmpty()) grp = grp.copy(time = ev.time)
            grp = grp.copy(isPast = isPast(grp.lastDate(), now))
            grouped[index] = grp
        } else {
            val finalEndDate = ev.endDate?.takeIf { it.isNotEmpty() && it != ev.date }
            val newEv = ev.copy(title = normTitle.ifEmpty { ev.title }, endDate = finalEndDate)
            grouped += newEv.copy(isPast = isPast(newEv.lastDate(), now))
        }
    }
    return grouped
}
