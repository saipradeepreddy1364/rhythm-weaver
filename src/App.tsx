import { View, StyleSheet, SafeAreaView, StatusBar, Dimensions, ScrollView, Text, TouchableOpacity, Platform, useWindowDimensions, DeviceEventEmitter } from 'react-native'
import React, { useState, useEffect, useRef, useCallback } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as SplashScreen from "expo-splash-screen";
import TrackPlayer from "react-native-track-player";

// Register playback service for background lock screen controls
TrackPlayer.registerPlaybackService(() => async () => {});

// Keep native splash screen visible until React Native is mounted and ready
SplashScreen.preventAutoHideAsync().catch(() => {});

// Import Providers
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PlayerProvider, usePlayer } from "./context/PlayerContext";
import { LibraryProvider } from "./context/LibraryContext";

// Import Native Screens / Components
import HomePage from "./pages/HomePage";
import SearchPage from "./pages/SearchPage";
import LibraryPage from "./pages/LibraryPage";
import { MiniPlayer } from "./components/MiniPlayer";
import { FullPlayer } from "./components/FullPlayer";
import { AuthModal } from "./components/AuthModal";

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
    SplashScreen.hideAsync().catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0d0d', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#E91E63" style={{ marginBottom: 16 }} />
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>App crashed on render</Text>
          <ScrollView style={{ maxHeight: 300, width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, marginBottom: 20 }}>
            <Text style={{ color: '#E91E63', fontFamily: 'monospace', fontSize: 12 }}>{this.state.error?.toString()}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontSize: 10, marginTop: 8 }}>{this.state.error?.stack}</Text>
          </ScrollView>
          <TouchableOpacity
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

  const [activeTab, setActiveTab] = useState<'Home' | 'Search' | 'Library'>('Home');
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();
  const navigationRef = useRef<any>(null);

  // Initialization state — keeps a dark screen visible while we check connectivity
  const [isInitializing, setIsInitializing] = useState(true);
  // Tracks whether the device is offline so we can render the correct layout
  const [isOffline, setIsOffline] = useState(false);

  const setParentScroll = useCallback((enabled: boolean) => {
    scrollViewRef.current?.setNativeProps({ scrollEnabled: enabled });
  }, []);

  const handleRequireAuth = () => {
    if (!user) setShowAuthModal(true);
  };

  // Consolidated init: Auth → Connectivity check → set correct state → hide splash
  useEffect(() => {
    const initialize = async () => {
      // 1. Auth check (non-blocking if it fails)
      try { await checkAuth(); } catch {}

      // 2. Connectivity check — 2s timeout
      let offline = false;
      try {
        await Promise.race([
          fetch("https://clients3.google.com/generate_204", { method: "HEAD" }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
        ]);
      } catch {
        offline = true;
      }

      // 3. Set correct state BEFORE revealing the UI
      if (offline) {
        setIsOffline(true);
        setActiveTab('Library');
      }

      // 4. Un-hide the app (the correct layout is already in state)
      setIsInitializing(false);

      // 5. Hide native splash screen after one frame so the dark background is visible
      requestAnimationFrame(() => {
        SplashScreen.hideAsync().catch(() => {});
      });
    };

    initialize();

    const interval = setInterval(checkAuth, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to global tab navigation event requests
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("NAVIGATE_TO_TAB", (tabName: 'Home' | 'Search' | 'Library') => {
      setActiveTab(tabName);
      const index = tabName === 'Home' ? 0 : tabName === 'Search' ? 1 : 2;
      scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    });
    return () => { subscription.remove(); };
  }, [screenWidth]);

  // While initializing keep a plain dark screen visible (native splash still covers it)
  if (isInitializing) {
    return <View style={{ flex: 1, backgroundColor: "#0d0d0d" }} />;
  }

  // ── OFFLINE MODE: render ONLY the Downloads page, no tab bar, no other pages ──
  if (isOffline) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />
        <NavigationContainer ref={navigationRef} theme={DarkTheme}>
          <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
            <Tab.Screen name="Main">
              {() => (
                <View style={{ flex: 1, backgroundColor: "#0d0d0d" }}>
                  <LibraryPage onRequireAuth={handleRequireAuth} initialTab="downloads" />
                  {currentSong && <MiniPlayer onRequireAuth={handleRequireAuth} />}
                  {showPlayer && <FullPlayer onRequireAuth={handleRequireAuth} />}
                  <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
                </View>
              )}
            </Tab.Screen>
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaView>
    );
  }

  // ── ONLINE MODE: full 3-tab layout ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />

      <NavigationContainer ref={navigationRef} theme={DarkTheme}>
        <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
          <Tab.Screen name="Main">
            {() => (
              <View style={{ flex: 1, backgroundColor: "#0d0d0d" }}>
                <ScrollView
                  ref={scrollViewRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const index = screenWidth > 0 ? Math.round(e.nativeEvent.contentOffset.x / screenWidth) : 0;
                    const tabs: ('Home' | 'Search' | 'Library')[] = ['Home', 'Search', 'Library'];
                    setActiveTab(tabs[index]);
                  }}
                  style={{ flex: 1 }}
                >
                  <View style={{ width: screenWidth, flex: 1 }}>
                    <HomePage onRequireAuth={handleRequireAuth} setParentScrollEnabled={setParentScroll} />
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

      {/* Floating Mini Player */}
      {currentSong && <MiniPlayer onRequireAuth={handleRequireAuth} />}

      {/* Full screen overlay player */}
      {showPlayer && <FullPlayer onRequireAuth={handleRequireAuth} />}

      {/* Authentication Modal */}
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: "#0d0d0d" }}>
      <ErrorBoundary>
        <PaperProvider>
          <AuthProvider>
            <PlayerProvider>
              <LibraryProvider>
                <AppContent />
              </LibraryProvider>
            </PlayerProvider>
          </AuthProvider>
        </PaperProvider>
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d0d0d",
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