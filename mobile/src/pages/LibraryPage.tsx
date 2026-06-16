import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Platform } from 'react-native'
import React, { useState, useEffect } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useLibrary, Playlist } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { SongRow } from "../components/SongRow";

import { localStorage, sessionStorage } from "../lib/storage";
import type { Song } from "../data/songs";

type Tab = "liked" | "playlists" | "recent" | "downloads" | { type: "playlist"; id: string };

interface LibraryPageProps {
  onRequireAuth: () => void;
}

export default function LibraryPage({ onRequireAuth }: LibraryPageProps) {
  const { user, logout } = useAuth();
  const {
    likedSongs,
    recentlyPlayed,
    playlists,
    createNewPlaylist,
    removePlaylist,
    updatePlaylistName,
    getPlaylist,
    loadLikedSongs,
    loadPlaylists,
    downloadedSongs,
  } = useLibrary();
  const { playSong } = usePlayer();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [tab, setTab] = useState<Tab>("liked");
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  useEffect(() => {
    if (user) {
      loadLikedSongs();
      loadPlaylists();
    }
  }, [user]);

  const isOffline = false;

  const recentFiltered = recentlyPlayed;

  const handleRequireAuth = () => {
    onRequireAuth();
    setShowAuthModal(true);
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const openPlaylist = async (id: string) => {
    setTab({ type: "playlist", id });
    setLoadingPlaylist(true);
    const songs = await getPlaylist(id);
    setPlaylistSongs(songs);
    setLoadingPlaylist(false);
  };

  // Removed early return for logged-out state to allow accessing Downloads tab offline/logged-out

  // ── Playlist Detail View ──
  const currentPlaylist =
    typeof tab === "object" && tab.type === "playlist"
      ? playlists.find((p) => p.id === tab.id)
      : null;

  if (currentPlaylist) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity delayPressIn={0} onPress={() => { setTab("playlists"); setPlaylistSongs([]); }} style={styles.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentPlaylist.name}
          </Text>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Cover Header */}
          <View style={styles.detailCoverSection}>
            <View style={styles.largeCoverArt}>
              {currentPlaylist.cover_art ? (
                <Image source={{ uri: currentPlaylist.cover_art }} style={styles.coverImage} />
              ) : (
                <MaterialCommunityIcons name="playlist-music" size={60} color="#000" />
              )}
            </View>
            <Text style={styles.detailTitle}>{currentPlaylist.name}</Text>
            <Text style={styles.detailSubtitle}>
              {currentPlaylist.song_count ?? 0} songs
            </Text>

            {playlistSongs.length > 0 ? (
              <TouchableOpacity delayPressIn={0} onPress={() => playSong(playlistSongs[0], playlistSongs, true)} style={styles.playAllBtn} activeOpacity={0.8}>
                <MaterialCommunityIcons name="play" size={16} color="#000" style={{ marginRight: 6 }} />
                <Text style={styles.playAllBtnText}>Play All</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {loadingPlaylist ? (
            <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 20 }} />
          ) : playlistSongs.length === 0 ? (
            <LibraryEmpty
              icon="playlist-music"
              title="This playlist is empty"
              subtitle="Add songs from the home or search screen."
            />
          ) : (
            <View style={{ paddingBottom: 60 }}>
              {playlistSongs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  queue={playlistSongs}
                  onRequireAuth={handleRequireAuth}
                  fromLibrary={true}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Library Dashboard Tab View ──
  const activeTabStr = typeof tab === "string" ? tab : "playlists";

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    await createNewPlaylist(newPlaylistName.trim());
    setCreatingPlaylist(false);
    setNewPlaylistName("");
  };

  const handleRenamePlaylist = async (id: string) => {
    if (!editName.trim()) return;
    await updatePlaylistName(id, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.dashboardTitle}>Your Library</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {!isOffline && (
          <TouchableOpacity delayPressIn={0} onPress={() => setTab("liked")} style={[styles.tabBtn, activeTabStr === "liked" && styles.activeTabBtn]} activeOpacity={0.7}>
            <Text style={[styles.tabBtnText, activeTabStr === "liked" && styles.activeTabBtnText]}>
              Liked
            </Text>
          </TouchableOpacity>
        )}

        {!isOffline && (
          <TouchableOpacity delayPressIn={0} onPress={() => setTab("playlists")} style={[styles.tabBtn, activeTabStr === "playlists" && styles.activeTabBtn]} activeOpacity={0.7}>
            <Text style={[styles.tabBtnText, activeTabStr === "playlists" && styles.activeTabBtnText]}>
              Playlists
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity delayPressIn={0} onPress={() => setTab("downloads")} style={[styles.tabBtn, activeTabStr === "downloads" && styles.activeTabBtn]} activeOpacity={0.7}>
          <Text style={[styles.tabBtnText, activeTabStr === "downloads" && styles.activeTabBtnText]}>
            Downloads
          </Text>
        </TouchableOpacity>

        {!isOffline && (
          <TouchableOpacity delayPressIn={0} onPress={() => setTab("recent")} style={[styles.tabBtn, activeTabStr === "recent" && styles.activeTabBtn]} activeOpacity={0.7}>
            <Text style={[styles.tabBtnText, activeTabStr === "recent" && styles.activeTabBtnText]}>
              Recent
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Tab content: Liked Songs */}
        {activeTabStr === "liked" && (
          <View style={{ paddingBottom: 60 }}>
            {likedSongs.length === 0 ? (
              <LibraryEmpty
                icon="heart-outline"
                title="Songs you like will appear here"
                subtitle="Tap the heart icon on any song to save it."
              />
            ) : (
              (() => {
                const seen = new Set<string>();
                const uniqueLiked = likedSongs.filter((song) => {
                  const key = (song.title || "").toLowerCase().trim() + "|" + (song.artist || "").toLowerCase().trim();
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                return uniqueLiked.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    queue={uniqueLiked}
                    onRequireAuth={handleRequireAuth}
                    fromLibrary={true}
                  />
                ));
              })()
            )}
          </View>
        )}

        {/* Tab content: Playlists */}
        {activeTabStr === "playlists" && (
          <View style={{ paddingBottom: 60 }}>
            {/* Creator tool */}
            {!creatingPlaylist ? (
              <TouchableOpacity delayPressIn={0} onPress={() => setCreatingPlaylist(true)} style={styles.creatorTrigger} activeOpacity={0.7}>
                <MaterialCommunityIcons name="plus" size={20} color="#1DB954" style={{ marginRight: 8 }} />
                <Text style={styles.creatorTriggerText}>Create Playlist</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.creatorInputBar}>
                <TextInput
                  autoFocus
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  placeholder="Playlist name..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={styles.textInput}
                />
                <TouchableOpacity delayPressIn={0} onPress={handleCreatePlaylist} disabled={!newPlaylistName.trim()} style={[styles.creatorBtn, !newPlaylistName.trim() && { opacity: 0.5 }]} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="check" size={18} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity delayPressIn={0} onPress={() => setCreatingPlaylist(false)} style={[styles.creatorBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* List */}
            {playlists.length === 0 && !creatingPlaylist ? (
              <LibraryEmpty
                icon="playlist-music"
                title="Create your first playlist"
                subtitle="Group songs into custom playlists to listen later."
              />
            ) : (
              playlists.map((playlist) => {
                const isEditing = editingId === playlist.id;

                return (
                  <View key={playlist.id} style={styles.playlistItemContainer}>
                    <TouchableOpacity delayPressIn={0} onPress={() => openPlaylist(playlist.id)} style={styles.playlistRowItem} activeOpacity={0.7}>
                      <View style={styles.coverArtWrapper}>
                        {playlist.cover_art ? (
                          <Image source={{ uri: playlist.cover_art }} style={styles.coverArt} />
                        ) : (
                          <MaterialCommunityIcons name="playlist-music" size={20} color="rgba(255,255,255,0.4)" />
                        )}
                      </View>

                      {isEditing ? (
                        <View style={styles.editBarRow}>
                          <TextInput
                            autoFocus
                            value={editName}
                            onChangeText={setEditName}
                            style={styles.editTextInput}
                          />
                          <TouchableOpacity delayPressIn={0} onPress={() => handleRenamePlaylist(playlist.id)} style={styles.editBtnOk} activeOpacity={0.7}>
                            <MaterialCommunityIcons name="check" size={14} color="#000" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.playlistMeta}>
                          <Text style={styles.playlistTitleText} numberOfLines={1}>
                            {playlist.name}
                          </Text>
                          <Text style={styles.playlistSubtitleText}>
                            {playlist.song_count ?? 0} songs
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Playlist actions */}
                    {!isEditing && (
                      <View style={styles.playlistActions}>
                        <TouchableOpacity delayPressIn={0} onPress={() => { setEditingId(playlist.id); setEditName(playlist.name); }} style={styles.actionBtn} activeOpacity={0.7}>
                          <MaterialCommunityIcons name="pencil-outline" size={16} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                        <TouchableOpacity delayPressIn={0} onPress={() => removePlaylist(playlist.id)} style={styles.actionBtn} activeOpacity={0.7}>
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Tab content: Downloads */}
        {activeTabStr === "downloads" && (
          <View style={{ paddingBottom: 60 }}>
            {downloadedSongs.length === 0 ? (
              <LibraryEmpty
                icon="download-outline"
                title="No downloaded songs yet"
                subtitle="Tap the download icon on any song to listen offline."
              />
            ) : (
              (() => {
                const seen = new Set<string>();
                const uniqueDownloads = downloadedSongs.filter((song) => {
                  const key = (song.title || "").toLowerCase().trim() + "|" + (song.artist || "").toLowerCase().trim();
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                return uniqueDownloads.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    queue={uniqueDownloads}
                    onRequireAuth={handleRequireAuth}
                    fromLibrary={true}
                  />
                ));
              })()
            )}
          </View>
        )}

        {/* Tab content: Recently Played */}
        {activeTabStr === "recent" && (
          <View style={{ paddingBottom: 60 }}>
            {recentFiltered.length === 0 ? (
              <LibraryEmpty
                icon="clock-outline"
                title="No recently played tracks"
                subtitle="Songs you listen to will be remembered here."
              />
            ) : (
              (() => {
                const seen = new Set<string>();
                const uniqueRecent = recentFiltered.filter((song) => {
                  const key = (song.title || "").toLowerCase().trim() + "|" + (song.artist || "").toLowerCase().trim();
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                return uniqueRecent.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    queue={uniqueRecent}
                    onRequireAuth={handleRequireAuth}
                  />
                ));
              })()
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Sub-component: Empty States ───
function LibraryEmpty({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name={icon as any} size={40} color="rgba(255,255,255,0.15)" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

// ─── Sub-component: Logged Out Tab Content ───
function LoggedOutTabContent({ onSignIn }: { onSignIn: () => void }) {
  return (
    <View style={[styles.loggedOutContainer, { backgroundColor: "transparent", paddingVertical: 60 }]}>
      <View style={styles.emptyIconCircle}>
        <MaterialCommunityIcons name="playlist-music" size={36} color="rgba(255,255,255,0.2)" />
      </View>
      <View style={{ alignItems: "center" }}>
        <Text style={styles.loggedOutTitle}>Enjoy your Library</Text>
        <Text style={styles.loggedOutSubtitle}>
          Sign in to save songs, create playlists, and more.
        </Text>
      </View>
      <TouchableOpacity delayPressIn={0} onPress={onSignIn} style={styles.signInBtn} activeOpacity={0.8}>
        <Text style={styles.signInBtnText}>Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Native Styles ───
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#121212",
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
    marginLeft: 12,
  },
  dashboardTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  profileBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#000",
  },
  userDropdown: {
    position: "absolute",
    right: 16,
    top: Platform.OS === 'ios' ? 80 : 60,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    width: 160,
    padding: 10,
    zIndex: 99,
  },
  dropdownInfo: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  dropdownName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
  },
  dropdownEmail: {
    fontSize: 9,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 4,
  },
  logoutText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: 3,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  activeTabBtn: {
    backgroundColor: "#2a2a2a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
  },
  activeTabBtnText: {
    color: "#fff",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 90,
  },
  // Logged out styles
  loggedOutContainer: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 20,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  loggedOutTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  loggedOutSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  signInBtn: {
    backgroundColor: "#1DB954",
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 24,
  },
  signInBtnText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#000",
  },
  // Empty view
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.8)",
    marginTop: 12,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 16,
  },
  // Detail playlist cover section
  detailCoverSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  largeCoverArt: {
    width: 140,
    height: 140,
    borderRadius: 16,
    backgroundColor: "#1DB954", // primary gradient start representation
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  detailSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginTop: 4,
  },
  playAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
  },
  playAllBtnText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#000",
  },
  // Playlists List Manager
  creatorTrigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  creatorTriggerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1DB954",
  },
  creatorInputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 6,
    gap: 8,
    marginBottom: 12,
  },
  textInput: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    paddingHorizontal: 8,
  },
  creatorBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },
  playlistItemContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  playlistRowItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingVertical: 10,
  },
  coverArtWrapper: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverArt: {
    width: "100%",
    height: "100%",
  },
  playlistMeta: {
    flex: 1,
    marginLeft: 12,
  },
  playlistTitleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  playlistSubtitleText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  playlistActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtn: {
    padding: 8,
    marginLeft: 4,
  },
  editBarRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  editTextInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
    color: "#fff",
    fontSize: 12,
  },
  editBtnOk: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },
});