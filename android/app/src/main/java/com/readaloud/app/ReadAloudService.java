package com.readaloud.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 后台朗读服务。
 *
 * 设计要点：
 * - 数据（队列、下标、语速）全部放在静态字段，插件侧直接写入，服务侧读取，
 *   避免 startForegroundService 异步创建导致的时序问题。
 * - 一次只 submit 一句，onDone 里再提交下一句，这样暂停/切句永远是句级精度。
 * - 通知栏按钮通过 PendingIntent 发 action 回服务自己，Activity 被杀也能控制。
 */
public class ReadAloudService extends Service implements TextToSpeech.OnInitListener {

    private static final String TAG = "ReadAloudService";

    public static final String CMD_LOAD = "com.readaloud.app.cmd.LOAD";
    public static final String CMD_PLAY = "com.readaloud.app.cmd.PLAY";
    public static final String CMD_PAUSE = "com.readaloud.app.cmd.PAUSE";
    public static final String CMD_NEXT = "com.readaloud.app.cmd.NEXT";
    public static final String CMD_PREV = "com.readaloud.app.cmd.PREV";
    public static final String CMD_STOP = "com.readaloud.app.cmd.STOP";
    public static final String CMD_SEEK = "com.readaloud.app.cmd.SEEK";

    private static final String CHANNEL_ID = "readaloud_playback";
    private static final int NOTIFICATION_ID = 1001;

    // ---- 共享状态（插件写入，服务读取） ----
    public static final List<String> QUEUE = new ArrayList<>();
    public static int index = 0;
    public static boolean playing = false;
    public static float rate = 1f;
    public static float pitch = 1f;
    public static String voiceId = null;
    public static String bookTitle = "听书阁";
    public static String chapterTitle = "";
    public static Listener listener = null;

    public interface Listener {
        void onProgress(int index, String text);

        void onState(boolean playing, int index);

        void onFinished();

        void onVoices(String json);

        void onError(String message);
    }

    private static ReadAloudService instance;

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean ttsFailed = false;
    private String pendingAction = null;
    private int utteranceSeq = 0;
    private PowerManager.WakeLock wakeLock;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Runnable watchdog;

    // ---------------- 生命周期 ----------------

    public static ReadAloudService getInstance() {
        return instance;
    }

