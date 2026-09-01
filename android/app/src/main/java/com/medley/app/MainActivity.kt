package com.medley.app

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
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
        builder.setAutoEnterEnabled(true)
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
    try {
      val map = com.facebook.react.bridge.Arguments.createMap()
      map.putBoolean("isInPictureInPictureMode", true)
      val reactContext = reactInstanceManager.currentReactContext
      if (reactContext != null) {
        reactContext.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("ON_PIP_MODE_CHANGED", map)
      }
    } catch (e: Exception) {}
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) {
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

  override fun onTaskRemoved(rootIntent: android.content.Intent?) {
    super.onTaskRemoved(rootIntent)
    try {
      finishAndRemoveTask()
      android.os.Process.killProcess(android.os.Process.myPid())
    } catch (e: Exception) {
      try { finish() } catch (err: Exception) {}
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N && isInPictureInPictureMode) {
        finishAndRemoveTask()
      }
    } catch (e: Exception) {}
  }

}