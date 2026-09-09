const { withMainActivity, withMainApplication, withAndroidManifest } = require('@expo/config-plugins');

function withAndroidPipManifest(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = config.modResults.manifest.application[0].activity.find(
      (activity) => activity['$']['android:name'] === '.MainActivity'
    );
    if (mainActivity) {
      mainActivity['$']['android:supportsPictureInPicture'] = 'true';
      mainActivity['$']['android:resizeableActivity'] = 'true';
      const existingConfigChanges = mainActivity['$']['android:configChanges'] || '';
      const pipConfigChanges = 'keyboard|keyboardHidden|orientation|screenSize|uiMode|screenLayout|smallestScreenSize';
      mainActivity['$']['android:configChanges'] = existingConfigChanges
        ? `${existingConfigChanges}|keyboard|keyboardHidden|orientation|screenSize|uiMode|screenLayout|smallestScreenSize`
        : pipConfigChanges;
    }
    return config;
  });
}

function withAndroidPipApplication(config) {
  return withMainApplication(config, (config) => {
    let mainApp = config.modResults.contents;
    if (!mainApp.includes('PipPackage()')) {
      if (mainApp.includes('PackageList(this).packages')) {
        mainApp = mainApp.replace(
          'PackageList(this).packages',
          'PackageList(this).packages.apply { add(com.medley.app.PipPackage()) }'
        );
      }
      config.modResults.contents = mainApp;
    }
    return config;
  });
}

module.exports = function withAndroidPip(config) {
  config = withAndroidPipManifest(config);
  config = withAndroidPipApplication(config);
  return withMainActivity(config, (config) => {
    let mainActivity = config.modResults.contents;

    if (!mainActivity.includes('import com.facebook.react.bridge.ReactContextBaseJavaModule')) {
      mainActivity = mainActivity.replace(
        'package com.medley.app',
        `package com.medley.app\n\nimport com.facebook.react.bridge.ReactApplicationContext\nimport com.facebook.react.bridge.ReactContextBaseJavaModule\nimport com.facebook.react.bridge.ReactMethod\nimport com.facebook.react.bridge.NativeModule\nimport com.facebook.react.ReactPackage\nimport com.facebook.react.uimanager.ViewManager`
      );
    }

    if (!mainActivity.includes('getPipRemoteActions')) {
      const pipSnippet = `
  var isPipEligible = false
  var isPipPlaying = true

  fun setPipEligibleFromJs(eligible: Boolean, playing: Boolean = true) {
    isPipEligible = eligible
    isPipPlaying = playing
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
      try {
        val builder = android.app.PictureInPictureParams.Builder()
        builder.setAspectRatio(android.util.Rational(16, 9))
        builder.setActions(getPipRemoteActions(playing))
        builder.setAutoEnterEnabled(eligible)
        setPictureInPictureParams(builder.build())
      } catch (e: Exception) {}
    } else if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      try {
        val builder = android.app.PictureInPictureParams.Builder()
        builder.setAspectRatio(android.util.Rational(16, 9))
        builder.setActions(getPipRemoteActions(playing))
        setPictureInPictureParams(builder.build())
      } catch (e: Exception) {}
    }
  }

  private val pipActionReceiver = object : android.content.BroadcastReceiver() {
    override fun onReceive(context: android.content.Context?, intent: android.content.Intent?) {
      if (intent?.action == "ACTION_PIP_PLAY_PAUSE") {
        try {
          val reactContext = reactInstanceManager.currentReactContext
          if (reactContext != null) {
            reactContext.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
              .emit("ON_PIP_PLAY_PAUSE_PRESSED", null)
          }
        } catch (e: Exception) {}
      }
    }
  }

  private fun getPipRemoteActions(playing: Boolean): java.util.ArrayList<android.app.RemoteAction> {
    return java.util.ArrayList<android.app.RemoteAction>()
  }

  override fun onStart() {
    super.onStart()
    try {
      val filter = android.content.IntentFilter("ACTION_PIP_PLAY_PAUSE")
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(pipActionReceiver, filter, android.content.Context.RECEIVER_NOT_EXPORTED)
      } else {
        registerReceiver(pipActionReceiver, filter)
      }
    } catch (e: Exception) {}

    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
      try {
        val builder = android.app.PictureInPictureParams.Builder()
        builder.setAspectRatio(android.util.Rational(16, 9))
        builder.setActions(getPipRemoteActions(isPipPlaying))
        builder.setAutoEnterEnabled(isPipEligible)
        setPictureInPictureParams(builder.build())
      } catch (e: Exception) {}
    }
  }

  override fun onStop() {
    super.onStop()
    try {
      unregisterReceiver(pipActionReceiver)
    } catch (e: Exception) {}
  }

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (!isPipEligible) return

    try {
      val map = com.facebook.react.bridge.Arguments.createMap()
      map.putBoolean("isInPictureInPictureMode", true)
      val reactContext = reactInstanceManager.currentReactContext
      if (reactContext != null) {
        reactContext.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("ON_PIP_MODE_CHANGED", map)
      }
    } catch (e: Exception) {}

    if (isPipEligible && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      try {
        // Deactivate any active MediaSession so Android cannot derive prev/play/next PiP controls from it
        try {
          val mediaSessionManager = getSystemService(android.content.Context.MEDIA_SESSION_SERVICE) as? android.media.session.MediaSessionManager
          val audioManager = getSystemService(android.content.Context.AUDIO_SERVICE) as? android.media.AudioManager
          if (audioManager != null) {
            // Briefly abandon then re-request audio focus to clear the active media session notification
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
              val focusRequest = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                  android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MOVIE)
                    .build()
                )
                .setWillPauseWhenDucked(false)
                .setAcceptsDelayedFocusGain(true)
                .setOnAudioFocusChangeListener {}
                .build()
              audioManager.abandonAudioFocusRequest(focusRequest)
              audioManager.requestAudioFocus(focusRequest)
            }
          }
        } catch (e: Exception) {}

        val builder = android.app.PictureInPictureParams.Builder()
        builder.setAspectRatio(android.util.Rational(16, 9))
        builder.setActions(getPipRemoteActions(isPipPlaying))
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
          builder.setAutoEnterEnabled(true)
          builder.setSeamlessResizeEnabled(false)
        }
        enterPictureInPictureMode(builder.build())
      } catch (e: Exception) {}
    }
  }

  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: android.content.res.Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    try {
      val map = com.facebook.react.bridge.Arguments.createMap()
      map.putBoolean("isInPictureInPictureMode", isInPictureInPictureMode)
      val reactContext = reactInstanceManager.currentReactContext
      if (reactContext != null) {
        reactContext.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("ON_PIP_MODE_CHANGED", map)
      }
    } catch (e: Exception) {}
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
        finishAndRemoveTask()
      }
    } catch (e: Exception) {}
  }
`;
      const packageClassSnippet = `
class PipModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "PipModule"

  @ReactMethod
  fun setPipEligible(eligible: Boolean, playing: Boolean = true) {
    val activity = currentActivity
    if (activity is MainActivity) {
      activity.runOnUiThread {
        activity.setPipEligibleFromJs(eligible, playing)
      }
    }
  }
}

class PipPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> {
    val modules = ArrayList<NativeModule>()
    modules.add(PipModule(reactContext))
    return modules
  }
  override fun createViewManagers(reactContext: ReactApplicationContext): MutableList<ViewManager<*, *>> {
    return ArrayList()
  }
}
`;
      mainActivity = mainActivity.replace(/}\s*$/, `${pipSnippet}\n}\n${packageClassSnippet}`);
    }

    config.modResults.contents = mainActivity;
    return config;
  });
};
