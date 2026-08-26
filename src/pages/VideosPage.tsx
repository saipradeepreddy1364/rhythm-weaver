import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Platform, Modal, Dimensions, DeviceEventEmitter, Animated, PanResponder, Linking, Keyboard } from 'react-native'
import React, { useState, useEffect, useRef, useCallback } from "react";
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
  "https://inv.tux.pizza/embed",
  "https://invidious.nerdvpn.de/embed",
  "https://vid.puffyan.us/embed"
];

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
  return "0xMQfnTU6oo"; // Clean fallback
}

async function searchYouTubeVideos(searchQuery: string): Promise<VideoItem[]> {
  try {
    const encoded = encodeURIComponent(searchQuery);
    const res = await Promise.race([
      fetch(`https://www.youtube.com/results?search_query=${encoded}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000))
    ]);

    if (!res.ok) return [];
    const html = await res.text();

    const videoItems: VideoItem[] = [];
    const seenIds = new Set<string>();

    const jsonMatch = html.match(/var ytInitialData\s*=\s*({.*?});<\/script>/s) ||
                      html.match(/window\["ytInitialData"\]\s*=\s*({.*?});/s);

    if (jsonMatch && jsonMatch[1]) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const contents =
          data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

        for (const item of contents) {
          const video = item.videoRenderer;
          if (video && video.videoId) {
            const vId = video.videoId;
            if (seenIds.has(vId)) continue;
            seenIds.add(vId);

            const title = video.title?.runs?.[0]?.text || video.title?.simpleText || searchQuery;
            const artist = video.ownerText?.runs?.[0]?.text || video.shortBylineText?.runs?.[0]?.text || "YouTube";
            const thumbnail = video.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;

            videoItems.push({
              id: `yt_${vId}`,
              videoId: vId,
              title: decodeHtmlEntities(title),
              artist: decodeHtmlEntities(artist),
              thumbnail,
            });
          }
        }
      } catch {}
    }

    if (videoItems.length === 0) {
      const regex = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}/g;
      let match;
      while ((match = regex.exec(html)) !== null && videoItems.length < 25) {
        const [, vId, title] = match;
        if (!seenIds.has(vId)) {
          seenIds.add(vId);
          videoItems.push({
            id: `yt_${vId}`,
            videoId: vId,
            title: decodeHtmlEntities(title),
            artist: "YouTube",
            thumbnail: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
          });
        }
      }
    }

    return videoItems;
  } catch (e) {
    return [];
  }
}

export default function VideosPage({ onRequireAuth }: { onRequireAuth: () => void }) {
  const { likedVideos, toggleLikeVideo, isVideoLiked } = useLibrary();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Live YouTube Autocomplete Search Suggestions
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(query.trim());
        const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encoded}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && Array.isArray(data[1])) {
            setSuggestions(data[1].slice(0, 8));
            setShowSuggestions(data[1].length > 0);
          }
        }
      } catch {}
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedInstanceIndex, setSelectedInstanceIndex] = useState(0);
  const [isVideoBlocked, setIsVideoBlocked] = useState(false);
  const [pipWidth, setPipWidth] = useState(175);
  const pipWidthRef = useRef(175);
  pipWidthRef.current = pipWidth;
  const baseWidthRef = useRef(175);
  const initialPinchDistRef = useRef<number | null>(null);

  const calcDistance = (touches: any[]) => {
    if (!touches || touches.length < 2) return 0;
    const [t1, t2] = touches;
    const dx = t1.pageX - t2.pageX;
    const dy = t1.pageY - t2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => isMinimized,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => isMinimized,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length === 2) {
          initialPinchDistRef.current = calcDistance(evt.nativeEvent.touches);
          baseWidthRef.current = pipWidthRef.current;
        } else {
          initialPinchDistRef.current = null;
          pan.setOffset({
            x: (pan.x as any)._value || 0,
            y: (pan.y as any)._value || 0,
          });
          pan.setValue({ x: 0, y: 0 });
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length === 2) {
          if (!initialPinchDistRef.current || initialPinchDistRef.current <= 0) {
            initialPinchDistRef.current = calcDistance(evt.nativeEvent.touches);
            baseWidthRef.current = pipWidthRef.current;
            return;
          }
          const currentDist = calcDistance(evt.nativeEvent.touches);
          if (currentDist > 0 && initialPinchDistRef.current > 0) {
            const scale = currentDist / initialPinchDistRef.current;
            const newWidth = Math.max(130, Math.min(width - 28, Math.round(baseWidthRef.current * scale)));
            setPipWidth(newWidth);
          }
        } else {
          initialPinchDistRef.current = null;
          const curWidth = pipWidthRef.current;

          // Screen bounds clamping to prevent mini video frame from going out of screen
          const minTranslateX = -(width - curWidth - 28);
          const maxTranslateX = 0;
          const currentOffsetX = (pan.x as any)._offset || 0;
          const clampedDx = Math.max(minTranslateX - currentOffsetX, Math.min(maxTranslateX - currentOffsetX, gestureState.dx));

          const minTranslateY = -(Dimensions.get("window").height - (Platform.OS === 'ios' ? 170 : 150));
          const maxTranslateY = 0;
          const currentOffsetY = (pan.y as any)._offset || 0;
          const clampedDy = Math.max(minTranslateY - currentOffsetY, Math.min(maxTranslateY - currentOffsetY, gestureState.dy));

          pan.x.setValue(clampedDx);
          pan.y.setValue(clampedDy);
        }
      },
      onPanResponderRelease: () => {
        initialPinchDistRef.current = null;
        pan.flattenOffset();
      },
    })
  ).current;

  // Initial trending music videos load
  useEffect(() => {
    fetchTrendingVideos("Telugu video songs");
  }, []);

  const fetchTrendingVideos = async (searchQuery: string) => {
    setShowSuggestions(false);
    setSuggestions([]);
    Keyboard.dismiss();
    setLoading(true);
    try {
      // 1. Direct YouTube search for 100% accurate results on any channel/video (e.g. rawtalkswithvk)
      const ytResults = await searchYouTubeVideos(searchQuery);
      if (ytResults.length > 0) {
        setVideos(ytResults);
        return;
      }

      // 2. Fallback to API search if YouTube direct search returns empty
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
    fetchTrendingVideos(query.trim());
  };

  const isYouTubeVideoId = (id?: string) => {
    return !!id && typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id);
  };

  const handleVideoCardPress = async (item: VideoItem) => {
    setSelectedInstanceIndex(0);
    setIsVideoBlocked(false);
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

  const playNextVideo = useCallback(() => {
    if (!activeVideo || videos.length === 0) return;
    const currentIndex = videos.findIndex((v) => v.id === activeVideo.id || (v.videoId && v.videoId === activeVideo.videoId));
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % videos.length;
    const nextVideo = videos[nextIndex];
    if (nextVideo) {
      handleVideoCardPress(nextVideo);
    }
  }, [activeVideo, videos]);

  const playPrevVideo = useCallback(() => {
    if (!activeVideo || videos.length === 0) return;
    const currentIndex = videos.findIndex((v) => v.id === activeVideo.id || (v.videoId && v.videoId === activeVideo.videoId));
    const prevIndex = currentIndex <= 0 ? videos.length - 1 : currentIndex - 1;
    const prevVideo = videos[prevIndex];
    if (prevVideo) {
      handleVideoCardPress(prevVideo);
    }
  }, [activeVideo, videos]);

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

      {/* Search Input Container with Autocomplete Dropdown */}
      <View style={{ zIndex: 1000 }}>
        <View style={styles.searchBarContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
          <TextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              if (!text.trim()) setShowSuggestions(false);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onSubmitEditing={() => {
              setShowSuggestions(false);
              handleSearchSubmit();
            }}
            placeholder="Search videos (Telugu, Hindi, English...)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              delayPressIn={0}
              onPress={() => {
                setQuery("");
                setSuggestions([]);
                setShowSuggestions(false);
                fetchTrendingVideos("Telugu music videos");
              }}
            >
              <MaterialCommunityIcons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Live Autocomplete Suggestions Dropdown Box */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 240 }}>
              {suggestions.map((item, idx) => (
                <TouchableOpacity
                  delayPressIn={0}
                  key={`${item}_${idx}`}
                  style={styles.suggestionRow}
                  onPress={() => {
                    setQuery(item);
                    setShowSuggestions(false);
                    setSuggestions([]);
                    Keyboard.dismiss();
                    fetchTrendingVideos(item);
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="magnify" size={18} color="rgba(255,255,255,0.4)" style={{ marginRight: 12 }} />
                  <Text style={styles.suggestionText} numberOfLines={1}>{item}</Text>
                  <MaterialCommunityIcons name="arrow-top-left" size={16} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
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
                    width: pipWidth,
                    height: Math.round(pipWidth * (110 / 175)),
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
                onPress={playPrevVideo}
                style={{ padding: 6, marginRight: 2 }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="skip-previous" size={24} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                delayPressIn={0}
                onPress={playNextVideo}
                style={{ padding: 6, marginRight: 4 }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="skip-next" size={24} color="#fff" />
              </TouchableOpacity>

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
                pointerEvents={isMinimized ? "none" : "auto"}
                source={{
                  html: `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                        <style>
                          * { box-sizing: border-box; margin: 0; padding: 0; }
                          body, html { background-color: #000; width: 100%; height: 100%; overflow: hidden; display: flex; align-items: center; justify-content: center; }
                          #player { width: 100%; height: 100%; border: none; }
                          iframe { width: 100%; height: 100%; border: none; }
                        </style>
                      </head>
                      <body>
                        <div id="player"></div>
                        <script>
                          var tag = document.createElement('script');
                          tag.src = "https://www.youtube.com/iframe_api";
                          var firstScriptTag = document.getElementsByTagName('script')[0];
                          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

                          var player;
                          function onYouTubeIframeAPIReady() {
                            player = new YT.Player('player', {
                              height: '100%',
                              width: '100%',
                              videoId: '${targetId}',
                              playerVars: {
                                'autoplay': 1,
                                'controls': 1,
                                'rel': 0,
                                'modestbranding': 1,
                                'playsinline': 1,
                                'enablejsapi': 1,
                                'fs': 1
                              },
                              events: {
                                'onStateChange': function(event) {
                                  if (event && event.data === 0) {
                                    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                                      window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'VIDEO_ENDED' }));
                                    }
                                  }
                                },
                                'onError': function(event) {
                                  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'VIDEO_BLOCKED' }));
                                  }
                                }
                              }
                            });
                          }

                          document.addEventListener('click', function(e) {
                            if (player && typeof player.getDuration === 'function') {
                              var duration = player.getDuration();
                              if (duration > 0 && e.clientY > (window.innerHeight - 55)) {
                                var ratio = e.clientX / window.innerWidth;
                                player.seekTo(duration * ratio, true);
                              }
                            }
                          });

                          if ('mediaSession' in navigator) {
                            try {
                              navigator.mediaSession.metadata = new MediaMetadata({
                                title: ${JSON.stringify(activeVideo.title)},
                                artist: ${JSON.stringify(activeVideo.artist)},
                              });
                              navigator.mediaSession.setActionHandler('play', function() { if (player && player.playVideo) player.playVideo(); });
                              navigator.mediaSession.setActionHandler('pause', function() { if (player && player.pauseVideo) player.pauseVideo(); });
                            } catch (e) {}
                          }
                        </script>
                      </body>
                    </html>
                  `,
                  baseUrl: "https://www.google.com",
                }}
                style={{ flex: 1, backgroundColor: "#000" }}
                allowsPictureInPicture={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                androidLayerType="hardware"
                mixedContentMode="always"
                playInBackground={true}
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data && data.event === "VIDEO_ENDED") {
                      playNextVideo();
                    } else if (data && data.event === "VIDEO_BLOCKED") {
                      setIsVideoBlocked(true);
                      setSelectedInstanceIndex((prev) => (prev + 1) % VIDEO_EMBED_PROVIDERS.length);
                    }
                  } catch {}
                }}
                onError={() => {
                  setIsVideoBlocked(true);
                  setSelectedInstanceIndex((prev) => (prev + 1) % VIDEO_EMBED_PROVIDERS.length);
                }}
              />
            )}

            {/* Overlaid Minimized Quick Controls (Expand / Close) */}
            {isMinimized && (
              <View style={styles.pipOverlayControls} pointerEvents="auto">
                <TouchableOpacity
                  delayPressIn={0}
                  onPress={() => setIsMinimized(false)}
                  style={styles.pipIconBadge}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="fullscreen" size={16} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  delayPressIn={0}
                  onPress={() => { setActiveVideo(null); setIsMinimized(false); }}
                  style={[styles.pipIconBadge, { backgroundColor: "rgba(0,0,0,0.75)" }]}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={15} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {!isMinimized && (
            /* Full Screen Player Body (Up Next Songs & Info) */
            <ScrollView style={styles.modalBody} contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.infoHeading}>{activeVideo.title}</Text>
              <Text style={styles.infoSub}>{activeVideo.artist}</Text>

              {/* Only render Server Switcher & Open in YouTube buttons when YouTube blocks the video */}
              {isVideoBlocked && (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12, marginBottom: 8 }}>
                  <TouchableOpacity
                    delayPressIn={0}
                    style={[styles.switchInstanceBtn, { flex: 1 }]}
                    onPress={() => setSelectedInstanceIndex((prev) => (prev + 1) % VIDEO_EMBED_PROVIDERS.length)}
                  >
                    <MaterialCommunityIcons name="swap-horizontal" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.switchInstanceText}>Server ({selectedInstanceIndex + 1}/{VIDEO_EMBED_PROVIDERS.length})</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    delayPressIn={0}
                    style={[styles.switchInstanceBtn, { flex: 1, backgroundColor: "#E50914" }]}
                    onPress={() => {
                      const ytUrl = `https://www.youtube.com/watch?v=${targetId || activeVideo.videoId}`;
                      Linking.openURL(ytUrl).catch(() => {});
                    }}
                  >
                    <MaterialCommunityIcons name="youtube" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.switchInstanceText}>Open in YouTube</Text>
                  </TouchableOpacity>
                </View>
              )}

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
  suggestionsBox: {
    position: "absolute",
    top: 52,
    left: 16,
    right: 16,
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    zIndex: 9999,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  suggestionText: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  floatingPipContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 85 : 70,
    right: 14,
    width: 175,
    height: 110,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 16,
    borderWidth: 2,
    borderColor: "#1DB954",
    zIndex: 9999,
  },
  pipVideoBox: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  pipOverlayControls: {
    position: "absolute",
    top: 4,
    right: 4,
    flexDirection: "row",
    gap: 4,
    zIndex: 100,
  },
  pipIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
});
