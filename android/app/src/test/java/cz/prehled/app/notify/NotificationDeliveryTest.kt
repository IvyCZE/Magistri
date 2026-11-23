package cz.prehled.app.notify

import cz.prehled.app.data.FileStateStore
import cz.prehled.app.data.SessionState
import cz.prehled.app.domain.Mark
import cz.prehled.app.sync.NewItems
import cz.prehled.app.sync.SyncOutcome
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDateTime

class NotificationDeliveryTest {
    @get:Rule val tmp = TemporaryFolder()
    private val now = LocalDateTime.parse("2026-10-06T12:00:00")
    private val state by lazy { FileStateStore(tmp.newFile("state.json").also { it.delete() }) }
    private val posted = mutableListOf<NotificationSpec>()

    private fun deliver(outcome: SyncOutcome) = NotificationDelivery.deliver(outcome, state, now) { posted += it }

    private val oneMark = NewItems(marks = listOf(Mark("m1", "M", "Matematika", "1", 3, "", "2026-10-06", true)))

    @Test
    fun updatedSyncPostsPlannedNotifications() {
        deliver(SyncOutcome.Updated(oneMark, partial = false))
        assertEquals(1, posted.size)
    }

    @Test
    fun usesPreferencesPushedFromTheApp() {
        state.setPrefs(JSONObject().put("notifyMarks", false))
        deliver(SyncOutcome.Updated(oneMark, partial = false))
        assertTrue(posted.isEmpty())
    }

    @Test
    fun failuresAndSkipsStaySilent() {
        deliver(SyncOutcome.Failed)
        deliver(SyncOutcome.Skipped("night"))
        assertTrue(posted.isEmpty())
    }

    @Test
    fun expiredSessionIsAnnouncedOnlyOnce() {
        state.setSessionState(SessionState.EXPIRED)
        deliver(SyncOutcome.SessionExpired)
        deliver(SyncOutcome.SessionExpired)
        assertEquals(listOf(NotifyCategory.ACCOUNT), posted.map { it.category })
    }

    @Test
    fun signingInAgainRearmsTheExpiredNotice() {
        state.setSessionState(SessionState.EXPIRED)
        deliver(SyncOutcome.SessionExpired)
        state.setSessionState(SessionState.OK)
        state.setSessionState(SessionState.EXPIRED)
        deliver(SyncOutcome.SessionExpired)
        assertEquals(2, posted.size)
    }
}
