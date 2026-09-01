import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Platform, Modal, Dimensions, DeviceEventEmitter, AppState, Animated, PanResponder, Linking, Keyboard, RefreshControl, useWindowDimensions } from 'react-native'
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { Song, mapApiSong, decodeHtmlEntities } from "../data/songs";
import { api, extractResults } from "../services/api";
import { useLibrary, normalizeSongTitle } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import TrackPlayer from "react-native-track-player";

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

function getBestYouTubeThumbnail(vId?: string, thumbnails?: any[]): string {
  if (Array.isArray(thumbnails) && thumbnails.length > 0) {
    const best = thumbnails[thumbnails.length - 1]?.url || thumbnails[0]?.url;
    if (best) {
      let clean = best;
      if (clean.startsWith("//")) clean = "https:" + clean;
      return clean;
    }
  }
  if (vId && /^[a-zA-Z0-9_-]{11}$/.test(vId)) {
    return `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
  }
  return vId ? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg` : "";
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
              const vId = String(video.videoId).trim();
              if (vId && /^[a-zA-Z0-9_-]{11}$/.test(vId) && !seenIds.has(vId)) {
                seenIds.add(vId);

                const title = video.title?.runs?.[0]?.text || video.title?.simpleText || searchQuery;
                const artist = video.ownerText?.runs?.[0]?.text || video.shortBylineText?.runs?.[0]?.text || "YouTube";
                const thumbnail = getBestYouTubeThumbnail(vId, video.thumbnail?.thumbnails);

                videoItems.push({
                  id: `yt_${vId}`,
                  videoId: vId,
                  title: decodeHtmlEntities(title),
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
                const vId = String(subVideo.videoId).trim();
                if (vId && /^[a-zA-Z0-9_-]{11}$/.test(vId) && !seenIds.has(vId)) {
                  seenIds.add(vId);
                  const title = subVideo.title?.runs?.[0]?.text || subVideo.title?.simpleText || searchQuery;
                  const artist = subVideo.ownerText?.runs?.[0]?.text || subVideo.shortBylineText?.runs?.[0]?.text || "YouTube";
                  const thumbnail = getBestYouTubeThumbnail(vId, subVideo.thumbnail?.thumbnails);

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
        const [, rawVId, title] = match;
        const vId = rawVId ? String(rawVId).trim() : "";
        if (vId && /^[a-zA-Z0-9_-]{11}$/.test(vId) && !seenIds.has(vId)) {
          seenIds.add(vId);
          videoItems.push({
            id: `yt_${vId}`,
            videoId: vId,
            title: decodeHtmlEntities(title),
            artist: "YouTube",
            thumbnail: getBestYouTubeThumbnail(vId),
          });
        }
      }
    }

    // Direct Invidious & Piped API fallback if scraping returned empty
    if (videoItems.length === 0) {
      const apis = [
        `https://pipedapi.kavin.rocks/search?q=${encoded}&filter=videos`,
        `https://pipedapi.adminforge.de/search?q=${encoded}&filter=videos`,
        `https://invidious.nerdvpn.de/api/v1/search?q=${encoded}&type=video`,
        `https://inv.tux.pizza/api/v1/search?q=${encoded}&type=video`
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
              const vId = rawUrl.replace("/watch?v=", "").split("&")[0]?.trim();
              if (vId && /^[a-zA-Z0-9_-]{11}$/.test(vId) && !seenIds.has(vId)) {
                seenIds.add(vId);
                videoItems.push({
                  id: `yt_${vId}`,
                  videoId: vId,
                  title: decodeHtmlEntities(item.title || searchQuery),
                  artist: decodeHtmlEntities(item.uploaderName || item.author || "YouTube"),
                  thumbnail: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
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

export default function VideosPage({ onRequireAuth, activeTab, floatingOnly, isSystemPip: isSystemPipProp }: { onRequireAuth: () => void; activeTab?: string; floatingOnly?: boolean; isSystemPip?: boolean }) {
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
  const [isSystemPip, setIsSystemPip] = useState(isSystemPipProp || false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { currentSong } = usePlayer();

  // Sync activeVideo with currentSong playing in PlayerContext so video & mini player always match the real song
  useEffect(() => {
    if (currentSong && currentSong.title) {
      const currentTitleKey = normalizeSongTitle(currentSong.title, currentSong.movie || currentSong.album);
      const activeTitleKey = activeVideo ? normalizeSongTitle(activeVideo.title, "") : "";

      if (!activeVideo || currentTitleKey !== activeTitleKey) {
        let ytId = currentSong.id?.startsWith("yt-") ? currentSong.id.replace("yt-", "") : "";
        if (!ytId && currentSong.audioUrl?.includes("youtube://")) {
          ytId = currentSong.audioUrl.replace("youtube://", "");
        }

        if (ytId && /^[a-zA-Z0-9_-]{11}$/.test(ytId)) {
          setActiveVideo({
            id: `yt_${ytId}`,
            videoId: ytId,
            title: currentSong.title,
            artist: currentSong.artist || "YouTube",
            thumbnail: currentSong.albumArt || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
            duration: currentSong.duration,
          });
        } else {
          getYouTubeVideoId(currentSong.title, currentSong.artist || "").then((resolvedId) => {
            if (resolvedId) {
              setActiveVideo((prev) => {
                const prevKey = prev ? normalizeSongTitle(prev.title, "") : "";
                if (!prev || prevKey !== currentTitleKey) {
                  return {
                    id: `yt_${resolvedId}`,
                    videoId: resolvedId,
                    title: currentSong.title,
                    artist: currentSong.artist || "YouTube",
                    thumbnail: currentSong.albumArt || `https://i.ytimg.com/vi/${resolvedId}/hqdefault.jpg`,
                    duration: currentSong.duration,
                  };
                }
                return prev;
              });
            }
          });
        }
      }
    }
  }, [currentSong]);

  useEffect(() => {
    if (typeof isSystemPipProp === "boolean") {
      setIsSystemPip(isSystemPipProp);
    }
  }, [isSystemPipProp]);

  useEffect(() => {
    DeviceEventEmitter.emit("VIDEO_ACTIVE_CHANGED", !!activeVideo);
  }, [activeVideo]);

  useEffect(() => {
    DeviceEventEmitter.emit("VIDEO_MINIMIZED_CHANGED", isMinimized);
    if (webViewRef.current) {
      try {
        webViewRef.current.injectJavaScript(`
          if (${isMinimized}) {
            document.body.classList.add('is-minimized');
          } else {
            document.body.classList.remove('is-minimized');
          }
          true;
        `);
      } catch (err) {}
    }
    // Auto-hide controls when minimized
    setShowPipControls(false);
  }, [isMinimized]);

  useEffect(() => {
    const pipSub = DeviceEventEmitter.addListener("ON_PIP_MODE_CHANGED", (data: any) => {
      if (data && typeof data.isInPictureInPictureMode === "boolean") {
        setIsSystemPip(data.isInPictureInPictureMode);
      }
    });
    return () => pipSub.remove();
  }, []);

  const isSystemPipActive = Boolean(isSystemPipProp || isSystemPip);
  const isSystemPipRef = useRef(false);
  isSystemPipRef.current = isSystemPipActive;

  const pipControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webViewRef = useRef<any>(null);

  const togglePipControls = useCallback(() => {
    setShowPipControls((prev) => {
      const next = !prev;
      if (pipControlsTimeoutRef.current) clearTimeout(pipControlsTimeoutRef.current);
      if (next) {
        pipControlsTimeoutRef.current = setTimeout(() => {
          setShowPipControls(false);
        }, 2000);
      }
      return next;
    });
  }, []);

  const handleTogglePipPlay = useCallback((overrideState?: boolean) => {
    try {
      TrackPlayer.pause().catch(() => {});
    } catch {}
    setIsPipPlaying((prev) => {
      const nextState = typeof overrideState === 'boolean' ? overrideState : !prev;
      try {
        if (webViewRef.current) {
          const msg = JSON.stringify({ type: 'TOGGLE_PLAY', play: nextState });
          webViewRef.current.postMessage(msg);
          webViewRef.current.injectJavaScript(`
            (function() {
              try {
                var targetState = ${nextState ? 'true' : 'false'};
                if (typeof window.toggleVideoPlayback === 'function') {
                  window.toggleVideoPlayback(targetState);
                }
                if (typeof player !== 'undefined' && player) {
                  if (targetState && typeof player.playVideo === 'function') player.playVideo();
                  if (!targetState && typeof player.pauseVideo === 'function') player.pauseVideo();
                }
                var vids = document.querySelectorAll('video');
                for (var j = 0; j < vids.length; j++) {
                  if (targetState) {
                    var p = vids[j].play();
                    if (p && typeof p.catch === 'function') p.catch(function(){});
                  } else {
                    vids[j].pause();
                  }
                }
              } catch(e) {}
            })();
            true;
          `);
        }
      } catch (err) {}
      return nextState;
    });
  }, []);

  const [pipWidth, setPipWidth] = useState(210);
  const pipWidthRef = useRef(210);
  pipWidthRef.current = pipWidth;
  const baseWidthRef = useRef(210);
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
      onStartShouldSetPanResponder: () => isMinimized && !isSystemPipActive,
      onStartShouldSetPanResponderCapture: (evt) => {
        return isMinimized && !isSystemPipActive && Boolean(evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2);
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return isMinimized && !isSystemPipActive && (Math.abs(gestureState.dx) > 1 || Math.abs(gestureState.dy) > 1 || Boolean(evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2));
      },
      onMoveShouldSetPanResponderCapture: (evt) => {
        return isMinimized && !isSystemPipActive && Boolean(evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2);
      },
      onPanResponderGrant: (evt) => {
        togglePipControls();
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
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
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          const dist = calcDistance(touches);
          if (dist > 0) {
            if (!initialPinchDistRef.current || initialPinchDistRef.current <= 0) {
              initialPinchDistRef.current = dist;
              baseWidthRef.current = pipWidthRef.current;
            } else {
              const scale = dist / initialPinchDistRef.current;
              const targetWidth = (baseWidthRef.current || 175) * scale;
              const clampedWidth = Math.max(130, Math.min(width - 20, Math.round(targetWidth)));
              setPipWidth(clampedWidth);
            }
          }
        } else {
          initialPinchDistRef.current = null;
          Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(evt, gestureState);
        }
      },
      onPanResponderRelease: () => {
        initialPinchDistRef.current = null;
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

  // Listen for PAUSE_ACTIVE_VIDEO emitted when audio song plays in Search/Home/Library
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("PAUSE_ACTIVE_VIDEO", () => {
      try {
        webViewRef.current?.injectJavaScript(
          "if(player && player.pauseVideo) player.pauseVideo(); true;"
        );
      } catch {}
      setIsPipPlaying(false);
      setActiveVideo(null);
    });
    return () => sub.remove();
  }, []);

  // Auto-minimize active video when switching tabs away from Videos
  useEffect(() => {
    if (activeTab && activeTab !== "Videos" && activeVideo && !isMinimized) {
      setIsMinimized(true);
    }
  }, [activeTab, activeVideo, isMinimized]);

  // Toggle minimized CSS class & disable playback speed in WebView when minimized
  useEffect(() => {
    try {
      webViewRef.current?.injectJavaScript(`
        (function() {
          if (document && document.body) {
            if (${isMinimized}) {
              document.body.classList.add('is-minimized');
              if (player && typeof player.setPlaybackRate === 'function') {
                player.setPlaybackRate(1);
              }
            } else {
              document.body.classList.remove('is-minimized');
            }
          }
        })();
        true;
      `);
    } catch {}
  }, [isMinimized]);

  // Pause video on incoming phone calls, WhatsApp calls, or background transitions (unless System PiP is active)
  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (!isSystemPipRef.current) {
          if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({ type: 'TOGGLE_PLAY', play: false }));
          }
          setIsPipPlaying(false);
        }
      }
    });

    const pauseSub1 = DeviceEventEmitter.addListener("PAUSE_ACTIVE_VIDEO", () => {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: 'TOGGLE_PLAY', play: false }));
      }
      setIsPipPlaying(false);
    });

    const pauseSub2 = DeviceEventEmitter.addListener("PAUSE_VIDEO", () => {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: 'TOGGLE_PLAY', play: false }));
      }
      setIsPipPlaying(false);
    });

    return () => {
      appStateSub.remove();
      pauseSub1.remove();
      pauseSub2.remove();
    };
  }, []);

  const fetchTrendingVideos = async (searchQuery: string, isRefresh = false) => {
    setShowSuggestions(false);
    setSuggestions([]);
    Keyboard.dismiss();
    if (!isRefresh && videos.length === 0) {
      setLoading(true);
    }
    try {
      setPageBatch(1);
      const isDefault = !searchQuery || searchQuery.toLowerCase().includes("trending telugu hindi");
      const subQueries = isDefault
        ? [
            "latest telugu video songs 2026",
            "latest hindi video songs 2026",
            "trending telugu hd video songs",
            "trending hindi hd video songs",
            "new telugu movie video songs",
            "new hindi movie video songs"
          ]
        : [
            searchQuery,
            `${searchQuery} video song hd`,
            `${searchQuery} official video song`
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
      const res = await api.searchSongs(`${searchQuery}`, 1, 30);
      const items = extractResults(res);

      const resolvedFallback: (VideoItem | null)[] = await Promise.all(
        items.map(async (item) => {
          const song = mapApiSong(item);
          let ytId = item.id?.startsWith("yt-") ? item.id.replace("yt-", "") : "";
          if (!ytId || !/^[a-zA-Z0-9_-]{11}$/.test(ytId)) {
            ytId = await getYouTubeVideoId(song.title, song.artist);
          }
          const validVId = (ytId && /^[a-zA-Z0-9_-]{11}$/.test(ytId) && ytId !== "0xMQfnTU6oo") ? ytId : "";
          if (!validVId) return null;
          const vItem: VideoItem = {
            id: `yt_${validVId}`,
            videoId: validVId,
            title: decodeHtmlEntities(song.title),
            artist: decodeHtmlEntities(song.artist),
            thumbnail: `https://i.ytimg.com/vi/${validVId}/hqdefault.jpg`,
            duration: song.duration,
          };
          return vItem;
        })
      );

      const validItems = resolvedFallback.filter((v): v is VideoItem => Boolean(v) && !seenIds.has(v!.id));
      if (validItems.length > 0) {
        setVideos(validItems);
      }
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
        "top telugu video songs 4k",
        "top hindi video songs 4k",
        "superhit telugu video songs 2026",
        "superhit hindi video songs 2026",
        "latest telugu official video songs",
        "latest hindi official video songs"
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
    try {
      TrackPlayer.pause().catch(() => {});
    } catch {}
    setSelectedInstanceIndex(0);
    setIsVideoBlocked(false);
    setIsMinimized(false);
    setIsPipPlaying(true);
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

  const handleShouldStartLoad = useCallback((request: any) => {
    const url = (request.url || "").toLowerCase();
    if (
      url.includes("googleads") ||
      url.includes("doubleclick.net") ||
      url.includes("/pagead/") ||
      url.includes("/api/stats/ads") ||
      url.includes("googleadservices") ||
      url.includes("googlesyndication") ||
      url.includes("ptracking") ||
      url.includes("ad_break")
    ) {
      return false;
    }
    // Block all YouTube external link navigations away from the embedded player
    if (
      url.includes("youtube.com/watch") ||
      url.includes("youtu.be") ||
      url.includes("youtube.com/channel") ||
      url.includes("youtube.com/user") ||
      url.includes("youtube.com/redirect") ||
      url.includes("m.youtube.com")
    ) {
      return false;
    }
    return true;
  }, []);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data && data.event === "VIDEO_PLAYING") {
        setIsPipPlaying(true);
      } else if (data && data.event === "VIDEO_PAUSED") {
        setIsPipPlaying(false);
      } else if (data && data.event === "VIDEO_ENDED") {
        playNextVideo();
      } else if (data && data.event === "VIDEO_BLOCKED") {
        setIsVideoBlocked(true);
        setSelectedInstanceIndex((prev) => (prev + 1) % VIDEO_EMBED_PROVIDERS.length);
      }
    } catch {}
  }, [playNextVideo]);

  const handleWebViewError = useCallback(() => {
    setIsVideoBlocked(true);
    setSelectedInstanceIndex((prev) => (prev + 1) % VIDEO_EMBED_PROVIDERS.length);
  }, []);

  const webViewSource = useMemo(() => {
    if (!targetId) return null;
    return {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body, html { background-color: #000; width: 100%; height: 100%; overflow: hidden; display: flex; align-items: center; justify-content: center; }
              .player-wrapper { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }
              #player, iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
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
              /* Clean Full Screen Player Rules: Hide Share button, Pause overlay cards, YouTube logo, Top channel title header, and Watermark */
              .ytp-share-button,
              .ytp-share-panel,
              .ytp-share-panel-link,
              .ytp-show-share-title,
              .ytp-share-title,
              .ytp-pause-overlay,
              .ytp-pause-overlay-container,
              .ytp-pause-overlay-shelf,
              .ytp-suggestion-link,
              .ytp-scroll-min,
              .ytp-pause-overlay-controls,
              .ytp-ce-element,
              .ytp-ce-video,
              .ytp-ce-channel,
              .ytp-ce-covering-overlay,
              .ytp-ce-element-show,
              .ytp-cards-teaser,
              .ytp-cards-button,
              .ytp-youtube-button,
              a.ytp-youtube-button,
              .ytp-title-channel,
              .ytp-title-link,
              a.ytp-title-link,
              .ytp-watermark,
              .ytp-gradient-top,
              .ytp-c4-brand-header,
              body.is-minimized .ytp-large-play-button,
              body.is-minimized .ytp-chrome-bottom,
              body.is-minimized .ytp-progress-bar-container,
              body.is-minimized .ytp-progress-bar,
              body.is-minimized .ytp-settings-menu,
              body.is-minimized .ytp-settings-button,
              body.is-minimized .ytp-subtitles-button,
              body.is-minimized .ytp-caption-window-container,
              body.is-minimized .ytp-panel-menu,
              body.is-minimized .ytp-menuitem,
              body.is-minimized .ytp-popup,
              body.is-minimized .ytp-contextmenu,
              body.is-minimized .ytp-play-button,
              body.is-minimized .ytp-button,
              body.is-minimized .ytp-title,
              body.is-minimized .ytp-spinner {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                transform: scale(0) !important;
                -webkit-transform: scale(0) !important;
              }
              /* Explicitly keep Settings gear button, Subtitles/Captions CC button, Progress bar, and Bottom controls ENABLED & VISIBLE in Full Screen */
              body:not(.is-minimized) .ytp-settings-button,
              body:not(.is-minimized) .ytp-subtitles-button,
              body:not(.is-minimized) .ytp-chrome-bottom,
              body:not(.is-minimized) .ytp-progress-bar-container,
              body:not(.is-minimized) .ytp-progress-bar,
              body:not(.is-minimized) .ytp-play-button {
                display: inline-block !important;
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
              }
              /* YouTube Settings & Quality Menu Touch Scrolling & Expanded Visibility */
              body:not(.is-minimized) .ytp-settings-menu,
              body:not(.is-minimized) .ytp-panel,
              body:not(.is-minimized) .ytp-popup {
                max-height: 85vh !important;
                overflow-y: auto !important;
                -webkit-overflow-scrolling: touch !important;
                z-index: 99999 !important;
              }
              body:not(.is-minimized) .ytp-panel-menu {
                max-height: 250px !important;
                overflow-y: auto !important;
                -webkit-overflow-scrolling: touch !important;
                padding-bottom: 8px !important;
              }
              body:not(.is-minimized) .ytp-menuitem {
                min-height: 32px !important;
                height: auto !important;
                padding: 4px 10px !important;
              }
            </style>
          </head>
          <body class="is-minimized">
            <div class="player-wrapper">
              <div id="player"></div>
            </div>
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
                    'fs': 0,
                    'iv_load_policy': 3,
                    'cc_load_policy': 0
                  },
                  events: {
                    'onStateChange': function(event) {
                      if (event && window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                        if (event.data === 1) {
                          window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'VIDEO_PLAYING' }));
                        } else if (event.data === 2) {
                          window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'VIDEO_PAUSED' }));
                        } else if (event.data === 0) {
                          window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'VIDEO_ENDED' }));
                        }
                      }
                    },
                    'onPlaybackRateChange': function(event) {
                      if (document.body.classList.contains('is-minimized')) {
                        if (event && event.data !== 1 && player && typeof player.setPlaybackRate === 'function') {
                          try { player.setPlaybackRate(1); } catch(err){}
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

              window.toggleVideoPlayback = function(shouldPlay) {
                try {
                  if (typeof player !== 'undefined' && player) {
                    if (shouldPlay && typeof player.playVideo === 'function') player.playVideo();
                    if (!shouldPlay && typeof player.pauseVideo === 'function') player.pauseVideo();
                  }
                  var cmd = shouldPlay ? 'playVideo' : 'pauseVideo';
                  var iframes = document.querySelectorAll('iframe');
                  for (var i = 0; i < iframes.length; i++) {
                    try {
                      iframes[i].contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args: [] }), '*');
                    } catch(e) {}
                  }
                  var vids = document.querySelectorAll('video');
                  for (var v = 0; v < vids.length; v++) {
                    if (vids[v]) {
                      if (shouldPlay) {
                        var p = vids[v].play();
                        if (p && typeof p.catch === 'function') p.catch(function(){});
                      } else {
                        vids[v].pause();
                      }
                    }
                  }
                } catch (err) {}
              };

              function attachVideoListeners() {
                try {
                  var vids = document.querySelectorAll('video');
                  for (var k = 0; k < vids.length; k++) {
                    vids[k].removeEventListener('play', onVidPlay);
                    vids[k].removeEventListener('pause', onVidPause);
                    vids[k].addEventListener('play', onVidPlay);
                    vids[k].addEventListener('pause', onVidPause);
                  }
                } catch(e) {}
              }
              function onVidPlay() {
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'VIDEO_PLAYING' }));
                }
              }
              function onVidPause() {
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'VIDEO_PAUSED' }));
                }
              }
              setInterval(function() {
                try {
                  // 1. Auto-click YouTube "Skip Ad" buttons immediately
                  var skipSelectors = [
                    '.ytp-ad-skip-button',
                    '.ytp-ad-skip-button-modern',
                    '.ytp-ad-skip-button-slot',
                    '.ytp-skip-ad-button',
                    '.ytp-ad-overlay-close-button'
                  ];
                  for (var k = 0; k < skipSelectors.length; k++) {
                    var skipBtns = document.querySelectorAll(skipSelectors[k]);
                    for (var b = 0; b < skipBtns.length; b++) {
                      if (skipBtns[b]) {
                        try { skipBtns[b].click(); } catch(e){}
                      }
                    }
                  }

                  // 2. Fast-forward video immediately if an ad is currently playing
                  var adShowing = document.querySelector('.ad-showing, .ad-interrupting, .video-ads');
                  var vid = document.querySelector('video');
                  if (adShowing && vid && isFinite(vid.duration) && vid.duration > 0) {
                    vid.currentTime = vid.duration - 0.1;
                    vid.playbackRate = 16;
                  }

                  // 3. Hide all ad elements
                  var adElements = document.querySelectorAll('.ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-image-overlay, .ytp-ad-overlay-slot, .ytd-promoted-sparkles-web-renderer');
                  for (var a = 0; a < adElements.length; a++) {
                    adElements[a].style.setProperty('display', 'none', 'important');
                    adElements[a].style.setProperty('visibility', 'hidden', 'important');
                  }

                  var allHideSelectors = [
                    '.ytp-large-play-button',
                    '.ytp-bezel',
                    '.ytp-bezel-text',
                    '.ytp-bezel-icon',
                    '.ytp-pause-overlay',
                    '.ytp-pause-overlay-container',
                    '.ytp-pause-overlay-shelf',
                    '.ytp-suggestion-link',
                    '.ytp-scroll-min',
                    '.ytp-pause-overlay-controls',
                    '.ytp-ce-element',
                    '.ytp-ce-video',
                    '.ytp-ce-channel',
                    '.ytp-ce-covering-overlay',
                    '.ytp-ce-element-show',
                    '.ytp-cards-teaser',
                    '.ytp-cards-button',
                    '.ytp-share-button',
                    '.ytp-share-panel',
                    '.ytp-share-panel-link',
                    '.ytp-show-share-title',
                    '.ytp-share-title',
                    '.ytp-paid-content-overlay',
                    '.ytp-gradient-top',
                    '.ytp-title',
                    'a.ytp-title-link',
                    'a.ytp-youtube-button',
                    '.ytp-youtube-button',
                    '.ytp-title-channel',
                    '.ytp-watermark'
                  ];
                  for (var h = 0; h < allHideSelectors.length; h++) {
                    var hideEls = document.querySelectorAll(allHideSelectors[h]);
                    for (var hd = 0; hd < hideEls.length; hd++) {
                      hideEls[hd].style.setProperty('display', 'none', 'important');
                      hideEls[hd].style.setProperty('visibility', 'hidden', 'important');
                      hideEls[hd].style.setProperty('opacity', '0', 'important');
                      hideEls[hd].style.setProperty('transform', 'scale(0)', 'important');
                      hideEls[hd].style.setProperty('-webkit-transform', 'scale(0)', 'important');
                    }
                  }
                  var iframes = document.querySelectorAll('iframe');
                  for (var f = 0; f < iframes.length; f++) {
                    try {
                      var doc = iframes[f].contentDocument || (iframes[f].contentWindow && iframes[f].contentWindow.document);
                      if (doc) {
                        for (var s2 = 0; s2 < allHideSelectors.length; s2++) {
                          var childEls = doc.querySelectorAll(allHideSelectors[s2]);
                          for (var c = 0; c < childEls.length; c++) {
                            childEls[c].style.setProperty('display', 'none', 'important');
                            childEls[c].style.setProperty('visibility', 'hidden', 'important');
                            childEls[c].style.setProperty('opacity', '0', 'important');
                            childEls[c].style.setProperty('transform', 'scale(0)', 'important');
                            childEls[c].style.setProperty('-webkit-transform', 'scale(0)', 'important');
                          }
                        }
                      }
                    } catch(e) {}
                  }
                } catch(e) {}
              }, 20);

              function handleMessageEvent(e) {
                try {
                  var raw = e.data;
                  if (typeof raw === 'string') {
                    var data = JSON.parse(raw);
                    if (data && data.type === 'TOGGLE_PLAY') {
                      if (typeof window.toggleVideoPlayback === 'function') {
                        window.toggleVideoPlayback(data.play);
                      }
                    }
                  }
                } catch(err) {}
              }
              document.addEventListener('message', handleMessageEvent);
              window.addEventListener('message', handleMessageEvent);

              if ('mediaSession' in navigator) {
                try {
                  navigator.mediaSession.setActionHandler('play', function() {
                    if (typeof window.toggleVideoPlayback === 'function') window.toggleVideoPlayback(true);
                  });
                  navigator.mediaSession.setActionHandler('pause', function() {
                    if (typeof window.toggleVideoPlayback === 'function') window.toggleVideoPlayback(false);
                  });
                } catch (e) {}
              }

              setInterval(attachVideoListeners, 1000);

              document.addEventListener('touchmove', function(e) {
                var settingsMenu = document.querySelector('.ytp-settings-menu, .ytp-panel-menu, .ytp-popup');
                if (settingsMenu && settingsMenu.contains(e.target)) {
                  e.stopPropagation();
                }
              }, { passive: false });
            </script>
          </body>
        </html>
      `,
      baseUrl: "https://www.google.com",
    };
  }, [targetId, selectedInstanceIndex]);

  const isVideosTab = (!activeTab || activeTab === "Videos") || isSystemPipActive;

  return (
    <View
      style={[
        styles.container,
        !isVideosTab && { backgroundColor: "transparent" },
      ]}
      pointerEvents={isVideosTab ? "auto" : (isMinimized || isSystemPipActive) ? "box-none" : "none"}
    >
      {/* Video Feed UI (Only visible on Videos tab) */}
      <View style={{ flex: 1, display: isVideosTab ? "flex" : "none" }}>
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
                        <MaterialCommunityIcons name="play" size={28} color="#ffffff" style={{ marginLeft: 3 }} />
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
      </View>

      {/* Persistent Single Video Player (Full Screen or Mini Draggable PiP) */}
      {activeVideo && (
        <Animated.View
          style={
            isSystemPipActive
              ? styles.pipVideoBoxFull
              : isMinimized
              ? [
                  styles.floatingPipContainer,
                  {
                    width: pipWidth,
                    height: Math.round(pipWidth * (9 / 16)),
                    transform: [
                      ...pan.getTranslateTransform(),
                      { scale: pinchScale },
                    ],
                  },
                ]
              : styles.fullScreenPlayerOverlay
          }
          {...(isMinimized && !isSystemPipActive ? panResponder.panHandlers : {})}
        >
          {!isMinimized && !isSystemPipActive && (
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
                    width: 24,
                    height: 24,
                    borderRadius: 12,
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
          <View style={(isMinimized || isSystemPipActive) ? styles.pipVideoBox : styles.videoPlayerBox}>
            {isResolvingVideo ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size={(isMinimized || isSystemPipActive) ? "small" : "large"} color="#1DB954" />
                {!isMinimized && !isSystemPipActive && <Text style={styles.loadingText}>Fetching official music video...</Text>}
              </View>
            ) : (
              webViewSource && (
                <WebView
                  ref={webViewRef}
                  key={`${activeVideo.videoId}_${selectedInstanceIndex}`}
                  pointerEvents={(isMinimized || isSystemPipActive) ? "none" : "auto"}
                  source={webViewSource}
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
                  injectedJavaScriptForMainFrameOnly={false}
                  injectedJavaScript={`
                    (function() {
                      function injectHideCSS() {
                        try {
                          var styleId = '__yt_custom_hide_styles__';
                          if (!document.getElementById(styleId)) {
                            var style = document.createElement('style');
                            style.id = styleId;
                            style.textContent = \`
                              .ytp-share-button,
                              .ytp-share-panel,
                              .ytp-share-panel-link,
                              .ytp-show-share-title,
                              .ytp-share-title,
                              .ytp-pause-overlay,
                              .ytp-pause-overlay-container,
                              .ytp-pause-overlay-shelf,
                              .ytp-suggestion-link,
                              .ytp-scroll-min,
                              .ytp-pause-overlay-controls,
                              .ytp-ce-element,
                              .ytp-ce-video,
                              .ytp-ce-channel,
                              .ytp-ce-covering-overlay,
                              .ytp-ce-element-show,
                              .ytp-cards-teaser,
                              .ytp-cards-button,
                              .ytp-youtube-button,
                              a.ytp-youtube-button,
                              .ytp-title-channel,
                              .ytp-title-link,
                              a.ytp-title-link,
                              .ytp-watermark,
                              .ytp-gradient-top,
                              .ytp-c4-brand-header {
                                display: none !important;
                                visibility: hidden !important;
                                opacity: 0 !important;
                                pointer-events: none !important;
                                transform: scale(0) !important;
                                -webkit-transform: scale(0) !important;
                              }
                              body:not(.is-minimized) .ytp-settings-button,
                              body:not(.is-minimized) .ytp-subtitles-button,
                              body:not(.is-minimized) .ytp-chrome-bottom,
                              body:not(.is-minimized) .ytp-right-controls,
                              body:not(.is-minimized) .ytp-progress-bar-container,
                              body:not(.is-minimized) .ytp-progress-bar,
                              body:not(.is-minimized) .ytp-play-button {
                                display: inline-block !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                                pointer-events: auto !important;
                              }
                            \`;
                            (document.head || document.documentElement).appendChild(style);
                          }
                        } catch (e) {}
                      }
                      injectHideCSS();
                      if (!window.__yt_hide_interval) {
                        window.__yt_hide_interval = setInterval(injectHideCSS, 50);
                      }

                      function handleCrossFrameMsg(e) {
                        try {
                          var raw = e.data;
                          var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                          if (data && data.type === 'TOGGLE_PLAY') {
                            var shouldPlay = Boolean(data.play);
                            if (typeof player !== 'undefined' && player) {
                              try {
                                if (shouldPlay && typeof player.playVideo === 'function') player.playVideo();
                                if (!shouldPlay && typeof player.pauseVideo === 'function') player.pauseVideo();
                              } catch(err) {}
                            }
                            var vids = document.querySelectorAll('video');
                            for (var v = 0; v < vids.length; v++) {
                              try {
                                if (shouldPlay) {
                                  var p = vids[v].play();
                                  if (p && typeof p.catch === 'function') p.catch(function(){});
                                } else {
                                  vids[v].pause();
                                }
                              } catch(err) {}
                            }
                          }
                        } catch(err) {}
                      }
                      if (!window.__yt_msg_listener) {
                        window.__yt_msg_listener = true;
                        window.addEventListener('message', handleCrossFrameMsg);
                        document.addEventListener('message', handleCrossFrameMsg);
                      }
                    })();
                    true;
                  `}
                  onShouldStartLoadWithRequest={handleShouldStartLoad}
                  onMessage={handleWebViewMessage}
                  onError={handleWebViewError}
                />
              )
            )}

            {/* Minimized Quick Control Badges & YouTube Touch/Link Blocker */}
            {isMinimized && !isSystemPipActive && (
              <>
                {/* Black Letterbox Mask Top (16%) & Bottom (16%) to cleanly cover YouTube header/footer & progress bar without squishing the 16:9 video */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '16%', backgroundColor: '#000', zIndex: 15 }} pointerEvents="none" />
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '16%', backgroundColor: '#000', zIndex: 15 }} pointerEvents="none" />

                {/* Full Frame Touch Overlay to Toggle Controls Visibility on Tap */}
                <TouchableOpacity
                  activeOpacity={1}
                  delayPressIn={0}
                  onPress={togglePipControls}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 20,
                  }}
                />

                {/* VISIBLE ONLY WHEN TOUCHED / TAPPED (AUTOHIDES AFTER 2 SECONDS) */}
                {showPipControls && (
                  <>
                    {/* Top-Right Controls: Expand Fullscreen, Close X */}
                    <Animated.View
                      style={[
                        styles.pipTopControls,
                        {
                          zIndex: 50,
                          elevation: 50,
                        },
                      ]}
                      pointerEvents="box-none"
                    >
                      <TouchableOpacity
                        delayPressIn={0}
                        onPress={(e) => {
                          e.stopPropagation();
                          togglePipControls();
                          setIsMinimized(false);
                          DeviceEventEmitter.emit("NAVIGATE_TO_TAB", "Videos");
                        }}
                        style={styles.pipIconBadge}
                        activeOpacity={0.7}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <MaterialCommunityIcons name="arrow-expand" size={16} color="#fff" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        delayPressIn={0}
                        onPress={(e) => {
                          e.stopPropagation();
                          togglePipControls();
                          setActiveVideo(null);
                          setIsMinimized(false);
                        }}
                        style={styles.pipIconBadge}
                        activeOpacity={0.7}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <MaterialCommunityIcons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </Animated.View>

                    {/* Bottom-Center Control: Play / Pause */}
                    <Animated.View
                      style={[
                        styles.pipBottomControls,
                        {
                          zIndex: 50,
                          elevation: 50,
                        },
                      ]}
                      pointerEvents="box-none"
                    >
                      <TouchableOpacity
                        delayPressIn={0}
                        onPress={(e) => {
                          e.stopPropagation();
                          togglePipControls();
                          handleTogglePipPlay();
                        }}
                        style={styles.pipPlayIconBadge}
                        activeOpacity={0.7}
                        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                      >
                        <MaterialCommunityIcons
                          name={isPipPlaying ? "pause" : "play"}
                          size={18}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    </Animated.View>
                  </>
                )}
              </>
            )}
          </View>

          {!isMinimized && !isSystemPipActive && (
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
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
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
    bottom: Platform.OS === "ios" ? 100 : 85,
    right: 14,
    width: 210,
    height: 118,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 16,
    borderWidth: 0,
    zIndex: 9999,
  },
  pipVideoBox: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  pipTopControls: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    gap: 6,
    zIndex: 100,
  },
  pipBottomControls: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    zIndex: 100,
  },
  pipIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  pipPlayIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 8,
  },
  pipVideoBoxFull: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
    zIndex: 99999,
  },
});