    public static void sendCommand(Context context, String action) {
        Intent intent = new Intent(context, ReadAloudService.class);
        intent.setAction(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        ensureTts();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Android 8+ 必须在 5 秒内进入前台，先做这件事再处理命令
        goForeground();

        String action = intent != null && intent.getAction() != null ? intent.getAction() : CMD_LOAD;
        handle(action);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        instance = null;
        stopSpeaking();
        releaseWakeLock();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        ttsReady = false;
        super.onDestroy();
    }

    // ---------------- TTS 初始化 ----------------

    private void ensureTts() {
        if (tts != null || ttsFailed) return;
        tts = new TextToSpeech(this, this);
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) {
            ttsFailed = true;
            emitError("系统语音引擎初始化失败，请检查是否安装了文字转语音服务");
            return;
        }

        int langResult = tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
        if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            // 退而求其次用默认语言，至少能出声
            tts.setLanguage(Locale.getDefault());
        }

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                // no-op
            }

            @Override
            public void onDone(String utteranceId) {
                main.post(() -> onUtteranceDone(utteranceId));
            }

            @Override
            public void onError(String utteranceId) {
                main.post(() -> onUtteranceError(utteranceId, "语音合成出错"));
            }

            @Override
            public void onError(String utteranceId, int errorCode) {
                main.post(() -> onUtteranceError(utteranceId, "语音合成出错（" + errorCode + "）"));
            }
        });

        ttsReady = true;
        emitVoices();

        if (pendingAction != null) {
            String a = pendingAction;
            pendingAction = null;
            handle(a);
        }
    }

    private void emitVoices() {
        if (listener == null || tts == null) return;
        try {
            Set<Voice> voices = tts.getVoices();
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            if (voices != null) {
                for (Voice v : voices) {
                    String lang = v.getLocale() != null ? v.getLocale().toString() : "";
                    // 过滤掉非中英文音色，列表太长反而难选
                    if (!(lang.startsWith("zh") || lang.startsWith("en"))) continue;
                    if (!first) sb.append(',');
                    sb.append("{\"id\":\"").append(escape(v.getName())).append("\",\"name\":\"")
                            .append(escape(v.getName())).append("\",\"lang\":\"").append(escape(lang)).append("\"}");
                    first = false;
                }
            }
            sb.append("]");
            listener.onVoices(sb.toString());
        } catch (Exception e) {
            Log.w(TAG, "emitVoices failed", e);
        }
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
    }

    // ---------------- 命令处理 ----------------

    private void handle(String action) {
        switch (action) {
            case CMD_LOAD:
                stopSpeaking();
                playing = false;
                updateNotification();
                emitState();
                emitProgress();
                break;

            case CMD_PLAY:
                if (!ttsReady) {
                    pendingAction = CMD_PLAY;
                    ensureTts();
                    return;
                }
                if (QUEUE.isEmpty()) {
                    emitError("没有可朗读的内容");
                    return;
                }
                if (index < 0 || index >= QUEUE.size()) index = 0;
                playing = true;
                acquireWakeLock();
                speakCurrent();
                break;

            case CMD_PAUSE:
                playing = false;
                stopSpeaking();
                releaseWakeLock();
                updateNotification();
                emitState();
                break;

            case CMD_NEXT:
                step(1);
                break;

            case CMD_PREV:
                step(-1);
                break;

            case CMD_SEEK:
                stopSpeaking();
                if (playing) speakCurrent();
                else {
                    updateNotification();
                    emitProgress();
                }
                break;

            case CMD_STOP:
                playing = false;
                index = 0;
                stopSpeaking();
                releaseWakeLock();
                updateNotification();
                emitState();
                break;

            default:
                break;
        }
    }

    private void step(int delta) {
        stopSpeaking();
        int next = index + delta;
        if (next < 0) next = 0;
        if (next >= QUEUE.size()) {
            playing = false;
            releaseWakeLock();
            emitFinished();
            updateNotification();
            emitState();
            return;
        }
        index = next;
        emitProgress();
        if (playing) speakCurrent();
        else updateNotification();
    }

    // ---------------- 朗读 ----------------

    private void speakCurrent() {
        if (tts == null || !ttsReady) return;
        if (index < 0 || index >= QUEUE.size()) {
            playing = false;
            releaseWakeLock();
            emitFinished();
            updateNotification();
            emitState();
            return;
        }

        String text = QUEUE.get(index);
        if (text == null || text.trim().isEmpty()) {
            index++;
            speakCurrent();
            return;
        }

        applyVoiceAndTempo();

        String uttId = "u" + (utteranceSeq++);
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f);

        int r = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, uttId);
        if (r != TextToSpeech.SUCCESS) {
            emitError("语音引擎拒绝朗读，可能是音色不可用");
            playing = false;
            emitState();
            return;
        }

        emitProgress();
        updateNotification();
        emitState();
        armWatchdog(text);
    }

    private void applyVoiceAndTempo() {
        if (tts == null) return;
        try {
            tts.setSpeechRate(clamp(rate, 0.3f, 2.5f));
            tts.setPitch(clamp(pitch, 0.5f, 2f));
            if (voiceId != null && !voiceId.isEmpty()) {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        if (v.getName().equals(voiceId)) {
                            tts.setVoice(v);
                            break;
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "applyVoiceAndTempo failed", e);
        }
    }

    /** 部分 TTS 引擎 onDone 不回调，按字数估时长兜底推进 */
    private void armWatchdog(String text) {
        clearWatchdog();
        long estimate = (long) (Math.max(2000, text.length() * 250) / clamp(rate, 0.3f, 2.5f));
        watchdog = () -> {
            watchdog = null;
            if (playing) {
                index++;
                if (index >= QUEUE.size()) {
                    playing = false;
                    releaseWakeLock();
                    emitFinished();
                    updateNotification();
                    emitState();
                } else {
                    speakCurrent();
                }
            }
        };
        main.postDelayed(watchdog, estimate);
    }

    private void clearWatchdog() {
        if (watchdog != null) {
            main.removeCallbacks(watchdog);
            watchdog = null;
        }
    }

    private void onUtteranceDone(String utteranceId) {
        clearWatchdog();
        if (!playing) return;
        index++;
        if (index >= QUEUE.size()) {
            playing = false;
            releaseWakeLock();
            emitFinished();
            updateNotification();
            emitState();
        } else {
            speakCurrent();
        }
    }

    private void onUtteranceError(String utteranceId, String message) {
        clearWatchdog();
        emitError(message);
        // 跳过这一句，继续往下读，避免整本书卡死
        if (playing) {
            main.postDelayed(() -> {
                index++;
                if (index < QUEUE.size()) speakCurrent();
                else {
                    playing = false;
                    emitFinished();
                    emitState();
                }
            }, 300);
        }
    }

    private void stopSpeaking() {
        clearWatchdog();
        if (tts != null) {
            try {
                tts.stop();
            } catch (Exception ignored) {
            }
        }
    }

    // ---------------- 电源 ----------------

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "readaloud:tts");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(60 * 60 * 1000L);
        } catch (Exception e) {
            Log.w(TAG, "wakeLock failed", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    // ---------------- 通知 ----------------

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "朗读播放控制",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("在通知栏控制后台朗读");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        nm.createNotificationChannel(channel);
    }

    private PendingIntent serviceIntent(String action) {
        Intent intent = new Intent(this, ReadAloudService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        // requestCode 用 action 的 hash，保证不同按钮不互相覆盖
        return PendingIntent.getService(this, action.hashCode(), intent, flags);
    }

    private Notification buildNotification() {
        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launch, piFlags);

        String text = chapterTitle != null && !chapterTitle.isEmpty() ? chapterTitle : "正在朗读";
        String sub = index >= 0 && index < QUEUE.size() ? QUEUE.get(index) : "";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(bookTitle != null ? bookTitle : "听书阁")
                .setContentText(sub)
                .setSubText(text)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(contentIntent)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(sub.isEmpty() ? text : sub))
                .addAction(android.R.drawable.ic_media_previous, "上一句", serviceIntent(CMD_PREV))
                .addAction(
                        playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? "暂停" : "继续",
                        serviceIntent(playing ? CMD_PAUSE : CMD_PLAY))
                .addAction(android.R.drawable.ic_media_next, "下一句", serviceIntent(CMD_NEXT));

        return builder.build();
    }

    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            nm.notify(NOTIFICATION_ID, buildNotification());
        } catch (Exception e) {
            Log.w(TAG, "notify failed", e);
        }
    }

    private void goForeground() {
        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed", e);
        }
    }

    // ---------------- 事件上报 ----------------

    private void emitProgress() {
        if (listener == null) return;
        String text = index >= 0 && index < QUEUE.size() ? QUEUE.get(index) : "";
        listener.onProgress(index, text);
    }

    private void emitState() {
        if (listener == null) return;
        listener.onState(playing, index);
    }

    private void emitFinished() {
        if (listener == null) return;
        listener.onFinished();
    }

    private void emitError(String message) {
        if (listener == null) return;
        listener.onError(message);
    }

    private static float clamp(float v, float min, float max) {
        return Math.max(min, Math.min(max, v));
    }
}
