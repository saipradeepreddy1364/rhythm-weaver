import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, ActivityIndicator, SafeAreaView, StatusBar, Platform } from 'react-native'
import React, { useRef, useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Updates from "expo-updates";

// Import Providers (these will be migrated to React Native next)
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { PlayerProvider, usePlayer } from "../src/context/PlayerContext";
import { LibraryProvider } from "../src/context/LibraryContext";

// Import Native Screens / Components (these will be migrated next)
import HomePage from "../src/pages/HomePage";
import SearchPage from "../src/pages/SearchPage";
import LibraryPage from "../src/pages/LibraryPage";
import { MiniPlayer } from "../src/components/MiniPlayer";
import { FullPlayer } from "../src/components/FullPlayer";
import { AuthModal } from "../src/components/AuthModal";

const Tab = createBottomTabNavigator();

function AppContent() {
  const { currentSong, showPlayer } = usePlayer();
  const { user, checkAuth } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
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

      {/* Floating Mini Player (native version of MiniPlayer component) */}
      {currentSong && <MiniPlayer onRequireAuth={handleRequireAuth} />}

      {/* Full screen overlay player (native version of FullPlayer component) */}
      {showPlayer && <FullPlayer onRequireAuth={handleRequireAuth} />}

      {/* Authentication Modal */}
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />

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
