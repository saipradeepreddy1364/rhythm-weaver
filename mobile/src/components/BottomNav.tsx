import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type Page = "home" | "search" | "library";

interface BottomNavProps {
  page: Page;
  onNavigate: (page: Page) => void;
}

const tabs: { key: Page; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "search", label: "Search", icon: "magnify" },
  { key: "library", label: "Library", icon: "playlist-music" },
];

export function BottomNav({ page, onNavigate }: BottomNavProps) {
  return (
    <View style={styles.navContainer}>
      {tabs.map(({ key, label, icon }) => {
        const active = page === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onNavigate(key)}
            style={styles.navButton}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={icon as any}
              size={22}
              color={active ? "#1DB954" : "rgba(255,255,255,0.4)"}
            />
            <Text
              style={[
                styles.navLabel,
                { color: active ? "#1DB954" : "rgba(255,255,255,0.4)" }
              ]}
            >
              {label}
            </Text>
            {active && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10,10,10,0.97)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  navButton: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    paddingTop: 4,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 2,
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    width: 32,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#1DB954",
  },
});