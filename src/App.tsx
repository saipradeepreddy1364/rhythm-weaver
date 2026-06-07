import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native'
import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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

function AppContent() {
  const { currentSong, showPlayer } = usePlayer();
  const { user, checkAuth } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

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
      
      <NavigationContainer>
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
          })}
        >
          <Tab.Screen
            name="Home"
            options={{
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="home" color={color} size={size} />
              ),
            }}
          >
            {() => <HomePage onRequireAuth={handleRequireAuth} />}
          </Tab.Screen>
          
          <Tab.Screen
            name="Search"
            options={{
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="magnify" color={color} size={size} />
              ),
            }}
          >
            {() => <SearchPage onRequireAuth={handleRequireAuth} />}
          </Tab.Screen>

          <Tab.Screen
            name="Library"
            options={{
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="playlist-music" color={color} size={size} />
              ),
            }}
          >
            {() => <LibraryPage onRequireAuth={handleRequireAuth} />}
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
});