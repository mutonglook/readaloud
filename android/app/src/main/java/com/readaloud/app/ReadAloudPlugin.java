package com.readaloud.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;

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
        ReadAloudService.listener = bridge;
    }

    @Override
    protected void handleOnDestroy() {
        // Activity 销毁时解绑，服务本身继续在后台跑
        if (ReadAloudService.listener == bridge) {
            ReadAloudService.listener = null;
        }
        super.handleOnDestroy();
    }

    /** 启动服务并返回是否可用；音色列表稍后通过 voices 事件下发 */
    @PluginMethod
    public void initialize(PluginCall call) {
        ReadAloudService.listener = bridge;
        ReadAloudService.sendCommand(getContext(), ReadAloudService.CMD_LOAD);

        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("voices", new JSArray());
        call.resolve(ret);
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

        ReadAloudService.listener = bridge;
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

        ReadAloudService.listener = bridge;
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
}
