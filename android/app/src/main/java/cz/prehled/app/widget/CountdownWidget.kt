package cz.prehled.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import cz.prehled.app.R
import cz.prehled.app.domain.CountdownMode

/**
 * The countdowns are classic RemoteViews widgets because only a Chronometer counts
 * down by itself every second without waking the app. There are two: the time left in
 * the lesson (or break) and the time left in the school day. The progress bar under
 * the counter is redrawn by the inexact alarm in [WidgetUpdater] about once a minute.
 */
abstract class BaseCountdownProvider(private val mode: CountdownMode) : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        update(context, manager, appWidgetIds, mode)
        WidgetUpdater.ensureAlarm(context)
    }

    override fun onDisabled(context: Context) {
        WidgetUpdater.ensureAlarm(context)
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, newOptions: android.os.Bundle) {
        update(context, manager, intArrayOf(appWidgetId), mode)
    }

    companion object {
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            for ((provider, mode) in PROVIDERS) {
                val ids = manager.getAppWidgetIds(ComponentName(context, provider))
                if (ids.isNotEmpty()) update(context, manager, ids, mode)
            }
        }

        private val PROVIDERS = listOf(
            CountdownWidgetProvider::class.java to CountdownMode.LESSON_TIME,
            DayCountdownWidgetProvider::class.java to CountdownMode.DAY_TIME,
        )

        private fun update(context: Context, manager: AppWidgetManager, ids: IntArray, mode: CountdownMode) {
            val input = WidgetData.inputs(context)
            val colors = WidgetData.colors(context, input)
            for (id in ids) manager.updateAppWidget(id, build(context, input, colors, mode))
        }

        private fun build(context: Context, input: WidgetInputs, colors: WidgetColors, mode: CountdownMode): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_countdown)
            views.setInt(R.id.countdown_bg, "setColorFilter", colors["surfaceContainer"])
            views.setTextColor(R.id.countdown_label, colors["primary"])
            views.setTextColor(R.id.countdown_chrono, colors["onSurface"])
            views.setTextColor(R.id.countdown_counter, colors["onSurface"])
            views.setTextColor(R.id.countdown_note, colors["onSurfaceVariant"])

            val tap = PendingIntent.getActivity(
                context, REQUEST_OPEN, WidgetData.openIntent(context, "prehled://open/timetable"),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            views.setOnClickPendingIntent(R.id.countdown_root, tap)

            fun message(text: String) {
                views.setViewVisibility(R.id.countdown_icon, View.GONE)
                views.setTextViewText(R.id.countdown_label, text)
                views.setViewVisibility(R.id.countdown_chrono, View.GONE)
                views.setViewVisibility(R.id.countdown_counter, View.GONE)
                views.setViewVisibility(R.id.countdown_progress, View.GONE)
                views.setViewVisibility(R.id.countdown_note, View.GONE)
            }

            when (input.status) {
                WidgetStatus.Demo -> message(input.text.demo)
                WidgetStatus.SignedOut -> message(input.text.signedOut)
                WidgetStatus.SessionExpired -> message(input.text.sessionExpired)
                WidgetStatus.Loading -> message(input.text.loading)
                WidgetStatus.Ready -> {
                    val model = CountdownModel.build(input, mode)
                    views.setTextViewText(R.id.countdown_label, model.label)
                    views.setViewVisibility(R.id.countdown_icon, View.VISIBLE)
                    views.setImageViewResource(
                        R.id.countdown_icon,
                        when (model.icon) {
                            CountdownIcon.CLOCK -> R.drawable.ic_countdown_clock
                            CountdownIcon.COFFEE -> R.drawable.ic_countdown_coffee
                            CountdownIcon.DONE -> R.drawable.ic_countdown_done
                            CountdownIcon.TIMER -> R.drawable.ic_countdown_timer
                        },
                    )
                    // Finished school gets the green check from the app, everything else the theme colour.
                    views.setInt(R.id.countdown_icon, "setColorFilter", if (model.icon == CountdownIcon.DONE) 0xFF10B981.toInt() else colors["primary"])
                    val end = model.chronometerEndMs
                    if (end != null) {
                        views.setViewVisibility(R.id.countdown_chrono, View.VISIBLE)
                        views.setViewVisibility(R.id.countdown_counter, View.GONE)
                        views.setChronometerCountDown(R.id.countdown_chrono, true)
                        views.setChronometer(R.id.countdown_chrono, SystemClock.elapsedRealtime() + (end - input.nowMs), null, true)
                    } else {
                        views.setViewVisibility(R.id.countdown_chrono, View.GONE)
                        views.setViewVisibility(R.id.countdown_counter, View.VISIBLE)
                        views.setTextViewText(R.id.countdown_counter, model.counter)
                    }
                    views.setViewVisibility(R.id.countdown_progress, if (model.showProgress) View.VISIBLE else View.GONE)
                    if (model.showProgress) {
                        views.setImageViewBitmap(R.id.countdown_progress, progressBar(model.progress, colors["primary"], colors["surfaceContainerHighest"]))
                    }
                    views.setViewVisibility(R.id.countdown_note, if (input.staleNote != null) View.VISIBLE else View.GONE)
                    views.setTextViewText(R.id.countdown_note, input.staleNote.orEmpty())
                }
            }
            return views
        }

        /** Drawn here because RemoteViews cannot tint a ProgressBar before Android 12. */
        private fun progressBar(progress: Double, fill: Int, track: Int): Bitmap {
            val w = 600
            val h = 16
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            paint.color = track
            canvas.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), h / 2f, h / 2f, paint)
            val filled = (w * progress.coerceIn(0.0, 1.0)).toFloat()
            if (filled > 0f) {
                paint.color = fill
                canvas.drawRoundRect(RectF(0f, 0f, maxOf(filled, h.toFloat()), h.toFloat()), h / 2f, h / 2f, paint)
            }
            return bitmap
        }

        private const val REQUEST_OPEN = 1
    }
}

/** Time left in the current lesson or break. Keeps the original class name so placed widgets survive the update. */
class CountdownWidgetProvider : BaseCountdownProvider(CountdownMode.LESSON_TIME)

/** Time left in today's school day. */
class DayCountdownWidgetProvider : BaseCountdownProvider(CountdownMode.DAY_TIME)
