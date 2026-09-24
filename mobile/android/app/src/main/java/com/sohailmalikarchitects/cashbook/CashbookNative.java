package com.sohailmalikarchitects.cashbook;

import android.webkit.JavascriptInterface;

/**
 * Native adapter exposed to the page as window.CashbookAndroid.
 *
 * Android WebView lacks Web Share and cannot download blob: URLs, which the
 * frontend uses for every PDF/Excel/CSV export. The injected polyfill in
 * CashbookWebViewClient routes those through here.
 */
public class CashbookNative {
    private final MainActivity activity;

    public CashbookNative(MainActivity activity) {
        this.activity = activity;
    }

    /** mode: "download" saves to Downloads; "view" opens a fullscreen viewer. */
    @JavascriptInterface
    public void handleBlob(String blobUrl, String name, String mode) {
        activity.runOnUiThread(() -> activity.resolveBlob(blobUrl, name, mode));
    }

    @JavascriptInterface
    public void shareFile(String name, String base64, String mime) {
        activity.runOnUiThread(() -> activity.shareFile(name, base64, mime));
    }

    @JavascriptInterface
    public void shareText(String title, String text) {
        activity.runOnUiThread(() -> activity.shareText(title, text));
    }
}
