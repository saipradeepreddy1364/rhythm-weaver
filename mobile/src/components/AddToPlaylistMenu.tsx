import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, Image } from 'react-native'
import React, { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLibrary } from "../context/LibraryContext";
import { useAuth } from "../context/AuthContext";
import type { Song } from "../data/songs";

interface AddToPlaylistMenuProps {
  song: Song;
  onRequireAuth?: () => void;
  children?: React.ReactNode;
}

export function AddToPlaylistMenu({
  song,
  onRequireAuth,
  children,
}: AddToPlaylistMenuProps) {
  const { user } = useAuth();
  const { playlists, addToPlaylist, createNewPlaylist } = useLibrary();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleOpen = () => {
    if (!user) {
      onRequireAuth?.();
      return;
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setCreating(false);
    setNewName("");
  };

  const handleAdd = async (playlistId: string) => {
    if (addedIds.has(playlistId) || loadingId) return;
    setLoadingId(playlistId);
    await addToPlaylist(playlistId, song);
    setAddedIds((prev) => {
      const next = new Set(prev);
      next.add(playlistId);
      return next;
    });
    setLoadingId(null);
    setTimeout(handleClose, 600);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoadingId("new");
    const playlist = await createNewPlaylist(newName.trim());
    if (playlist && playlist.id) {
      await addToPlaylist(playlist.id, song);
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.add(playlist.id);
        return next;
      });
    }
    setLoadingId(null);
    setCreating(false);
    setNewName("");
    setTimeout(handleClose, 600);
  };

  return (
    <View style={styles.container}>
      {/* Trigger */}
      <TouchableOpacity delayPressIn={0} onPress={handleOpen} activeOpacity={0.7}>
        {children ?? (
          <View style={styles.triggerBtn}>
            <MaterialCommunityIcons name="playlist-plus" size={18} color="rgba(255,255,255,0.4)" />
          </View>
        )}
      </TouchableOpacity>

      {/* Modal Dropdown */}
      <Modal
        visible={open}
        transparent={true}
        animationType="fade"
        onRequestClose={handleClose}
      >
        <TouchableOpacity delayPressIn={0}
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={handleClose}
        >
          <TouchableOpacity delayPressIn={0}
            style={styles.dialog}
            activeOpacity={1} // Prevents click propagation to backdrop
          >
            {/* Header */}
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Add to Playlist</Text>
              <TouchableOpacity delayPressIn={0} onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            {/* Playlists List */}
            <ScrollView style={styles.playlistsList} contentContainerStyle={styles.playlistsListContent}>
              {playlists.length === 0 && !creating ? (
                <Text style={styles.emptyText}>No playlists yet</Text>
              ) : null}

              {playlists.map((p) => {
                const isLoading = loadingId === p.id;
                const isAdded = addedIds.has(p.id);

                return (
                  <TouchableOpacity delayPressIn={0}
                    key={p.id}
                    onPress={() => handleAdd(p.id)}
                    style={styles.playlistRow}
                    activeOpacity={0.7}
                  >
                    <View style={styles.coverWrapper}>
                      {p.cover_art ? (
                        <Image source={{ uri: p.cover_art }} style={styles.coverArt} />
                      ) : (
                        <MaterialCommunityIcons name="playlist-music" size={16} color="rgba(255,255,255,0.4)" />
                      )}
                    </View>

                    <View style={styles.rowInfo}>
                      <Text style={styles.playlistName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.songCount}>
                        {p.song_count ?? 0} songs
                      </Text>
                    </View>

                    {isLoading ? (
                      <ActivityIndicator size="small" color="#1DB954" />
                    ) : isAdded ? (
                      <MaterialCommunityIcons name="check" size={18} color="#1DB954" />
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.4)" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Bottom creator */}
            <View style={styles.creatorSection}>
              {!creating ? (
                <TouchableOpacity delayPressIn={0}
                  onPress={() => setCreating(true)}
                  style={styles.newPlaylistBtn}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="plus" size={18} color="#1DB954" style={{ marginRight: 6 }} />
                  <Text style={styles.newPlaylistText}>New playlist</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.creatorInputRow}>
                  <TextInput
                    autoFocus
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Playlist name..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={styles.textInput}
                  />
                  <TouchableOpacity delayPressIn={0}
                    onPress={handleCreate}
                    disabled={!newName.trim() || loadingId === "new"}
                    style={[styles.saveBtn, (!newName.trim() || loadingId === "new") && styles.disabledSaveBtn]}
                    activeOpacity={0.7}
                  >
                    {loadingId === "new" ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <MaterialCommunityIcons name="check" size={16} color="#000" />
                    )}
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
  container: {
    position: "relative",
  },
  triggerBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
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
    maxHeight: 400,
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
  playlistsList: {
    maxHeight: 220,
  },
  playlistsListContent: {
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    paddingVertical: 20,
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  coverWrapper: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverArt: {
    width: "100%",
    height: "100%",
  },
  rowInfo: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  playlistName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  songCount: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  creatorSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    padding: 10,
  },
  newPlaylistBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  newPlaylistText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1DB954",
  },
  creatorInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: "#fff",
  },
  saveBtn: {
    backgroundColor: "#1DB954",
    borderRadius: 6,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledSaveBtn: {
    opacity: 0.5,
  },
});