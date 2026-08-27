import { View, Text, StyleSheet, TouchableOpacity, Image, Linking, ActivityIndicator, Modal, DeviceEventEmitter } from 'react-native'
import React, { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Song, formatDuration } from "../data/songs";
import { usePlayer } from "../context/PlayerContext";
import { LikeButton } from "./LikeButton";
import { useLibrary } from "../context/LibraryContext";

interface SongRowProps {
  song: Song;
  queue?: Song[];
  onRequireAuth?: () => void;
  fromLibrary?: boolean;
  hideActions?: boolean;
}

export function SongRow({ song, queue, onRequireAuth, fromLibrary, hideActions }: SongRowProps) {
  const { playSong, currentSong, isPlaying, togglePlay, addToQueue } = usePlayer();
  const { downloadSong, deleteDownloadedSong, isDownloaded, downloadingIds } = useLibrary();
  const isActive = currentSong?.id === song.id;
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [queued, setQueued] = useState(false);
  const downloaded = isDownloaded(song.id);
  const downloading = downloadingIds.includes(song.id);

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
    if (downloading) return;
    if (downloaded) {
      deleteDownloadedSong(song.id);
    } else {
      downloadSong(song);
    }
  };

  return (
    <>
      <TouchableOpacity delayPressIn={0} style={[ styles.rowContainer, isActive && styles.activeContainer ]} onPress={handleClick} activeOpacity={0.7}>
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

        {/* 3-Dots Options Menu Button */}
        {!hideActions && (
          <TouchableOpacity
            delayPressIn={0}
            onPress={(e) => {
              e.stopPropagation();
              setShowOptionsModal(true);
            }}
            style={styles.actionButton}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="dots-vertical" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* 3-Dots Song Options Modal */}
      <Modal
        visible={showOptionsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <TouchableOpacity
          delayPressIn={0}
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowOptionsModal(false)}
        >
          <TouchableOpacity
            delayPressIn={0}
            style={styles.optionsDialog}
            activeOpacity={1}
            onPress={() => {}}
          >
            {/* Header info */}
            <View style={styles.optionsHeader}>
              {song.albumArt ? (
                <Image source={{ uri: song.albumArt }} style={styles.optionsThumb} />
              ) : (
                <View style={[styles.optionsThumb, { backgroundColor: "#282828", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ fontSize: 18 }}>🎵</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                <Text style={styles.optionsTitle} numberOfLines={1}>{song.title}</Text>
                <Text style={styles.optionsArtist} numberOfLines={1}>{song.artist}</Text>
              </View>
              <TouchableOpacity delayPressIn={0} onPress={() => setShowOptionsModal(false)} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            <View style={styles.optionsList}>
              {/* Option 1: Like / Add to Folders */}
              <TouchableOpacity
                delayPressIn={0}
                onPress={() => {
                  setShowOptionsModal(false);
                  DeviceEventEmitter.emit("OPEN_FOLDER_PICKER", song);
                }}
                style={styles.optionItem}
                activeOpacity={0.7}
              >
                <View style={{ marginRight: 14 }}>
                  <LikeButton song={song} onRequireAuth={onRequireAuth} size="md" />
                </View>
                <Text style={styles.optionLabel}>Like / Add to Folders</Text>
              </TouchableOpacity>

              {/* Option 2: Download */}
              <TouchableOpacity
                delayPressIn={0}
                onPress={() => {
                  handleDownload();
                  setShowOptionsModal(false);
                }}
                style={styles.optionItem}
                activeOpacity={0.7}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#1DB954" style={{ marginRight: 14 }} />
                ) : (
                  <MaterialCommunityIcons
                    name={downloaded ? "trash-can-outline" : "download"}
                    size={22}
                    color={downloaded ? "#ff5b5b" : "#1DB954"}
                    style={{ marginRight: 14 }}
                  />
                )}
                <Text style={styles.optionLabel}>
                  {downloaded ? "Delete Download" : "Download Song"}
                </Text>
              </TouchableOpacity>

              {/* Option 3: Add to Queue */}
              <TouchableOpacity
                delayPressIn={0}
                onPress={() => {
                  handleAddToQueue();
                  setShowOptionsModal(false);
                }}
                style={styles.optionItem}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="playlist-play"
                  size={24}
                  color={queued ? "#1DB954" : "rgba(255,255,255,0.8)"}
                  style={{ marginRight: 14 }}
                />
                <Text style={styles.optionLabel}>
                  {queued ? "Added to Queue" : "Add to Queue"}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
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
    backgroundColor: "#ff7a00",
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
    fontSize: 15,
    fontWeight: "600",
  },
  normalTitle: {
    color: "#ffffff",
  },
  activeTitle: {
    color: "#1DB954",
  },
  artistText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 3,
  },
  actionButton: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  optionsDialog: {
    backgroundColor: "#181818",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  optionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  optionsThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  optionsArtist: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  optionsList: {
    paddingVertical: 4,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#fff",
  },
});