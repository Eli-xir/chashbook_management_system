package com.sohailmalikarchitects.cashbook;

import android.graphics.Bitmap;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Injects the WebView workarounds into the hosted page at page-start and
 * routes blob: navigations (print/ledger preview) to the native viewer.
 */
public class CashbookWebViewClient extends BridgeWebViewClient {
    private final Bridge bridge;

    public CashbookWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        view.evaluateJavascript(POLYFILL, null);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (url.startsWith("blob:")) {
            view.evaluateJavascript(
                "window.CashbookAndroid.handleBlob(" + jsonString(url) + ", 'ledger.pdf', 'view');", null);
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    private static String jsonString(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    /**
     * Runs before the page renders. Intercepts anchor downloads of blob: URLs,
     * blob: window.open calls, and polyfills navigator.share for file sharing.
     */
    private static final String POLYFILL =
        "(function(){" +
        "if(window.__cashbookPatched||!window.CashbookAndroid)return;window.__cashbookPatched=true;" +
        "var N=window.CashbookAndroid;" +
        "var click=HTMLAnchorElement.prototype.click;" +
        "HTMLAnchorElement.prototype.click=function(){" +
        "var href=this.getAttribute('href')||'';" +
        "if(href.indexOf('blob:')===0&&this.hasAttribute('download')){" +
        "N.handleBlob(href,this.getAttribute('download')||'download','download');return;}" +
        "return click.call(this);};" +
        "var open=window.open.bind(window);" +
        "window.open=function(u,n,f){" +
        "if(typeof u==='string'&&u.indexOf('blob:')===0){N.handleBlob(u,'ledger.pdf','view');return null;}" +
        "return open(u,n,f);};" +
        "if(!navigator.share){" +
        "navigator.share=function(data){" +
        "var files=(data&&data.files)||[];" +
        "if(!files.length){N.shareText((data&&data.title)||'',(data&&data.text)||'');return Promise.resolve();}" +
        "var file=files[0];" +
        "return new Promise(function(res,rej){" +
        "var r=new FileReader();r.onload=function(){" +
        "try{res(N.shareFile(file.name||'report',String(r.result).split(',')[1],file.type||'application/octet-stream'));}catch(e){rej(e);}}" +
        ";r.onerror=function(){rej(r.error);};r.readAsDataURL(file);});};" +
        "navigator.canShare=function(d){return !!d&&(!d.files||d.files.length>0);};}" +
        "})();";
}
