package com.readaloud.app;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 朗读插件：把 Web 层的句子队列交给前台服务，并把进度回传给 JS。
 * 方法名刻意避开 load/init 等基类已有方法，防止反射映射冲突。
 */
@CapacitorPlugin(name = "ReadAloud")
public class ReadAloudPlugin extends Plugin {

    private ReadAloudService.Listener bridge;

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

        ReadAloudService.setListener(bridge);
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_PREVIEW);
        call.resolve();
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
     * 沉浸式全屏：隐藏 / 显示状态栏与导航栏。
     * Android 15 起应用默认 edge-to-edge，这里只负责控制系统栏可见性。
     */
    @PluginMethod
    public void setImmersive(PluginCall call) {
        Boolean flag = call.getBoolean("enabled", Boolean.TRUE);
        final boolean enabled = flag != null && flag;
        final Activity activity = getActivity();

        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                WindowCompat.setDecorFitsSystemWindows(activity.getWindow(), false);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                        activity.getWindow(), activity.getWindow().getDecorView());

                if (enabled) {
                    controller.hide(WindowInsetsCompat.Type.systemBars());
                    controller.setSystemBarsBehavior(
                            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                } else {
                    controller.show(WindowInsetsCompat.Type.systemBars());
                    controller.setSystemBarsBehavior(
                            WindowInsetsControllerCompat.BEHAVIOR_DEFAULT);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("setImmersive failed: " + e.getMessage());
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
        try {
            Intent probe = new Intent("android.intent.action.TTS_SERVICE");
            return getContext().getPackageManager().queryIntentServices(probe, 0).size();
        } catch (Exception e) {
            return 0;
        }
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
}
