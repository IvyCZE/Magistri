package cz.prehled.app.widget

import cz.prehled.app.data.FileSeenStore
import cz.prehled.app.data.FileSnapshotStore
import cz.prehled.app.data.FileStateStore
import cz.prehled.app.data.Prefs
import cz.prehled.app.data.Snapshot
import cz.prehled.app.domain.Fixtures
import cz.prehled.app.domain.TestMark
import cz.prehled.app.sync.ApiResult
import cz.prehled.app.sync.FakeApi
import cz.prehled.app.sync.SyncEngine
import java.io.File
import java.time.LocalDateTime
import java.time.ZoneId

/** A real snapshot produced by the sync engine from the shared raw fixtures. */
object WidgetTestSupport {
    private fun ok(raw: String) = ApiResult.Ok(Fixtures.obj("raw/$raw"))

    fun snapshot(dir: File, syncAt: LocalDateTime = LocalDateTime.parse("2026-10-06T07:00:00")): Snapshot {
        val api = FakeApi(
            mutableMapOf(
                "/api/3/timetable/actual" to ok("timetable-actual.json"),
                "/api/3/timetable/permanent" to ok("timetable-permanent.json"),
                "/api/3/marks" to ok("marks.json"),
                "/api/3/homeworks" to ok("homeworks.json"),
                "/api/3/events" to ok("events.json"),
                "/api/3/komens/messages/received" to ok("komens-received.json"),
                "/api/3/komens/messages/noticeboard" to ok("komens-noticeboard.json"),
            ),
        )
        val snapshots = FileSnapshotStore(File(dir, "snapshot.json"))
        SyncEngine(api, snapshots, FileSeenStore(File(dir, "seen.json")), FileStateStore(File(dir, "state.json")), { syncAt }).sync(force = true)
        return snapshots.load()!!
    }

    fun input(
        snapshot: Snapshot?,
        now: String,
        prefs: Prefs = Prefs(),
        signedIn: Boolean = true,
        sessionExpired: Boolean = false,
        testMarks: List<TestMark> = emptyList(),
    ): WidgetInputs {
        val at = LocalDateTime.parse(now)
        return WidgetInputs(snapshot, prefs, signedIn, sessionExpired, at, at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(), testMarks)
    }

    fun ms(local: String): Long = LocalDateTime.parse(local).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
}
