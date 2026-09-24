package com.sohailmalikarchitects.cashbook;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Capacitor shell loading the production site (see capacitor.config.ts).
 * Adds the native adapters the WebView lacks: blob: downloads, file sharing
 * and a fullscreen viewer for blob: documents.
 */
public class MainActivity extends BridgeActivity {
    private String pendingName;
    private String pendingMode;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new CashbookNative(this), "CashbookAndroid");
        getBridge().setWebViewClient(new CashbookWebViewClient(getBridge()));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 9001 && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            saveDownload(pendingName, getBlobBase64());
        }
    }

    /** Fetches a blob: URL from the page as base64, then saves or views it. */
    public void resolveBlob(String blobUrl, String name, String mode) {
        pendingName = name;
        pendingMode = mode;
        // Blob -> base64 returned from the page to the evaluateJavascript callback.
        String js = "(async()=>" +
            "{const b=await (await fetch(" + quote(blobUrl) + ")).blob();" +
            "return await new Promise((res,rej)=>{const r=new FileReader();" +
            "r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(b);});})()";
        getBridge().getWebView().evaluateJavascript(js, value -> {
            blobBase64 = unquote(value);
            if ("view".equals(pendingMode)) viewFile(pendingName, blobBase64);
            else saveDownload(pendingName, blobBase64);
        });
    }

    private String blobBase64;

    private String getBlobBase64() { return blobBase64; }

    /** Saves into the public Downloads folder and shows a toast-less no-op. */
    private void saveDownload(String name, String base64) {
        if (base64 == null || base64.isEmpty()) return;
        byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeFor(name));
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(data);
            } catch (Exception ignored) { }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 9001);
                return;
            }
            try {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File file = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(file)) { out.write(data); }
            } catch (Exception ignored) { }
        }
    }

    /** Opens the file fullscreen with an external viewer (PDF, image, audio). */
    private void viewFile(String name, String base64) {
        if (base64 == null || base64.isEmpty()) return;
        try {
            File file = new File(getCacheDir(), name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, mimeFor(name))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(intent, "Open " + name));
        } catch (Exception ignored) { }
    }

    public void shareFile(String name, String base64, String mime) {
        if (base64 == null || base64.isEmpty()) return;
        try {
            File file = new File(getCacheDir(), name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_SEND)
                .setType(mime == null || mime.isEmpty() ? mimeFor(name) : mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, name)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, "Share " + name));
        } catch (Exception ignored) { }
    }

    public void shareText(String title, String text) {
        Intent intent = new Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, title)
            .putExtra(Intent.EXTRA_TEXT, text);
        startActivity(Intent.createChooser(intent, title == null || title.isEmpty() ? "Share" : title));
    }

    private static String mimeFor(String name) {
        String n = name == null ? "" : name.toLowerCase();
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".webm")) return "audio/webm";
        if (n.endsWith(".mp3")) return "audio/mpeg";
        if (n.endsWith(".mp4")) return "video/mp4";
        if (n.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String unquote(String json) {
        String v = json == null ? "" : json.trim();
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) {
            v = v.substring(1, v.length() - 1);
        }
        return v.replace("\\\"", "\"").replace("\\\\", "\\").replace("\\n", "");
    }
}
