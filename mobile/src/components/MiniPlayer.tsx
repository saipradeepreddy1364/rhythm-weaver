import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native'
import React, { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePlayer } from "../context/PlayerContext";
import { LikeButton } from "./LikeButton";

interface MiniPlayerProps {
  onRequireAuth?: () => void;
}

export function MiniPlayer({ onRequireAuth }: MiniPlayerProps) {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    progress,
    duration,
    setShowPlayer,
    addToQueue,
  } = usePlayer();

  const [queuedFlash, setQueuedFlash] = useState(false);

  if (!currentSong) return null;

  const totalDuration =
    duration && isFinite(duration) && duration > 1
      ? duration
      : (currentSong.duration && currentSong.duration > 1 ? currentSong.duration : 0);

  const pct = totalDuration > 0 ? Math.min(100, (progress / totalDuration) * 100) : 0;

  const handleAddToQueue = () => {
    addToQueue(currentSong);
    setQueuedFlash(true);
    setTimeout(() => setQueuedFlash(false), 2000);
  };

  return (
    <View style={styles.floatingContainer}>
      <View style={styles.pill}>
        {/* Album art with play/pause touch overlay */}
        <View style={styles.artContainer}>
          {currentSong.albumArt ? (
            <Image
              source={{ uri: currentSong.albumArt }}
              style={styles.albumArt}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
              <MaterialCommunityIcons name="music" size={16} color="#000" />
            </View>
          )}

          <TouchableOpacity delayPressIn={0} onPress={togglePlay} style={styles.playOverlay} activeOpacity={0.8}>
            <MaterialCommunityIcons
              name={isPlaying ? "pause" : "play"}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        {/* Song info (taps to expand full player) */}
        <TouchableOpacity delayPressIn={0} style={styles.infoButton} onPress={() => setShowPlayer(true)} activeOpacity={0.8}>
          <Text style={styles.titleText} numberOfLines={1}>
            {currentSong.title}
          </Text>
          <Text style={styles.artistText} numberOfLines={1}>
            {currentSong.artist}
          </Text>
        </TouchableOpacity>

        {/* Add to Queue */}
        <TouchableOpacity delayPressIn={0} onPress={handleAddToQueue} style={[ styles.circleBtn, { backgroundColor: queuedFlash ? "rgba(29,185,84,0.2)" : "rgba(255,255,255,0.08)", } ]} activeOpacity={0.7}>
          <MaterialCommunityIcons
            name="playlist-play"
            size={18}
            color={queuedFlash ? "#1DB954" : "rgba(255,255,255,0.6)"}
          />
        </TouchableOpacity>

        {/* Like button */}
        <View style={styles.likeBtnWrapper}>
          <LikeButton
            song={currentSong}
            onRequireAuth={onRequireAuth}
            size="sm"
          />
        </View>

        {/* Sleek horizontal progress bar at the very bottom of the pill */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${pct}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: "absolute",
    bottom: 72, // Above bottom tab navigator (60px) + spacing
    left: 12,
    right: 12,
    zIndex: 99,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(38, 28, 32, 0.97)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 36,
    paddingHorizontal: 10,
    height: 64,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
    overflow: "hidden", // clip the progress bar at the bottom
    position: "relative",
  },
  artContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#282828",
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumArtPlaceholder: {
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoButton: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
    justifyContent: "center",
  },
  titleText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
  },
  artistText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 2,
  },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  likeBtnWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#e8b4bc", // Accent color matching web theme
  },
});