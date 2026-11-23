package cz.prehled.app.notify

import cz.prehled.app.data.StateStore
import cz.prehled.app.sync.SyncOutcome
import java.time.LocalDateTime

/** Decides what a finished background sync tells the user. Failures stay silent. */
object NotificationDelivery {
    fun deliver(outcome: SyncOutcome, state: StateStore, now: LocalDateTime, post: (NotificationSpec) -> Unit) {
        when (outcome) {
            is SyncOutcome.Updated -> NotificationPlanner.plan(outcome.newItems, state.prefs(), now).forEach(post)
            // One notice per expired session; signing in again re-arms it.
            SyncOutcome.SessionExpired -> if (state.claimExpiredNotice()) post(NotificationPlanner.sessionExpired(state.prefs(), now))
            is SyncOutcome.Skipped, SyncOutcome.Failed -> Unit
        }
    }
}
