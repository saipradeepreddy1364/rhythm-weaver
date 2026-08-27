import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  DeviceEventEmitter,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Song } from "../data/songs";
import { useLibrary } from "../context/LibraryContext";

export function GlobalFolderPickerModal() {
  const { isLiked, toggleLike, playlists, createNewPlaylist, addToPlaylist, removeFromPlaylist } = useLibrary();
  const [song, setSong] = useState<Song | null>(null);
  const [visible, setVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("OPEN_FOLDER_PICKER", (targetSong: Song) => {
      if (targetSong) {
        setSong(targetSong);
        setVisible(true);
        setCreating(false);
        setNewFolderName("");
        setLoadingId(null);
      }
    });
    return () => sub.remove();
  }, []);

  if (!visible || !song) return null;

  const containingFolderIds = new Set(
    playlists
      .filter((p) => (p.songs || []).some((s: any) => String(s.id) === String(song.id)))
      .map((p) => p.id)
  );

  const likedGeneral = isLiked(song);

  const handleToggleGeneralLike = async () => {
    setLoadingId("general");
    await toggleLike(song);
    setLoadingId(null);
  };

  const handleToggleFolderLike = async (playlistId: string) => {
    if (loadingId) return;
    setLoadingId(playlistId);
    if (containingFolderIds.has(playlistId)) {
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
    }
    setNewFolderName("");
    setCreating(false);
    setLoadingId(null);
  };

  const handleClose = () => {
    setVisible(false);
    setSong(null);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        delayPressIn={0}
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity
          delayPressIn={0}
          style={styles.dialog}
          activeOpacity={1}
          onPress={() => {}}
        >
          {/* Header */}
          <View style={styles.dialogHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dialogTitle}>Add to Liked Folders</Text>
              <Text style={styles.songSubTitle} numberOfLines={1}>
                {song.title} · {song.artist}
              </Text>
            </View>
            <TouchableOpacity delayPressIn={0} onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView style={styles.folderList} contentContainerStyle={styles.folderListContent}>
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
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#181818",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
    elevation: 20,
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  songSubTitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  folderList: {
    maxHeight: 260,
  },
  folderListContent: {
    paddingVertical: 4,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.03)",
  },
  iconWrapper: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  folderName: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  creatorSection: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.07)",
    backgroundColor: "#141414",
  },
  newFolderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  newFolderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1DB954",
  },
  creatorInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    height: 38,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: "#fff",
    fontSize: 14,
    marginRight: 8,
  },
  saveBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  disabledSaveBtn: {
    opacity: 0.4,
  },
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
