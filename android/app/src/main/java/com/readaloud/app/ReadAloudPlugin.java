package com.readaloud.app;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * 朗读插件：把 Web 层的句子队列交给前台服务，并把进度回传给 JS。
 * 方法名刻意避开 load/init 等基类已有方法，防止反射映射冲突。
 */
@CapacitorPlugin(name = "ReadAloud")
public class ReadAloudPlugin extends Plugin {

    private ReadAloudService.Listener bridge;

    /** 单次最多允许导入的文件总大小，超过就提示用户，避免 OOM */
    private static final long MAX_PICK_BYTES = 80L * 1024 * 1024;

    private OkHttpClient http;

    private OkHttpClient http() {
        if (http == null) {
            http = new OkHttpClient.Builder()
                    .connectTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(90, java.util.concurrent.TimeUnit.SECONDS)
                    .writeTimeout(90, java.util.concurrent.TimeUnit.SECONDS)
                    .followRedirects(true)
                    .build();
        }
        return http;
    }

    @Override
    public void load() {
        bridge = new ReadAloudService.Listener() {
            @Override
            public void onProgress(int index, String text) {
                JSObject o = new JSObject();
                o.put("index", index);
                o.put("text", text == null ? "" : text);
                notifyListeners("progress", o);
            }

            @Override
            public void onState(boolean playing, int index) {
                JSObject o = new JSObject();
                o.put("playing", playing);
                o.put("index", index);
                notifyListeners("state", o);
            }

            @Override
            public void onFinished() {
                notifyListeners("finished", new JSObject());
            }

            @Override
            public void onVoices(String json) {
                JSObject o = new JSObject();
                o.put("voices", json);
                notifyListeners("voices", o);
            }

            @Override
            public void onError(String message) {
                JSObject o = new JSObject();
                o.put("message", message);
                notifyListeners("error", o);
            }
        };
        ReadAloudService.setListener(bridge);
    }

    @Override
    protected void handleOnDestroy() {
        // Activity 销毁时解绑，服务本身继续在后台跑
        ReadAloudService.setListener(null);
        super.handleOnDestroy();
    }

