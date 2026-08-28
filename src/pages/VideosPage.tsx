import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Platform, Modal, Dimensions, DeviceEventEmitter, Animated, PanResponder, Linking, Keyboard, RefreshControl } from 'react-native'
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
        const sectionList =
          data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
            ?.sectionListRenderer?.contents || [];

        for (const section of sectionList) {
          const contents = section?.itemSectionRenderer?.contents || [];
          for (const item of contents) {
            // 1. Video renderer
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

            // 2. Playlist / Jukebox / Mashup Album Renderer
            const playlist = item.playlistRenderer;
            if (playlist) {
              const firstVideoId = playlist.navigationEndpoint?.watchEndpoint?.videoId ||
                                  playlist.playlists?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
                                  playlist.videoId;
              if (firstVideoId && !seenIds.has(firstVideoId)) {
                seenIds.add(firstVideoId);
                const title = playlist.title?.simpleText || playlist.title?.runs?.[0]?.text || "Mashup / Jukebox";
                const artist = playlist.shortBylineText?.runs?.[0]?.text || playlist.ownerText?.runs?.[0]?.text || "YouTube Playlist";
                const thumbnail = playlist.thumbnails?.[0]?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${firstVideoId}/hqdefault.jpg`;

                videoItems.push({
                  id: `yt_${firstVideoId}`,
                  videoId: firstVideoId,
                  title: `📀 ${decodeHtmlEntities(title)}`,
                  artist: decodeHtmlEntities(artist),
                  thumbnail,
                });
              }
            }

            // 3. Shelf / Horizontal Carousel Items
            const shelfContents = item.shelfRenderer?.content?.verticalListRenderer?.items ||
                                  item.shelfRenderer?.content?.horizontalListRenderer?.items || [];
            for (const subItem of shelfContents) {
              const subVideo = subItem.videoRenderer;
              if (subVideo && subVideo.videoId) {
                const vId = subVideo.videoId;
                if (!seenIds.has(vId)) {
                  seenIds.add(vId);
                  const title = subVideo.title?.runs?.[0]?.text || subVideo.title?.simpleText || searchQuery;
                  const artist = subVideo.ownerText?.runs?.[0]?.text || subVideo.shortBylineText?.runs?.[0]?.text || "YouTube";
                  const thumbnail = subVideo.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;

                  videoItems.push({
                    id: `yt_${vId}`,
                    videoId: vId,
                    title: decodeHtmlEntities(title),
                    artist: decodeHtmlEntities(artist),
                    thumbnail,
                  });
                }
              }
            }
          }
        }
      } catch {}
    }

    if (videoItems.length === 0) {
      const regex = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}/g;
      let match;
      while ((match = regex.exec(html)) !== null && videoItems.length < 35) {
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

    // Direct Invidious API fallback if scraping returned empty
    if (videoItems.length === 0) {
      const apis = [
        `https://pipedapi.adminforge.de/search?q=${encoded}&filter=all`,
        `https://invidious.nerdvpn.de/api/v1/search?q=${encoded}`
      ];
      for (const apiUrl of apis) {
        try {
          const apiRes = await Promise.race([
            fetch(apiUrl),
            new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
          ]);
          if (apiRes.ok) {
            const json = await apiRes.json();
            const items = Array.isArray(json) ? json : json.items || [];
            for (const item of items) {
              const rawUrl = item.url || item.videoId || "";
              const vId = rawUrl.replace("/watch?v=", "").split("&")[0];
              if (vId && /^[a-zA-Z0-9_-]{11}$/.test(vId) && !seenIds.has(vId)) {
                seenIds.add(vId);
                videoItems.push({
                  id: `yt_${vId}`,
                  videoId: vId,
                  title: decodeHtmlEntities(item.title || searchQuery),
                  artist: decodeHtmlEntities(item.uploaderName || item.author || "YouTube"),
                  thumbnail: item.thumbnail || item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
                });
              }
            }
            if (videoItems.length > 0) break;
          }
        } catch {}
      }
    }

    return videoItems;
  } catch (e) {
    return [];
  }
}

