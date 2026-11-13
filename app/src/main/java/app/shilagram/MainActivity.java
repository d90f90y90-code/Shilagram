package app.shilagram;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.EditText;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final int RQ_FILE = 1, RQ_SAVE = 2, RQ_PERM = 3, RQ_NOTIF = 4, RQ_SCREEN = 5, RQ_STORAGE = 6;
    WebView web;
    ValueCallback<Uri[]> fcb;
    PermissionRequest pendingPerm;
    byte[] pendData;
    int notifId = 100;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#142139"));
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/shfill/"))
                    return ShFill.serve(MainActivity.this, u, r.getRequestHeaders());
                return loader.shouldInterceptRequest(u);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !HOST.equals(r.getUrl().getHost()); // never navigate away from the app
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsPrompt(WebView v, String url, String msg, String def, final JsPromptResult res) {
                final EditText et = new EditText(MainActivity.this);
                et.setText(def);
                new AlertDialog.Builder(MainActivity.this).setMessage(msg).setView(et)
                    .setPositiveButton(android.R.string.ok, (d, i) -> res.confirm(et.getText().toString()))
                    .setNegativeButton(android.R.string.cancel, (d, i) -> res.cancel())
                    .setOnCancelListener(d -> res.cancel()).show();
                return true;
            }
            @Override public boolean onJsConfirm(WebView v, String url, String msg, final JsResult res) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                    .setPositiveButton(android.R.string.ok, (d, i) -> res.confirm())
                    .setNegativeButton(android.R.string.cancel, (d, i) -> res.cancel())
                    .setOnCancelListener(d -> res.cancel()).show();
                return true;
            }
            @Override public boolean onJsAlert(WebView v, String url, String msg, final JsResult res) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                    .setPositiveButton(android.R.string.ok, (d, i) -> res.confirm())
                    .setOnCancelListener(d -> res.confirm()).show();
                return true;
            }
            @Override public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fcb != null) fcb.onReceiveValue(null);
                fcb = cb;
                try { startActivityForResult(p.createIntent(), RQ_FILE); } catch (Exception e) { fcb = null; return false; }
                return true;
            }
            @Override public void onPermissionRequest(final PermissionRequest r) {
                runOnUiThread(() -> {
                    if (!HOST.equals(r.getOrigin().getHost())) { r.deny(); return; }
                    if (pendingPerm != null) pendingPerm.deny();
                    List<String> missing = new ArrayList<>();
                    for (String res : r.getResources()) {
                        String p = PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) ? Manifest.permission.RECORD_AUDIO
                                 : PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) ? Manifest.permission.CAMERA : null;
                        if (p != null && checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
                    }
                    if (missing.isEmpty()) r.grant(r.getResources());
                    else { pendingPerm = r; requestPermissions(missing.toArray(new String[0]), RQ_PERM); }
                });
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        NotificationChannel ch = new NotificationChannel("msgs", "Messages", NotificationManager.IMPORTANCE_HIGH);
        getSystemService(NotificationManager.class).createNotificationChannel(ch);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, RQ_NOTIF);
        try { startForegroundService(new Intent(this, KeepAliveService.class)); } catch (Exception e) { /* background start restrictions */ }
        web.loadUrl("https://" + HOST + "/assets/index.html");
    }

    class Bridge {
        @JavascriptInterface public void notify(String title, String text) {
            Intent in = new Intent(MainActivity.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 0, in, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            android.app.Notification n = new android.app.Notification.Builder(MainActivity.this, "msgs").setSmallIcon(R.drawable.ic_fg)
                .setContentTitle(title).setContentText(text).setContentIntent(pi).setAutoCancel(true).build();
            getSystemService(NotificationManager.class).notify(notifId++ % 1000 + 100, n);
        }
        @JavascriptInterface public void exportFile(final String name, final String mime, String b64) {
            pendData = Base64.decode(b64, Base64.DEFAULT);
            final String m = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(m).putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, RQ_SAVE); } catch (Exception e) { pendData = null; }
            });
        }
        @JavascriptInterface public void setStatusColor(final String hex) {
            runOnUiThread(() -> { try { getWindow().setStatusBarColor(Color.parseColor(hex)); } catch (Exception e) { } });
        }
        @JavascriptInterface public void copy(final String text) {
            runOnUiThread(() -> ((ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Shilagram", text)));
        }
        @JavascriptInterface public void setSecure(final boolean on) {
            runOnUiThread(() -> { if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE); });
        }
        @JavascriptInterface public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
        }
        // update check: only this project's own GitHub release page may be opened (the system browser downloads the APK)
        @JavascriptInterface public void openUrl(final String url) {
            if (url == null || !url.startsWith("https://github.com/d90f90y90-code/Shilagram/")) return;
            runOnUiThread(() -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* no browser */ } });
        }
        @JavascriptInterface public void notifSettings() {
            runOnUiThread(() -> { try { startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())); } catch (Exception e) { } });
        }
        @JavascriptInterface public void startScreenShare() {
            runOnUiThread(() -> {
                try { startActivityForResult(((MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE)).createScreenCaptureIntent(), RQ_SCREEN); }
                catch (Exception e) { jsStopped(); }
            });
        }
        @JavascriptInterface public void stopScreenShare() {
            runOnUiThread(() -> { try { startService(new Intent(MainActivity.this, ScreenShareService.class).setAction("stop")); } catch (Exception e) { } });
        }
        // ---- Sh-Fill: visible folder on the phone ----
        @JavascriptInterface public boolean shAccess() { return ShFill.access(MainActivity.this); }
        @JavascriptInterface public boolean shInit() { return ShFill.init(MainActivity.this); }
        @JavascriptInterface public String shRoot() { return ShFill.root().getAbsolutePath(); }
        @JavascriptInterface public String shWrite(String key, String name, String b64, boolean first) { return ShFill.write(MainActivity.this, key, name, b64, first); }
        @JavascriptInterface public boolean shDone(String key, String name) { return ShFill.done(MainActivity.this, key, name); }
        @JavascriptInterface public String shList(String key) { return ShFill.list(MainActivity.this, key); }
        @JavascriptInterface public boolean shDelete(String key, String name) { return ShFill.delete(MainActivity.this, key, name); }
        @JavascriptInterface public void shRequest() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= 30) {
                        try { startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getPackageName()))); }
                        catch (Exception e) { startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)); }
                    } else requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.READ_EXTERNAL_STORAGE}, RQ_STORAGE);
                } catch (Exception e) { /* no settings screen available */ }
            });
        }
        @JavascriptInterface public void batterySettings() {
            runOnUiThread(() -> { try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception e) { } });
        }
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("(function(){return window.__back?window.__back():0})()", v -> { if (!"1".equals(v)) finish(); });
    }

    void jsStopped() { web.post(() -> web.evaluateJavascript("window.__screenStopped&&window.__screenStopped()", null)); }

    @Override protected void onActivityResult(int rq, int rs, Intent d) {
        if (rq == RQ_SCREEN) {
            if (rs == RESULT_OK && d != null) {
                ScreenShareService.sink = new ScreenShareService.Sink() {
                    @Override public void onFrame(String b64) { web.post(() -> web.evaluateJavascript("window.__screenFrame&&window.__screenFrame('" + b64 + "')", null)); }
                    @Override public void onStopped() { jsStopped(); }
                };
                try { startForegroundService(new Intent(this, ScreenShareService.class).putExtra("rc", rs).putExtra("data", d)); } catch (Exception e) { jsStopped(); }
            } else jsStopped();
            return;
        }
        if (rq == RQ_FILE && fcb != null) { fcb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(rs, d)); fcb = null; }
        else if (rq == RQ_SAVE && pendData != null) {
            if (rs == RESULT_OK && d != null && d.getData() != null) {
                try (OutputStream o = getContentResolver().openOutputStream(d.getData())) { o.write(pendData); Toast.makeText(this, "✓", Toast.LENGTH_SHORT).show(); }
                catch (Exception e) { Toast.makeText(this, "✗", Toast.LENGTH_SHORT).show(); }
            }
            pendData = null;
        }
    }

    void jsShfPerm() { web.post(() -> web.evaluateJavascript("window.__shfPerm&&window.__shfPerm()", null)); }

    @Override protected void onResume() { super.onResume(); if (web != null) jsShfPerm(); }

    @Override public void onRequestPermissionsResult(int rq, String[] perms, int[] res) {
        if (rq == RQ_STORAGE) { jsShfPerm(); return; }
        if (rq == RQ_PERM && pendingPerm != null) {
            boolean ok = res.length > 0;
            for (int g : res) if (g != PackageManager.PERMISSION_GRANTED) ok = false;
            if (ok) pendingPerm.grant(pendingPerm.getResources()); else pendingPerm.deny();
            pendingPerm = null;
        }
    }

    @Override protected void onDestroy() {
        stopService(new Intent(this, KeepAliveService.class));
        web.destroy();
        super.onDestroy();
    }
}
