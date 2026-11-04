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
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
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
 * - 一次只 submit 一句，onDone 里再提交下一句，暂停/切句永远是句级精度。
 * - 通知走 MediaStyle + MediaSession：ColorOS / HyperOS / MIUI 只有在看到
 *   MediaSession 时才会把这条通知渲染成「媒体播放卡片」——锁屏、控制中心、
 *   状态栏都能显示书名、章节、进度并直接暂停/切句。用普通通知做不到这点。
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
    public static final String CMD_PREVIEW = "com.readaloud.app.cmd.PREVIEW";

    private static final String CHANNEL_ID = "readaloud_playback";
    private static final int NOTIFICATION_ID = 1001;

    // ---- 共享状态（插件写入，服务读取） ----
    public static final List<String> QUEUE = new ArrayList<>();
    public static int index = 0;
    public static boolean playing = false;
    public static float rate = 1f;
    public static float pitch = 1f;
    public static String voiceId = null;
    /** 指定的系统 TTS 引擎包名，null = 系统默认引擎 */
    public static String enginePkg = null;
    public static String bookTitle = "听书阁";
    public static String chapterTitle = "";
    /** 试听用的一次性文本，不进队列、不推进进度 */
    public static String previewText = null;
    private static Listener listener = null;
    /** 缓存的音色列表：插件晚于服务初始化时也要能补发，否则前端永远拿不到音色 */
    private static String lastVoicesJson = "[]";

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
    private boolean languageOk = true;
    private String pendingAction = null;
    private int utteranceSeq = 0;
    private PowerManager.WakeLock wakeLock;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Runnable watchdog;
    private MediaSessionCompat session;

    // ---------------- 生命周期 ----------------

    public static ReadAloudService getInstance() {
        return instance;
    }

    /** 绑定 JS 侧监听，并立刻把已缓存的音色补发一次 */
    public static void setListener(Listener l) {
        listener = l;
        if (l != null && lastVoicesJson != null) {
            l.onVoices(lastVoicesJson);
        }
    }

    public static String getVoicesJson() {
        return lastVoicesJson;
    }

    public static boolean isTtsReady() {
        return instance != null && instance.ttsReady;
    }

    public static boolean isTtsFailed() {
        return instance != null && instance.ttsFailed;
    }

    public static String getEnginePkg() {
        return enginePkg;
    }

    /** 前端主动要音色：服务若已就绪就重发一次 */
    public static void requestVoices() {
        if (instance != null && instance.ttsReady) {
            instance.emitVoices();
        }
    }

    public static void sendCommand(Context context, String action) {
        Intent intent = new Intent(context, ReadAloudService.class);
        intent.setAction(action);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            // Android 12+ 在后台禁止启动前台服务，退化用 startService；仍失败就放弃本次命令
            Log.w(TAG, "startForegroundService failed, fallback to startService", e);
            try {
                context.startService(intent);
            } catch (Exception ignored) {
                Log.w(TAG, "startService also failed", ignored);
            }
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        setupSession();
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
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        ttsReady = false;
        ttsFailed = false;
        languageOk = true;
        lastVoicesJson = "[]";
        super.onDestroy();
    }

    // ---------------- MediaSession（ColorOS 媒体卡片的关键） ----------------

    private void setupSession() {
        try {
            session = new MediaSessionCompat(this, "ReadAloud");
            session.setFlags(
                    MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                            | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);

            Intent launch = new Intent(this, MainActivity.class);
            launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            session.setSessionActivity(PendingIntent.getActivity(this, 0, launch, flags));

            session.setCallback(new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    handle(CMD_PLAY);
                }

                @Override
                public void onPause() {
                    handle(CMD_PAUSE);
                }

                @Override
                public void onStop() {
                    handle(CMD_STOP);
                }

                @Override
                public void onSkipToNext() {
                    handle(CMD_NEXT);
                }

                @Override
                public void onSkipToPrevious() {
                    handle(CMD_PREV);
                }
            });
            session.setActive(true);
        } catch (Exception e) {
            Log.w(TAG, "MediaSession setup failed", e);
        }
    }

    /** 把书名 / 章节 / 进度同步给系统媒体面板 */
    private void syncSessionState() {
        if (session == null) return;
        try {
            session.setMetadata(new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, bookTitle != null ? bookTitle : "听书阁")
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, chapterTitle == null ? "" : chapterTitle)
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "听书阁")
                    .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, Math.max(1, QUEUE.size()))
                    .build());

            long actions = PlaybackStateCompat.ACTION_PLAY
                    | PlaybackStateCompat.ACTION_PAUSE
                    | PlaybackStateCompat.ACTION_PLAY_PAUSE
                    | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                    | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackStateCompat.ACTION_STOP;

            int state = playing
                    ? PlaybackStateCompat.STATE_PLAYING
                    : PlaybackStateCompat.STATE_PAUSED;

            session.setPlaybackState(new PlaybackStateCompat.Builder()
                    .setActions(actions)
                    .setState(state, Math.max(0, index), playing ? 1f : 0f)
                    .build());
        } catch (Exception e) {
            Log.w(TAG, "syncSessionState failed", e);
        }
    }

    // ---------------- TTS 初始化 ----------------

    private void ensureTts() {
        if (tts != null || ttsFailed) return;
        try {
            if (enginePkg != null && !enginePkg.isEmpty()) {
                tts = new TextToSpeech(this, this, enginePkg);
            } else {
                tts = new TextToSpeech(this, this);
            }
        } catch (Exception e) {
            // 指定的引擎被卸载了，退回默认引擎
            Log.w(TAG, "指定引擎不可用，改用系统默认", e);
            enginePkg = null;
            tts = new TextToSpeech(this, this);
        }
    }

    /** 切换语音引擎：不同引擎的音色完全不同，必须重建 TTS 对象 */
    public void switchEngine(String pkg) {
        String next = (pkg == null || pkg.isEmpty()) ? null : pkg;
        if (next == null && enginePkg == null) return;
        if (next != null && next.equals(enginePkg)) return;

        enginePkg = next;
        lastVoicesJson = "[]";
        ttsReady = false;
        ttsFailed = false;
        stopSpeaking();
        if (tts != null) {
            try {
                tts.shutdown();
            } catch (Exception ignored) {
            }
            tts = null;
        }
        ensureTts();
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) {
            ttsFailed = true;
            emitError("系统语音引擎初始化失败，请检查是否安装了文字转语音服务");
            return;
        }

        // 中文优先，逐级回退；国产 ROM 上有时候只有 Locale.CHINA 被接受
        int langResult = tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
        if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            langResult = tts.setLanguage(Locale.CHINA);
        }
        if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            // 还不行就退回默认语言，至少能出声
            langResult = tts.setLanguage(Locale.getDefault());
        }
        languageOk = langResult != TextToSpeech.LANG_MISSING_DATA
                && langResult != TextToSpeech.LANG_NOT_SUPPORTED;

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

        // 一个中英文音色都没有，基本可以断定系统没装语音引擎或缺少语言包
        if ("[]".equals(lastVoicesJson) && !languageOk) {
            emitError("系统里没有可用的中文语音，请先在设置中安装「文字转语音」引擎");
        }

        if (pendingAction != null) {
            String a = pendingAction;
            pendingAction = null;
            handle(a);
        }
    }

    private void emitVoices() {
        if (tts == null) return;
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
                            .append(escape(friendlyName(v))).append("\",\"lang\":\"").append(escape(lang)).append("\"}");
                    first = false;
                }
            }
            sb.append("]");
            lastVoicesJson = sb.toString();
            if (listener != null) {
                listener.onVoices(lastVoicesJson);
            }
        } catch (Exception e) {
            Log.w(TAG, "emitVoices failed", e);
        }
    }

    /**
     * 音色在系统里的名字经常是一串包名式 ID（如 zh-cn-x-ccc-local），
     * 这里挑出可读的那一段给用户看。
     */
    private static String friendlyName(Voice v) {
        String name = v.getName() == null ? "" : v.getName();
        String[] parts = name.split("[-_#]");
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p.isEmpty()) continue;
            // 形如 x-ccc-local / network 的标记跳过
            if (p.length() <= 2 || "local".equalsIgnoreCase(p) || "network".equalsIgnoreCase(p)) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(p);
        }
        return sb.length() > 0 ? sb.toString() : name;
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
                // 只为取音色而启动的服务没必要常驻通知，退出前台，播放时再回来
                stopForegroundCompat();
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
                goForeground();
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

            case CMD_PREVIEW:
                if (!ttsReady) {
                    pendingAction = CMD_PREVIEW;
                    ensureTts();
                    return;
                }
                speakPreview();
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

    /** 设置页试听：只念这一句，不动队列、不动进度、不改通知 */
    private void speakPreview() {
        if (tts == null || !ttsReady) return;
        String text = previewText;
        if (text == null || text.trim().isEmpty()) {
            emitError("试听文本为空");
            return;
        }
        applyVoiceAndTempo();
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f);
        int r = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, "pv" + (utteranceSeq++));
        if (r != TextToSpeech.SUCCESS) {
            emitError("语音引擎拒绝了这次试听，可能是音色不可用");
        }
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
        // 试听音频结束，不推进队列
        if (utteranceId != null && utteranceId.startsWith("pv")) return;
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
        if (utteranceId != null && utteranceId.startsWith("pv")) {
            emitError(message + "（试听失败）");
            return;
        }
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
        channel.setDescription("在通知栏与锁屏控制后台朗读");
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
                .setSmallIcon(R.drawable.ic_stat_book)
                .setContentIntent(contentIntent)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(sub.isEmpty() ? text : sub))
                .addAction(R.drawable.ic_stat_prev, "上一句", serviceIntent(CMD_PREV))
                .addAction(
                        playing ? R.drawable.ic_stat_pause : R.drawable.ic_stat_play,
                        playing ? "暂停" : "继续",
                        serviceIntent(playing ? CMD_PAUSE : CMD_PLAY))
                .addAction(R.drawable.ic_stat_next, "下一句", serviceIntent(CMD_NEXT));

        // MediaStyle + session token：这一句决定了 ColorOS 会不会把它画成媒体卡片
        if (session != null) {
            builder.setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
        }

        return builder.build();
    }

    private void updateNotification() {
        syncSessionState();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            nm.notify(NOTIFICATION_ID, buildNotification());
        } catch (Exception e) {
            Log.w(TAG, "notify failed", e);
        }
    }

    private void goForeground() {
        syncSessionState();
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

    /** 退出前台并撤掉通知：只初始化不播放时用，避免通知栏常驻一条「正在朗读」 */
    private void stopForegroundCompat() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Exception e) {
            Log.w(TAG, "stopForeground failed", e);
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
