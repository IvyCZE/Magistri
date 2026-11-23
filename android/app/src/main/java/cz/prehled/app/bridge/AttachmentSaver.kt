package cz.prehled.app.bridge

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import java.io.File
import java.io.OutputStream

/**
 * Where a downloaded attachment goes. Android 10+ files go to the public Downloads folder through
 * MediaStore (no storage permission needed). Older versions would need a storage permission for
 * that, so the file stays in the app cache and is shared through the FileProvider.
 */
class AttachmentSaver(private val context: Context) {
    class Pending(
        val uri: Uri,
        val stream: OutputStream,
        /** True when the file is in the user's Downloads folder. */
        val publicDownload: Boolean,
        val file: File?,
    )

    fun create(fileName: String, mimeType: String?): Pending =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) createInDownloads(fileName, mimeType) else createInCache(fileName)

    /** Makes the file visible to other apps and returns the URI to open it with. */
    fun finish(pending: Pending): Uri {
        if (pending.publicDownload) {
            val values = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
            context.contentResolver.update(pending.uri, values, null, null)
        }
        return pending.uri
    }

    fun discard(pending: Pending) {
        runCatching { pending.stream.close() }
        if (pending.publicDownload) {
            runCatching { context.contentResolver.delete(pending.uri, null, null) }
        } else {
            pending.file?.delete()
        }
    }

    /** Removes cached copies, used on logout. */
    fun clearCache() {
        File(context.cacheDir, CACHE_DIR).deleteRecursively()
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun createInDownloads(fileName: String, mimeType: String?): Pending {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType ?: "application/octet-stream")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: error("Cannot create download")
        val stream = resolver.openOutputStream(uri) ?: error("Cannot open download")
        return Pending(uri, stream, publicDownload = true, file = null)
    }

    private fun createInCache(fileName: String): Pending {
        val dir = File(context.cacheDir, CACHE_DIR).apply { mkdirs() }
        var file = File(dir, fileName)
        if (file.exists()) file = File(dir, "${System.currentTimeMillis()}-$fileName")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return Pending(uri, file.outputStream(), publicDownload = false, file = file)
    }

    private companion object {
        const val CACHE_DIR = "attachments"
    }
}
