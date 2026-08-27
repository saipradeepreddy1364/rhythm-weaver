const { withMainActivity } = require('@expo/config-plugins');

module.exports = function withAndroidPip(config) {
  return withMainActivity(config, (config) => {
    let mainActivity = config.modResults.contents;

    if (!mainActivity.includes('onUserLeaveHint')) {
      const pipSnippet = `
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      try {
        val params = android.app.PictureInPictureParams.Builder().build()
        enterPictureInPictureMode(params)
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
