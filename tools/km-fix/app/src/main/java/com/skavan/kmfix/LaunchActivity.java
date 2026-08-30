package com.skavan.kmfix;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/* Invisible entry point. Fully Kiosk launches this at boot via its
   "Application to Run on Start in Foreground (PLUS)" setting; it starts
   the worker service and removes itself from the task stack immediately. */
public final class LaunchActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startService(new Intent(this, KmFixService.class));
        finishAndRemoveTask();
    }
}
