const { withMainActivity, withMainApplication, withAndroidManifest } = require('@expo/config-plugins');

function withAndroidPipManifest(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = config.modResults.manifest.application[0].activity.find(
      (activity) => activity['$']['android:name'] === '.MainActivity'
    );
    if (mainActivity) {
      mainActivity['$']['android:supportsPictureInPicture'] = 'true';
      const existingConfigChanges = mainActivity['$']['android:configChanges'] || '';
      const pipConfigChanges = 'keyboard|keyboardHidden|orientation|screenSize|uiMode|screenLayout|smallestScreenSize';
      mainActivity['$']['android:configChanges'] = existingConfigChanges
        ? `${existingConfigChanges}|screenSize|smallestScreenSize|screenLayout`
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

    if (!mainActivity.includes('getPipRemoteActions')) {
      const pipSnippet = `
  var isPipEligible = false

  fun setPipEligibleFromJs(eligible: Boolean) {
    isPipEligible = eligible
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
      try {
        val builder = android.app.PictureInPictureParams.Builder()
        builder.setAspectRatio(android.util.Rational(16, 9))
        builder.setActions(getPipRemoteActions())
        builder.setAutoEnterEnabled(eligible)
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

  private fun getPipRemoteActions(): java.util.ArrayList<android.app.RemoteAction> {
    val actions = java.util.ArrayList<android.app.RemoteAction>()
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      try {
        val intent = android.content.Intent("ACTION_PIP_PLAY_PAUSE")
        val pendingIntent = android.app.PendingIntent.getBroadcast(
          this,
          0,
          intent,
          android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        val icon = android.graphics.drawable.Icon.createWithResource(this, android.R.drawable.ic_media_play)
        val action = android.app.RemoteAction(icon, "Play/Pause", "Play or Pause Video", pendingIntent)
        actions.add(action)
      } catch (e: Exception) {}
    }
    return actions
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
        builder.setActions(getPipRemoteActions())
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

    if (isPipEligible && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) {
      try {
        val builder = android.app.PictureInPictureParams.Builder()
        builder.setAspectRatio(android.util.Rational(16, 9))
        builder.setActions(getPipRemoteActions())
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
class PipModule(private val reactContext: com.facebook.react.bridge.ReactApplicationContext) :
  com.facebook.react.bridge.ReactContextBaseModule(reactContext) {

  override fun getName(): String = "PipModule"

  @com.facebook.react.bridge.ReactMethod
  fun setPipEligible(eligible: Boolean) {
    val activity = currentActivity
    if (activity is MainActivity) {
      activity.runOnUiThread {
        activity.setPipEligibleFromJs(eligible)
      }
    }
  }
}

class PipPackage : com.facebook.react.ReactPackage {
  override fun createNativeModules(reactContext: com.facebook.react.bridge.ReactApplicationContext): List<com.facebook.react.bridge.NativeModule> {
    return listOf(PipModule(reactContext))
  }
  override fun createViewManagers(reactContext: com.facebook.react.bridge.ReactApplicationContext): List<com.facebook.react.uimanager.ViewManager<*, *>> {
    return emptyList()
  }
}
`;
      mainActivity = mainActivity.replace(/}\s*$/, `${pipSnippet}\n}\n${packageClassSnippet}`);
      config.modResults.contents = mainActivity;
    }

    return config;
  });
};
