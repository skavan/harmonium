package com.skavan.imefix;

import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Process;
import android.provider.Settings;
import android.util.Log;

public final class ImeFixService extends Service {
    private static final String TAG = "HarmoniumImeFix";
    private static final String LATIN_IME = "com.android.inputmethod.latin/.LatinIME";
    private static final String KEY_MAPPER_IME =
            "io.github.sds100.keymapper/.system.inputmethod.KeyMapperImeService";
    private static final long STARTUP_DELAY_MS = 5000;
    private static final long SWITCH_DELAY_MS = 500;

    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        handler.removeCallbacksAndMessages(null);
        Log.i(TAG, "Started; waiting for Fully Kiosk to settle");
        handler.postDelayed(() -> selectIme(LATIN_IME, startId), STARTUP_DELAY_MS);
        return START_NOT_STICKY;
    }

    private void selectIme(String ime, int startId) {
        try {
            boolean changed = Settings.Secure.putString(
                    getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD, ime);
            String selected = Settings.Secure.getString(
                    getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
            Log.i(TAG, "Selected " + ime + "; changed=" + changed + "; current=" + selected);

            if (LATIN_IME.equals(ime)) {
                handler.postDelayed(() -> selectIme(KEY_MAPPER_IME, startId), SWITCH_DELAY_MS);
            } else {
                exit(startId);
            }
        } catch (SecurityException exception) {
            Log.e(TAG, "WRITE_SECURE_SETTINGS has not been granted", exception);
            exit(startId);
        }
    }

    private void exit(int startId) {
        handler.removeCallbacksAndMessages(null);
        stopSelfResult(startId);
        Log.i(TAG, "Finished; exiting process");
        Process.killProcess(Process.myPid());
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}