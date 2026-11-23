package cz.prehled.app.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import cz.prehled.app.Graph
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Redraws every placed widget from the local snapshot and sets one inexact alarm
 * for the next time something on screen changes (lesson boundary, midnight).
 * Exact alarms are deliberately not used: they need a permission Play restricts.
 */
object WidgetUpdater {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val glanceWidgets: List<GlanceAppWidget> = listOf(
        TimetableWidget(), MarksWidget(), MessagesWidget(), HomeworkWidget(), EventsWidget(),
    )

    private val providers = listOf(
        TimetableWidgetReceiver::class.java, MarksWidgetReceiver::class.java, MessagesWidgetReceiver::class.java,
        HomeworkWidgetReceiver::class.java, EventsWidgetReceiver::class.java, CountdownWidgetProvider::class.java, DayCountdownWidgetProvider::class.java,
    )

    fun hasWidgets(context: Context): Boolean {
        val manager = AppWidgetManager.getInstance(context)
        return providers.any { manager.getAppWidgetIds(ComponentName(context, it)).isNotEmpty() }
    }

    suspend fun refresh(context: Context) {
        val app = context.applicationContext
        if (!hasWidgets(app)) {
            cancelAlarm(app)
            return
        }
        val revision = System.currentTimeMillis()
        glanceWidgets.forEach { runCatching { it.redraw(app, revision) } }
        BaseCountdownProvider.updateAll(app)
        scheduleNext(app)
    }

    /** The new revision is what makes a still-running session load the data again (see [provideLive]). */
    private suspend fun GlanceAppWidget.redraw(context: Context, revision: Long) {
        GlanceAppWidgetManager(context).getGlanceIds(javaClass).forEach { id ->
            updateAppWidgetState(context, id) { it[REVISION] = revision }
            update(context, id)
        }
    }

    /** For callers that are not suspending (plugin methods, receivers). */
    fun refreshAsync(context: Context, done: (() -> Unit)? = null) {
        val app = context.applicationContext
        scope.launch {
            try {
                refresh(app)
            } finally {
                done?.invoke()
            }
        }
    }

    private fun alarmIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context, 0,
            Intent(context, WidgetRefreshReceiver::class.java).setAction(WidgetRefreshReceiver.ACTION_TICK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    /** Called when a widget is added or removed, so the alarm exists exactly while widgets do. */
    fun ensureAlarm(context: Context) {
        val app = context.applicationContext
        if (hasWidgets(app)) scheduleNext(app) else cancelAlarm(app)
    }

    private fun scheduleNext(context: Context) {
        val at = WidgetSchedule.nextUpdateMs(WidgetData.inputs(context))
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, at, alarmIntent(context))
    }

    private fun cancelAlarm(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context))
    }
}

/** Alarm ticks and system events that invalidate what the widgets show or the alarm itself. */
class WidgetRefreshReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Only the alarm and the system broadcasts it is registered for may trigger a redraw.
        if (intent.action !in HANDLED_ACTIONS) return
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED && Graph.tokenStore(context).load() != null) {
            cz.prehled.app.sync.SyncScheduler.syncSoon(context)
        }
        val pending = goAsync()
        WidgetUpdater.refreshAsync(context) { pending.finish() }
    }

    companion object {
        const val ACTION_TICK = "cz.prehled.app.WIDGET_TICK"

        private val HANDLED_ACTIONS = setOf(
            ACTION_TICK,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_DATE_CHANGED,
        )
    }
}
