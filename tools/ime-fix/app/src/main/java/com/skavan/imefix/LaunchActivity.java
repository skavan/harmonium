package com.skavan.imefix;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

public final class LaunchActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startService(new Intent(this, ImeFixService.class));
        finishAndRemoveTask();
    }
}