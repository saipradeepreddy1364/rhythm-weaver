import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface NotFoundProps {
  onGoBack?: () => void;
}

export function NotFound({ onGoBack }: NotFoundProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconWrapper}>
          <MaterialCommunityIcons name="music-note-off" size={36} color="rgba(255,255,255,0.3)" />
        </View>
        <Text style={styles.title}>404</Text>
        <Text style={styles.subtitle}>Page not found</Text>
        <Text style={styles.description}>
          The page you're looking for doesn't exist.
        </Text>
        <TouchableOpacity delayPressIn={0} onPress={onGoBack} style={styles.button} activeOpacity={0.7}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default NotFound;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#121212",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 24,
  },
  title: {
    fontSize: 60,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginBottom: 32,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: "#1DB954",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#000",
  },
});