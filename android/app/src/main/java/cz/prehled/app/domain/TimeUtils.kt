package cz.prehled.app.domain

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime

private val TIME_REGEX = Regex("""(?:^|T|\s)(\d{1,2}):(\d{2})""")

/** Parses "HH:mm" or an ISO timestamp into minutes since midnight. */
fun parseTimeToMinutes(time: String?): Int? {
    if (time.isNullOrBlank()) return null
    val match = TIME_REGEX.find(time.trim()) ?: return null
    return match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt()
}

/** JavaScript's Date.getDay(): 0 = Sunday ... 6 = Saturday. */
val DayOfWeek.jsDay: Int get() = value % 7

fun LocalDateTime.isoDate(): String = toLocalDate().toString()

fun LocalDate.jsDay(): Int = dayOfWeek.jsDay
