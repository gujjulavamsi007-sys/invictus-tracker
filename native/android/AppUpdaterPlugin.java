package com.invictus.tracker;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String DOWNLOAD_URL =
        "https://github.com/gujjulavamsi007-sys/invictus-tracker/releases/latest/download/trip-petrol-expense-tracker.apk";
    private static final String PREFERENCES_NAME = "invictus_app_updates";
    private static final String LAST_DOWNLOAD_ID = "last_download_id";
    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url");
        if (!DOWNLOAD_URL.equals(url)) {
            call.reject("The update link is not the official app download.");
            return;
        }

        try {
            DownloadManager manager = getDownloadManager();
            SharedPreferences preferences = getContext().getSharedPreferences(
                PREFERENCES_NAME,
                Context.MODE_PRIVATE
            );
            long previousId = preferences.getLong(LAST_DOWNLOAD_ID, -1L);
            if (previousId > 0) manager.remove(previousId);

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Trip & Petrol Expense Tracker update");
            request.setDescription("Downloading the latest app version");
            request.setMimeType(APK_MIME_TYPE);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(
                getContext(),
                Environment.DIRECTORY_DOWNLOADS,
                "trip-petrol-expense-tracker-update-" + System.currentTimeMillis() + ".apk"
            );

            long downloadId = manager.enqueue(request);
            preferences.edit().putLong(LAST_DOWNLOAD_ID, downloadId).apply();

            JSObject result = new JSObject();
            result.put("downloadId", downloadId);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not start the update download. Check your connection and try again.", error);
        }
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        long downloadId = call.getData().optLong("downloadId", -1L);
        if (downloadId < 1) {
            call.reject("The update download could not be found.");
            return;
        }

        Cursor cursor = null;
        try {
            cursor = getDownloadManager().query(new DownloadManager.Query().setFilterById(downloadId));
            JSObject result = new JSObject();
            if (cursor == null || !cursor.moveToFirst()) {
                result.put("status", "missing");
                result.put("progress", 0);
                call.resolve(result);
                return;
            }

            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            int progress = total > 0 ? (int) Math.min(100, (downloaded * 100L) / total) : 0;

            result.put("status", getStatusName(status));
            result.put("progress", progress);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read the update download status.", error);
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        long downloadId = call.getData().optLong("downloadId", -1L);
        if (downloadId < 1) {
            call.reject("Download the update before installing it.");
            return;
        }

        try {
            DownloadManager manager = getDownloadManager();
            Uri apkUri = manager.getUriForDownloadedFile(downloadId);
            if (apkUri == null) {
                call.reject("The update has not finished downloading yet.");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent permissionIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                permissionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(permissionIntent);

                JSObject result = new JSObject();
                result.put("permissionRequired", true);
                call.resolve(result);
                return;
            }

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, APK_MIME_TYPE);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(installIntent);

            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Android could not open the app installer.", error);
        }
    }

    private DownloadManager getDownloadManager() {
        Object service = getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (!(service instanceof DownloadManager)) {
            throw new IllegalStateException("Android download service is unavailable.");
        }
        return (DownloadManager) service;
    }

    private String getStatusName(int status) {
        if (status == DownloadManager.STATUS_PENDING) return "pending";
        if (status == DownloadManager.STATUS_RUNNING) return "running";
        if (status == DownloadManager.STATUS_PAUSED) return "paused";
        if (status == DownloadManager.STATUS_SUCCESSFUL) return "completed";
        if (status == DownloadManager.STATUS_FAILED) return "failed";
        return "missing";
    }
}
