package cz.prehled.app.sync

import cz.prehled.app.data.FileSeenStore
import cz.prehled.app.data.FileSnapshotStore
import cz.prehled.app.data.FileStateStore
import cz.prehled.app.data.Prefs
import cz.prehled.app.data.SeenCategory
import cz.prehled.app.data.SessionState
import cz.prehled.app.domain.Fixtures
import cz.prehled.app.domain.TestMark
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDateTime

internal class FakeApi(var responses: MutableMap<String, ApiResult> = mutableMapOf()) : ApiSource {
    val calls = mutableListOf<String>()
    override fun get(path: String): ApiResult { calls += path; return respond(path) }
    override fun komens(path: String): ApiResult { calls += path; return respond(path) }
    private fun respond(path: String): ApiResult =
        responses[path] ?: responses[path.substringBefore('?')] ?: ApiResult.Failure
}

class SyncEngineTest {
    @get:Rule val tmp = TemporaryFolder()

    private lateinit var api: FakeApi
    private lateinit var snapshots: FileSnapshotStore
    private lateinit var seen: FileSeenStore
    private lateinit var state: FileStateStore
    private var now = LocalDateTime.parse("2026-10-06T12:30:00")

    private fun engine() = SyncEngine(api, snapshots, seen, state, { now })

    private fun ok(raw: String) = ApiResult.Ok(Fixtures.obj("raw/$raw"))

    private fun healthy(): MutableMap<String, ApiResult> = mutableMapOf(
        "/api/3/timetable/actual" to ok("timetable-actual.json"),
        "/api/3/timetable/permanent" to ok("timetable-permanent.json"),
        "/api/3/marks" to ok("marks.json"),
        "/api/3/homeworks" to ok("homeworks.json"),
        "/api/3/events" to ok("events.json"),
        "/api/3/komens/messages/received" to ok("komens-received.json"),
        "/api/3/komens/messages/noticeboard" to ok("komens-noticeboard.json"),
    )

    @Before
    fun setUp() {
        api = FakeApi(healthy())
        snapshots = FileSnapshotStore(tmp.newFile("snapshot.json").also { it.delete() })
        seen = FileSeenStore(tmp.newFile("seen.json").also { it.delete() })
        state = FileStateStore(tmp.newFile("state.json").also { it.delete() })
    }

    @Test
    fun writesSnapshotAndSeedsSilentlyOnFirstSync() {
        val outcome = engine().sync() as SyncOutcome.Updated
        assertTrue("first sync must not notify", outcome.newItems.isEmpty())
        assertFalse(outcome.partial)

        val snap = snapshots.load()!!
        assertEquals(5, snap.timetableActual!!.days.size)
        assertEquals(3, snap.marks.size)
        assertEquals("MK3", snap.marks.first().id)
        assertEquals(listOf("H1"), snap.homework.map { it.id })
        assertEquals(2, snap.unreadMessages)
        assertEquals(3, snap.messages.size)
        assertEquals(2, snap.events.size)
        assertTrue(snap.timetablePermanent!!.days.isNotEmpty())
        assertTrue(api.calls.any { it.startsWith("/api/3/timetable/actual?date=2026-10-12") })
        assertTrue("/api/3/homeworks?from=2025-10-06&to=2027-01-04" in api.calls)
    }

    @Test
    fun expandingHomeworkRangeSeedsSilentlyAndOnlyNotifiesNewOpenAssignments() {
        val oldSeen = tmp.newFile("old-seen.json").also { it.writeText("""{"homework":["known"]}""") }
        seen = FileSeenStore(oldSeen)
        val homework = JSONObject("""{"Homeworks":[
            {"ID":"long-running","DateStart":"2026-08-01","DateEnd":"2026-10-09"},
            {"ID":"overdue","DateStart":"2026-09-01","DateEnd":"2026-10-05"}
        ]}""")
        api.responses["/api/3/homeworks"] = ApiResult.Ok(homework)

        assertTrue((engine().sync() as SyncOutcome.Updated).newItems.homework.isEmpty())
        assertEquals(listOf("long-running"), snapshots.load()!!.homework.map { it.id })

        homework.getJSONArray("Homeworks")
            .put(JSONObject("""{"ID":"closed","DateEnd":"2026-10-09","Closed":true}"""))
            .put(JSONObject("""{"ID":"new","DateEnd":"2026-10-06"}"""))
        val outcome = engine().sync() as SyncOutcome.Updated
        assertEquals(listOf("new"), outcome.newItems.homework.map { it.id })
        assertEquals(listOf("new", "long-running"), snapshots.load()!!.homework.map { it.id })
    }

