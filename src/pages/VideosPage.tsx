import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Platform, Modal, Dimensions } from 'react-native'
import React, { useState, useEffect, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { Song, mapApiSong } from "../data/songs";
import { api, extractResults } from "../services/api";

const { width } = Dimensions.get("window");

interface VideoItem {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
}

// ─── Piped / Invidious Embed Helper ──────────────────────────────────────────
// Clean Video Embed Providers
const VIDEO_EMBED_PROVIDERS = [
  "https://www.youtube-nocookie.com/embed",
  "https://piped.video/embed",
  "https://inv.tux.pizza/embed"
];

export default function VideosPage({ onRequireAuth }: { onRequireAuth: () => void }) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [selectedInstanceIndex, setSelectedInstanceIndex] = useState(0);

  // Initial trending music videos load
  useEffect(() => {
    fetchTrendingVideos("Telugu music videos");
  }, []);

  const fetchTrendingVideos = async (searchQuery: string) => {
    setLoading(true);
    try {
      const res = await api.searchSongs(`${searchQuery}`, 1, 30);
      const items = extractResults(res);
      const mapped: VideoItem[] = items.map((item: any) => {
        const song = mapApiSong(item);
        const ytId = item.id?.startsWith("yt-") ? item.id.replace("yt-", "") : item.id;
        return {
          id: song.id,
          videoId: ytId || "dQw4w9WgXcQ",
          title: song.title,
          artist: song.artist,
          thumbnail: song.albumArt || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          duration: song.duration,
        };
      });
      setVideos(mapped);
    } catch (err) {
      console.warn("Failed to fetch videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = () => {
    if (!query.trim()) return;
    fetchTrendingVideos(`${query.trim()} video song`);
  };

  const providerBase = VIDEO_EMBED_PROVIDERS[selectedInstanceIndex];
  const embedUrl = activeVideo
    ? providerBase.includes("youtube-nocookie.com")
      ? `${providerBase}/${activeVideo.videoId}?autoplay=1&controls=1&modestbranding=1&rel=0&playsinline=1`
      : `${providerBase}/${activeVideo.videoId}?autoplay=1&controls=1`
    : "";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Music Videos</Text>
        <Text style={styles.headerSubtitle}>Watch in-app videos</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchBarContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearchSubmit}
          placeholder="Search videos (Telugu, Hindi, English...)"
          placeholderTextColor="rgba(255,255,255,0.3)"
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity delayPressIn={0} onPress={() => { setQuery(""); fetchTrendingVideos("Telugu music videos"); }}>
            <MaterialCommunityIcons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}
      </View>

      {/* Categories Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryBar} contentContainerStyle={styles.categoryContent}>
        {(["Telugu Hits", "Hindi 4K", "Bollywood", "English Pop", "Tamil Hits", "Lofi Video"] as const).map((cat) => (
          <TouchableOpacity
            delayPressIn={0}
            key={cat}
            onPress={() => { setQuery(cat); fetchTrendingVideos(`${cat} video songs`); }}
            style={styles.chipBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.chipText}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Video Feed */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1DB954" />
          <Text style={styles.loadingText}>Fetching videos...</Text>
        </View>
      ) : (
        <ScrollView style={styles.feed} contentContainerStyle={styles.feedContent}>
          {videos.map((item) => (
            <TouchableOpacity
              delayPressIn={0}
              key={item.id}
              style={styles.videoCard}
              onPress={() => {
                setSelectedInstanceIndex(0);
                setActiveVideo(item);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.thumbnailContainer}>
                <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
                <View style={styles.playOverlay}>
                  <View style={styles.playCircle}>
                    <MaterialCommunityIcons name="play" size={24} color="#000" style={{ marginLeft: 2 }} />
                  </View>
                </View>
              </View>

              <View style={styles.videoMeta}>
                <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.videoArtist} numberOfLines={1}>{item.artist}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* In-App Clean Video Player Modal */}
      <Modal
        visible={!!activeVideo}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setActiveVideo(null)}
      >
        {activeVideo && (
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity delayPressIn={0} onPress={() => setActiveVideo(null)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalVideoTitle} numberOfLines={1}>{activeVideo.title}</Text>
                <Text style={styles.modalVideoArtist} numberOfLines={1}>{activeVideo.artist}</Text>
              </View>
            </View>

            {/* In-App Video Player Box */}
            <View style={styles.videoPlayerBox}>
              <WebView
                source={{ uri: embedUrl }}
                style={{ flex: 1, backgroundColor: "#000" }}
                allowsFullscreenVideo={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                injectedJavaScript={`
                  const hideElements = () => {
                    const nav = document.querySelector('header, nav, .navbar, #navbar, .piped-header, .site-header');
                    if (nav) nav.style.display = 'none';
                  };
                  hideElements();
                  setTimeout(hideElements, 1000);
                  setTimeout(hideElements, 2000);
                  true;
                `}
                onError={() => {
                  setSelectedInstanceIndex((prev) => (prev + 1) % VIDEO_EMBED_PROVIDERS.length);
                }}
              />
            </View>

            {/* Video Info */}
            <ScrollView style={styles.modalBody} contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.infoHeading}>{activeVideo.title}</Text>
              <Text style={styles.infoSub}>{activeVideo.artist}</Text>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 48 : 28,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
  },
  categoryBar: {
    maxHeight: 38,
    marginBottom: 12,
  },
  categoryContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chipBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
  },
  chipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 12,
  },
  feed: {
    flex: 1,
  },
  feedContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
    gap: 16,
  },
  videoCard: {
    backgroundColor: "#181818",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 16,
  },
  thumbnailContainer: {
    width: "100%",
    height: 190,
    backgroundColor: "#000",
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1DB954",
    justifyContent: "center",
    alignItems: "center",
  },
  videoMeta: {
    padding: 12,
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
    lineHeight: 20,
  },
  videoArtist: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#0d0d0d",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#141414",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  closeBtn: {
    padding: 6,
  },
  modalVideoTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  modalVideoArtist: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  videoPlayerBox: {
    width: "100%",
    height: 230,
    backgroundColor: "#000",
  },
  modalBody: {
    flex: 1,
  },
  infoHeading: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  infoSub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 4,
  },
  instanceNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 185, 84, 0.1)",
    padding: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  instanceNoticeText: {
    color: "#1DB954",
    fontSize: 12,
    fontWeight: "600",
  },
  switchInstanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  switchInstanceText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
