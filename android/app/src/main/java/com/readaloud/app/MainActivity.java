package com.readaloud.app;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReadAloudPlugin.class);
        super.onCreate(savedInstanceState);

        // 全应用强制 edge-to-edge：正文可以画到状态栏和手势条下面，
        // 具体让出多少空间交给 CSS 的 env(safe-area-inset-*)，阅读页才能真沉浸。
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // 刘海屏 / 挖孔屏：允许内容进入挖孔区域
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
    }
}