    @Test
    fun secondSyncReportsOnlyNewItems() {
        engine().sync()

        val marks = JSONObject(Fixtures.json("raw/marks.json"))
        marks.getJSONArray("Subjects").getJSONObject(0).getJSONArray("Marks").put(
            JSONObject("""{"Id":"MK9","MarkDate":"2026-10-06T00:00:00+02:00","Caption":"Test","MarkText":"1","Weight":5,"IsNew":true}""")
        )
        val received = JSONObject(Fixtures.json("raw/komens-received.json"))
        received.getJSONArray("Messages").put(
            JSONObject("""{"Id":"K9","Title":"Nová zpráva","SentDate":"2026-10-06T11:00:00+02:00","Sender":{"Id":"UA","Name":"Mgr. Jana Nováková"},"Unread":true}""")
        )
        api.responses["/api/3/marks"] = ApiResult.Ok(marks)
        api.responses["/api/3/komens/messages/received"] = ApiResult.Ok(received)

        val outcome = engine().sync() as SyncOutcome.Updated
        assertEquals(listOf("MK9"), outcome.newItems.marks.map { it.id })
        assertEquals(listOf("K9"), outcome.newItems.messages.map { it.id })
        assertTrue(outcome.newItems.homework.isEmpty())

        // And not again on the next run.
        assertTrue((engine().sync() as SyncOutcome.Updated).newItems.isEmpty())
    }

    @Test
    fun readMessagesAreNeverReportedAsNew() {
        engine().sync()
        val received = JSONObject(Fixtures.json("raw/komens-received.json"))
        received.getJSONArray("Messages").put(JSONObject("""{"Id":"K8","Title":"Už přečtená","SentDate":"2026-10-06T11:00:00+02:00","Unread":false}"""))
        api.responses["/api/3/komens/messages/received"] = ApiResult.Ok(received)
        assertTrue((engine().sync() as SyncOutcome.Updated).newItems.messages.isEmpty())
    }

    @Test
    fun reportsNewTimetableChangesOnTheShownDay() {
        // Tuesday 07:00: today is shown, with a cancellation, a room change and a substitution.
        now = LocalDateTime.parse("2026-10-06T07:00:00")
        val timetable = JSONObject(Fixtures.json("raw/timetable-actual.json"))
        val atoms = timetable.getJSONArray("Days").getJSONObject(1).getJSONArray("Atoms")
        val removed = (0 until atoms.length()).filter { atoms.getJSONObject(it).has("Change") && !atoms.getJSONObject(it).isNull("Change") }
        assertEquals(3, removed.size)
        val withoutChanges = JSONObject(timetable.toString())
        val plain = withoutChanges.getJSONArray("Days").getJSONObject(1).getJSONArray("Atoms")
        for (i in removed) plain.getJSONObject(i).put("Change", JSONObject.NULL)
        api.responses["/api/3/timetable/actual"] = ApiResult.Ok(withoutChanges)
        engine().sync()

        api.responses["/api/3/timetable/actual"] = ApiResult.Ok(timetable)
        val outcome = engine().sync() as SyncOutcome.Updated
        assertEquals(setOf("Canceled", "RoomChanged", "Substitution"), outcome.newItems.timetableChanges.map { it.lesson.change!!.type }.toSet())
        assertTrue((engine().sync() as SyncOutcome.Updated).newItems.timetableChanges.isEmpty())
    }

    @Test
    fun failedSectionKeepsPreviousDataAndFlagsPartial() {
        engine().sync()
        api.responses["/api/3/marks"] = ApiResult.Failure
        val outcome = engine().sync() as SyncOutcome.Updated
        assertTrue(outcome.partial)
        assertEquals(3, snapshots.load()!!.marks.size)
    }

    @Test
    fun allFailuresReportFailedAndKeepSnapshot() {
        engine().sync()
        val before = snapshots.load()!!.generatedAt
        now = now.plusMinutes(30)
        api.responses.clear()
        assertEquals(SyncOutcome.Failed, engine().sync())
        assertEquals(before, snapshots.load()!!.generatedAt)
    }

    @Test
    fun sessionExpiryIsRecordedAndNoticeClaimedOnce() {
        api.responses["/api/3/timetable/actual"] = ApiResult.SessionExpired
        assertEquals(SyncOutcome.SessionExpired, engine().sync())
        assertEquals(SessionState.EXPIRED, state.sessionState())
        assertTrue(state.claimExpiredNotice())
        assertFalse(state.claimExpiredNotice())

        // Signing in again resets it.
        api.responses = healthy()
        engine().sync()
        assertEquals(SessionState.OK, state.sessionState())
        api.responses["/api/3/timetable/actual"] = ApiResult.SessionExpired
        engine().sync()
        assertTrue(state.claimExpiredNotice())
    }

