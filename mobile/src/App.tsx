import { View, StyleSheet, SafeAreaView, StatusBar, Dimensions, ScrollView, Text, TouchableOpacity, Platform } from 'react-native'
import React, { useState, useEffect, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import TrackPlayer from "react-native-track-player";

// Register playback service for background lock screen controls
TrackPlayer.registerPlaybackService(() => async () => {});

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

const Stack = createStackNavigator();

function AppContent() {
  const { currentSong, showPlayer } = usePlayer();
  const { user, checkAuth } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [activeTab, setActiveTab] = useState<'Home' | 'Search' | 'Library'>('Home');
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = Dimensions.get('window');
  const navigationRef = useRef<any>(null);

  const handleRequireAuth = () => {
    if (!user) setShowAuthModal(true);
  };

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
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main">
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
          </Stack.Screen>
        </Stack.Navigator>
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
    <PaperProvider>
      <AuthProvider>
        <PlayerProvider>
          <LibraryProvider>
            <AppContent />
          </LibraryProvider>
        </PlayerProvider>
      </AuthProvider>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
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