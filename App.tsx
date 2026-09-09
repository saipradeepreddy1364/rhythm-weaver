import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, ActivityIndicator, SafeAreaView, StatusBar, Platform, Modal, AppState, AppStateStatus, Dimensions, useWindowDimensions, Animated, Alert, DeviceEventEmitter } from 'react-native'
import React, { useRef, useState, useEffect, useCallback } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import * as SplashScreen from "expo-splash-screen";
import TrackPlayer from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { PlaybackService } from "./playbackService";
import { localStorage } from "./src/lib/storage";

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
import VideosPage from "./src/pages/VideosPage";
import LibraryPage from "./src/pages/LibraryPage";
import { MiniPlayer } from "./src/components/MiniPlayer";
import { FullPlayer } from "./src/components/FullPlayer";
import { EqualizerModal } from "./src/components/EqualizerModal";
import { GlobalFolderPickerModal } from "./src/components/GlobalFolderPickerModal";

const Tab = createBottomTabNavigator();

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("App render error:", error, errorInfo);
    // Force hide the splash screen so the crash view is visible
    SplashScreen.hideAsync().catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#E91E63" style={{ marginBottom: 16 }} />
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>App crashed on render</Text>
          <ScrollView style={{ maxHeight: 300, width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, marginBottom: 20 }}>
            <Text style={{ color: '#E91E63', fontFamily: 'monospace', fontSize: 12 }}>{this.state.error?.toString()}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontSize: 10, marginTop: 8 }}>{this.state.error?.stack}</Text>
          </ScrollView>
          <TouchableOpacity delayPressIn={0}
            style={{
              backgroundColor: '#1DB954',
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 25,
            }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 15 }}>Retry</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { currentSong, showPlayer } = usePlayer();
  const { user, checkAuth } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [activeTab, setActiveTabState] = useState<'Home' | 'Search' | 'Videos' | 'Library'>('Home');
  const navigationRef = useRef<any>(null);
  const appState = useRef(AppState.currentState);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const wasOfflineRef = useRef(false);

  const setActiveTab = useCallback((tabName: 'Home' | 'Search' | 'Videos' | 'Library') => {
    setActiveTabState(tabName);
  }, []);

  // Listen to network status for auto-redirection to Downloads and auto-reconnect reload
  useEffect(() => {
    const handleNetworkState = (state: any) => {
      const isNoNet = state.isConnected === false || state.isInternetReachable === false;
      if (isNoNet) {
        wasOfflineRef.current = true;
        setIsOfflineMode(true);
        setActiveTabState("Library");
        DeviceEventEmitter.emit("NAVIGATE_TO_DOWNLOADS");
      } else {
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false;
          setIsOfflineMode(false);
          DeviceEventEmitter.emit("NETWORK_RECONNECTED");
        } else {
          setIsOfflineMode(false);
        }
      }
    };

    const unsubscribe = NetInfo.addEventListener(handleNetworkState);
    NetInfo.fetch().then(handleNetworkState);

    return () => {
      unsubscribe();
    };
  }, []);

  // Track appState changes without force-resetting the active tab to Home on app resume/unminimize
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const [isRestarting, setIsRestarting] = useState(false);

  // Check for OTA updates on app mount
  useEffect(() => {
    // Expose a global method to manually trigger/preview the OTA update modal
    (global as any).triggerOTAUpdateModal = async () => {
      setIsCheckingUpdate(true);
      setUpdateError(null);
      try {
        console.log("[App] Manual OTA update check requested...");
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          setUpdateAvailable(true);
        } else {
          Alert.alert("Up to Date", "You are already running the latest version of Medley.");
        }
      } catch (e: any) {
        console.warn("Manual OTA update check failed:", e);
        if (__DEV__) {
          // Fallback to simulated popup in dev mode
          setUpdateAvailable(true);
        } else {
          Alert.alert("Check Failed", e.message || "Failed to check for updates. Please try again later.");
        }
      } finally {
        setIsCheckingUpdate(false);
      }
    };

    // Check for OTA updates 1.5s after launch
    const checkUpdatesTimer = setTimeout(async () => {
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
    }, 1500);

    return () => {
      clearTimeout(checkUpdatesTimer);
      delete (global as any).triggerOTAUpdateModal;
    };
  }, []);

  const handleUpdateAndRestart = async () => {
    if (isDownloadingUpdate) return;
    setIsDownloadingUpdate(true);
    setUpdateError(null);
    try {
      try {
        await Updates.fetchUpdateAsync();
      } catch (e) {
        if (!__DEV__) throw e;
        // In dev mode, simulate the download delay
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      // Immediately reload after download — no extra step needed
      try {
        await Updates.reloadAsync();
      } catch (e) {
        if (__DEV__) {
          setUpdateAvailable(false);
          setIsDownloadingUpdate(false);
        } else {
          throw e;
        }
      }
    } catch (e: any) {
      setUpdateError(e.message || "Failed to update");
      setIsDownloadingUpdate(false);
    }
  };


  const closeUpdateModal = () => {
    setUpdateAvailable(false);
    setIsDownloadingUpdate(false);
    setUpdateDownloaded(false);
  };

  const handleTabPress = useCallback((tabName: 'Home' | 'Search' | 'Videos' | 'Library') => {
    setActiveTab(tabName);
  }, []);

  const handleRequireAuth = useCallback(() => {
    // Guest mode enabled - no auth required
  }, []);

  const [showEqualizer, setShowEqualizer] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("OPEN_EQUALIZER_MODAL", () => {
      setShowEqualizer(true);
    });
    return () => sub.remove();
  }, []);

  // Listen to global tab navigation requests
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("NAVIGATE_TO_TAB", (tabName: 'Home' | 'Search' | 'Videos' | 'Library') => {
      setActiveTab(tabName);
    });
    return () => sub.remove();
  }, []);

  // Flush pending storage writes to disk before app process is suspended or killed
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        localStorage.flush().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const [isSystemPip, setIsSystemPip] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [currentAppState, setCurrentAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      setCurrentAppState(nextState);
    });
    return () => sub.remove();
  }, []);

  // Listen to native Android Picture-in-Picture mode changes
  useEffect(() => {
    const pipSub = DeviceEventEmitter.addListener("ON_PIP_MODE_CHANGED", (data: any) => {
      if (data && typeof data.isInPictureInPictureMode === "boolean") {
        setIsSystemPip(data.isInPictureInPictureMode);
      }
    });
    return () => pipSub.remove();
  }, []);

  // Listen to video active state emitted from VideosPage
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("VIDEO_ACTIVE_CHANGED", (active: boolean) => {
      setIsVideoActive(!!active);
    });
    return () => sub.remove();
  }, []);

  // Synchronously compute PiP state from native event OR window dimensions/appState to prevent 1ms bottom bar blink
  const isAppBackgrounded = currentAppState === "inactive" || currentAppState === "background";
  const isSystemPipActive =
    isSystemPip ||
    (isVideoActive && isAppBackgrounded) ||
    (windowWidth > 0 &&
      windowHeight > 0 &&
      (windowHeight < 320 || (windowWidth / windowHeight > 1.2 && windowHeight < 400)));

  // Check auth once on mount
  useEffect(() => {
    checkAuth();
    const interval = setInterval(checkAuth, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaView style={[styles.container, isSystemPipActive && { backgroundColor: "#000" }]}>
      {!isSystemPipActive && <StatusBar barStyle="light-content" backgroundColor="#121212" />}
      {isOfflineMode && !isSystemPipActive && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons name="wifi-off" size={16} color="#000" style={{ marginRight: 6 }} />
          <Text style={styles.offlineBannerText}>No Internet Connection — Showing Downloaded Songs</Text>
        </View>
      )}
      
      {__DEV__ && !isSystemPipActive && !updateAvailable && !isDownloadingUpdate && !updateDownloaded && (
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
        <Tab.Navigator tabBar={() => null} screenOptions={{ headerShown: false }}>
          <Tab.Screen name="Main">
            {() => (
              <View style={{ flex: 1, backgroundColor: isSystemPipActive ? "#000" : "#121212" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flex: 1, display: activeTab === 'Home' && !isSystemPipActive ? 'flex' : 'none' }}>
                    <HomePage onRequireAuth={handleRequireAuth} />
                  </View>

                  <View style={{ flex: 1, display: activeTab === 'Search' && !isSystemPipActive ? 'flex' : 'none' }}>
                    <SearchPage onRequireAuth={handleRequireAuth} />
                  </View>

                  <View style={{ flex: 1, display: activeTab === 'Library' && !isSystemPipActive ? 'flex' : 'none' }}>
                    <LibraryPage onRequireAuth={handleRequireAuth} />
                  </View>

                  {/* Single Persistent Videos Page Instance (Renders Feed on Videos tab, and mini floating player overlay on other tabs) */}
                  <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                    <VideosPage onRequireAuth={handleRequireAuth} activeTab={activeTab} isSystemPip={isSystemPipActive} />
                  </View>
                </View>

                {/* Bottom Tab Bar (Hidden in PiP mode) */}
                {!isSystemPipActive && (
                  <View style={styles.tabBarStyle}>
                    {(['Home', 'Search', 'Videos', 'Library'] as const).map((tab) => {
                      const isActive = activeTab === tab;
                      const iconName = tab === 'Home' ? 'home' : tab === 'Search' ? 'magnify' : tab === 'Videos' ? 'video' : 'playlist-music';
                      const color = isActive ? "#1DB954" : "rgba(255, 255, 255, 0.5)";
                      return (
                        <TouchableOpacity
                          delayPressIn={0}
                          key={tab}
                          onPress={() => handleTabPress(tab as any)}
                          style={styles.tabBarButton}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name={iconName as any} color={color} size={24} />
                          <Text style={[styles.tabBarLabel, { color }]}>{tab}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>

      {/* Floating Mini Player (hidden when Video is active, on Videos tab, or in PiP mode) */}
      {!isSystemPipActive && !isVideoActive && currentSong && activeTab !== 'Videos' && (
        <MiniPlayer onRequireAuth={handleRequireAuth} />
      )}

      {/* Full screen overlay player (native version of FullPlayer component) */}
      {!isSystemPipActive && showPlayer && <FullPlayer onRequireAuth={handleRequireAuth} />}

      {/* Global Sound Equalizer & Bass Adjuster Modal */}
      {!isSystemPipActive && <EqualizerModal visible={showEqualizer} onClose={() => setShowEqualizer(false)} />}

      {/* Premium OTA Update Modal */}
      <Modal
        visible={isCheckingUpdate || updateAvailable || isDownloadingUpdate}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <MaterialCommunityIcons 
                name={isCheckingUpdate ? "cloud-search" : updateDownloaded ? "check-circle" : isDownloadingUpdate ? "cloud-download" : "rocket-launch"} 
                size={48} 
                color="#1DB954" 
              />
            </View>

            <Text style={styles.modalTitle}>
              {isCheckingUpdate ? "Checking Updates..." : isDownloadingUpdate ? "Applying Update..." : "Update Available!"}
            </Text>

            <Text style={styles.modalDescription}>
              {isCheckingUpdate
                ? "Connecting to the update server to check for new versions of Medley..."
                : isDownloadingUpdate
                  ? "Downloading and installing the latest version. The app will restart automatically."
                  : "A new version of Medley is available with improvements and new features. Tap below to update and restart instantly."}
            </Text>

            {updateError && (
              <Text style={styles.errorText}>Error: {updateError}</Text>
            )}

            <View style={styles.modalButtonGroup}>
              {isCheckingUpdate ? (
                <View style={styles.progressContainer}>
                  <ActivityIndicator size="small" color="#1DB954" style={{ marginRight: 8 }} />
                  <Text style={styles.progressText}>Checking server...</Text>
                </View>
              ) : isDownloadingUpdate ? (
                <View style={styles.progressContainer}>
                  <ActivityIndicator size="small" color="#1DB954" style={{ marginRight: 8 }} />
                  <Text style={styles.progressText}>Downloading & restarting...</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    delayPressIn={0}
                    disabled={isDownloadingUpdate}
                    style={[styles.primaryButton, isDownloadingUpdate && { opacity: 0.6 }]}
                    onPress={handleUpdateAndRestart}
                  >
                    <Text style={styles.primaryButtonText}>⚡ Update & Restart</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    delayPressIn={0}
                    disabled={isDownloadingUpdate}
                    style={[styles.secondaryButton, isDownloadingUpdate && { opacity: 0.6 }]}
                    onPress={closeUpdateModal}
                  >
                    <Text style={styles.secondaryButtonText}>Later</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Global Root Folder Picker Modal (resolves Android nested modal collision) */}
      <GlobalFolderPickerModal />
    </SafeAreaView>
  );
}

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const splashHidden = useRef(false);

  useEffect(() => {
    // Start storage initialization
    const prepareApp = async () => {
      try {
        // Proactively wake up Render backend in the background to prevent cold starts
        fetch("https://musicbackend-xg4u.onrender.com/api/songs/health").catch(() => {});

        await localStorage.ensureInitialized();
      } catch (e) {
        console.warn("Storage init error:", e);
      } finally {
        setAppReady(true);
      }
    };
    prepareApp();
  }, []);

  useEffect(() => {
    if (!appReady) return;

    let timerDone = false;
    let prefetchDone = false;

    const maybeHideSplash = () => {
      if ((timerDone || prefetchDone) && !splashHidden.current) {
        splashHidden.current = true;
        SplashScreen.hideAsync().catch(() => {});
      }
    };

    // 1. Minimum 5 seconds timer
    const timer = setTimeout(() => {
      timerDone = true;
      maybeHideSplash();
    }, 5000);

    // 2. Data prefetch tracker
    if (homePagePrefetcher.ready) {
      prefetchDone = true;
      maybeHideSplash();
    }

    const unsub = homePagePrefetcher.subscribe(() => {
      if (homePagePrefetcher.ready) {
        prefetchDone = true;
        maybeHideSplash();
      }
    });

    // Start prefetching home sections immediately in the background
    homePagePrefetcher.start();

    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [appReady]);

  const handleRootLayout = useCallback(() => {
    // Native splash screen is held visible by the 5-second timer, do nothing on layout
  }, []);

  if (!appReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }} onLayout={handleRootLayout}>
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
    </ErrorBoundary>
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
