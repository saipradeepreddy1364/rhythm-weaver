import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, ActivityIndicator, SafeAreaView, StatusBar, Platform, Modal, AppState } from 'react-native'
import React, { useRef, useState, useEffect, useCallback } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import * as SplashScreen from "expo-splash-screen";
import TrackPlayer from "react-native-track-player";
import { PlaybackService } from "./playbackService";

// Prevent the splash screen from auto-hiding before storage is initialized
SplashScreen.preventAutoHideAsync().catch(() => {});

// Register playback service for background lock screen controls
TrackPlayer.registerPlaybackService(() => PlaybackService);

// Import Providers (these will be migrated to React Native next)
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { PlayerProvider, usePlayer } from "./src/context/PlayerContext";
import { LibraryProvider } from "./src/context/LibraryContext";

// Import Native Screens / Components (these will be migrated next)
import HomePage, { homePagePrefetcher } from "./src/pages/HomePage";
import SearchPage from "./src/pages/SearchPage";
import LibraryPage from "./src/pages/LibraryPage";
import { MiniPlayer } from "./src/components/MiniPlayer";
import { FullPlayer } from "./src/components/FullPlayer";

const Tab = createBottomTabNavigator();

function AppContent() {
  const { currentSong, showPlayer } = usePlayer();
  const { user, checkAuth } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const navigationRef = useRef<any>(null);
  const appState = useRef(AppState.currentState);

  // Reset navigation to Home when app is closed (backgrounded) and opened again (foregrounded)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        if (navigationRef.current && typeof navigationRef.current.navigate === "function") {
          try {
            navigationRef.current.navigate("Home");
          } catch (err) {
            console.warn("Redirect to Home failed:", err);
          }
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Check for OTA updates on app mount
  useEffect(() => {
    const checkUpdatesTimer = setTimeout(async () => {
      if (__DEV__) return;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          setUpdateAvailable(true);
        }
      } catch (e) {
        console.warn("OTA update check failed:", e);
      }
    }, 3000);

    return () => clearTimeout(checkUpdatesTimer);
  }, []);

  const handleDownloadUpdate = async () => {
    setIsDownloadingUpdate(true);
    setUpdateError(null);
    try {
      await Updates.fetchUpdateAsync();
      setUpdateDownloaded(true);
    } catch (e: any) {
      setUpdateError(e.message || "Failed to download update");
    } finally {
      setIsDownloadingUpdate(false);
    }
  };

  const handleRestartApp = async () => {
    try {
      await Updates.reloadAsync();
    } catch (e) {
      console.error("Failed to reload app:", e);
    }
  };

  const handleRequireAuth = () => {
    // Guest mode enabled - no auth required
  };

  const renderHome = useCallback(() => <HomePage onRequireAuth={handleRequireAuth} />, []);
  const renderSearch = useCallback(() => <SearchPage onRequireAuth={handleRequireAuth} />, []);
  const renderLibrary = useCallback(() => <LibraryPage onRequireAuth={handleRequireAuth} />, []);

  // Check auth once on mount
  useEffect(() => {
    checkAuth();
    const interval = setInterval(checkAuth, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      <NavigationContainer ref={navigationRef}>
        <Tab.Navigator
          id="root-tabs"
          screenOptions={() => ({
            headerShown: false,
            tabBarStyle: {
              backgroundColor: "#181818",
              borderTopColor: "rgba(255, 255, 255, 0.08)",
              height: 60,
              paddingBottom: 8,
              paddingTop: 8,
            },
            tabBarActiveTintColor: "#1DB954",
            tabBarInactiveTintColor: "rgba(255, 255, 255, 0.5)",
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: "600",
            },
            tabBarButton: ({ ref, ...props }: any) => (
              <TouchableOpacity delayPressIn={0} {...props} />
            ),
          })}
        >
          <Tab.Screen
            name="Home"
            options={{
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="home" color={color} size={size} />
              ),
            }}
            component={renderHome}
          />
          
          <Tab.Screen
            name="Search"
            options={{
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="magnify" color={color} size={size} />
              ),
            }}
            component={renderSearch}
          />

          <Tab.Screen
            name="Library"
            options={{
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="playlist-music" color={color} size={size} />
              ),
            }}
            component={renderLibrary}
          />
        </Tab.Navigator>
      </NavigationContainer>

      {/* Floating Mini Player (native version of MiniPlayer component) */}
      {currentSong && <MiniPlayer onRequireAuth={handleRequireAuth} />}

      {/* Full screen overlay player (native version of FullPlayer component) */}
      {showPlayer && <FullPlayer onRequireAuth={handleRequireAuth} />}

      {/* Premium OTA Update Modal */}
      <Modal
        visible={updateAvailable || isDownloadingUpdate || updateDownloaded}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <MaterialCommunityIcons 
                name={updateDownloaded ? "check-circle" : isDownloadingUpdate ? "cloud-download" : "rocket-launch"} 
                size={48} 
                color="#1DB954" 
              />
            </View>

            <Text style={styles.modalTitle}>
              {updateDownloaded ? "Update Ready!" : isDownloadingUpdate ? "Downloading..." : "Update Available!"}
            </Text>

            <Text style={styles.modalDescription}>
              {updateDownloaded 
                ? "The update has been successfully downloaded and is ready to install. Restart the app now to apply the changes."
                : isDownloadingUpdate 
                  ? "We are fetching the latest update for Medley. This will only take a moment. Please keep the app open."
                  : "A new version of Medley is available with performance improvements and new features. Would you like to update now?"}
            </Text>

            {updateError && (
              <Text style={styles.errorText}>Error: {updateError}</Text>
            )}

            <View style={styles.modalButtonGroup}>
              {updateDownloaded ? (
                <>
                  <TouchableOpacity delayPressIn={0} style={styles.primaryButton} onPress={handleRestartApp}>
                    <Text style={styles.primaryButtonText}>Restart Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity delayPressIn={0} style={styles.secondaryButton} onPress={() => setUpdateAvailable(false)}>
                    <Text style={styles.secondaryButtonText}>Later</Text>
                  </TouchableOpacity>
                </>
              ) : isDownloadingUpdate ? (
                <View style={styles.progressContainer}>
                  <ActivityIndicator size="small" color="#1DB954" style={{ marginRight: 8 }} />
                  <Text style={styles.progressText}>Downloading update files...</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity delayPressIn={0} style={styles.primaryButton} onPress={handleDownloadUpdate}>
                    <Text style={styles.primaryButtonText}>Update Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity delayPressIn={0} style={styles.secondaryButton} onPress={() => setUpdateAvailable(false)}>
                    <Text style={styles.secondaryButtonText}>Later</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

import { localStorage } from "./src/lib/storage";

export default function App() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    // Start background prefetching of home page content immediately on app start
    homePagePrefetcher.start();

    const startTime = Date.now();

    const prepareApp = async () => {
      try {
        // 1. Ensure storage is initialized
        await localStorage.ensureInitialized();

        // 2. Wait for the homePagePrefetcher to be ready, up to a maximum of 6 seconds (covers quick load, prevents hanging)
        const maxWait = 6000;
        while (!homePagePrefetcher.ready && (Date.now() - startTime) < maxWait) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // 3. Ensure the splash screen stays visible for at least 1 second to prevent flickering
        const minDuration = 1000;
        const elapsed = Date.now() - startTime;
        if (elapsed < minDuration) {
          await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
        }
      } catch (e) {
        console.warn("App initialization error:", e);
      } finally {
        setAppReady(true);
      }
    };

    prepareApp();
  }, []);

  const onLayoutRootView = React.useCallback(async () => {
    if (appReady) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  if (!appReady) {
    // Returning null keeps the native splash screen visible without any flash or loading spinner
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <PaperProvider>
        <AuthProvider>
          <PlayerProvider>
            <LibraryProvider>
              <AppContent />
            </LibraryProvider>
          </PlayerProvider>
        </AuthProvider>
      </PaperProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#181818",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  modalDescription: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  errorText: {
    color: "#E91E63",
    fontSize: 12,
    marginBottom: 16,
    textAlign: "center",
  },
  modalButtonGroup: {
    width: "100%",
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#1DB954",
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: "center",
    width: "100%",
  },
  primaryButtonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "bold",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  progressText: {
    color: "#1DB954",
    fontSize: 14,
    fontWeight: "600",
  },
});
