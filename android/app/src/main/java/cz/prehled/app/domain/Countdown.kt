package cz.prehled.app.domain

import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale

enum class CountdownMode(val key: String) {
    LESSON_TIME("lesson_time"),
    DAY_TIME("day_time"),
    LESSON_PERCENT("lesson_percent"),
    DAY_PERCENT("day_percent");

    companion object {
        fun fromKey(key: String?): CountdownMode = entries.firstOrNull { it.key == key } ?: LESSON_TIME
    }
}

enum class CountdownState(val key: String) {
    WEEKEND_OR_FREE("weekend_or_free"),
    SCHOOL_OVER("school_over"),
    BEFORE_SCHOOL("before_school"),
    BREAK("break"),
    IN_LESSON("in_lesson"),
    DAY_TIME("day_time"),
    DAY_PERCENT("day_percent"),
}

enum class CountdownLabel(val key: String) {
    WEEKEND_FREE("weekendFree"),
    DAY_OFF("dayOff"),
    HOLIDAY("holiday"),
    SCHOOL_ENDS("schoolEnds"),
    SCHOOL_STARTS("schoolStarts"),
    LESSON_STARTS("lessonStarts"),
    LESSON_ENDS("lessonEnds"),
    BREAK_ENDS("breakEnds"),
}

data class CountdownResult(
    val state: CountdownState,
    val label: CountdownLabel,
    val holidayLabel: String?,
    val counterValue: String,
    val progress: Double,
    /** Absolute epoch milliseconds of the phase being counted down, null when nothing runs. */
    val phaseStartMs: Long?,
    val phaseEndMs: Long?,
)

private data class ScheduledLesson(val lesson: Lesson, val hour: Hour)

private fun pad2(n: Int) = n.toString().padStart(2, '0')

private fun formatHms(totalSecs: Double): String {
    val total = totalSecs.toInt()
    return "${pad2(total / 3600)}:${pad2((total % 3600) / 60)}:${pad2(total % 60)}"
}

private fun formatMs(totalSecs: Double): String {
    val total = totalSecs.toInt()
    return "${pad2(total / 60)}:${pad2(total % 60)}"
}

private fun formatPercent(ratio: Double, hideDecimals: Boolean): String {
    val clamped = ratio.coerceIn(0.0, 1.0)
    return if (hideDecimals) "${Math.round(clamped * 100)} %" else "${String.format(Locale.US, "%.2f", clamped * 100)} %"
}

