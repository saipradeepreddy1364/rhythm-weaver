import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native'
import React, { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Song, formatDuration } from "../data/songs";
import { usePlayer } from "../context/PlayerContext";
import { LikeButton } from "./LikeButton";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";

interface SongRowProps {
  song: Song;
  queue?: Song[];
  onRequireAuth?: () => void;
  fromLibrary?: boolean;
}

export function SongRow({ song, queue, onRequireAuth, fromLibrary }: SongRowProps) {
  const { playSong, currentSong, isPlaying, togglePlay, addToQueue } = usePlayer();
  const isActive = currentSong?.id === song.id;
  const [queued, setQueued] = useState(false);

  const handleClick = () => {
    if (isActive) {
      togglePlay();
    } else {
      playSong(song, queue, fromLibrary);
    }
  };

  const handleAddToQueue = () => {
    addToQueue(song);
    setQueued(true);
    setTimeout(() => setQueued(false), 2000);
  };

  const handleDownload = () => {
    const downloadUrl = `https://musicbackend-xg4u.onrender.com/api/downloads/${song.id}/audio`;
    Linking.openURL(downloadUrl).catch((err: any) => {
      console.warn("Failed to open download link:", err);
    });
  };

  return (
    <TouchableOpacity
      style={[
        styles.rowContainer,
        isActive && styles.activeContainer
      ]}
      onPress={handleClick}
      activeOpacity={0.7}
    >
      {/* Album art */}
      <View style={styles.albumArtContainer}>
        {song.albumArt ? (
          <Image
            source={{ uri: song.albumArt }}
            style={styles.albumArt}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.albumArt, styles.albumArtPlaceholder]}>
            <Text style={styles.placeholderIcon}>🎵</Text>
          </View>
        )}

        {/* Playing wave overlay */}
        {isActive && isPlaying && (
          <View style={styles.playingOverlay}>
            <MaterialCommunityIcons name="volume-high" size={16} color="#1DB954" />
          </View>
        )}
      </View>

      {/* Song info */}
      <View style={styles.infoContainer}>
        <Text
          style={[styles.titleText, isActive ? styles.activeTitle : styles.normalTitle]}
          numberOfLines={1}
        >
          {song.title}
        </Text>
        <Text style={styles.artistText} numberOfLines={1}>
          {song.artist}
          {song.movie ? ` • ${song.movie}` : ""}
          {song.duration ? ` · ${formatDuration(song.duration)}` : ""}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actionsContainer}>
        {/* Add to Queue */}
        <TouchableOpacity
          onPress={handleAddToQueue}
          style={styles.actionButton}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="playlist-plus"
            size={20}
            color={queued ? "#1DB954" : "rgba(255,255,255,0.4)"}
          />
        </TouchableOpacity>

        {/* Like Button */}
        <View style={styles.likeButtonWrapper}>
          <LikeButton
            song={song}
            onRequireAuth={onRequireAuth}
            size="sm"
          />
        </View>

        {/* Download Song */}
        <TouchableOpacity
          onPress={handleDownload}
          style={styles.actionButton}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="download"
            size={18}
            color="rgba(255,255,255,0.4)"
          />
        </TouchableOpacity>

        {/* Add to Playlist Menu */}
        <AddToPlaylistMenu song={song} onRequireAuth={onRequireAuth} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 4,
    backgroundColor: "transparent",
  },
  activeContainer: {
    backgroundColor: "rgba(29, 185, 84, 0.1)",
  },
  albumArtContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#282828",
    position: "relative",
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumArtPlaceholder: {
    backgroundColor: "#ff7a00", // Fallback layout gradient start
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: {
    fontSize: 16,
    color: "#fff",
  },
  playingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  titleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  normalTitle: {
    color: "rgba(255, 255, 255, 0.9)",
  },
  activeTitle: {
    color: "#1DB954",
  },
  artistText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.4)",
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  likeButtonWrapper: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});