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

    if (!mainActivity.includes('setAutoEnterEnabled')) {
      const pipSnippet = `
  override fun onStart() {
    super.onStart()
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
      try {
        val builder = android.app.PictureInPictureParams.Builder()
        builder.setAspectRatio(android.util.Rational(16, 9))
        builder.setAutoEnterEnabled(true)
        setPictureInPictureParams(builder.build())
      } catch (e: Exception) {}
    }
  }

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) {
      try {
        val builder = android.app.PictureInPictureParams.Builder()
        builder.setAspectRatio(android.util.Rational(16, 9))
        enterPictureInPictureMode(builder.build())
      } catch (e: Exception) {}
    }
  }
`;
      mainActivity = mainActivity.replace(/}\s*$/, `${pipSnippet}\n}`);
      config.modResults.contents = mainActivity;
    }

    return config;
  });
};