    /** 启动服务并返回是否可用；音色列表稍后通过 voices 事件下发 */
    @PluginMethod
    public void initialize(PluginCall call) {
        ReadAloudService.setListener(bridge);
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_LOAD);

        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("engineCount", countTtsEngines());
        ret.put("voices", ReadAloudService.getVoicesJson());
        call.resolve(ret);
    }

    /** 前端主动拉音色（服务可能比插件先初始化完，靠这个补齐） */
    @PluginMethod
    public void getVoices(PluginCall call) {
        ReadAloudService.requestVoices();
        JSObject ret = new JSObject();
        ret.put("voices", ReadAloudService.getVoicesJson());
        ret.put("ready", ReadAloudService.isTtsReady());
        ret.put("failed", ReadAloudService.isTtsFailed());
        ret.put("engineCount", countTtsEngines());
        call.resolve(ret);
    }

    /**
     * 试听：直接交给服务念一句，不进队列。
     * 以前这一步在 WebView 里走 speechSynthesis，安卓 WebView 没有这个 API，
     * 于是必然报「当前环境不支持语音朗读」。
     */
    @PluginMethod
    public void preview(PluginCall call) {
        Double r = call.getDouble("rate");
        Double p = call.getDouble("pitch");
        ReadAloudService.rate = r == null ? 1f : r.floatValue();
        ReadAloudService.pitch = p == null ? 1f : p.floatValue();
        ReadAloudService.voiceId = call.getString("voice", null);
        ReadAloudService.previewText = call.getString("text", "你好，我是听书阁，正在为你朗读。");

        applyEngine(call.getString("engine", null));

        ReadAloudService.setListener(bridge);
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_PREVIEW);
        call.resolve();
    }

    /** 前端指定了引擎就顺手切过去，避免「选了讯飞却还在用系统默认」 */
    private void applyEngine(String pkg) {
        if (pkg == null || pkg.isEmpty()) return;
        if (pkg.equals(ReadAloudService.enginePkg)) return;
        ReadAloudService.enginePkg = pkg;
        ReadAloudService svc = ReadAloudService.getInstance();
        if (svc != null) svc.switchEngine(pkg);
    }

    @PluginMethod
    public void loadQueue(PluginCall call) {
        ensureNotificationPermission();

        JSArray arr = call.getArray("queue");
        ReadAloudService.QUEUE.clear();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                ReadAloudService.QUEUE.add(arr.optString(i, ""));
            }
        }

        Integer start = call.getInt("startIndex", 0);
        ReadAloudService.index = Math.max(0, Math.min(start == null ? 0 : start, Math.max(0, ReadAloudService.QUEUE.size() - 1)));
        ReadAloudService.bookTitle = call.getString("title", "听书阁");
        ReadAloudService.chapterTitle = call.getString("subtitle", "");

        ReadAloudService.setListener(bridge);
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_LOAD);
        call.resolve();
    }

    @PluginMethod
    public void append(PluginCall call) {
        JSArray arr = call.getArray("queue");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                ReadAloudService.QUEUE.add(arr.optString(i, ""));
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void play(PluginCall call) {
        Double r = call.getDouble("rate");
        Double p = call.getDouble("pitch");
        ReadAloudService.rate = r == null ? 1f : r.floatValue();
        ReadAloudService.pitch = p == null ? 1f : p.floatValue();
        ReadAloudService.voiceId = call.getString("voice", null);

        applyEngine(call.getString("engine", null));

        ReadAloudService.setListener(bridge);
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_PLAY);
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_PAUSE);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_PLAY);
        call.resolve();
    }

    @PluginMethod
    public void next(PluginCall call) {
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_NEXT);
        call.resolve();
    }

    @PluginMethod
    public void prev(PluginCall call) {
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_PREV);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_STOP);
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Integer idx = call.getInt("index");
        if (idx != null) ReadAloudService.index = idx;
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_SEEK);
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("playing", ReadAloudService.playing);
        ret.put("index", ReadAloudService.index);
        ret.put("size", ReadAloudService.QUEUE.size());
        call.resolve(ret);
    }

    /**
     * 沉浸式 / 状态栏图标明暗。
     *
     * Android 15 起应用默认 edge-to-edge，所以这里始终 setDecorFitsSystemWindows(false)，
     * 由 CSS 的 env(safe-area-inset-*) 负责让内容避开刘海与手势条；
     * immersive 只决定要不要把系统栏整个藏起来，darkIcons 决定图标是黑是白。
     */
    @PluginMethod
    public void setSystemBars(PluginCall call) {
        applySystemBars(call.getBoolean("immersive"), call.getBoolean("darkIcons"), call);
    }

    /** 老接口保留：参数名是 enabled，转给 applySystemBars */
    @PluginMethod
    public void setImmersive(PluginCall call) {
        applySystemBars(call.getBoolean("enabled"), null, call);
    }

    private void applySystemBars(Boolean immersiveArg, Boolean darkArg, PluginCall call) {
        final Activity activity = getActivity();

        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                Window window = activity.getWindow();
                WindowCompat.setDecorFitsSystemWindows(window, false);
                window.setStatusBarColor(Color.TRANSPARENT);

                // 刘海屏：允许内容画到挖孔区域，靠 CSS 的 safe-area 留白
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    lp.layoutInDisplayCutoutMode =
                            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                    window.setAttributes(lp);
                }

                // 导航栏保持透明，否则全面屏手势条下方会留一条色带
                window.setNavigationBarColor(Color.TRANSPARENT);

                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());

                if (immersiveArg != null) {
                    if (immersiveArg) {
                        controller.hide(WindowInsetsCompat.Type.systemBars());
                        controller.setSystemBarsBehavior(
                                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    } else {
                        controller.show(WindowInsetsCompat.Type.systemBars());
                        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_DEFAULT);
                    }
                }

                if (darkArg != null) {
                    controller.setAppearanceLightStatusBars(darkArg);
                    controller.setAppearanceLightNavigationBars(darkArg);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("setSystemBars failed: " + e.getMessage());
            }
        });
    }

    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (getActivity() == null) return;
        boolean granted = ActivityCompat.checkSelfPermission(
                getActivity(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        if (!granted) {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[] { Manifest.permission.POST_NOTIFICATIONS },
                    9101);
        }
    }

    /* ------------------------- 后台运行 / ColorOS 适配 ------------------------- */

    /** 系统里装了几个文字转语音引擎（ColorOS 出厂常常一个都没有） */
    private int countTtsEngines() {
        return resolveEngines().size();
    }

    /**
     * 枚举系统里的 TTS 引擎。
     *
     * 不 new TextToSpeech(...) 去问，因为那会拉起一个引擎服务、又慢又费电；
     * 直接按 TTS_SERVICE 这个 action 查包管理器即可。
     */
    private List<ResolveInfo> resolveEngines() {
        try {
            Intent probe = new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE);
            return getContext().getPackageManager().queryIntentServices(probe, 0);
        } catch (Exception e) {
            return java.util.Collections.emptyList();
        }
    }

    /** 系统当前默认的 TTS 引擎包名 */
    private String defaultEnginePkg() {
        try {
            return Settings.Secure.getString(
                    getContext().getContentResolver(), "tts_default_synth");
        } catch (Exception e) {
            return null;
        }
    }

    /** 引擎列表 → JSON，label 用应用名，供设置页下拉框使用 */
    @PluginMethod
    public void getEngines(PluginCall call) {
        String current = ReadAloudService.enginePkg != null
                ? ReadAloudService.enginePkg
                : defaultEnginePkg();

        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        String def = defaultEnginePkg();
        for (ResolveInfo ri : resolveEngines()) {
            String pkg = ri.serviceInfo == null ? null : ri.serviceInfo.packageName;
            if (pkg == null) continue;
            CharSequence label = ri.serviceInfo.applicationInfo == null
                    ? pkg
                    : ri.serviceInfo.applicationInfo.loadLabel(getContext().getPackageManager());
            if (!first) sb.append(',');
            sb.append("{\"pkg\":\"").append(escape(pkg)).append("\",\"label\":\"")
                    .append(escape(label == null ? pkg : label.toString())).append("\",\"isDefault\":")
                    .append(pkg.equals(def)).append('}');
            first = false;
        }
        sb.append(']');

        JSObject ret = new JSObject();
        ret.put("engines", sb.toString());
        ret.put("current", current == null ? "" : current);
        call.resolve(ret);
    }

    /** 切换引擎：服务会重建 TTS 对象，音色列表随后通过 voices 事件刷新 */
    @PluginMethod
    public void setEngine(PluginCall call) {
        String pkg = call.getString("pkg", "");
        String next = (pkg == null || pkg.isEmpty()) ? null : pkg;
        ReadAloudService.enginePkg = next;

        ReadAloudService svc = ReadAloudService.getInstance();
        if (svc != null) {
            svc.switchEngine(next);
        } else {
            // 服务还没起来：先把包名写进静态字段，等服务启动时 onCreate 会用它
            ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_LOAD);
        }

        JSObject ret = new JSObject();
        ret.put("current", next == null ? "" : next);
        ret.put("voices", "[]");
        call.resolve(ret);
    }

    /**
     * 打开「下载 / 管理离线语音包」。
     *
     * 系统没有统一的中文语音包下载入口，这里按优先级试：
     *  1. 指定引擎已安装 → 打开它的应用详情页，用户可直接打开 App 下载离线包
     *  2. 未安装 → market:// 搜索（ColorOS 会落到软件商店）
     *  3. 都不行 → 系统「文字转语音」设置页
     */
    @PluginMethod
    public void openVoicePack(PluginCall call) {
        String engine = call.getString("engine", null);

        if (engine != null && !engine.isEmpty()) {
            PackageManager pm = getContext().getPackageManager();
            boolean installed;
            try {
                pm.getPackageInfo(engine, 0);
                installed = true;
            } catch (Exception e) {
                installed = false;
            }

            if (installed) {
                Intent detail = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                detail.setData(Uri.parse("package:" + engine));
                if (launch(detail)) {
                    call.resolve();
                    return;
                }
            } else {
                try {
                    Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=" + engine));
                    if (launch(market)) {
                        call.resolve();
                        return;
                    }
                } catch (Exception ignored) {
                }
            }
        }

        openTtsSettings(call);
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ActivityCompat.checkSelfPermission(
                getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isIgnoringBattery() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    /** 设置页「后台朗读守护」用的状态快照 */
    @PluginMethod
    public void checkStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("notifications", hasNotificationPermission());
        ret.put("batteryWhitelisted", isIgnoringBattery());
        ret.put("ttsEngines", countTtsEngines());
        ret.put("ttsReady", ReadAloudService.isTtsReady());
        ret.put("ttsFailed", ReadAloudService.isTtsFailed());
        ret.put("voices", ReadAloudService.getVoicesJson());
        ret.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        ret.put("engine", ReadAloudService.enginePkg == null ? "" : ReadAloudService.enginePkg);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        ensureNotificationPermission();
        call.resolve();
    }

    /** 申请忽略电池优化：ColorOS 的「耗电保护」不关，锁屏几分钟就被冻结 */
    @PluginMethod
    public void requestBatteryWhitelist(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !isIgnoringBattery()) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                if (launch(intent)) {
                    call.resolve();
                    return;
                }
            } catch (Exception ignored) {
                // 部分 ROM 不支持直接申请，退到电池优化列表
            }
            try {
                launch(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            launch(intent);
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    /** 跳到系统「文字转语音」输出设置，让用户装/选语音引擎 */
    @PluginMethod
    public void openTtsSettings(PluginCall call) {
        String[] actions = new String[] {
                "com.android.settings.TTS_SETTINGS",
                Settings.ACTION_ACCESSIBILITY_SETTINGS,
                Settings.ACTION_SETTINGS,
        };
        for (String a : actions) {
            try {
                if (launch(new Intent(a))) {
                    call.resolve();
                    return;
                }
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    /** ColorOS / realme UI 的自启动管理页，各家包名不同，逐个试 */
    @PluginMethod
    public void openAutoStart(PluginCall call) {
        String[][] candidates = new String[][] {
                { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
                { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
                { "com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity" },
                { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
                { "com.coloros.oppoguardelf", "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity" },
        };
        for (String[] c : candidates) {
            try {
                Intent intent = new Intent();
                intent.setComponent(new ComponentName(c[0], c[1]));
                if (launch(intent)) {
                    call.resolve();
                    return;
                }
            } catch (Exception ignored) {
            }
        }
        // 都没找到就退到应用详情页，用户可以在里面找权限管理
        openAppSettings(call);
    }

    private boolean launch(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
    }

    /* ------------------------- WebDAV 用的原生 HTTP ------------------------- */

    /**
     * 通用 HTTP 请求。
     *
     * 为什么不用 fetch：WebDAV 服务器（坚果云等）不会给 WebView 的跨域请求放行，
     * 而 CORS 头我们控制不了。走 OkHttp 就没有这层限制，还能发 PROPFIND / MKCOL
     * 这类 HttpURLConnection 会拒绝的自定义方法。
     */
    @PluginMethod
    public void httpRequest(PluginCall call) {
        final String url = call.getString("url");
        final String method = call.getString("method", "GET");
        final String body = call.getString("data");
        final String responseType = call.getString("responseType", "text");
        JSObject h = call.getObject("headers");
        final JSObject headersIn = h == null ? new JSObject() : h;

        if (url == null || url.isEmpty()) {
            call.reject("url 不能为空");
            return;
        }

        new Thread(() -> {
            Response resp = null;
            try {
                Request.Builder builder = new Request.Builder().url(url);

                if (headersIn != null) {
                    Iterator<String> it = headersIn.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        String v = headersIn.getString(k);
                        if (v != null) builder.header(k, v);
                    }
                }

                boolean hasBody = body != null && !body.isEmpty();
                RequestBody rb = hasBody
                        ? RequestBody.create(MediaType.parse("application/json; charset=utf-8"), body.getBytes("UTF-8"))
                        : null;

                builder.method(method, rb);
                resp = http().newCall(builder.build()).execute();

                JSObject ret = new JSObject();
                ret.put("status", resp.code());

                JSObject hs = new JSObject();
                for (String name : resp.headers().names()) {
                    hs.put(name.toLowerCase(Locale.ROOT), resp.header(name));
                }
                ret.put("headers", hs);

                ResponseBody rb2 = resp.body();
                if ("base64".equals(responseType)) {
                    byte[] bytes = rb2 == null ? new byte[0] : rb2.bytes();
                    ret.put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                    ret.put("data", "");
                } else {
                    ret.put("data", rb2 == null ? "" : rb2.string());
                }
                call.resolve(ret);
            } catch (Exception e) {
                String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                call.reject("HTTP 请求失败：" + msg);
            } finally {
                if (resp != null) resp.close();
            }
        }).start();
    }

    /* ------------------------- 用系统文件管理器选书（SAF） ------------------------- */

    /**
     * 打开系统的文件选择界面（ColorOS 上就是「文件管理」/「最近文件」那个页面）。
     * 用 ACTION_OPEN_DOCUMENT 而不是 READ_EXTERNAL_STORAGE：不需要任何存储权限，
     * 用户选哪个文件我们才拿到哪个文件，Android 11+ 的合规做法。
     */
    @PluginMethod
    public void pickBooks(PluginCall call) {
        Boolean multi = call.getBoolean("multiple", Boolean.TRUE);
        JSArray mimes = call.getArray("mimes");

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multi != null && multi);
        if (mimes != null && mimes.length() > 0) {
            String[] arr = new String[mimes.length()];
            for (int i = 0; i < mimes.length(); i++) arr[i] = mimes.optString(i, "*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, arr);
        }

        startActivityForResult(call, intent, "pickBooksResult");
    }

    @ActivityCallback
    private void pickBooksResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject cancel = new JSObject();
            cancel.put("cancelled", true);
            cancel.put("files", "[]");
            call.resolve(cancel);
            return;
        }

        Intent data = result.getData();
        JSONArray files = new JSONArray();
        long total = 0;

        try {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                for (int i = 0; i < count; i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    JSONObject f = readUri(uri);
                    if (f != null) {
                        total += f.optLong("size", 0);
                        if (total > MAX_PICK_BYTES) {
                            call.reject("选中的文件超过 80 MB，请分开导入");
                            return;
                        }
                        files.put(f);
                    }
                }
            } else if (data.getData() != null) {
                JSONObject f = readUri(data.getData());
                if (f != null) files.put(f);
            }
        } catch (Exception e) {
            call.reject("读取文件失败：" + (e.getMessage() == null ? "未知错误" : e.getMessage()));
            return;
        }

        JSObject ret = new JSObject();
        ret.put("files", files.toString());
        call.resolve(ret);
    }

    /** 把 content:// 读成 base64；JS 侧再还原成 File，走原来的解析管线 */
    private JSONObject readUri(Uri uri) throws Exception {
        String name = "book.txt";
        long size = 0;

        Cursor c = getContext().getContentResolver().query(uri, null, null, null, null);
        if (c != null) {
            try {
                int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int si = c.getColumnIndex(OpenableColumns.SIZE);
                if (c.moveToFirst()) {
                    if (ni >= 0) name = c.getString(ni);
                    if (si >= 0) size = c.getLong(si);
                }
            } finally {
                c.close();
            }
        }

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        InputStream in = getContext().getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("无法打开所选文件");
        try {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        } finally {
            in.close();
        }

        byte[] bytes = bos.toByteArray();
        JSONObject o = new JSONObject();
        o.put("name", name);
        o.put("size", size > 0 ? size : bytes.length);
        o.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
        return o;
    }
}