export default function VideosPage({ onRequireAuth, activeTab, floatingOnly }: { onRequireAuth: () => void; activeTab?: string; floatingOnly?: boolean }) {
  const { likedVideos, toggleLikeVideo, isVideoLiked } = useLibrary();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const isSelectingSuggestionRef = useRef(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageBatch, setPageBatch] = useState(1);

  // Live YouTube Autocomplete Search Suggestions
  useEffect(() => {
    if (isSelectingSuggestionRef.current) {
      isSelectingSuggestionRef.current = false;
      return;
    }

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
  const [showPipControls, setShowPipControls] = useState(false);
  const [isPipPlaying, setIsPipPlaying] = useState(true);
  const pipControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webViewRef = useRef<any>(null);

  const togglePipControls = useCallback(() => {
    setShowPipControls((prev) => {
      const next = !prev;
      if (pipControlsTimeoutRef.current) clearTimeout(pipControlsTimeoutRef.current);
      if (next) {
        pipControlsTimeoutRef.current = setTimeout(() => {
          setShowPipControls(false);
        }, 3500);
      }
      return next;
    });
  }, []);

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
  const pinchScale = useRef(new Animated.Value(1)).current;

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
          pinchScale.setValue(1);
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
            pinchScale.setValue(1);
            return;
          }
          const currentDist = calcDistance(evt.nativeEvent.touches);
          if (currentDist > 0 && initialPinchDistRef.current > 0) {
            const rawScale = currentDist / initialPinchDistRef.current;
            const maxAllowedScale = (width - 28) / (baseWidthRef.current || 175);
            const minAllowedScale = 130 / (baseWidthRef.current || 175);
            const clampedScale = Math.max(minAllowedScale, Math.min(maxAllowedScale, rawScale));
            pinchScale.setValue(clampedScale);
          }
        } else {
          initialPinchDistRef.current = null;
          const curWidth = pipWidthRef.current;
          const curHeight = Math.round(curWidth * (110 / 175));
          const screenHeight = Dimensions.get("window").height;

          // Screen bounds clamping to prevent mini video frame from going out of screen
          const minTranslateX = -(width - curWidth - 28);
          const maxTranslateX = 0;
          const currentOffsetX = (pan.x as any)._offset || 0;
          const clampedDx = Math.max(minTranslateX - currentOffsetX, Math.min(maxTranslateX - currentOffsetX, gestureState.dx));

          // Top boundary clamp: keep box below top status bar
          const minTranslateY = -(screenHeight - curHeight - 110);
          const maxTranslateY = 0;
          const currentOffsetY = (pan.y as any)._offset || 0;
          const clampedDy = Math.max(minTranslateY - currentOffsetY, Math.min(maxTranslateY - currentOffsetY, gestureState.dy));

          pan.x.setValue(clampedDx);
          pan.y.setValue(clampedDy);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (initialPinchDistRef.current) {
          const finalScale = (pinchScale as any)._value || 1;
          if (finalScale !== 1) {
            const newWidth = Math.max(130, Math.min(width - 28, Math.round(baseWidthRef.current * finalScale)));
            setPipWidth(newWidth);
          }
          pinchScale.setValue(1);
          initialPinchDistRef.current = null;
        } else {
          // Detect tap on minimized frame to toggle controls visibility
          if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
            togglePipControls();
          }
        }
        pan.flattenOffset();
      },
    })
  ).current;

  // Initial trending music videos load (Telugu & Hindi)
  useEffect(() => {
    fetchTrendingVideos("trending telugu hindi video songs 2026");
  }, []);

  // Listen for PLAY_VIDEO_ITEM events emitted from LibraryPage or SearchPage
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("PLAY_VIDEO_ITEM", (videoItem: VideoItem) => {
      if (videoItem) {
        handleVideoCardPress(videoItem);
        DeviceEventEmitter.emit("NAVIGATE_TO_TAB", "Videos");
      }
    });
    return () => sub.remove();
  }, []);

  // Auto-minimize active video when switching tabs away from Videos
  useEffect(() => {
    if (activeTab && activeTab !== "Videos" && activeVideo && !isMinimized) {
      setIsMinimized(true);
    }
  }, [activeTab, activeVideo, isMinimized]);

  const fetchTrendingVideos = async (searchQuery: string, isRefresh = false) => {
    setShowSuggestions(false);
    setSuggestions([]);
    Keyboard.dismiss();
    if (!isRefresh && videos.length === 0) {
      setLoading(true);
    }
    try {
      setPageBatch(1);
      // Run parallel sub-queries to aggregate a massive list of 100+ videos!
      const subQueries = [
        searchQuery,
        `${searchQuery} jukebox mashup`,
        `${searchQuery} latest video songs hits`
      ];

      const resultsArray = await Promise.all(
        subQueries.map((q) => searchYouTubeVideos(q))
      );

      const combined: VideoItem[] = [];
      const seenIds = new Set<string>();

      for (const list of resultsArray) {
        for (const item of list) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            combined.push(item);
          }
        }
      }

      if (combined.length > 0) {
        setVideos(combined);
        return;
      }

      // 2. Fallback to API search if YouTube direct search returns empty
      const res = await api.searchSongs(`${searchQuery}`, 1, 50);
      const items = extractResults(res);
      const deduppedMapped: VideoItem[] = [];

      for (const item of items) {
        const song = mapApiSong(item);
        const titleKey = (song.title || '').toLowerCase().trim();
        if (!titleKey || seenIds.has(song.id)) continue;
        seenIds.add(song.id);

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
      setRefreshing(false);
    }
  };

  const fetchMoreVideos = async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const nextBatch = pageBatch + 1;
      setPageBatch(nextBatch);
      const currentQuery = query.trim() || "trending telugu hindi video songs 2026";

      const extraQueries = [
        `${currentQuery} dj remix 4k`,
        `${currentQuery} lofi chill video songs`,
        `${currentQuery} original soundtrack bgm`
      ];

      const targetQuery = extraQueries[(nextBatch - 2) % extraQueries.length] || `${currentQuery} hits ${nextBatch}`;
      const extraResults = await searchYouTubeVideos(targetQuery);

      if (extraResults.length > 0) {
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          const newItems = extraResults.filter((item) => !seen.has(item.id));
          return [...prev, ...newItems];
        });
      }
    } catch (e) {
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const targetQuery = query.trim() || "trending telugu hindi video songs 2026";
    await fetchTrendingVideos(targetQuery, true);
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

  if (floatingOnly) {
    if (!activeVideo || !isMinimized) return null;
    return (
      <Animated.View
        style={[
          styles.floatingPipContainer,
          {
            width: pipWidth,
            height: Math.round(pipWidth * (110 / 175)),
            transform: [
              ...pan.getTranslateTransform(),
              { scale: pinchScale },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {showPipControls && (
          <Animated.View
            style={[
              styles.pipOverlayControls,
              {
                transform: [{ scale: Animated.divide(1, pinchScale) }],
              },
            ]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              delayPressIn={0}
              onPress={() => {
                setIsMinimized(false);
                setShowPipControls(false);
                DeviceEventEmitter.emit("NAVIGATE_TO_TAB", "Videos");
              }}
              style={styles.pipIconBadge}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="arrow-expand" size={14} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              delayPressIn={0}
              onPress={() => {
                const nextState = !isPipPlaying;
                setIsPipPlaying(nextState);
                try {
                  webViewRef.current?.injectJavaScript(
                    nextState
                      ? "if(player && player.playVideo) player.playVideo(); true;"
                      : "if(player && player.pauseVideo) player.pauseVideo(); true;"
                  );
                } catch {}
              }}
              style={styles.pipIconBadge}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={isPipPlaying ? "pause" : "play"}
                size={14}
                color="#fff"
              />
            </TouchableOpacity>

            <TouchableOpacity
              delayPressIn={0}
              onPress={() => {
                setActiveVideo(null);
                setIsMinimized(false);
                setShowPipControls(false);
              }}
              style={[styles.pipIconBadge, { backgroundColor: "rgba(229, 9, 20, 0.85)" }]}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={styles.pipVideoBox}>
          {isResolvingVideo ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1DB954" />
            </View>
          ) : (
            <WebView
              ref={webViewRef}
              key={`${activeVideo.videoId}_${selectedInstanceIndex}`}
              pointerEvents="auto"
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
                        .ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-message-container,
                        .ytp-ad-preview-container, .ytp-ad-skip-button-slot, .ytp-ad-text,
                        .video-ads, .ytp-ad-player-overlay, .ytp-ad-image-overlay,
                        .annotation, .ytp-paid-content-overlay, .ytp-ad-action-interstitial {
                          display: none !important;
                          visibility: hidden !important;
                          opacity: 0 !important;
                          pointer-events: none !important;
                        }
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

                        window.addEventListener('visibilitychange', function(e) {
                          e.stopImmediatePropagation();
                        }, true);

                        document.addEventListener('visibilitychange', function(e) {
                          e.stopImmediatePropagation();
                          if (document.hidden && player && typeof player.playVideo === 'function') {
                            setTimeout(function() {
                              try { player.playVideo(); } catch (err) {}
                            }, 50);
                          }
                        }, true);

                        setInterval(function() {
                          try {
                            var skipSelectors = [
                              '.ytp-ad-skip-button',
                              '.ytp-ad-skip-button-modern',
                              '.ytp-skip-ad-button',
                              '.ytp-ad-overlay-close-button',
                              '.ytp-ad-skip-button-container',
                              'button.ytp-ad-skip-button-icon',
                              '.ytp-ad-skip-button-slot'
                            ];
                            for (var s = 0; s < skipSelectors.length; s++) {
                              var btns = document.querySelectorAll(skipSelectors[s]);
                              for (var b = 0; b < btns.length; b++) {
                                btns[b].click();
                              }
                            }

                            var adOverlays = document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-message-container, .ytp-ad-module, .video-ads');
                            for (var i = 0; i < adOverlays.length; i++) {
                              adOverlays[i].style.display = 'none';
                            }

                            var isAd = document.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay');
                            var vids = document.querySelectorAll('video');
                            if (isAd && vids.length > 0) {
                              for (var v = 0; v < vids.length; v++) {
                                var vid = vids[v];
                                if (vid && !vid.paused) {
                                  vid.muted = true;
                                  vid.playbackRate = 16;
                                  if (vid.duration && !isNaN(vid.duration)) {
                                    vid.currentTime = vid.duration;
                                  }
                                }
                              }
                            }
                          } catch (e) {}
                        }, 50);
                      </script>
                    </body>
                  </html>
                `,
                baseUrl: "https://www.google.com",
              }}
              style={{ flex: 1, backgroundColor: "#000" }}
              userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"
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
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={styles.container}>
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
              isSelectingSuggestionRef.current = false;
              setQuery(text);
              if (!text.trim()) {
                setSuggestions([]);
                setShowSuggestions(false);
              }
            }}
            onFocus={() => {
              if (!isSelectingSuggestionRef.current && suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            onSubmitEditing={() => {
              isSelectingSuggestionRef.current = true;
              setShowSuggestions(false);
              setSuggestions([]);
              Keyboard.dismiss();
              handleSearchSubmit();
            }}
            placeholder=""
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
                fetchTrendingVideos("trending telugu hindi video songs");
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
                    isSelectingSuggestionRef.current = true;
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

      {/* Video Feed */}
      <ScrollView
        style={styles.feed}
        contentContainerStyle={[
          styles.feedContent,
          loading && videos.length === 0 && { flex: 1, justifyContent: "center", alignItems: "center" }
        ]}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 600;
          if (isCloseToBottom && !loadingMore && !loading) {
            fetchMoreVideos();
          }
        }}
        scrollEventThrottle={250}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#1DB954"
            colors={["#1DB954"]}
            progressBackgroundColor="#181818"
          />
        }
      >
        {loading && videos.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1DB954" />
            <Text style={styles.loadingText}>Fetching videos...</Text>
          </View>
        ) : (
          <>
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

            {loadingMore && (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#1DB954" />
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 6 }}>Loading more videos...</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

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
                    transform: [
                      ...pan.getTranslateTransform(),
                      { scale: pinchScale },
                    ],
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
                {isVideoLiked(activeVideo) ? (
                  <View style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: "#1DB954",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <MaterialCommunityIcons name="check" size={15} color="#000" />
                  </View>
                ) : (
                  <MaterialCommunityIcons name="heart-outline" size={22} color="#fff" />
                )}
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
                pointerEvents="auto"
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
                          /* 100% Zero-Ad Youtube CSS Rules */
                          .ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-message-container,
                          .ytp-ad-preview-container, .ytp-ad-skip-button-slot, .ytp-ad-text,
                          .video-ads, .ytp-ad-player-overlay, .ytp-ad-image-overlay,
                          .annotation, .ytp-paid-content-overlay, .ytp-ad-action-interstitial {
                            display: none !important;
                            visibility: hidden !important;
                            opacity: 0 !important;
                            pointer-events: none !important;
                          }
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

                          // Prevent YouTube from pausing when app backgrounds (document.hidden)
                          window.addEventListener('visibilitychange', function(e) {
                            e.stopImmediatePropagation();
                          }, true);

                          document.addEventListener('visibilitychange', function(e) {
                            e.stopImmediatePropagation();
                            if (document.hidden && player && typeof player.playVideo === 'function') {
                              setTimeout(function() {
                                try { player.playVideo(); } catch (err) {}
                              }, 50);
                            }
                          }, true);

                          // Ultra-Aggressive 100% Zero-Ad YouTube Auto Skipper & Fast-Forwarder
                          setInterval(function() {
                            try {
                              var skipSelectors = [
                                '.ytp-ad-skip-button',
                                '.ytp-ad-skip-button-modern',
                                '.ytp-skip-ad-button',
                                '.ytp-ad-overlay-close-button',
                                '.ytp-ad-skip-button-container',
                                'button.ytp-ad-skip-button-icon',
                                '.ytp-ad-skip-button-slot'
                              ];
                              for (var s = 0; s < skipSelectors.length; s++) {
                                var btns = document.querySelectorAll(skipSelectors[s]);
                                for (var b = 0; b < btns.length; b++) {
                                  btns[b].click();
                                }
                              }

                              var adOverlays = document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-message-container, .ytp-ad-module, .video-ads');
                              for (var i = 0; i < adOverlays.length; i++) {
                                adOverlays[i].style.display = 'none';
                              }

                              var isAd = document.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay');
                              var vids = document.querySelectorAll('video');
                              if (isAd && vids.length > 0) {
                                for (var v = 0; v < vids.length; v++) {
                                  var vid = vids[v];
                                  if (vid && !vid.paused) {
                                    vid.muted = true;
                                    vid.playbackRate = 16;
                                    if (vid.duration && !isNaN(vid.duration)) {
                                      vid.currentTime = vid.duration;
                                    }
                                  }
                                }
                              }
                            } catch (e) {}
                          }, 50);
                        </script>
                      </body>
                    </html>
                  `,
                  baseUrl: "https://www.google.com",
                }}
                style={{ flex: 1, backgroundColor: "#000" }}
                userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"
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

            {/* Overlaid Minimized Quick Controls (Expand / Pause / Close) */}
            {isMinimized && showPipControls && (
              <Animated.View
                style={[
                  styles.pipOverlayControls,
                  {
                    transform: [{ scale: Animated.divide(1, pinchScale) }],
                  },
                ]}
                pointerEvents="box-none"
              >
                <TouchableOpacity
                  delayPressIn={0}
                  onPress={() => {
                    setIsMinimized(false);
                    setShowPipControls(false);
                    DeviceEventEmitter.emit("NAVIGATE_TO_TAB", "Videos");
                  }}
                  style={styles.pipIconBadge}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="arrow-expand" size={14} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  delayPressIn={0}
                  onPress={() => {
                    const nextState = !isPipPlaying;
                    setIsPipPlaying(nextState);
                    try {
                      webViewRef.current?.injectJavaScript(
                        nextState
                          ? "if(player && player.playVideo) player.playVideo(); true;"
                          : "if(player && player.pauseVideo) player.pauseVideo(); true;"
                      );
                    } catch {}
                  }}
                  style={styles.pipIconBadge}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={isPipPlaying ? "pause" : "play"}
                    size={14}
                    color="#fff"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  delayPressIn={0}
                  onPress={() => {
                    setActiveVideo(null);
                    setIsMinimized(false);
                    setShowPipControls(false);
                  }}
                  style={[styles.pipIconBadge, { backgroundColor: "rgba(229, 9, 20, 0.85)" }]}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </Animated.View>
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
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  activeChipBtn: {
    backgroundColor: "#1DB954",
    borderColor: "#1DB954",
  },
  chipText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
  },
  activeChipText: {
    color: "#000",
    fontWeight: "700",
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
