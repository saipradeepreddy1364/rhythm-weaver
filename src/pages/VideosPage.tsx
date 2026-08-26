import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Platform, Modal, Dimensions, DeviceEventEmitter, Animated, PanResponder } from 'react-native'
import React, { useState, useEffect, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { Song, mapApiSong, decodeHtmlEntities } from "../data/songs";
import { api, extractResults } from "../services/api";
import { useLibrary } from "../context/LibraryContext";

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

async function searchYouTubeVideos(searchQuery: string): Promise<VideoItem[]> {
  const PIPED_APIS = [
    "https://pipedapi.adminforge.de",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.projectsegfau.lt",
    "https://pipedapi.nerdvpn.de"
  ];

  for (const apiBase of PIPED_APIS) {
    try {
      const res = await Promise.race([
        fetch(`${apiBase}/search?q=${encodeURIComponent(searchQuery)}&filter=music_songs`),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500))
      ]);
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        const mapped: VideoItem[] = items.slice(0, 25).map((item: any) => {
          const rawUrl = item.url || "";
          const videoId = rawUrl.replace("/watch?v=", "").split("&")[0];
          return {
            id: videoId || item.id || Math.random().toString(),
            videoId: videoId,
            title: item.title || "Music Video",
            artist: item.uploaderName || "Artist",
            thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: item.duration || 0,
          };
        }).filter((v: VideoItem) => v.videoId && v.videoId.length >= 8);

        if (mapped.length > 0) return mapped;
      }
    } catch {
      // try next API node
    }
  }
  return [];
}

async function getYouTubeVideoId(title: string, artist: string): Promise<string> {
  const searchQuery = encodeURIComponent(`${title} ${artist} video song`);

  // Method 1: Query YouTube Search HTML directly
  try {
    const res = await Promise.race([
      fetch(`https://www.youtube.com/results?search_query=${searchQuery}`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500))
    ]);
    if (res.ok) {
      const html = await res.text();
      const matches = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/g);
      if (matches && matches.length > 0) {
        for (const m of matches) {
          const vId = m.replace('"videoId":"', '').replace('"', '');
          if (vId && /^[a-zA-Z0-9_-]{11}$/.test(vId)) {
            return vId;
          }
        }
      }
    }
  } catch {}

  // Method 2: Invidious / Piped API fallbacks
  const apis = [
    `https://pipedapi.adminforge.de/search?q=${searchQuery}&filter=videos`,
    `https://pipedapi.kavin.rocks/search?q=${searchQuery}&filter=videos`,
    `https://invidious.nerdvpn.de/api/v1/search?q=${searchQuery}&type=video`
  ];

  for (const url of apis) {
    try {
      const res = await Promise.race([
        fetch(url),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
      ]);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.items || [];
        for (const item of items) {
          const raw = item.url || item.videoId || "";
          const vId = raw.replace("/watch?v=", "").split("&")[0];
          if (vId && /^[a-zA-Z0-9_-]{11}$/.test(vId)) return vId;
        }
      }
    } catch {}
  }
  return "";
}

