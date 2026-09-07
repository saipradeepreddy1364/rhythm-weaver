const { withMainActivity, withAndroidManifest } = require('@expo/config-plugins');

function withAndroidPipManifest(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = config.modResults.manifest.application[0].activity.find(
      (activity) => activity['$']['android:name'] === '.MainActivity'
    );
    if (mainActivity) {
      mainActivity['$']['android:supportsPictureInPicture'] = 'true';
    }
    return config;
  });
}

module.exports = function withAndroidPip(config) {
  config = withAndroidPipManifest(config);
  return withMainActivity(config, (config) => {
    let mainActivity = config.modResults.contents;

    if (!mainActivity.includes('getPipRemoteActions')) {
      const pipSnippet = `
  private var isPipEligible = false

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
      } else if (intent?.action == "ACTION_SET_PIP_ELIGIBLE") {
        val eligible = intent.getBooleanExtra("eligible", false)
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
      val filter = android.content.IntentFilter()
      filter.addAction("ACTION_PIP_PLAY_PAUSE")
      filter.addAction("ACTION_SET_PIP_ELIGIBLE")
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
        builder.setAutoEnterEnabled(false)
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
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N && isInPictureInPictureMode) {
        finishAndRemoveTask()
      }
    } catch (e: Exception) {}
  }
`;
      mainActivity = mainActivity.replace(/}\s*$/, `${pipSnippet}\n}`);
      config.modResults.contents = mainActivity;
    }

    return config;
  });
};
