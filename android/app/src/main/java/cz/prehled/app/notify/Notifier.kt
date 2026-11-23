package cz.prehled.app.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import cz.prehled.app.MainActivity
import cz.prehled.app.R
import java.util.concurrent.atomic.AtomicInteger

class Notifier(context: Context) {
    private val context = context.applicationContext
    private val nextId = AtomicInteger((System.currentTimeMillis() / 1000 % 100_000).toInt() * 10)

    /** False when the user has not granted (or has switched off) notifications for the app. */
    fun canPost(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /**
     * Channels are created before the permission is asked for, and renamed when
     * the app language changes (a channel keeps the user's own settings when only its name changes).
     */
    fun ensureChannels(language: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val cs = language != "en"
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        fun channel(category: NotifyCategory, czName: String, enName: String, czDesc: String, enDesc: String) {
            val c = NotificationChannel(category.channelId, if (cs) czName else enName, NotificationManager.IMPORTANCE_DEFAULT)
            c.description = if (cs) czDesc else enDesc
            manager.createNotificationChannel(c)
        }
        channel(NotifyCategory.MARKS, "Známky", "Marks", "Nové známky", "New marks")
        channel(NotifyCategory.MESSAGES, "Zprávy", "Messages", "Nové zprávy a nástěnka", "New messages and noticeboard posts")
        channel(NotifyCategory.TIMETABLE, "Změny v rozvrhu", "Timetable changes", "Zrušené hodiny, suplování a změny učeben", "Cancelled lessons, substitutions and room changes")
        channel(NotifyCategory.HOMEWORK, "Úkoly", "Homework", "Nové domácí úkoly", "New homework")
        channel(NotifyCategory.ACCOUNT, "Přihlášení", "Account", "Upozornění, když je potřeba se znovu přihlásit", "Reminder when you need to sign in again")
    }

    fun post(spec: NotificationSpec) {
        if (!canPost()) return
        val id = nextId.incrementAndGet()
        val tap = Intent(Intent.ACTION_VIEW, Uri.parse(spec.deepLink))
            .setClass(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(context, id, tap, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        val builder = NotificationCompat.Builder(context, spec.category.channelId)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(spec.title)
            .setContentText(spec.text)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(if (spec.category == NotifyCategory.MESSAGES) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_EVENT)
        if (spec.lines.size > 1) {
            val style = NotificationCompat.InboxStyle()
            spec.lines.take(MAX_INBOX_LINES).forEach { style.addLine(it) }
            if (spec.lines.size > MAX_INBOX_LINES) style.setSummaryText("+${spec.lines.size - MAX_INBOX_LINES}")
            builder.setStyle(style)
        } else {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(spec.text))
        }
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (e: SecurityException) {
            // Permission revoked between the check and the call; nothing to do.
        }
    }

    private companion object {
        const val MAX_INBOX_LINES = 5
    }
}