export default function VideosPage({ onRequireAuth }: { onRequireAuth: () => void }) {
  const { likedVideos, toggleLikeVideo, isVideoLiked } = useLibrary();
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedInstanceIndex, setSelectedInstanceIndex] = useState(0);

  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value || 0,
          y: (pan.y as any)._value || 0,
        });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  // Initial trending music videos load
  useEffect(() => {
    fetchTrendingVideos("Telugu video songs");
  }, []);

  const fetchTrendingVideos = async (searchQuery: string) => {
    setLoading(true);
    try {
      // Fast, reliable backend search with strict title deduplication
      const res = await api.searchSongs(`${searchQuery}`, 1, 40);
      const items = extractResults(res);
      const seenTitles = new Set<string>();
      const deduppedMapped: VideoItem[] = [];

      for (const item of items) {
        const song = mapApiSong(item);
        const titleKey = (song.title || '').toLowerCase().trim();
        if (!titleKey || seenTitles.has(titleKey)) continue;
        seenTitles.add(titleKey);

        const ytId = item.id?.startsWith("yt-") ? item.id.replace("yt-", "") : "";
        deduppedMapped.push({
          id: song.id,
          videoId: ytId,
          title: decodeHtmlEntities(song.title),
          artist: decodeHtmlEntities(song.artist),
          thumbnail: song.albumArt || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          duration: song.duration,
        });
      }
      setVideos(deduppedMapped);
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

  const isYouTubeVideoId = (id?: string) => {
    return !!id && typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id);
  };

  const handleVideoCardPress = async (item: VideoItem) => {
    setSelectedInstanceIndex(0);
    setIsMinimized(false);
    if (isYouTubeVideoId(item.videoId)) {
      setActiveVideo(item);
    } else {
      setActiveVideo(item);
      const resolvedId = await getYouTubeVideoId(item.title, item.artist);
      if (resolvedId) {
        setActiveVideo((prev) => (prev && prev.id === item.id ? { ...prev, videoId: resolvedId } : prev));
      }
    }
  };

  const providerBase = VIDEO_EMBED_PROVIDERS[selectedInstanceIndex];
  const isResolvingVideo = activeVideo && !isYouTubeVideoId(activeVideo.videoId);
  const targetId = isYouTubeVideoId(activeVideo?.videoId) ? activeVideo!.videoId : "";

  const embedUrl = activeVideo && targetId
    ? `${providerBase}/${targetId}?autoplay=1&controls=1&modestbranding=1&rel=0&playsinline=1`
    : "";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Music Videos</Text>
          <Text style={styles.headerSubtitle}>Watch in-app videos</Text>
        </View>
        <TouchableOpacity
          delayPressIn={0}
          onPress={() => DeviceEventEmitter.emit("OPEN_EQUALIZER_MODAL")}
          style={{ padding: 6 }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="equalizer" size={22} color="#1DB954" />
        </TouchableOpacity>
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
              onPress={() => handleVideoCardPress(item)}
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
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.videoArtist} numberOfLines={1}>{item.artist}</Text>
                </View>
                <TouchableOpacity
                  delayPressIn={0}
                  onPress={(e) => {
                    e.stopPropagation();
                    toggleLikeVideo(item);
                  }}
                  style={{ padding: 6 }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={isVideoLiked(item) ? "heart" : "heart-outline"}
                    size={24}
                    color={isVideoLiked(item) ? "#1DB954" : "rgba(255,255,255,0.6)"}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Persistent Single Video Player (Full Screen or Mini Draggable PiP) */}
      {activeVideo && (
        <Animated.View
          style={
            isMinimized
              ? [
                  styles.floatingPipContainer,
                  {
                    transform: pan.getTranslateTransform(),
                  },
                ]
              : styles.fullScreenPlayerOverlay
          }
          {...(isMinimized ? panResponder.panHandlers : {})}
        >
          {!isMinimized && (
            /* Full Screen Header */
            <View style={styles.modalHeader}>
              <TouchableOpacity delayPressIn={0} onPress={() => setIsMinimized(true)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="chevron-down" size={28} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalVideoTitle} numberOfLines={1}>{activeVideo.title}</Text>
                <Text style={styles.modalVideoArtist} numberOfLines={1}>{activeVideo.artist}</Text>
              </View>
              <TouchableOpacity
                delayPressIn={0}
                onPress={() => toggleLikeVideo(activeVideo)}
                style={{ padding: 6, marginRight: 6 }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={isVideoLiked(activeVideo) ? "heart" : "heart-outline"}
                  size={22}
                  color={isVideoLiked(activeVideo) ? "#1DB954" : "#fff"}
                />
              </TouchableOpacity>
              <TouchableOpacity delayPressIn={0} onPress={() => { setActiveVideo(null); setIsMinimized(false); }} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* THE SINGLE PERSISTENT UNMOUNTABLE WEBVIEW INSTANCE */}
          <View style={isMinimized ? styles.pipVideoBox : styles.videoPlayerBox}>
            {isResolvingVideo ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size={isMinimized ? "small" : "large"} color="#1DB954" />
                {!isMinimized && <Text style={styles.loadingText}>Fetching official music video...</Text>}
              </View>
            ) : (
              <WebView
                key={`${activeVideo.videoId}_${selectedInstanceIndex}`}
                source={{
                  html: `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                        <style>
                          * { box-sizing: border-box; margin: 0; padding: 0; }
                          body, html { background-color: #000; width: 100%; height: 100%; overflow: hidden; display: flex; align-items: center; justify-content: center; }
                          iframe { width: 100%; height: 100%; border: none; }
                        </style>
                      </head>
                      <body>
                        <iframe src="${embedUrl}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
                      </body>
                    </html>
                  `,
                  baseUrl: "https://www.google.com",
                }}
                style={{ flex: 1, backgroundColor: "#000" }}
                allowsFullscreenVideo={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                onError={() => {
                  setSelectedInstanceIndex((prev) => (prev + 1) % VIDEO_EMBED_PROVIDERS.length);
                }}
              />
            )}
          </View>

          {isMinimized ? (
            /* Mini Floating PiP Title, Artist & Controls Row */
            <View style={styles.pipContent}>
              <TouchableOpacity
                delayPressIn={0}
                activeOpacity={0.8}
                onPress={() => setIsMinimized(false)}
                style={styles.pipMeta}
              >
                <Text style={styles.pipTitle} numberOfLines={1}>{activeVideo.title}</Text>
                <Text style={styles.pipArtist} numberOfLines={1}>{activeVideo.artist}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                delayPressIn={0}
                onPress={() => setIsMinimized(false)}
                style={{ padding: 6 }}
              >
                <MaterialCommunityIcons name="fullscreen" size={22} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                delayPressIn={0}
                onPress={() => { setActiveVideo(null); setIsMinimized(false); }}
                style={{ padding: 6, marginLeft: 4 }}
              >
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            /* Full Screen Player Body (Up Next Songs & Info) */
            <ScrollView style={styles.modalBody} contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.infoHeading}>{activeVideo.title}</Text>
              <Text style={styles.infoSub}>{activeVideo.artist}</Text>

              <TouchableOpacity
                delayPressIn={0}
                style={styles.switchInstanceBtn}
                onPress={() => setSelectedInstanceIndex((prev) => (prev + 1) % VIDEO_EMBED_PROVIDERS.length)}
              >
                <MaterialCommunityIcons name="swap-horizontal" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.switchInstanceText}>If video doesn't play, tap to Switch Server ({selectedInstanceIndex + 1}/{VIDEO_EMBED_PROVIDERS.length})</Text>
              </TouchableOpacity>

              {/* Up Next / Related Songs List */}
              <View style={styles.upNextSection}>
                <Text style={styles.upNextTitle}>Up Next / Related Songs</Text>
                {videos
                  .filter((v) => v.id !== activeVideo.id)
                  .map((item) => (
                    <TouchableOpacity
                      delayPressIn={0}
                      key={item.id}
                      style={styles.upNextCard}
                      onPress={() => handleVideoCardPress(item)}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: item.thumbnail }} style={styles.upNextThumb} />
                      <View style={styles.upNextMeta}>
                        <Text style={styles.upNextSongTitle} numberOfLines={2}>{item.title}</Text>
                        <Text style={styles.upNextSongArtist} numberOfLines={1}>{item.artist}</Text>
                      </View>
                      <MaterialCommunityIcons name="play-circle-outline" size={24} color="#1DB954" />
                    </TouchableOpacity>
                  ))}
              </View>
            </ScrollView>
          )}
        </Animated.View>
      )}
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
  fullScreenPlayerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#121212",
    zIndex: 1000,
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
    height: Math.round(width * (9 / 16)),
    backgroundColor: "#000",
    overflow: "hidden",
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
  upNextSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  upNextTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 14,
  },
  upNextCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#181818",
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  upNextThumb: {
    width: 90,
    height: 54,
    borderRadius: 6,
    backgroundColor: "#000",
  },
  upNextMeta: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  upNextSongTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  upNextSongArtist: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginTop: 2,
  },
  floatingPipContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 85 : 75,
    right: 12,
    width: width - 24,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#181818",
    borderRadius: 14,
    padding: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 16,
    borderWidth: 1.5,
    borderColor: "#1DB954",
    zIndex: 9999,
  },
  pipContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  pipVideoBox: {
    width: 110,
    height: 62,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  pipMeta: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  pipTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  pipArtist: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginTop: 2,
  },
});
