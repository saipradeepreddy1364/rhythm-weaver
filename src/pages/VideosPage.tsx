import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, Platform, Modal, Dimensions, DeviceEventEmitter, AppState, Animated, PanResponder, Linking, Keyboard, RefreshControl, useWindowDimensions } from 'react-native'
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { Song, mapApiSong, decodeHtmlEntities } from "../data/songs";
import { api, extractResults } from "../services/api";
import { useLibrary, normalizeSongTitle } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import TrackPlayer from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

interface VideoItem {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
  uploadedAt?: string;
  views?: string;
}

function formatViews(views?: number | string): string {
  if (!views) return "";
  if (typeof views === "string") {
    if (views.toLowerCase().includes("view")) return views;
    const num = parseInt(views.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(num) && num > 0) return formatViews(num);
    return `${views} views`;
  }
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K views`;
  return `${views} views`;
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

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
                const uploadedAt = video.publishedTimeText?.simpleText || video.publishedTimeText?.runs?.[0]?.text || "";
                const views = video.shortViewCountText?.simpleText || video.viewCountText?.simpleText || video.viewCountText?.runs?.[0]?.text || "";

                videoItems.push({
                  id: `yt_${vId}`,
                  videoId: vId,
                  title: decodeHtmlEntities(title),
                  artist: decodeHtmlEntities(artist),
                  thumbnail,
                  uploadedAt: uploadedAt ? decodeHtmlEntities(uploadedAt) : undefined,
                  views: views ? decodeHtmlEntities(views) : undefined,
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
                  const uploadedAt = subVideo.publishedTimeText?.simpleText || subVideo.publishedTimeText?.runs?.[0]?.text || "";
                  const views = subVideo.shortViewCountText?.simpleText || subVideo.viewCountText?.simpleText || subVideo.viewCountText?.runs?.[0]?.text || "";

                  videoItems.push({
                    id: `yt_${vId}`,
                    videoId: vId,
                    title: decodeHtmlEntities(title),
                    artist: decodeHtmlEntities(artist),
                    thumbnail,
                    uploadedAt: uploadedAt ? decodeHtmlEntities(uploadedAt) : undefined,
                    views: views ? decodeHtmlEntities(views) : undefined,
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
                const uploadedAt = item.uploadedDate || item.publishedText || item.uploaded || "";
                const rawViews = item.views ?? item.viewCount;
                videoItems.push({
                  id: `yt_${vId}`,
                  videoId: vId,
                  title: decodeHtmlEntities(item.title || searchQuery),
                  artist: decodeHtmlEntities(item.uploaderName || item.author || "YouTube"),
                  thumbnail: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
                  uploadedAt: uploadedAt ? decodeHtmlEntities(uploadedAt) : undefined,
                  views: rawViews ? formatViews(rawViews) : undefined,
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

function VideosPageComponent({ onRequireAuth, activeTab, floatingOnly, isSystemPip: isSystemPipProp }: { onRequireAuth: () => void; activeTab?: string; floatingOnly?: boolean; isSystemPip?: boolean }) {
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
  const userToggleTimeRef = useRef<number>(0);
  const [isSystemPip, setIsSystemPip] = useState(isSystemPipProp || false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { currentSong } = usePlayer();

  // Sync activeVideo with currentSong only when a video is already active in the current session
  useEffect(() => {
    if (activeVideo && currentSong && currentSong.title) {
      const currentTitleKey = normalizeSongTitle(currentSong.title, currentSong.movie || currentSong.album);
      const activeTitleKey = normalizeSongTitle(activeVideo.title, "");

      if (currentTitleKey !== activeTitleKey) {
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
    const isEligible = isSystemPip ? Boolean(activeVideo) : Boolean(activeVideo && isPipPlaying);
    DeviceEventEmitter.emit("VIDEO_ACTIVE_CHANGED", isEligible);

    if (Platform.OS === 'android') {
      try {
        const { NativeModules } = require('react-native');
        if (NativeModules.PipModule && typeof NativeModules.PipModule.setPipEligible === 'function') {
          NativeModules.PipModule.setPipEligible(isEligible, isPipPlaying);
        }
      } catch {}
    }
  }, [activeVideo, isPipPlaying, isSystemPip]);

  // Listen for EQ settings changes and apply WebAudio EQ gains to WebView video player
  useEffect(() => {
    const applyEqToWebView = async () => {
      try {
        const raw = await AsyncStorage.getItem("rw_eq_settings");
        if (raw && webViewRef.current) {
          const parsed = JSON.parse(raw);
          const bassPct = parsed.bass ?? 85;
          const bandsArr = parsed.bands ?? [8, 6, 2, 0, 0];
          const enabled = parsed.enabled ?? true;

          const bassGain = Math.min(14, Math.max(-10, ((bassPct - 50) / 50) * 8 + (bandsArr[0] || 0)));
          const midGain = Math.min(12, Math.max(-10, (bandsArr[2] || 0)));
          const trebleGain = Math.min(12, Math.max(-10, (bandsArr[4] || 0)));

          const js = `if (typeof window.setWebViewEq === 'function') window.setWebViewEq(${bassGain}, ${midGain}, ${trebleGain}, ${enabled ? 'true' : 'false'}); true;`;
          webViewRef.current.injectJavaScript(js);
        }
      } catch {}
    };

    applyEqToWebView();
    const sub = DeviceEventEmitter.addListener("EQ_SETTINGS_CHANGED", applyEqToWebView);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    DeviceEventEmitter.emit("VIDEO_MINIMIZED_CHANGED", isMinimized);
    if (webViewRef.current) {
      try {
        const msg = JSON.stringify({ type: 'SET_MINIMIZED', minimized: isMinimized });
        webViewRef.current.postMessage(msg);
        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              window.postMessage(${msg}, '*');
              var iframes = document.querySelectorAll('iframe');
              for (var i = 0; i < iframes.length; i++) {
                try { iframes[i].contentWindow.postMessage(${msg}, '*'); } catch(e) {}
              }
            } catch(e) {}
          })();
          true;
        `);
      } catch (err) {}
    }
    // Auto-hide controls when minimized
    setShowPipControls(false);
  }, [isMinimized]);

  const handleTogglePipPlay = useCallback((overrideState?: boolean) => {
    try {
      TrackPlayer.pause().catch(() => {});
    } catch {}
    userToggleTimeRef.current = Date.now();
    setIsPipPlaying((prev) => {
      const nextState = typeof overrideState === 'boolean' ? overrideState : !prev;
      try {
        if (webViewRef.current) {
          const msg = JSON.stringify({ type: 'TOGGLE_PLAY', play: nextState });
          webViewRef.current.postMessage(msg);
          webViewRef.current.injectJavaScript(`
            (function() {
              try {
                var shouldPlay = ${nextState ? 'true' : 'false'};
                if (typeof window.toggleVideoPlayback === 'function') {
                  window.toggleVideoPlayback(shouldPlay);
                } else {
                  if (typeof player !== 'undefined' && player) {
                    if (shouldPlay && typeof player.playVideo === 'function') player.playVideo();
                    if (!shouldPlay && typeof player.pauseVideo === 'function') player.pauseVideo();
                  }
                  var vids = document.querySelectorAll('video');
                  for (var j = 0; j < vids.length; j++) {
                    if (shouldPlay) { vids[j].play(); } else { vids[j].pause(); }
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

  useEffect(() => {
    const pipSub = DeviceEventEmitter.addListener("ON_PIP_MODE_CHANGED", (data: any) => {
      if (data && typeof data.isInPictureInPictureMode === "boolean") {
        setIsSystemPip(data.isInPictureInPictureMode);
      }
    });
    const playPauseSub = DeviceEventEmitter.addListener("ON_PIP_PLAY_PAUSE_PRESSED", () => {
      handleTogglePipPlay();
    });
    const audioFocusSub = DeviceEventEmitter.addListener("ON_AUDIO_FOCUS_GAINED", () => {
      if (activeVideo && !isPipPlaying) {
        handleTogglePipPlay(true);
      }
    });
    return () => {
      pipSub.remove();
      playPauseSub.remove();
      audioFocusSub.remove();
    };
  }, [handleTogglePipPlay, activeVideo, isPipPlaying]);

  const isSystemPipActive = Boolean(isSystemPipProp || isSystemPip);
  const isSystemPipRef = useRef(false);
  isSystemPipRef.current = isSystemPipActive;

  const pipControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webViewRef = useRef<any>(null);

  const togglePipControls = useCallback((forceState?: boolean) => {
    setShowPipControls((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      if (pipControlsTimeoutRef.current) {
        clearTimeout(pipControlsTimeoutRef.current);
        pipControlsTimeoutRef.current = null;
      }
      if (next) {
        pipControlsTimeoutRef.current = setTimeout(() => {
          setShowPipControls(false);
        }, 2500);
      }
      return next;
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
              const targetWidth = (baseWidthRef.current || 210) * scale;
              const clampedWidth = Math.max(140, Math.min(windowWidth - 16, Math.round(targetWidth)));
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

  // Auto-minimize active video when switching tabs away from Videos ONLY if video is actively playing
  const prevTabRef = useRef(activeTab);

  useEffect(() => {
    const prevTab = prevTabRef.current;
    prevTabRef.current = activeTab;

    if (activeTab && activeTab !== "Videos" && prevTab === "Videos") {
      if (activeVideo && isPipPlaying && !isMinimized) {
        setIsMinimized(true);
      }
    } else if (activeTab && activeTab !== "Videos" && (!isPipPlaying || !activeVideo) && isMinimized) {
      setIsMinimized(false);
    }
  }, [activeTab, activeVideo, isPipPlaying]);

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

  // Video playback continues playing when minimizing app (phone calls / explicit pause events trigger PAUSE_ACTIVE_VIDEO)
  useEffect(() => {
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
      const TRENDING_POOL = [
        "latest telugu video songs 2026",
        "latest hindi video songs 2026",
        "trending telugu hd video songs",
        "trending hindi hd video songs",
        "new telugu movie video songs",
        "new hindi movie video songs",
        "top telugu melody video songs 4k",
        "top hindi romantic video songs 4k",
        "telugu party dance video songs",
        "hindi party dance video songs",
        "telugu mass folk video songs",
        "hindi unplugged lo-fi video songs"
      ];
      const subQueries = isDefault
        ? shuffleArray(TRENDING_POOL).slice(0, 4)
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
        setVideos(isDefault ? shuffleArray(combined) : combined);
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

  const injectedBeforeContentLoaded = useMemo(() => {
    return `
      (function() {
        try {
          // 1. Intercept fetch calls to block ad networks and scrub player response JSON
          var origFetch = window.fetch;
          if (origFetch) {
            window.fetch = function() {
              var url = arguments[0];
              var urlStr = typeof url === 'string' ? url : (url && url.url) ? url.url : '';
              if (urlStr && (
                urlStr.indexOf('googleads') !== -1 ||
                urlStr.indexOf('doubleclick.net') !== -1 ||
                urlStr.indexOf('/pagead/') !== -1 ||
                urlStr.indexOf('/api/stats/ads') !== -1 ||
                urlStr.indexOf('ad_break') !== -1 ||
                urlStr.indexOf('ptracking') !== -1 ||
                urlStr.indexOf('get_midroll_info') !== -1 ||
                urlStr.indexOf('adunit') !== -1
              )) {
                return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
              }
              return origFetch.apply(this, arguments).then(function(res) {
                if (urlStr && (urlStr.indexOf('/player') !== -1 || urlStr.indexOf('/watch') !== -1)) {
                  return res.clone().json().then(function(data) {
                    if (data) {
                      delete data.adPlacements;
                      delete data.playerAds;
                      delete data.adSlots;
                      delete data.adParams;
                    }
                    return new Response(JSON.stringify(data), {
                      status: res.status,
                      statusText: res.statusText,
                      headers: res.headers
                    });
                  }).catch(function() { return res; });
                }
                return res;
              });
            };
          }

          // 2. Intercept XHR calls to block ad networks
          var origOpen = XMLHttpRequest.prototype.open;
          if (origOpen) {
            XMLHttpRequest.prototype.open = function(method, url) {
              var urlStr = typeof url === 'string' ? url : '';
              if (urlStr && (
                urlStr.indexOf('googleads') !== -1 ||
                urlStr.indexOf('doubleclick.net') !== -1 ||
                urlStr.indexOf('/pagead/') !== -1 ||
                urlStr.indexOf('/api/stats/ads') !== -1 ||
                urlStr.indexOf('ad_break') !== -1 ||
                urlStr.indexOf('ptracking') !== -1 ||
                urlStr.indexOf('get_midroll_info') !== -1 ||
                urlStr.indexOf('adunit') !== -1
              )) {
                this.isAdRequest = true;
              }
              return origOpen.apply(this, arguments);
            };
          }

          var origSend = XMLHttpRequest.prototype.send;
          if (origSend) {
            XMLHttpRequest.prototype.send = function(body) {
              if (this.isAdRequest) {
                try {
                  Object.defineProperty(this, 'readyState', { value: 4, writable: true });
                  Object.defineProperty(this, 'status', { value: 200, writable: true });
                  Object.defineProperty(this, 'responseText', { value: '{}', writable: true });
                  if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
                  if (typeof this.onload === 'function') this.onload();
                } catch(e) {}
                return;
              }
              return origSend.apply(this, arguments);
            };
          }
        } catch(e) {}
      })();
      true;
    `;
  }, []);

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
      url.includes("ad_break") ||
      url.includes("adunit") ||
      url.includes("get_midroll_info")
    ) {
      return false;
    }
    // Open YouTube external links in YouTube app or system browser
    if (
      url.includes("youtube.com/watch") ||
      url.includes("youtu.be") ||
      url.includes("youtube.com/channel") ||
      url.includes("youtube.com/user") ||
      url.includes("youtube.com/redirect") ||
      url.includes("m.youtube.com")
    ) {
      if (request.url) {
        Linking.openURL(request.url).catch(() => {});
      }
      return false;
    }
    return true;
  }, []);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      const isRecentUserToggle = Date.now() - userToggleTimeRef.current < 2500;
      if (data && data.event === "VIDEO_PLAYING") {
        if (!isRecentUserToggle) setIsPipPlaying(true);
      } else if (data && data.event === "VIDEO_PAUSED") {
        if (!isRecentUserToggle) setIsPipPlaying(false);
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
    const isPipedOrInvidious = providerBase && !providerBase.includes("youtube");
    return {
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body, html { background-color: #000; width: 100%; height: 100%; overflow: hidden; display: flex; align-items: center; justify-content: center; }
              .player-wrapper { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; }
              #player, iframe {
                position: absolute !important;
                top: 50% !important;
                left: 50% !important;
                width: 100% !important;
                height: 100% !important;
                min-width: 177.78vh !important;
                min-height: 56.25vw !important;
                transform: translate(-50%, -50%) !important;
                -webkit-transform: translate(-50%, -50%) !important;
                border: none !important;
              }
              /* 100% Zero-Ad Youtube CSS Rules */
              .ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-message-container,
              .ytp-ad-preview-container, .ytp-ad-skip-button-slot, .ytp-ad-text,
              .video-ads, .ytp-ad-player-overlay, .ytp-ad-image-overlay,
              .annotation, .ytp-paid-content-overlay, .ytp-ad-action-interstitial,
              .ytp-ad-overlay-slot {
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
              .ytp-impression-link,
              .ytp-watch-later-button,
              .ytp-overflow-button,
              .ytp-videowall-still,
              .ytp-videowall-still-info,
              .ytp-videowall-still-image,
              .ytp-title,
              .ytp-title-text,
              .ytp-title-channel,
              .ytp-title-link,
              a.ytp-title-link,
              .ytp-watermark,
              a.ytp-watermark,
              .ytp-gradient-top,
              .ytp-c4-brand-header,
              .ytp-chrome-top,
              .ytp-paid-content-overlay,
              .ytp-ad-overlay-container,
              body.is-minimized .ytp-large-play-button,
              body.is-minimized .ytp-chrome-top,
              body.is-minimized .ytp-chrome-bottom,
              body.is-minimized .ytp-gradient-top,
              body.is-minimized .ytp-gradient-bottom,
              body.is-minimized .ytp-mobile-content-overlay,
              body.is-minimized .ytp-mobile-controls-overlay,
              body.is-minimized .ytp-bezel,
              body.is-minimized .ytp-bezel-text-wrapper,
              body.is-minimized .ytp-pause-overlay,
              body.is-minimized .ytp-pause-overlay-container,
              body.is-minimized .ytp-unstarted-overlay,
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
              video, .html5-main-video, .html5-video-container,
              :fullscreen video, :-webkit-full-screen video, .ytp-fullscreen video {
                width: 100% !important;
                height: 100% !important;
                object-fit: cover !important;
                object-position: center center !important;
              }
              /* Explicitly keep Settings gear button, Subtitles/Captions CC button, Progress bar, and Bottom controls ENABLED & VISIBLE in Full Screen */
              body:not(.is-minimized) .ytp-settings-button,
              body:not(.is-minimized) .ytp-subtitles-button,
              body:not(.is-minimized) .ytp-fullscreen-button,
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
              ${
                isPipedOrInvidious
                  ? `
                var container = document.getElementById('player');
                var iframe = document.createElement('iframe');
                iframe.src = "${providerBase}/${targetId}?autoplay=1&listen=false";
                iframe.allow = "autoplay; encrypted-media; picture-in-picture";
                iframe.allowFullscreen = true;
                iframe.onerror = function() {
                  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'VIDEO_BLOCKED' }));
                  }
                };
                container.appendChild(iframe);
              `
                  : `
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
                    host: 'https://www.youtube-nocookie.com',
                    playerVars: {
                      'autoplay': 1,
                      'controls': 1,
                      'rel': 0,
                      'modestbranding': 1,
                      'playsinline': 1,
                      'enablejsapi': 1,
                      'fs': 1,
                      'iv_load_policy': 3,
                      'cc_load_policy': 0,
                      'adformat': '0'
                    },
                    events: {
                      'onStateChange': function(event) {
                        try {
                          if (event.data === 1) {
                            document.body.classList.remove('is-paused');
                          } else if (event.data === 2 || event.data === -1 || event.data === 5) {
                            document.body.classList.add('is-paused');
                          }
                        } catch(e) {}
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
              `
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
                    '.ytp-ad-overlay-close-button',
                    '.ytp-ad-skip-button-container',
                    'button.ytp-ad-skip-button-text',
                    '.ytp-ad-skip-button-text'
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
                  var adShowing = document.querySelector('.ad-showing, .ad-interrupting, .video-ads, .ytp-ad-player-overlay');
                  var vid = document.querySelector('video');
                  if (adShowing && vid && isFinite(vid.duration) && vid.duration > 0) {
                    vid.currentTime = vid.duration - 0.001;
                    vid.playbackRate = 16;
                    vid.muted = true;
                  }

                  // 3. Hide all ad elements
                  var adElements = document.querySelectorAll('.ytp-ad-module, .ytp-ad-overlay-container, .ytp-ad-image-overlay, .ytp-ad-overlay-slot, .ytd-promoted-sparkles-web-renderer');
                  for (var a = 0; a < adElements.length; a++) {
                    adElements[a].style.setProperty('display', 'none', 'important');
                    adElements[a].style.setProperty('visibility', 'hidden', 'important');
                  }
                } catch(e) {}
              }, 500);

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
                    if (data && data.type === 'SET_MINIMIZED') {
                      if (data.minimized) {
                        document.body.classList.add('is-minimized');
                      } else {
                        document.body.classList.remove('is-minimized');
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

              var audioCtx = null;
              var bassFilter = null;
              var midFilter = null;
              var trebleFilter = null;
              var videoSource = null;

              function initWebAudioEQ() {
                try {
                  var vid = document.querySelector('video');
                  if (!vid || vid.hasWebAudioEq) return;
                  vid.hasWebAudioEq = true;

                  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                  videoSource = audioCtx.createMediaElementSource(vid);

                  bassFilter = audioCtx.createBiquadFilter();
                  bassFilter.type = 'lowshelf';
                  bassFilter.frequency.value = 250;

                  midFilter = audioCtx.createBiquadFilter();
                  midFilter.type = 'peaking';
                  midFilter.frequency.value = 1000;
                  midFilter.Q.value = 1.0;

                  trebleFilter = audioCtx.createBiquadFilter();
                  trebleFilter.type = 'highshelf';
                  trebleFilter.frequency.value = 4000;

                  videoSource.connect(bassFilter);
                  bassFilter.connect(midFilter);
                  midFilter.connect(trebleFilter);
                  trebleFilter.connect(audioCtx.destination);
                } catch(e) {}
              }

              window.setWebViewEq = function(bassGain, midGain, trebleGain, enabled) {
                try {
                  if (!audioCtx) initWebAudioEQ();
                  if (audioCtx && audioCtx.state === 'suspended') {
                    audioCtx.resume();
                  }
                  if (bassFilter && midFilter && trebleFilter) {
                    bassFilter.gain.value = enabled ? bassGain : 0;
                    midFilter.gain.value = enabled ? midGain : 0;
                    trebleFilter.gain.value = enabled ? trebleGain : 0;
                  }
                  var vids = document.querySelectorAll('video');
                  for (var v = 0; v < vids.length; v++) {
                    if (vids[v]) {
                      var mult = enabled ? Math.min(1.0, Math.max(0.2, 0.8 + (bassGain / 20.0) + (midGain / 25.0))) : 1.0;
                      vids[v].volume = mult;
                    }
                  }
                } catch(e) {}
              };

              setInterval(function() {
                try {
                  var vid = document.querySelector('video');
                  if (vid && !vid.hasWebAudioEq) {
                    initWebAudioEQ();
                  }
                } catch(e) {}
              }, 1500);

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
      baseUrl: "https://www.youtube-nocookie.com",
    };
  }, [targetId, selectedInstanceIndex, providerBase]);

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
              placeholder="Search music videos..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                delayPressIn={0}
                onPress={() => {
                  isSelectingSuggestionRef.current = false;
                  setQuery("");
                  setSuggestions([]);
                  setShowSuggestions(false);
                  setVideos([]);
                  setLoading(true);
                  fetchTrendingVideos("trending telugu hindi video songs 2026", true);
                }}
              >
                <MaterialCommunityIcons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            )}
          </View>

          {/* Fullscreen backdrop to block touch events from reaching video feed below suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <TouchableOpacity
              activeOpacity={1}
              style={styles.suggestionsBackdrop}
              onPress={() => {
                setShowSuggestions(false);
                Keyboard.dismiss();
              }}
            />
          )}

          {/* Live Autocomplete Suggestions Dropdown Box */}
          {showSuggestions && suggestions.length > 0 && (
            <View
              style={styles.suggestionsBox}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onStartShouldSetResponderCapture={() => true}
            >
              <ScrollView
                keyboardShouldPersistTaps="always"
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
                scrollEnabled={true}
                style={{ maxHeight: 240 }}
                onScrollBeginDrag={(e) => e.stopPropagation?.()}
              >
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
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => {
            Keyboard.dismiss();
            setShowSuggestions(false);
          }}
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
                      {item.uploadedAt ? (
                        <Text style={styles.videoSubMeta} numberOfLines={1}>{item.uploadedAt}</Text>
                      ) : null}
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
              <TouchableOpacity delayPressIn={0} onPress={() => setIsMinimized(true)} style={styles.closeBtn} activeOpacity={0.7}>
                <MaterialCommunityIcons name="chevron-down" size={28} color="#fff" />
              </TouchableOpacity>

              {/* Centered Controls Row: Previous, Next, Like */}
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <TouchableOpacity delayPressIn={0} onPress={playPrevVideo} style={{ padding: 6 }} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="skip-previous" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity delayPressIn={0} onPress={playNextVideo} style={{ padding: 6 }} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="skip-next" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity delayPressIn={0} onPress={() => toggleLikeVideo(activeVideo)} style={{ padding: 6 }} activeOpacity={0.7}>
                  <MaterialCommunityIcons
                    name={isVideoLiked(activeVideo) ? "heart" : "heart-outline"}
                    size={22}
                    color={isVideoLiked(activeVideo) ? "#1DB954" : "#fff"}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity delayPressIn={0} onPress={() => { setActiveVideo(null); setIsMinimized(false); }} style={styles.closeBtn} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={24} color="#fff" />
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
                  pointerEvents="auto"
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
                  playInBackground={true}
                  injectedJavaScript={`
                    (function() {
                      function updateFrameStyles() {
                        try {
                          var styleId = '__yt_dynamic_frame_styles__';
                          var style = document.getElementById(styleId);
                          if (!style) {
                            style = document.createElement('style');
                            style.id = styleId;
                            style.textContent = '.ytp-share-button, .ytp-share-panel, .ytp-share-panel-link, .ytp-show-share-title, ' +
                              '.ytp-share-title, .ytp-pause-overlay, .ytp-pause-overlay-container, .ytp-pause-overlay-shelf, ' +
                              '.ytp-suggestion-link, .ytp-scroll-min, .ytp-pause-overlay-controls, .ytp-ce-element, ' +
                              '.ytp-ce-video, .ytp-ce-channel, .ytp-ce-covering-overlay, .ytp-ce-element-show, ' +
                              '.ytp-cards-teaser, .ytp-cards-button, .ytp-youtube-button, a.ytp-youtube-button, ' +
                              '.ytp-impression-link, .ytp-watch-later-button, .ytp-overflow-button, .ytp-videowall-still, ' +
                              '.ytp-videowall-still-info, .ytp-videowall-still-image, .ytp-title-channel, .ytp-title-link, ' +
                              'a.ytp-title-link, .ytp-watermark, a.ytp-watermark, .ytp-gradient-top, .ytp-c4-brand-header, ' +
                              '.ytp-chrome-top, .ytp-title, .ytp-title-text, .ytp-paid-content-overlay, .ytp-ad-overlay-container { ' +
                              '  display: none !important; visibility: hidden !important; opacity: 0 !important; ' +
                              '  pointer-events: none !important; transform: scale(0) !important; -webkit-transform: scale(0) !important; ' +
                              '} ' +
                              'video, .html5-main-video, .html5-video-container, #player, iframe, ' +
                              ':fullscreen video, :-webkit-full-screen video, .ytp-fullscreen video { ' +
                              '  position: absolute !important; top: 0 !important; left: 0 !important; margin: 0 !important; padding: 0 !important; ' +
                              '  width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; ' +
                              '  object-fit: cover !important; object-position: center center !important; transform: none !important; -webkit-transform: none !important; ' +
                              '} ' +
                              'body:not(.is-minimized) .ytp-settings-button, body:not(.is-minimized) .ytp-subtitles-button, ' +
                              'body:not(.is-minimized) .ytp-fullscreen-button, body:not(.is-minimized) .ytp-chrome-bottom, ' +
                              'body:not(.is-minimized) .ytp-right-controls, body:not(.is-minimized) .ytp-progress-bar-container, ' +
                              'body:not(.is-minimized) .ytp-progress-bar, body:not(.is-minimized) .ytp-play-button { ' +
                              '  display: inline-block !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; ' +
                              '} ' +
                              'body.is-minimized .ytp-chrome-bottom, body.is-minimized .ytp-chrome-top, ' +
                              'body.is-minimized .ytp-gradient-top, body.is-minimized .ytp-gradient-bottom, ' +
                              'body.is-minimized .ytp-mobile-content-overlay, body.is-minimized .ytp-mobile-controls-overlay, ' +
                              'body.is-minimized .ytp-bezel, body.is-minimized .ytp-pause-overlay, ' +
                              'body.is-minimized .ytp-unstarted-overlay, body.is-minimized .ytp-large-play-button, ' +
                              'body.is-minimized .ytp-progress-bar-container, body.is-minimized .ytp-progress-bar, ' +
                              'body.is-minimized .ytp-settings-menu, body.is-minimized .ytp-settings-button, ' +
                              'body.is-minimized .ytp-subtitles-button, body.is-minimized .ytp-play-button { ' +
                              '  display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; ' +
                              '}';
                            (document.head || document.documentElement).appendChild(style);
                          }
                        } catch (e) {}
                      }
                      updateFrameStyles();

                      function purgeElements() {
                        try {
                          // 1. Auto-skip Video Ads & 16x fast-forward ad playback
                          var skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container, .ytp-ad-preview-container');
                          if (skipBtn) {
                            try { skipBtn.click(); } catch(e) {}
                          }
                          var adShowing = document.querySelector('.ad-interrupting, .ad-showing, .video-ads, .ytp-ad-player-overlay, .ytp-ad-module');
                          var adVids = document.querySelectorAll('video');
                          for (var k = 0; k < adVids.length; k++) {
                            try {
                              if (adShowing || adVids[k].classList.contains('ad-showing')) {
                                adVids[k].muted = true;
                                adVids[k].playbackRate = 16.0;
                                if (!isNaN(adVids[k].duration) && adVids[k].currentTime < adVids[k].duration) {
                                  adVids[k].currentTime = adVids[k].duration - 0.001;
                                }
                              }
                            } catch(e) {}
                          }
                          // 2. Remove unwanted ad & control overlays
                          var selectors = [
                            '.ytp-ad-module',
                            '.ytp-ad-overlay-container',
                            '.ytp-ad-message-container',
                            '.ytp-ad-preview-container',
                            '.ytp-ad-skip-button-slot',
                            '.ytp-ad-text',
                            '.video-ads',
                            '.ytp-ad-player-overlay',
                            '.ytp-ad-image-overlay',
                            '.annotation',
                            '.ytp-paid-content-overlay',
                            '.ytp-ad-action-interstitial',
                            '.ytp-ad-overlay-slot',
                            '.ytp-share-button',
                            '.ytp-share-panel',
                            '.ytp-share-panel-link',
                            '.ytp-show-share-title',
                            '.ytp-share-title',
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
                            '.ytp-youtube-button',
                            'a.ytp-youtube-button',
                            '.ytp-impression-link',
                            '.ytp-watch-later-button',
                            '.ytp-overflow-button',
                            '.ytp-videowall-still',
                            '.ytp-videowall-still-info',
                            '.ytp-videowall-still-image',
                            '.ytp-title-channel',
                            '.ytp-title-link',
                            'a.ytp-title-link',
                            '.ytp-watermark',
                            'a.ytp-watermark',
                            '.ytp-gradient-top',
                            '.ytp-c4-brand-header',
                            '.ytp-chrome-top',
                            '.ytp-title',
                            '.ytp-title-text'
                          ];
                          for (var i = 0; i < selectors.length; i++) {
                            var els = document.querySelectorAll(selectors[i]);
                            for (var j = 0; j < els.length; j++) {
                              try {
                                els[j].remove();
                              } catch(err) {
                                try {
                                  els[j].style.setProperty('display', 'none', 'important');
                                  els[j].style.setProperty('visibility', 'hidden', 'important');
                                  els[j].style.setProperty('opacity', '0', 'important');
                                  els[j].style.setProperty('pointer-events', 'none', 'important');
                                } catch(e) {}
                              }
                            }
                          }
                        } catch(e) {}
                      }
                      setInterval(purgeElements, 400);

                      function handleCrossFrameMsg(e) {
                        try {
                          var raw = e.data;
                          var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                          if (data && data.type === 'SET_MINIMIZED') {
                            isMinMode = Boolean(data.minimized);
                            updateFrameStyles();
                            purgeElements();
                          }
                          if (data && (data.type === 'TOGGLE_PLAY' || data.func === 'playVideo' || data.func === 'pauseVideo')) {
                            var shouldPlay = data.type === 'TOGGLE_PLAY' ? Boolean(data.play) : (data.func === 'playVideo');
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
                                  var promise = vids[v].play();
                                  if (promise && typeof promise.catch === 'function') {
                                    promise.catch(function() {
                                      try { if (typeof player !== 'undefined' && player.playVideo) player.playVideo(); } catch(e) {}
                                    });
                                  }
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

                {/* Full Frame Touch Overlay to Toggle Controls Visibility (Show/Hide on Single Tap) */}
                <TouchableOpacity
                  activeOpacity={1}
                  delayPressIn={0}
                  onPress={() => togglePipControls()}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 20,
                  }}
                />

                {/* VISIBLE ONLY WHEN TOUCHED / TAPPED (AUTOHIDES AFTER 2.5 SECONDS OR INSTANTLY ON RE-TAP) */}
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
                          togglePipControls(false);
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
                          try {
                            webViewRef.current?.injectJavaScript("if(player && player.pauseVideo) player.pauseVideo(); true;");
                          } catch(err) {}
                          togglePipControls(false);
                          setActiveVideo(null);
                          setIsMinimized(false);
                          setIsPipPlaying(false);
                        }}
                        style={styles.pipIconBadge}
                        activeOpacity={0.7}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <MaterialCommunityIcons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </Animated.View>

                    {/* Bottom Controls Row: Previous, Play/Pause, Next */}
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
                          playPrevVideo();
                          togglePipControls(true);
                        }}
                        style={styles.pipIconBadge}
                        activeOpacity={0.7}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <MaterialCommunityIcons name="skip-previous" size={16} color="#fff" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        delayPressIn={0}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleTogglePipPlay();
                          togglePipControls(true);
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

                      <TouchableOpacity
                        delayPressIn={0}
                        onPress={(e) => {
                          e.stopPropagation();
                          playNextVideo();
                          togglePipControls(true);
                        }}
                        style={styles.pipIconBadge}
                        activeOpacity={0.7}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <MaterialCommunityIcons name="skip-next" size={16} color="#fff" />
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
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.infoHeading}>{activeVideo.title}</Text>
                <Text style={styles.infoSub}>{activeVideo.artist}</Text>
              </View>

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
                        {item.uploadedAt ? (
                          <Text style={styles.upNextSubMeta} numberOfLines={1}>{item.uploadedAt}</Text>
                        ) : null}
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
  videoSubMeta: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    marginTop: 3,
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
  upNextSubMeta: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    marginTop: 2,
  },
  suggestionsBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: -9999,
    backgroundColor: "transparent",
    zIndex: 9990,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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

export default React.memo(VideosPageComponent);