/** Port of computeCountdown in src/domain/countdown.ts. */
fun computeCountdown(
    now: LocalDateTime,
    actual: Timetable,
    permanent: Timetable,
    mode: CountdownMode,
    hideDecimals: Boolean,
    lang: String,
    zone: ZoneId = ZoneId.systemDefault(),
): CountdownResult {
    val todayJs = now.dayOfWeek.jsDay
    val isWeekend = todayJs == 0 || todayJs == 6
    val todayIso = now.isoDate()
    val isPercentMode = mode == CountdownMode.LESSON_PERCENT || mode == CountdownMode.DAY_PERCENT

    var holidayDay: Day? = null
    var lessons: List<ScheduledLesson> = emptyList()
    if (!isWeekend) {
        var hoursList = actual.hours.ifEmpty { permanent.hours }
        var day = actual.days.firstOrNull { if (it.date.isNotEmpty()) it.date.take(10) == todayIso else it.dayOfWeek == todayJs }
        val holiday = if (day != null) getHolidayInfo(day, lang) else getHolidayInfoForDate(lang)
        var perm = false
        if (!holiday.isHoliday && (day == null || day.lessons.isEmpty())) {
            val pDay = permanent.days.firstOrNull { it.dayOfWeek == todayJs }
            if (pDay != null && pDay.lessons.isNotEmpty()) {
                day = pDay
                perm = true
            }
        }
        holidayDay = day
        val todayDay = day?.takeIf { it.lessons.isNotEmpty() }
        if (perm) hoursList = permanent.hours
        if (todayDay != null && hoursList.isNotEmpty()) {
            lessons = todayDay.lessons
                .mapNotNull { lesson -> hoursList.firstOrNull { it.id == lesson.hourId }?.let { ScheduledLesson(lesson, it) } }
                .sortedBy { parseTimeToMinutes(it.hour.beginTime) ?: 0 }
        }
    }

    val midnightMs = now.toLocalDate().atStartOfDay(zone).toInstant().toEpochMilli()
    fun abs(secs: Int): Long = midnightMs + secs * 1000L

    if (isWeekend || lessons.isEmpty()) {
        val holiday = if (holidayDay != null) getHolidayInfo(holidayDay, lang) else getHolidayInfoForDate(lang)
        val isHoliday = !isWeekend && holiday.isHoliday
        return CountdownResult(
            state = CountdownState.WEEKEND_OR_FREE,
            label = if (isWeekend) CountdownLabel.WEEKEND_FREE else if (isHoliday) CountdownLabel.HOLIDAY else CountdownLabel.DAY_OFF,
            holidayLabel = if (isHoliday) holiday.title.ifEmpty { holiday.badgeLabel } else null,
            counterValue = if (isPercentMode) (if (hideDecimals) "100 %" else "100.00 %") else (if (mode == CountdownMode.DAY_TIME) "00:00:00" else "00:00"),
            progress = 1.0,
            phaseStartMs = null,
            phaseEndMs = null,
        )
    }

    val firstBeginSecs = (parseTimeToMinutes(lessons.first().hour.beginTime) ?: (8 * 60)) * 60
    val lastEndSecs = (parseTimeToMinutes(lessons.last().hour.endTime) ?: (14 * 60 + 25)) * 60
    val nowSecs = now.hour * 3600 + now.minute * 60 + now.second + now.nano / 1_000_000_000.0

    if (nowSecs >= lastEndSecs) {
        return CountdownResult(
            state = CountdownState.SCHOOL_OVER,
            label = CountdownLabel.SCHOOL_ENDS,
            holidayLabel = null,
            counterValue = if (isPercentMode) (if (hideDecimals) "100 %" else "100.00 %") else (if (mode == CountdownMode.DAY_TIME) "00:00:00" else "00:00"),
            progress = 1.0,
            phaseStartMs = null,
            phaseEndMs = null,
        )
    }

    if (nowSecs < firstBeginSecs) {
        val remaining = maxOf(0.0, firstBeginSecs - nowSecs)
        val counter = when (mode) {
            CountdownMode.LESSON_TIME -> if (remaining >= 3600) formatHms(remaining) else formatMs(remaining)
            CountdownMode.DAY_TIME -> formatHms(remaining)
            else -> if (hideDecimals) "0 %" else "0.00 %"
        }
        return CountdownResult(
            state = CountdownState.BEFORE_SCHOOL,
            label = if (mode == CountdownMode.DAY_TIME || mode == CountdownMode.DAY_PERCENT) CountdownLabel.SCHOOL_STARTS else CountdownLabel.LESSON_STARTS,
            holidayLabel = null,
            counterValue = counter,
            progress = 0.0,
            phaseStartMs = null,
            phaseEndMs = abs(firstBeginSecs),
        )
    }

    val totalDaySecs = maxOf(1, lastEndSecs - firstBeginSecs)
    val dayProgress = (maxOf(0.0, nowSecs - firstBeginSecs) / totalDaySecs).coerceIn(0.0, 1.0)
    val remainingDaySecs = maxOf(0.0, lastEndSecs - nowSecs)

    var active: ScheduledLesson? = null
    var isBreak = false
    var breakTargetBeginSecs = 0
    var breakPrevEndSecs = 0
    for (i in lessons.indices) {
        val item = lessons[i]
        val bSecs = (parseTimeToMinutes(item.hour.beginTime) ?: 0) * 60
        val eSecs = (parseTimeToMinutes(item.hour.endTime) ?: 0) * 60
        if (nowSecs >= bSecs && nowSecs <= eSecs) {
            active = item
            break
        }
        if (nowSecs < bSecs) {
            isBreak = true
            breakTargetBeginSecs = bSecs
            breakPrevEndSecs = lessons.getOrNull(i - 1)?.let { (parseTimeToMinutes(it.hour.endTime) ?: 0) * 60 } ?: (bSecs - 600)
            break
        }
    }

    var lessonProgress = 0.0
    var remainingLessonSecs = 0.0
    var phaseStartSecs = 0
    var phaseEndSecs = 0
    if (active != null) {
        phaseStartSecs = (parseTimeToMinutes(active.hour.beginTime) ?: 0) * 60
        phaseEndSecs = (parseTimeToMinutes(active.hour.endTime) ?: 0) * 60
    } else if (isBreak) {
        phaseStartSecs = breakPrevEndSecs
        phaseEndSecs = breakTargetBeginSecs
    }
    if (active != null || isBreak) {
        val total = maxOf(1, phaseEndSecs - phaseStartSecs)
        remainingLessonSecs = maxOf(0.0, phaseEndSecs - nowSecs)
        lessonProgress = (maxOf(0.0, nowSecs - phaseStartSecs) / total).coerceIn(0.0, 1.0)
    }

    val lessonState = if (isBreak) CountdownState.BREAK else CountdownState.IN_LESSON
    val lessonLabel = if (isBreak) CountdownLabel.BREAK_ENDS else CountdownLabel.LESSON_ENDS

    return when (mode) {
        CountdownMode.LESSON_TIME -> CountdownResult(lessonState, lessonLabel, null, formatMs(remainingLessonSecs), lessonProgress, abs(phaseStartSecs), abs(phaseEndSecs))
        CountdownMode.DAY_TIME -> CountdownResult(CountdownState.DAY_TIME, CountdownLabel.SCHOOL_ENDS, null, formatHms(remainingDaySecs), dayProgress, abs(firstBeginSecs), abs(lastEndSecs))
        CountdownMode.LESSON_PERCENT -> CountdownResult(lessonState, lessonLabel, null, formatPercent(lessonProgress, hideDecimals), lessonProgress, abs(phaseStartSecs), abs(phaseEndSecs))
        CountdownMode.DAY_PERCENT -> CountdownResult(CountdownState.DAY_PERCENT, CountdownLabel.SCHOOL_ENDS, null, formatPercent(dayProgress, hideDecimals), dayProgress, abs(firstBeginSecs), abs(lastEndSecs))
    }
}
