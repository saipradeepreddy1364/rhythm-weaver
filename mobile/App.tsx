import React, { useRef, useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
  Text,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Updates from "expo-updates";

// Update this to your deployed web app URL (e.g. Vercel deployment)
const WEB_APP_URL = "https://rhythm-weaver-two.vercel.app";

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [updateNotification, setUpdateNotification] = useState<string | null>(null);

  // Check for OTA updates after 3 seconds, displaying real-time UI notification
  useEffect(() => {
    const checkUpdatesTimer = setTimeout(async () => {
      if (__DEV__) return;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          setUpdateNotification("New update found. Downloading...");
          await Updates.fetchUpdateAsync();
          setUpdateNotification("Update downloaded. Restarting...");
          
          // Small delay to let user read the message before reboot
          setTimeout(async () => {
             await Updates.reloadAsync();
          }, 1500);
        }
      } catch (e) {
        setUpdateNotification(null);
      }
    }, 3000);

    return () => clearTimeout(checkUpdatesTimer);
  }, []);

  // Handle hardware back button on Android
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // prevent default exit
      }
      return false; // let default exit happen
    };

    if (Platform.OS === "android") {
      BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () =>
        BackHandler.removeEventListener("hardwareBackPress", onBackPress);
    }
  }, [canGoBack]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      
      {/* WebView Layer */}
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_APP_URL }}
        style={styles.webview}
        onNavigationStateChange={(navState) => {
          setCanGoBack(navState.canGoBack);
        }}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        renderLoading={() => (
          <View style={styles.splashContainer}>
            <Text style={styles.brandTitle}>RhythmWeaver</Text>
            <ActivityIndicator size="large" color="#1DB954" style={styles.spinner} />
            <Text style={styles.loadingText}>Tuning your beats...</Text>
          </View>
        )}
      />

      {/* Realtime OTA Update Notification Banner */}
      {updateNotification && (
        <View style={styles.notificationBanner}>
          <ActivityIndicator size="small" color="#1DB954" style={styles.bannerSpinner} />
          <Text style={styles.notificationText}>{updateNotification}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d0d",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0d0d0d",
  },
  splashContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0d0d0d",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#ffffff",
    letterSpacing: 2,
    marginBottom: 20,
    textShadowColor: "rgba(29, 185, 84, 0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  spinner: {
    marginBottom: 15,
  },
  loadingText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.4)",
    fontWeight: "600",
  },
  notificationBanner: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 20,
    right: 20,
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(29, 185, 84, 0.3)",
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1DB954",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 1000,
  },
  bannerSpinner: {
    marginRight: 10,
  },
  notificationText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
});
