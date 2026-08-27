import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Platform, Alert, DeviceEventEmitter } from 'react-native'
import React, { useState, useEffect } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useLibrary, Playlist, deduplicateSongs } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { SongRow } from "../components/SongRow";
import { AuthModal } from "../components/AuthModal";
import type { Song } from "../data/songs";

type Tab = "liked" | "liked-detail" | "downloads" | "videos" | { type: "playlist"; id: string } | { type: "album"; title: string };

interface LibraryPageProps {
  onRequireAuth: () => void;
  initialTab?: Tab;
}

export default function LibraryPage({ onRequireAuth, initialTab }: LibraryPageProps) {
  const { user, loading, logout } = useAuth();
  const {
    likedSongs,
    playlists,
    createNewPlaylist,
    removePlaylist,
    updatePlaylistName,
    getPlaylist,
    loadLikedSongs,
    loadPlaylists,
    loadLikedAlbums,
    downloadedSongs,
    likedAlbums,
    toggleLikeAlbum,
    likedVideos,
    loadLikedVideos,
    toggleLikeVideo,
  } = useLibrary();
  const { playSong } = usePlayer();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [tab, setTab] = useState<Tab>(initialTab ?? "liked");
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  useEffect(() => {
    loadLikedSongs();
    loadPlaylists();
    loadLikedAlbums();
    loadLikedVideos();
    const subSongs = DeviceEventEmitter.addListener("LIKED_SONGS_UPDATED", () => {
      loadLikedSongs();
    });
    const subAlbums = DeviceEventEmitter.addListener("LIKED_ALBUMS_UPDATED", () => {
      loadLikedAlbums();
    });
    return () => {
      subSongs.remove();
      subAlbums.remove();
    };
  }, [user, loadLikedSongs]);

  const [isOffline, setIsOffline] = useState(false);

  // Check connectivity once on mount, non-blockingly
  useEffect(() => {
    const checkConn = async () => {
      try {
        const res = await Promise.race([
          fetch("https://clients3.google.com/generate_202"),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
        ]);
        setIsOffline(false);
      } catch {
        setIsOffline(true);
      }
    };
    checkConn();
  }, []);

  // Keep initialTab / liked tab as default so user always sees local storage liked songs & folders

  // Listen for explicit "go to downloads" navigation from other screens
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("NAVIGATE_TO_DOWNLOADS", () => {
      setTab("downloads");
    });
    return () => sub.remove();
  }, []);

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
          <TouchableOpacity delayPressIn={0}
            onPress={() => {
              setTab("liked");
              setPlaylistSongs([]);
            }}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentPlaylist.name}
          </Text>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Cover Header */}
          <View style={styles.detailCoverSection}>
            <View style={[styles.largeCoverArt, { backgroundColor: "#1e1e1e" }]}>
              {currentPlaylist.cover_art ? (
                <Image source={{ uri: currentPlaylist.cover_art }} style={styles.coverImage} />
              ) : (
                <MaterialCommunityIcons name="folder-music" size={60} color="#1DB954" />
              )}
            </View>
            <Text style={styles.detailTitle}>{currentPlaylist.name}</Text>
            <Text style={styles.detailSubtitle}>
              {currentPlaylist.song_count ?? 0} songs
            </Text>

            {playlistSongs.length > 0 ? (
              <TouchableOpacity delayPressIn={0}
                onPress={() => playSong(playlistSongs[0], playlistSongs, true)}
                style={styles.playAllBtn}
                activeOpacity={0.8}
              >
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
              title="This folder is empty"
              subtitle="Add songs by tapping the heart button on any track."
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

  // ── Album Detail View ──
  const currentAlbum =
    typeof tab === "object" && tab.type === "album"
      ? likedAlbums.find((a) => a.title.toLowerCase().trim() === tab.title.toLowerCase().trim())
      : null;

  if (currentAlbum) {
    const albumSongs = deduplicateSongs(currentAlbum.songs || []);
    const handleUnlikeAlbum = async () => {
      await toggleLikeAlbum(currentAlbum);
      setTab("liked");
    };

    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity delayPressIn={0}
            onPress={() => setTab("liked")}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentAlbum.title}
          </Text>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Cover Header */}
          <View style={styles.detailCoverSection}>
            <View style={styles.largeCoverArt}>
              {currentAlbum.coverArt ? (
                <Image source={{ uri: currentAlbum.coverArt }} style={styles.coverImage} />
              ) : (
                <MaterialCommunityIcons name="disc" size={60} color="#000" />
              )}
            </View>
            <Text style={styles.detailTitle}>{currentAlbum.title}</Text>
            <Text style={styles.detailSubtitle}>
              {albumSongs.length} songs
            </Text>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              {albumSongs.length > 0 ? (
                <TouchableOpacity delayPressIn={0}
                  onPress={() => playSong(albumSongs[0], albumSongs, true)}
                  style={styles.playAllBtn}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="play" size={16} color="#000" style={{ marginRight: 6 }} />
                  <Text style={styles.playAllBtnText}>Play All</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {albumSongs.length === 0 ? (
            <LibraryEmpty
              icon="disc"
              title="This album is empty"
              subtitle=""
            />
          ) : (
            <View style={{ paddingBottom: 60 }}>
              {albumSongs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  queue={albumSongs}
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

  // ── General Liked Songs Detail View ──
  if (tab === "liked-detail") {
    const cleanLikedSongs = deduplicateSongs(likedSongs || []);

    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity delayPressIn={0}
            onPress={() => setTab("liked")}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Liked Songs
          </Text>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {cleanLikedSongs.length > 0 ? (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, marginTop: 12, marginBottom: 8 }}>
              <TouchableOpacity delayPressIn={0}
                onPress={() => playSong(cleanLikedSongs[0], cleanLikedSongs, true)}
                style={styles.playAllBtn}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="play" size={16} color="#000" style={{ marginRight: 6 }} />
                <Text style={styles.playAllBtnText}>Play All</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {cleanLikedSongs.length === 0 ? (
            <LibraryEmpty
              icon="heart-outline"
              title="No liked songs yet"
              subtitle="Tap the heart icon on any song to save it."
            />
          ) : (
            <View style={{ paddingBottom: 60 }}>
              {cleanLikedSongs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  queue={cleanLikedSongs}
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
  const activeTabStr = typeof tab === "string" ? tab : "liked";

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    const result = await createNewPlaylist(newPlaylistName.trim());
    setCreatingPlaylist(false);
    setNewPlaylistName("");
    // Reload playlists from storage to ensure UI is up to date
    loadPlaylists();
  };

  const handleRenamePlaylist = async (id: string) => {
    if (!editName.trim()) return;
    await updatePlaylistName(id, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  // (offline auto-switches to downloads tab via the useEffect above — no blocking screen needed)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.dashboardTitle}>Your Library</Text>

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            delayPressIn={0}
            onPress={() => DeviceEventEmitter.emit("OPEN_EQUALIZER_MODAL")}
            style={{ marginRight: 12, padding: 6 }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="equalizer" size={22} color="#1DB954" />
          </TouchableOpacity>

          <TouchableOpacity
            delayPressIn={0}
            onPress={() => (global as any).triggerOTAUpdateModal?.()}
            style={{ padding: 6 }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="cloud-refresh" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {!isOffline && (
          <TouchableOpacity delayPressIn={0}
            onPress={() => setTab("liked")}
            style={[styles.tabBtn, activeTabStr === "liked" && styles.activeTabBtn]}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabBtnText, activeTabStr === "liked" && styles.activeTabBtnText]}>
              Liked
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity delayPressIn={0}
          onPress={() => setTab("downloads")}
          style={[styles.tabBtn, activeTabStr === "downloads" && styles.activeTabBtn]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, activeTabStr === "downloads" && styles.activeTabBtnText]}>
            Downloads
          </Text>
        </TouchableOpacity>

        <TouchableOpacity delayPressIn={0}
          onPress={() => setTab("videos")}
          style={[styles.tabBtn, activeTabStr === "videos" && styles.activeTabBtn]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, activeTabStr === "videos" && styles.activeTabBtnText]}>
            Liked Videos ({likedVideos.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Tab content: Liked Section */}
        {activeTabStr === "liked" && (
          <View style={{ paddingBottom: 60 }}>
            {loading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#1DB954" />
                <Text style={styles.loadingText}>Loading your library…</Text>
              </View>
            ) : (
              <View>
                {/* Section Header: Folders */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderText}>Liked Songs & Folders</Text>
                  {!creatingPlaylist ? (
                    <TouchableOpacity delayPressIn={0}
                      onPress={() => setCreatingPlaylist(true)}
                      style={styles.iconAddBtn}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="folder-plus" size={20} color="#1DB954" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Folder Creator Input */}
                {creatingPlaylist && (
                  <View style={styles.creatorInputBar}>
                    <TextInput
                      autoFocus
                      value={newPlaylistName}
                      onChangeText={setNewPlaylistName}
                      placeholder="Folder name..."
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      style={styles.textInput}
                    />
                    <TouchableOpacity delayPressIn={0}
                      onPress={handleCreatePlaylist}
                      disabled={!newPlaylistName.trim()}
                      style={[styles.creatorBtn, !newPlaylistName.trim() && { opacity: 0.5 }]}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="check" size={18} color="#000" />
                    </TouchableOpacity>
                    <TouchableOpacity delayPressIn={0}
                      onPress={() => setCreatingPlaylist(false)}
                      style={[styles.creatorBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="close" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* 1. Default Liked Songs Row */}
                <View style={styles.playlistItemContainer}>
                  <TouchableOpacity delayPressIn={0}
                    onPress={() => setTab("liked-detail")}
                    style={styles.playlistRowItem}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.coverArtWrapper, { backgroundColor: "rgba(29, 185, 84, 0.15)" }]}>
                      <MaterialCommunityIcons name="heart" size={20} color="#1DB954" />
                    </View>
                    <View style={styles.playlistMeta}>
                      <Text style={styles.playlistTitleText}>Liked Songs</Text>
                      <Text style={styles.playlistSubtitleText}>{likedSongs.length} songs</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* 2. Custom Folders (Playlists) */}
                {playlists.map((playlist) => {
                  const isEditing = editingId === playlist.id;

                  return (
                    <View key={playlist.id} style={styles.playlistItemContainer}>
                      <TouchableOpacity delayPressIn={0}
                        onPress={() => openPlaylist(playlist.id)}
                        style={styles.playlistRowItem}
                        activeOpacity={0.7}
                      >
                        <View style={styles.coverArtWrapper}>
                          {playlist.cover_art ? (
                            <Image source={{ uri: playlist.cover_art }} style={styles.coverArt} />
                          ) : (
                            <MaterialCommunityIcons name="folder-music" size={20} color="rgba(255,255,255,0.4)" />
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
                            <TouchableOpacity delayPressIn={0}
                              onPress={() => handleRenamePlaylist(playlist.id)}
                              style={styles.editBtnOk}
                              activeOpacity={0.7}
                            >
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

                      {/* Folder Rename/Delete */}
                      {!isEditing && (
                        <View style={styles.playlistActions}>
                          <TouchableOpacity delayPressIn={0}
                            onPress={() => {
                              setEditingId(playlist.id);
                              setEditName(playlist.name);
                            }}
                            style={styles.actionBtn}
                            activeOpacity={0.7}
                          >
                            <MaterialCommunityIcons name="pencil-outline" size={16} color="rgba(255,255,255,0.5)" />
                          </TouchableOpacity>
                          <TouchableOpacity delayPressIn={0}
                            onPress={() => removePlaylist(playlist.id)}
                            style={styles.actionBtn}
                            activeOpacity={0.7}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={16} color="rgba(255,255,255,0.5)" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Section Header: Liked Albums */}
                <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
                  <Text style={styles.sectionHeaderText}>Liked Albums</Text>
                </View>

                {likedAlbums.length === 0 ? (
                  <LibraryEmpty
                    icon="disc"
                    title="No liked albums yet"
                    subtitle="Open any album and tap the heart to save it."
                  />
                ) : (
                  likedAlbums.map((album) => (
                    <View key={album.title} style={styles.playlistItemContainer}>
                      <TouchableOpacity delayPressIn={0}
                        onPress={() => setTab({ type: "album", title: album.title })}
                        style={[styles.playlistRowItem, { flex: 1 }]}
                        activeOpacity={0.7}
                      >
                        <View style={styles.coverArtWrapper}>
                          {album.coverArt ? (
                            <Image source={{ uri: album.coverArt }} style={styles.coverArt} />
                          ) : (
                            <MaterialCommunityIcons name="disc" size={20} color="rgba(255,255,255,0.4)" />
                          )}
                        </View>
                        <View style={styles.playlistMeta}>
                          <Text style={styles.playlistTitleText} numberOfLines={1}>
                            {album.title}
                          </Text>
                          <Text style={styles.playlistSubtitleText}>
                            {album.type === "movie" ? "Movie Soundtrack" : album.type === "artist" ? "Artist Discography" : "Album"} · {album.songs.length} songs
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.playlistActions}>
                        <TouchableOpacity delayPressIn={0}
                          onPress={() => {
                            Alert.alert(
                              "Remove Album",
                              `Remove "${album.title}" from your Liked Albums? This action cannot be undone.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Remove",
                                  style: "destructive",
                                  onPress: () => toggleLikeAlbum(album),
                                },
                              ]
                            );
                          }}
                          style={styles.actionBtn}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name="heart" size={16} color="#1DB954" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
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
              downloadedSongs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  queue={downloadedSongs}
                  onRequireAuth={handleRequireAuth}
                  fromLibrary={true}
                />
              ))
            )}
          </View>
        )}

        {/* Tab content: Liked Videos */}
        {activeTabStr === "videos" && (
          <View style={{ paddingBottom: 60 }}>
            {likedVideos.length === 0 ? (
              <LibraryEmpty
                icon="video-outline"
                title="No liked videos yet"
                subtitle="Tap the heart icon on any music video to save it here."
              />
            ) : (
              likedVideos.map((item) => (
                <TouchableOpacity
                  key={item.id || item.videoId}
                  style={styles.likedVideoCard}
                  onPress={() => {
                    DeviceEventEmitter.emit("PLAY_VIDEO_ITEM", item);
                  }}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: item.thumbnail }} style={styles.likedVideoThumb} />
                  <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                    <Text style={styles.likedVideoTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.likedVideoArtist} numberOfLines={1}>{item.artist}</Text>
                  </View>
                  <TouchableOpacity
                    delayPressIn={0}
                    onPress={() => toggleLikeVideo(item)}
                    style={{ padding: 8 }}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="heart" size={24} color="#1DB954" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
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
      <TouchableOpacity delayPressIn={0}
        onPress={onSignIn}
        style={styles.signInBtn}
        activeOpacity={0.8}
      >
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
  offlineContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 10,
    textAlign: "center",
  },
  offlineDescription: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  offlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1DB954",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 25,
  },
  offlineBtnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 15,
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
    backgroundColor: "#1DB954",
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingVertical: 4,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  iconAddBtn: {
    padding: 4,
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
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    marginTop: 10,
  },
  likedVideoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  likedVideoThumb: {
    width: 90,
    height: 54,
    borderRadius: 6,
    backgroundColor: "#000",
  },
  likedVideoTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  likedVideoArtist: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 2,
  },
});