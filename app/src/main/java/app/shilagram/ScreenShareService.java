package app.shilagram;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/**
 * Captures the screen (MediaProjection) at half resolution and hands JPEG frames to the WebView,
 * which turns them into a video track for the call. Android WebView has no getDisplayMedia().
 */
public class ScreenShareService extends Service {
    public interface Sink { void onFrame(String base64); void onStopped(); }
    static volatile Sink sink;

    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private long last;
    private boolean stopped;

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        if (i != null && "stop".equals(i.getAction())) { shutdown(false); stopSelf(); return START_NOT_STICKY; }
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("share", "Screen sharing", NotificationManager.IMPORTANCE_LOW));
        Notification n = new Notification.Builder(this, "share").setSmallIcon(R.drawable.ic_fg)
            .setContentTitle("Shilagram").setContentText("مشاركة الشاشة | Sharing screen").setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(2, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(2, n);
        if (i == null) { stopSelf(); return START_NOT_STICKY; }
        final int rc = i.getIntExtra("rc", 0);
        final Intent data = i.getParcelableExtra("data");
        try {
            MediaProjectionManager m = getSystemService(MediaProjectionManager.class);
            projection = m.getMediaProjection(rc, data);
            thread = new HandlerThread("shila-share"); thread.start();
            final Handler h = new Handler(thread.getLooper());
            projection.registerCallback(new MediaProjection.Callback() {
                @Override public void onStop() { shutdown(true); stopSelf(); }
            }, h);
            DisplayMetrics dm = getResources().getDisplayMetrics();
            final int w = Math.max(2, dm.widthPixels / 2), hh = Math.max(2, dm.heightPixels / 2);
            reader = ImageReader.newInstance(w, hh, PixelFormat.RGBA_8888, 2);
            display = projection.createVirtualDisplay("shila-share", w, hh, dm.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, h);
            reader.setOnImageAvailableListener(r -> {
                Image im = null;
                try {
                    im = r.acquireLatestImage();
                    if (im == null) return;
                    long now = SystemClock.uptimeMillis();
                    if (now - last < 170) return; // ~6 fps keeps the data channel light
                    last = now;
                    Image.Plane p = im.getPlanes()[0];
                    ByteBuffer buf = p.getBuffer();
                    int pixel = p.getPixelStride(), pad = p.getRowStride() - pixel * w;
                    Bitmap full = Bitmap.createBitmap(w + pad / pixel, hh, Bitmap.Config.ARGB_8888);
                    full.copyPixelsFromBuffer(buf);
                    Bitmap bmp = Bitmap.createBitmap(full, 0, 0, w, hh);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    bmp.compress(Bitmap.CompressFormat.JPEG, 45, out);
                    Sink s = sink;
                    if (s != null) s.onFrame(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                } catch (Exception e) { /* skip this frame */ }
                finally { if (im != null) im.close(); }
            }, h);
        } catch (Exception e) {
            shutdown(true); stopSelf();
        }
        return START_NOT_STICKY;
    }

    private synchronized void shutdown(boolean notify) {
        if (stopped) return; stopped = true;
        try { if (display != null) display.release(); } catch (Exception e) { }
        try { if (reader != null) reader.close(); } catch (Exception e) { }
        try { if (projection != null) projection.stop(); } catch (Exception e) { }
        try { if (thread != null) thread.quitSafely(); } catch (Exception e) { }
        Sink s = sink; if (notify && s != null) s.onStopped();
    }

    @Override public void onDestroy() { shutdown(false); super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
