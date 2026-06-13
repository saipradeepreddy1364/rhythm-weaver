import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image } from 'react-native'
import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import type { Song } from "@/data/songs";

interface LikeButtonProps {
  song: Song;
  onRequireAuth?: () => void;
  size?: "sm" | "md" | "lg";
}

export function LikeButton({
  song,
  onRequireAuth,
  size = "md",
}: LikeButtonProps) {
  const { user } = useAuth();
  const { isLiked, toggleLike } = useLibrary();
  const [animating, setAnimating] = useState(false);

  const liked = isLiked(song.id);

  const sizeMap = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const handlePress = async () => {
    if (!user) {
      onRequireAuth?.();
      return;
    }

    setAnimating(true);
    await toggleLike(song);
    setTimeout(() => setAnimating(false), 400);
  };

  return (
    <TouchableOpacity delayPressIn={0}
      onPress={handlePress}
      activeOpacity={0.7}
      style={[
        styles.button,
        animating && styles.animated
      ]}
    >
      <MaterialCommunityIcons
        name={liked ? "heart" : "heart-outline"}
        size={sizeMap[size]}
        color={liked ? "#f43f5e" : "rgba(255,255,255,0.4)"}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  animated: {
    transform: [{ scale: 1.2 }],
  },
});