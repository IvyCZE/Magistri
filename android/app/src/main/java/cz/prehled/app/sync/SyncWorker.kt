package cz.prehled.app.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import cz.prehled.app.Graph
import cz.prehled.app.notify.NotificationDelivery
import cz.prehled.app.widget.WidgetUpdater
import kotlinx.coroutines.runBlocking
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit

class SyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    private fun run(): SyncOutcome {
        val outcome = Graph.syncEngine(applicationContext).sync(force = false)
        val notifier = Graph.notifier(applicationContext)
        NotificationDelivery.deliver(outcome, Graph.stateStore(applicationContext), LocalDateTime.now(), notifier::post)
        if (outcome is SyncOutcome.Updated || outcome is SyncOutcome.SessionExpired) runBlocking { WidgetUpdater.refresh(applicationContext) }
        return outcome
    }

    override fun doWork(): Result = when (val outcome = run()) {
        // Never raise an error for background failures; WorkManager retries with backoff.
        SyncOutcome.Failed -> Result.retry()
        // Nothing can be fetched until the user signs in again, which schedules the work anew.
        SyncOutcome.SessionExpired -> {
            SyncScheduler.cancel(applicationContext)
            Result.success()
        }
        is SyncOutcome.Skipped, is SyncOutcome.Updated -> Result.success()
    }
}

object SyncScheduler {
    private const val WORK_NAME = "prehled-sync"

    /** 15 minutes is the shortest period Android allows. */
    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 5, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /**
     * One download right away, for after an app update: a new version can keep more of the school's
     * data than the old one, and the next periodic run may be a quarter of an hour away.
     */
    fun syncSoon(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("prehled-sync-soon", androidx.work.ExistingWorkPolicy.REPLACE, request)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }
}
