package app.shilagram;

import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Sh-Fill: a visible folder on the phone (<storage>/Sh-Fill/{صور,فيديو,صوتيات,تسجيلات الشاشة}) plus a Range-capable file server for the WebView. */
final class ShFill {
    static final String ROOT = "Sh-Fill";
    // key used by the web code -> folder name on the phone
    private static final String[][] CATS = {{"img", "صور"}, {"vid", "فيديو"}, {"aud", "صوتيات"}, {"scr", "تسجيلات الشاشة"}};

    private ShFill() { }

    static boolean access(Context c) {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return c.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    static File root() { return new File(Environment.getExternalStorageDirectory(), ROOT); }

    private static File dir(String key) {
        for (String[] c : CATS) if (c[0].equals(key)) return new File(root(), c[1]);
        return null;
    }

    static boolean init(Context c) {
        if (!access(c)) return false;
        boolean ok = true;
        for (String[] k : CATS) { File d = new File(root(), k[1]); if (!d.isDirectory() && !d.mkdirs()) ok = false; }
        return ok;
    }

    /** Makes a name safe to use as a single path segment. */
    static String clean(String n) {
        if (n == null) n = "";
        n = n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        while (n.startsWith(".")) n = n.substring(1);
        if (n.isEmpty()) n = "file";
        if (n.length() > 100) {
            int dot = n.lastIndexOf('.');
            String ext = dot > 0 && n.length() - dot <= 8 ? n.substring(dot) : "";
            n = n.substring(0, 100 - ext.length()) + ext;
        }
        return n;
    }

    /** An existing file inside the category folder, or null. Rejects traversal. */
    private static File safe(String key, String name) {
        try {
            File d = dir(key);
            if (d == null || name == null || name.isEmpty() || name.startsWith(".") || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0) return null;
            File f = new File(d, name);
            if (!f.getCanonicalFile().getParentFile().equals(d.getCanonicalFile())) return null;
            return f;
        } catch (Exception e) { return null; }
    }

    /** First chunk starts "<.name>.part" (returns "exists" if the final file is already there); later chunks append. Returns the clean name or "". */
    static String write(Context c, String key, String name, String b64, boolean first) {
        try {
            File d = dir(key);
            if (d == null || !init(c)) return "";
            String n = clean(name);
            if (first && new File(d, n).exists()) return "exists";
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            try (FileOutputStream o = new FileOutputStream(new File(d, "." + n + ".part"), !first)) { o.write(data); }
            return n;
        } catch (Exception e) { return ""; }
    }

    static boolean done(Context c, String key, String name) {
        try {
            File d = dir(key);
            if (d == null || !access(c)) return false;
            String n = clean(name);
            File part = new File(d, "." + n + ".part"), f = new File(d, n);
            if (!part.exists()) return false;
            if (f.exists()) { part.delete(); return true; }
            return part.renameTo(f);
        } catch (Exception e) { return false; }
    }

    static String list(Context c, String key) {
        JSONArray a = new JSONArray();
        try {
            File d = dir(key);
            File[] fs = d == null || !access(c) ? null : d.listFiles();
            if (fs == null) return "[]";
            Arrays.sort(fs, (x, y) -> Long.compare(y.lastModified(), x.lastModified()));
            for (File f : fs) {
                if (!f.isFile() || f.getName().startsWith(".")) continue;
                a.put(new JSONObject().put("name", f.getName()).put("size", f.length()).put("ts", f.lastModified()));
            }
        } catch (Exception e) { /* return what we have */ }
        return a.toString();
    }

    static boolean delete(Context c, String key, String name) {
        File f = access(c) ? safe(key, name) : null;
        return f != null && f.isFile() && f.delete();
    }

    private static WebResourceResponse status(int code, String why) {
        return new WebResourceResponse("text/plain", "utf-8", code, why, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    private static final class Limited extends FilterInputStream {
        private long left;
        Limited(InputStream in, long n) { super(in); left = n; }
        @Override public int read() throws IOException { if (left <= 0) return -1; int r = super.read(); if (r >= 0) left--; return r; }
        @Override public int read(byte[] b, int o, int l) throws IOException {
            if (left <= 0) return -1;
            int r = super.read(b, o, (int) Math.min(l, left));
            if (r > 0) left -= r;
            return r;
        }
    }

    /** Serves /shfill/<key>/<name> with HTTP Range support so video/audio can seek. */
    static WebResourceResponse serve(Context c, Uri u, Map<String, String> req) {
        try {
            List<String> seg = u.getPathSegments();
            if (seg.size() != 3 || !access(c)) return status(404, "Not Found");
            File f = safe(seg.get(1), seg.get(2));
            if (f == null || !f.isFile()) return status(404, "Not Found");
            long len = f.length(), start = 0, end = len - 1;
            boolean partial = false;
            String rg = req == null ? null : req.get("Range");
            if (rg != null && rg.startsWith("bytes=") && len > 0) {
                try {
                    String[] p = rg.substring(6).split("-", 2);
                    String a = p[0].trim(), b = p.length > 1 ? p[1].trim() : "";
                    if (!a.isEmpty()) { start = Long.parseLong(a); if (!b.isEmpty()) end = Math.min(end, Long.parseLong(b)); }
                    else if (!b.isEmpty()) start = Math.max(0, len - Long.parseLong(b));
                    if (start > end || start >= len) return status(416, "Range Not Satisfiable");
                    partial = true;
                } catch (NumberFormatException e) { start = 0; end = len - 1; partial = false; }
            }
            FileInputStream in = new FileInputStream(f);
            long skipped = 0;
            while (skipped < start) { long s = in.skip(start - skipped); if (s <= 0) break; skipped += s; }
            InputStream body = partial ? new Limited(in, end - start + 1) : in;

            String name = f.getName(), ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (mime == null) mime = "application/octet-stream";
            if ("aud".equals(seg.get(1)) && "webm".equals(ext)) mime = "audio/webm";

            Map<String, String> h = new HashMap<>();
            h.put("Accept-Ranges", "bytes");
            h.put("Cache-Control", "no-store");
            h.put("Content-Length", String.valueOf(partial ? end - start + 1 : len));
            if (partial) h.put("Content-Range", "bytes " + start + "-" + end + "/" + len);
            return new WebResourceResponse(mime, null, partial ? 206 : 200, partial ? "Partial Content" : "OK", h, body);
        } catch (Exception e) { return status(500, "Error"); }
    }
}
