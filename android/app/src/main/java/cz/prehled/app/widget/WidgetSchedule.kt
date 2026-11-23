package cz.prehled.app.widget

import cz.prehled.app.domain.CountdownMode
import cz.prehled.app.domain.Timetable
import cz.prehled.app.domain.parseTimeToMinutes
import cz.prehled.app.domain.selectTimetableDay
import java.time.ZoneId

/**
 * When the widgets should next be redrawn from the snapshot. The caller sets an
 * inexact alarm for the returned time; redrawing reads local data only.
 */
object WidgetSchedule {
    private const val MAX_WAIT_MS = 60 * 60 * 1000L
    private const val PROGRESS_TICK_MS = 60 * 1000L

    fun nextUpdateMs(input: WidgetInputs, zone: ZoneId = ZoneId.systemDefault()): Long {
        val now = input.now
        val nowMs = input.nowMs
        val candidates = mutableListOf(nowMs + MAX_WAIT_MS)

        fun at(minutes: Int): Long = now.toLocalDate().atStartOfDay(zone).plusMinutes(minutes.toLong()).toInstant().toEpochMilli()

        // The day changes at midnight, and a holiday card gives way to the next day at 17:00.
        candidates += now.toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        candidates += at(17 * 60)

        val s = input.snapshot
        val actual = s?.timetableActual
        if (actual != null) {
            val selection = selectTimetableDay(now, actual, s.timetablePermanent ?: Timetable.EMPTY, s.timetableNext, input.text.lang)
            if (selection.isToday) {
                selection.day?.lessons?.forEach { lesson ->
                    val hour = selection.hours.firstOrNull { it.id == lesson.hourId } ?: return@forEach
                    parseTimeToMinutes(hour.beginTime)?.let { candidates += at(it) }
                    parseTimeToMinutes(hour.endTime)?.let { candidates += at(it) }
                }
            }
            // The countdown progress bar moves only once school has started.
            val day = CountdownModel.build(input, CountdownMode.DAY_TIME)
            if (day.showProgress && day.progress > 0.0) candidates += nowMs + PROGRESS_TICK_MS
        }
        // A second of slack so the redraw lands just after the boundary, not just before it.
        return candidates.filter { it > nowMs }.min() + 1_000
    }
}
