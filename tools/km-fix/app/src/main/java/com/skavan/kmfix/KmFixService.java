package com.skavan.kmfix;

import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Process;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;

/* Harmonium KM Fix — the accessibility-service sibling of imefix.

   THE FAILURE IT REPAIRS (new Astrion HA100, firmware rev where the
   bridge does not persist): after a reboot Key Mapper's accessibility
   service comes up BOUND but its key interception is inert — a mapped
   Volume press falls through to the system (the on-screen volume panel
   appears) instead of being consumed. The service is running; it was
   just wired to an input pipeline that was not ready when it bound.
   Manually UN-binding and RE-binding the service (remove it from
   enabled_accessibility_services, then add it back) forces a fresh
   bind against a now-ready pipeline and restores interception.

   Why this is allowed without root, unlike the wireless-ADB path:
   enabled_accessibility_services is a SECURE SETTING, and
   WRITE_SECURE_SETTINGS (granted once over adb) permits writing it.
   No shell, no adb-over-tcp, no borrowed bridge privilege — the exact
   wall the self-healing-ADB idea could never get past.

   ONE-SHOT: launched by Fully at boot, waits for the system to settle,
   performs the bounce, then stops the service and kills its own
   process. Nothing persists. If the failure turns out NOT to be a
   bind-timing race (i.e. the firmware broke a11y key-filtering
   outright), the bounce will run cleanly and change nothing — a safe
   no-op, not a regression. */
public final class KmFixService extends Service {
    private static final String TAG = "HarmoniumKmFix";
    private static final String ENABLED_A11Y = "enabled_accessibility_services";
    private static final String A11Y_ENABLED = "accessibility_enabled";
    /* the substring that identifies Key Mapper's component, whatever its
       exact class name is across versions */
    private static final String KEYMAPPER = "keymapper";

    /* Settle window before bouncing. Longer than imefix's 5s because the
       accessibility pipeline settles later in boot than the IME does;
       raise this first if a boot run does not take. */
    private static final long STARTUP_DELAY_MS = 8000;
    /* Gap between un-bind and re-bind — long enough for the framework to
       fully tear the service down before we bring it back. */
    private static final long BOUNCE_GAP_MS = 1200;

    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        handler.removeCallbacksAndMessages(null);
        Log.i(TAG, "Started; waiting " + STARTUP_DELAY_MS + "ms for the system to settle");
        handler.postDelayed(() -> unbind(startId), STARTUP_DELAY_MS);
        return START_NOT_STICKY;
    }

    /* step 1 — remove Key Mapper from the enabled list (unbind it) */
    private void unbind(int startId) {
        try {
            String original = Settings.Secure.getString(
                    getContentResolver(), ENABLED_A11Y);
            Log.i(TAG, "enabled_accessibility_services=" + original);

            if (TextUtils.isEmpty(original) || !original.toLowerCase().contains(KEYMAPPER)) {
                Log.w(TAG, "Key Mapper not present in the enabled list; nothing to bounce");
                exit(startId);
                return;
            }

            String without = withoutKeymapper(original);
            boolean changed = Settings.Secure.putString(
                    getContentResolver(), ENABLED_A11Y, without);
            Log.i(TAG, "Unbound Key Mapper; wrote=" + without + "; changed=" + changed);

            handler.postDelayed(() -> rebind(original, startId), BOUNCE_GAP_MS);
        } catch (SecurityException e) {
            Log.e(TAG, "WRITE_SECURE_SETTINGS has not been granted", e);
            exit(startId);
        }
    }

    /* step 2 — restore the original list (rebind) and make sure the
       global accessibility flag is on */
    private void rebind(String original, int startId) {
        try {
            boolean changed = Settings.Secure.putString(
                    getContentResolver(), ENABLED_A11Y, original);
            Settings.Secure.putString(getContentResolver(), A11Y_ENABLED, "1");
            String current = Settings.Secure.getString(getContentResolver(), ENABLED_A11Y);
            Log.i(TAG, "Rebound Key Mapper; changed=" + changed + "; current=" + current);
        } catch (SecurityException e) {
            Log.e(TAG, "WRITE_SECURE_SETTINGS lost between steps", e);
        }
        exit(startId);
    }

    /* drop every ':'-separated component that names Key Mapper, keep the
       rest verbatim (so a device with other a11y services keeps them) */
    private static String withoutKeymapper(String list) {
        StringBuilder kept = new StringBuilder();
        for (String part : list.split(":")) {
            if (part.isEmpty() || part.toLowerCase().contains(KEYMAPPER)) continue;
            if (kept.length() > 0) kept.append(':');
            kept.append(part);
        }
        return kept.toString();   // may be "" when Key Mapper was the only one
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
