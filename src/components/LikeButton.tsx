import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Modal, ActivityIndicator, Animated } from 'react-native'
import React, { useState, useEffect, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLibrary } from "../context/LibraryContext";
import { useAuth } from "../context/AuthContext";
import type { Song } from "../data/songs";

interface LikeButtonProps {
  song: Song;
  onRequireAuth?: () => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  onModalOpenChange?: (open: boolean) => void;
}

export function LikeButton({
  song,
  onRequireAuth,
  size = "md",
  label,
  onModalOpenChange,
}: LikeButtonProps) {
  const { user } = useAuth();
  const { isLiked, toggleLike, playlists, createNewPlaylist, addToPlaylist, removeFromPlaylist } = useLibrary();
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const openFolderModal = () => {
    setModalOpen(true);
    if (onModalOpenChange) onModalOpenChange(true);
  };

  const closeFolderModal = () => {
    setModalOpen(false);
    if (onModalOpenChange) onModalOpenChange(false);
  };

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animateHeart = () => {
    scaleAnim.setValue(1);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.45,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const containingFolderIds = new Set(
    playlists
      .filter((p) => (p.songs || []).some((s: any) => String(s.id) === String(song.id)))
      .map((p) => p.id)
  );

  const likedGeneral = isLiked(song);
  const isLikedInAnyFolder = likedGeneral || containingFolderIds.size > 0;
  const loadingContaining = false;

  const sizeMap = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const handlePress = () => {
    animateHeart();
    DeviceEventEmitter.emit("OPEN_FOLDER_PICKER", song);
    if (onModalOpenChange) onModalOpenChange(true);
  };

  const handleLongPress = () => {
    animateHeart();
    DeviceEventEmitter.emit("OPEN_FOLDER_PICKER", song);
    if (onModalOpenChange) onModalOpenChange(true);
  };

  const handleToggleGeneralLike = async () => {
    animateHeart();
    setLoadingId("general");
    await toggleLike(song);
    setLoadingId(null);
  };

  const handleToggleFolderLike = async (playlistId: string) => {
    if (loadingId) return;
    animateHeart();
    setLoadingId(playlistId);
    const hasSong = containingFolderIds.has(playlistId);
    if (hasSong) {
      await removeFromPlaylist(playlistId, song.id);
    } else {
      await addToPlaylist(playlistId, song);
    }
    setLoadingId(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || loadingId) return;
    setLoadingId("new");
    const playlist = await createNewPlaylist(newFolderName.trim());
    if (playlist && playlist.id) {
      await addToPlaylist(playlist.id, song);
      animateHeart();
    }
    setNewFolderName("");
    setCreating(false);
    setLoadingId(null);
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity delayPressIn={0}
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
        style={[styles.button, label ? { flexDirection: "row", alignItems: "center" } : null]}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          {isLikedInAnyFolder ? (
            <View style={{
              width: sizeMap[size],
              height: sizeMap[size],
              borderRadius: sizeMap[size] / 2,
              backgroundColor: "#1DB954",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <MaterialCommunityIcons name="check" size={Math.round(sizeMap[size] * 0.68)} color="#000" />
            </View>
          ) : (
            <MaterialCommunityIcons
              name="heart-outline"
              size={sizeMap[size]}
              color="rgba(255,255,255,0.4)"
            />
          )}
        </Animated.View>
        {label ? (
          <Text style={{ fontSize: 15, fontWeight: "500", color: "#fff", marginLeft: 14 }}>
            {label}
          </Text>
        ) : null}
      </TouchableOpacity>

      <Modal
        visible={modalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <TouchableOpacity delayPressIn={0}
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setModalOpen(false)}
        >
          <TouchableOpacity delayPressIn={0}
            style={styles.dialog}
            activeOpacity={1}
            onPress={() => {}} // Intercept clicks inside the dialog to prevent bubbling/closing
          >
            {/* Header */}
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Add to Liked Folders</Text>
              <TouchableOpacity delayPressIn={0} onPress={() => setModalOpen(false)} style={styles.closeBtn} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            {/* List */}
            <ScrollView style={styles.folderList} contentContainerStyle={styles.folderListContent}>
              {loadingContaining ? (
                <ActivityIndicator size="small" color="#1DB954" style={{ marginVertical: 20 }} />
              ) : (
                <View>
                  {/* General Liked Songs */}
                  <TouchableOpacity delayPressIn={0} onPress={handleToggleGeneralLike} style={styles.folderRow} activeOpacity={0.7}>
                    <View style={styles.iconWrapper}>
                      <MaterialCommunityIcons name="heart" size={16} color="#1DB954" />
                    </View>
                    <Text style={styles.folderName}>Liked Songs (General)</Text>
                    {loadingId === "general" ? (
                      <ActivityIndicator size="small" color="#1DB954" />
                    ) : likedGeneral ? (
                      <MaterialCommunityIcons name="check" size={18} color="#1DB954" />
                    ) : (
                      <MaterialCommunityIcons name="plus" size={18} color="rgba(255,255,255,0.3)" />
                    )}
                  </TouchableOpacity>

                  {/* Custom Folders */}
                  {playlists.map((p) => {
                    const isLoading = loadingId === p.id;
                    const hasSong = containingFolderIds.has(p.id);

                    return (
                      <TouchableOpacity delayPressIn={0} key={p.id} onPress={() => handleToggleFolderLike(p.id)} style={styles.folderRow} activeOpacity={0.7}>
                        <View style={styles.iconWrapper}>
                          <MaterialCommunityIcons name="folder-music-outline" size={16} color="rgba(255,255,255,0.6)" />
                        </View>
                        <Text style={styles.folderName} numberOfLines={1}>{p.name}</Text>
                        {isLoading ? (
                          <ActivityIndicator size="small" color="#1DB954" />
                        ) : hasSong ? (
                          <MaterialCommunityIcons name="heart" size={16} color="#1DB954" />
                        ) : (
                          <MaterialCommunityIcons name="plus" size={18} color="rgba(255,255,255,0.3)" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {/* Folder Creator */}
            <View style={styles.creatorSection}>
              {!creating ? (
                <TouchableOpacity delayPressIn={0} onPress={() => setCreating(true)} style={styles.newFolderBtn} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="plus" size={18} color="#1DB954" style={{ marginRight: 6 }} />
                  <Text style={styles.newFolderText}>Create New Folder</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.creatorInputRow}>
                  <TextInput
                    autoFocus
                    value={newFolderName}
                    onChangeText={setNewFolderName}
                    placeholder="Folder name..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={styles.textInput}
                  />
                  <TouchableOpacity delayPressIn={0} onPress={handleCreateFolder} disabled={!newFolderName.trim() || loadingId === "new"} style={[styles.saveBtn, (!newFolderName.trim() || loadingId === "new") && styles.disabledSaveBtn]} activeOpacity={0.7}>
                    {loadingId === "new" ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <MaterialCommunityIcons name="check" size={16} color="#000" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity delayPressIn={0} onPress={() => { setCreating(false); setNewFolderName(""); }} style={styles.cancelBtn} activeOpacity={0.7}>
                    <MaterialCommunityIcons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialog: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    width: "100%",
    maxWidth: 300,
    maxHeight: 450,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    overflow: "hidden",
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
  },
  dialogTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 4,
  },
  folderList: {
    maxHeight: 250,
  },
  folderListContent: {
    paddingVertical: 4,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  folderName: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  creatorSection: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.07)",
    backgroundColor: "#181818",
  },
  newFolderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  newFolderText: {
    color: "#1DB954",
    fontSize: 13,
    fontWeight: "600",
  },
  creatorInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: "#1DB954",
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledSaveBtn: {
    opacity: 0.5,
  },
  cancelBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});