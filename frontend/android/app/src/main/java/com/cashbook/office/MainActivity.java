package com.cashbook.office;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 1400;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestCapturePermissions();
    }

    /**
     * The webview serves the transaction flow's camera input and MediaRecorder
     * voice capture. Android denies web getUserMedia/file capture unless the
     * hosting app already holds these runtime permissions, so ask once on
     * first launch.
     */
    private void requestCapturePermissions() {
        List<String> missing = new ArrayList<>();
        for (String permission : new String[] {Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                missing.add(permission);
            }
        }
        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }
}