    @Test
    fun nightWindowSkipsUnlessForced() {
        now = LocalDateTime.parse("2026-10-06T23:10:00")
        assertTrue(engine().sync() is SyncOutcome.Skipped)
        assertNull(snapshots.load())
        assertTrue(engine().sync(force = true) is SyncOutcome.Updated)
        assertNotNull(snapshots.load())

        assertTrue(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T05:29:00")))
        assertFalse(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T05:30:00")))
        assertFalse(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T21:59:00")))
        assertTrue(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T22:00:00")))
    }

    @Test
    fun nightRestFollowsPreferences() {
        val custom = Prefs(nightStartMinutes = 23 * 60, nightEndMinutes = 6 * 60)
        assertFalse(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T22:30:00"), custom))
        assertTrue(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T23:00:00"), custom))
        assertTrue(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T05:59:00"), custom))
        assertFalse(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T06:00:00"), custom))
        val sameDay = Prefs(nightStartMinutes = 13 * 60, nightEndMinutes = 15 * 60)
        assertTrue(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T14:00:00"), sameDay))
        assertFalse(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T15:00:00"), sameDay))
        assertFalse(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T23:30:00"), Prefs(nightRestEnabled = false)))
        assertFalse(SyncEngine.isNightWindow(LocalDateTime.parse("2026-10-06T03:00:00"), Prefs(nightStartMinutes = 600, nightEndMinutes = 600)))
    }

    @Test
    fun disabledNightRestSyncsAtNight() {
        state.setPrefs(JSONObject("""{"nightRestEnabled":false}"""))
        now = LocalDateTime.parse("2026-10-06T23:10:00")
        assertTrue(engine().sync() is SyncOutcome.Updated)
    }

    @Test
    fun demoModeNeverSyncs() {
        state.setPrefs(JSONObject("""{"demo":true}"""))
        assertEquals(SyncOutcome.Skipped("demo"), engine().sync(force = true))
        assertTrue(api.calls.isEmpty())
    }

    @Test
    fun localHomeworkIsMergedAndTickedHomeworkDropped() {
        state.setLocalData(JSONObject("""{"homeworkDone":{"H1":true},"customHomework":[{"id":"custom-1","subjectAbbrev":"Vlastní","content":"Referát","deadline":"2026-10-08","done":false}]}"""))
        engine().sync()
        assertEquals(listOf("custom-1"), snapshots.load()!!.homework.map { it.id })
    }

    @Test
    fun testMarksAreReadFromLocalDataAndBadEntriesDropped() {
        state.setLocalData(JSONObject("""{"testMarks":[{"date":"2026-10-06T00:00:00","hourId":2,"description":"Písemka"},{"date":"","hourId":1},{"date":"2026-10-07"}]}"""))
        assertEquals(listOf(TestMark("2026-10-06", 2, "Písemka")), state.localData().testMarks)
    }

    @Test
    fun seenStoreCapsAndSeedsPerCategory() {
        val store = FileSeenStore(tmp.newFile("cap.json").also { it.delete() }, cap = 3)
        assertFalse(store.isSeeded(SeenCategory.MARKS))
        assertTrue(store.recordAndDiff(SeenCategory.MARKS, listOf("a", "b")).isEmpty())
        assertTrue(store.isSeeded(SeenCategory.MARKS))
        assertEquals(listOf("c", "d"), store.recordAndDiff(SeenCategory.MARKS, listOf("a", "c", "d")))
        // "a" was pushed out by the cap, so it counts as new again.
        assertEquals(listOf("a"), store.recordAndDiff(SeenCategory.MARKS, listOf("a")))
        // Another category is seeded independently.
        assertTrue(store.recordAndDiff(SeenCategory.HOMEWORK, listOf("x")).isEmpty())
    }

    @Test
    fun snapshotRoundTripsAndRejectsOtherSchemas() {
        engine().sync()
        val original = snapshots.load()!!
        val file = tmp.root.resolve("copy.json")
        FileSnapshotStore(file).save(original)
        assertEquals(original, FileSnapshotStore(file).load())

        file.writeText(JSONObject(file.readText()).put("schemaVersion", 99).toString())
        assertNull(FileSnapshotStore(file).load())
        file.writeText("not json")
        assertNull(FileSnapshotStore(file).load())
    }

    @Test
    fun staleDetection() {
        engine().sync()
        val snap = snapshots.load()!!
        assertFalse(snap.isStale(snap.generatedAt + 60_000))
        assertTrue(snap.isStale(snap.generatedAt + 4 * 60 * 60 * 1000L))
    }
}
