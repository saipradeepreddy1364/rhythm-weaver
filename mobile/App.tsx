import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, ActivityIndicator, SafeAreaView, StatusBar, Platform, Modal, AppState, Dimensions } from 'react-native'
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

  const [activeTab, setActiveTab] = useState<'Home' | 'Search' | 'Library'>('Home');
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = Dimensions.get('window');
  const navigationRef = useRef<any>(null);
  const appState = useRef(AppState.currentState);

  // Reset navigation to Home when app is closed (backgrounded) and opened again (foregrounded)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        setActiveTab("Home");
        scrollViewRef.current?.scrollTo({ x: 0, animated: false });
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Check for OTA updates on app mount
  useEffect(() => {
    // Expose a global method to manually trigger/preview the OTA update modal
    (global as any).triggerOTAUpdateModal = () => {
      setUpdateAvailable(true);
    };

    const checkUpdatesTimer = setTimeout(async () => {
      if (__DEV__) {
        // Automatically show simulated updates popup in dev mode for UI review
        setUpdateAvailable(true);
        return;
      }
      try {
        console.log("[App] Checking for production OTA updates...");
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          console.log("[App] Production OTA update found, raising popup!");
          setUpdateAvailable(true);
        } else {
          console.log("[App] No production OTA updates available.");
        }
      } catch (e) {
        console.warn("OTA update check failed:", e);
      }
    }, 3000);

    return () => {
      clearTimeout(checkUpdatesTimer);
      delete (global as any).triggerOTAUpdateModal;
    };
  }, []);

  const handleDownloadUpdate = async () => {
    setIsDownloadingUpdate(true);
    setUpdateError(null);
    try {
      if (__DEV__) {
        // Simulate download delay in dev mode
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setUpdateDownloaded(true);
        return;
      }
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
      if (__DEV__) {
        // Simulates app reload by resetting modal states in dev mode
        setUpdateDownloaded(false);
        setUpdateAvailable(false);
        return;
      }
      await Updates.reloadAsync();
    } catch (e) {
      console.error("Failed to reload app:", e);
    }
  };

  const closeUpdateModal = () => {
    setUpdateAvailable(false);
    setIsDownloadingUpdate(false);
    setUpdateDownloaded(false);
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
      
      {__DEV__ && !updateAvailable && !isDownloadingUpdate && !updateDownloaded && (
        <TouchableOpacity 
          delayPressIn={0} 
          style={styles.devFloatingBtn} 
          onPress={() => setUpdateAvailable(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="cloud-refresh" size={18} color="#000" />
          <Text style={styles.devFloatingBtnText}>Preview OTA</Text>
        </TouchableOpacity>
      )}
      
      <NavigationContainer ref={navigationRef}>
        <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
          <Tab.Screen name="Main">
            {() => (
              <View style={{ flex: 1, backgroundColor: "#121212" }}>
                <ScrollView
                  ref={scrollViewRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                    const tabs: ('Home' | 'Search' | 'Library')[] = ['Home', 'Search', 'Library'];
                    setActiveTab(tabs[index]);
                  }}
                  style={{ flex: 1 }}
                >
                  <View style={{ width: screenWidth, flex: 1 }}>
                    <HomePage onRequireAuth={handleRequireAuth} />
                  </View>
                  <View style={{ width: screenWidth, flex: 1 }}>
                    <SearchPage onRequireAuth={handleRequireAuth} />
                  </View>
                  <View style={{ width: screenWidth, flex: 1 }}>
                    <LibraryPage onRequireAuth={handleRequireAuth} />
                  </View>
                </ScrollView>

                {/* Bottom Tab Bar */}
                <View style={styles.tabBarStyle}>
                  {(['Home', 'Search', 'Library'] as const).map((tab) => {
                    const isActive = activeTab === tab;
                    const iconName = tab === 'Home' ? 'home' : tab === 'Search' ? 'magnify' : 'playlist-music';
                    const color = isActive ? "#1DB954" : "rgba(255, 255, 255, 0.5)";
                    return (
                      <TouchableOpacity
                        delayPressIn={0}
                        key={tab}
                        onPress={() => {
                          setActiveTab(tab);
                          const index = tab === 'Home' ? 0 : tab === 'Search' ? 1 : 2;
                          scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
                        }}
                        style={styles.tabBarButton}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name={iconName} color={color} size={24} />
                        <Text style={[styles.tabBarLabel, { color }]}>{tab}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </Tab.Screen>
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
                  <TouchableOpacity delayPressIn={0} style={styles.secondaryButton} onPress={closeUpdateModal}>
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
                  <TouchableOpacity delayPressIn={0} style={styles.secondaryButton} onPress={closeUpdateModal}>
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
  devFloatingBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 30,
    right: 16,
    backgroundColor: "#1DB954",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  devFloatingBtnText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "bold",
    marginLeft: 6,
  },
  tabBarStyle: {
    backgroundColor: "#181818",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    height: Platform.OS === 'ios' ? 76 : 60,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  tabBarButton: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
});
