import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Modal, ActivityIndicator, Linking, Platform, PanResponder, Dimensions } from 'react-native'
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Animated } from 'react-native';
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePlayer } from "../context/PlayerContext";
import { formatDuration, Song } from "../data/songs";
import { LikeButton } from "./LikeButton";
import { useLibrary } from "../context/LibraryContext";

interface FullPlayerProps {
  onRequireAuth?: () => void;
}

type TabType = "cover" | "lyrics" | "video";

interface VideoStream {
  url: string;
  quality: string;
}

const PIPED_INSTANCES = [
  "https://pipedapi.adminforge.de",
  "https://pipedapi.projectsegfau.lt",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi-libre.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://api.looleh.xyz"
];

const INVIDIOUS_INSTANCES = [
  "https://iv.melmac.space",
  "https://invidious.flokinet.to",
  "https://invidious.privacydev.net",
  "https://invidious.projectsegfau.lt",
  "https://invidious.lunar.host",
  "https://inv.tux.pizza"
];

async function resolveVideoStreams(song: Song): Promise<VideoStream[]> {
  const songId = song.id;
  
  // 1. If it's a YouTube song, resolve streams directly
  if (songId.startsWith("yt-")) {
    const videoId = songId.replace("yt-", "");
    const piped = await fetchPipedStreams(videoId);
    if (piped.length > 0) return piped;
    return await fetchInvidiousStreams(videoId);
  }

  // 2. If it's a JioSaavn song, try the backend's video-url matching first
  try {
    const res = await Promise.race([
      fetch(`https://musicbackend-xg4u.onrender.com/api/songs/${songId}/video-url`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
    ]);
    if (res.ok) {
      const data = await res.json();
      const streams: VideoStream[] = data.streams ?? data.data?.streams ?? (Array.isArray(data) ? data : []);
      if (Array.isArray(streams) && streams.length > 0) {
        return streams.map(s => ({ url: s.url, quality: s.quality }));
      }
    }
  } catch (err) {
    console.log("[FullPlayer] Backend video-url resolve failed, falling back to Piped search:", err);
  }

  // 3. Fallback: Search YouTube via Piped/Invidious to match the song
  const query = `${song.title} ${song.artist} official video`;
  for (const instance of PIPED_INSTANCES) {
    try {
      const searchRes = await Promise.race([
        fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      const items = searchData.items || [];
      const firstVideoId = items[0]?.videoId;
      if (firstVideoId) {
        console.log(`[FullPlayer] Piped search resolved video ID: ${firstVideoId}`);
        const streams = await fetchPipedStreams(firstVideoId, instance);
        if (streams.length > 0) return streams;
        const invidiousStreams = await fetchInvidiousStreams(firstVideoId);
        if (invidiousStreams.length > 0) return invidiousStreams;
      }
    } catch { /* try next instance */ }
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const searchRes = await Promise.race([
        fetch(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      const items = Array.isArray(searchData) ? searchData : [];
      const firstVideoId = items[0]?.videoId;
      if (firstVideoId) {
        console.log(`[FullPlayer] Invidious search resolved video ID: ${firstVideoId}`);
        const streams = await fetchInvidiousStreams(firstVideoId);
        if (streams.length > 0) return streams;
      }
    } catch { /* try next */ }
  }

  return [];
}

async function fetchPipedStreams(videoId: string, preferredInstance?: string): Promise<VideoStream[]> {
  const instances = preferredInstance ? [preferredInstance, ...PIPED_INSTANCES] : PIPED_INSTANCES;
  for (const instance of instances) {
    try {
      const res = await Promise.race([
        fetch(`${instance}/streams/${videoId}`),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);
      if (!res.ok) continue;
      const data = await res.json();

      // If HLS streaming playlist is available, use it as first choice since it is proxied and bypasses YouTube IP lock!
      if (data.hls) {
        return [{ url: data.hls, quality: "Auto (HLS)" }];
      }

      const vs: any[] = data.videoStreams || [];
      if (vs.length > 0) {
        return vs.map((s) => ({ url: s.url, quality: s.quality }));
      }
    } catch { /* try next */ }
  }
  return [];
}

async function fetchInvidiousStreams(videoId: string): Promise<VideoStream[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await Promise.race([
        fetch(`${instance}/api/v1/videos/${videoId}`),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);
      if (!res.ok) continue;
      const data = await res.json();
      
      const streams: VideoStream[] = [];
      if (data.hlsUrl) {
        streams.push({ url: data.hlsUrl, quality: "Auto (HLS)" });
      }
      
      const formatStreams = data.formatStreams || [];
      if (formatStreams.length > 0) {
        formatStreams.forEach((s: any) => {
          if (s.url) {
            streams.push({ url: s.url, quality: `${s.qualityLabel || s.quality} (${s.container || "mp4"})` });
          }
        });
      }
      
      if (streams.length > 0) {
        console.log(`[FullPlayer] Resolved video streams from Invidious instance ${instance}`);
        return streams;
      }
    } catch (err) {
      console.warn(`[FullPlayer] Invidious streams failed on ${instance}:`, err);
    }
  }
  return [];
}

// Clean lyrics utility matching web app regex cleaning
function cleanLyricsHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&mut;/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractLyricsText(data: any): string | null {
  const inner = data?.data ?? data;
  const candidates = [
    inner?.lyrics,
    inner?.snippet,
    inner?.lyric,
    inner?.lyricsSnippet,
    inner?.lyrics_snippet,
    data?.lyrics,
    data?.snippet,
    typeof inner === "string" ? inner : null,
    typeof data  === "string" ? data  : null,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 5) {
      const cleaned = cleanLyricsHtml(c);
      if (cleaned.length > 5) return cleaned;
    }
  }
  return null;
}

function hasIndicCharacters(text: string): boolean {
  return /[\u0900-\u0DFF]/.test(text);
}

async function fetchLyrics(songId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://musicbackend-xg4u.onrender.com/api/songs/${songId}/lyrics`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return extractLyricsText(data);
  } catch {
    return null;
  }
}

export function FullPlayer({ onRequireAuth }: FullPlayerProps) {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    nextSong,
    prevSong,
    progress,
    duration,
    setProgress,
    showPlayer,
    setShowPlayer,
    addToQueue,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();

  const { downloadSong, deleteDownloadedSong, isDownloaded, downloadingIds } = useLibrary();
  const downloaded = currentSong ? isDownloaded(currentSong.id) : false;
  const downloading = currentSong ? downloadingIds.includes(currentSong.id) : false;

  const dragProgressRef = useRef<number | null>(null);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const trackLeftRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastSeekTimeRef = useRef<any>(0);

  // Animated value drives fill + thumb on native thread — no JS re-render lag
  const animPct = useRef(new Animated.Value(0)).current;

  const totalDuration =
    duration && isFinite(duration) && duration > 1
      ? duration
      : ((currentSong && currentSong.duration && currentSong.duration > 1) ? currentSong.duration : 0);

  const [activeTab, setActiveTab] = useState<TabType>("cover");
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [queuedFlash, setQueuedFlash] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [videoStreams, setVideoStreams] = useState<VideoStream[]>([]);
  const [selectedStream, setSelectedStream] = useState<VideoStream | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<any>(null);
  const lastVideoSyncRef = useRef<number>(-1);
  const videoReadyRef = useRef(false);

  // Lyrics scrolling refs & states
  const lyricsScrollRef = useRef<ScrollView>(null);
  const [lyricsContentHeight, setLyricsContentHeight] = useState(0);
  const [userIsScrollingLyrics, setUserIsScrollingLyrics] = useState(false);
  const userScrollTimeoutRef = useRef<any>(null);

  const handleUserScroll = () => {
    setUserIsScrollingLyrics(true);
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      setUserIsScrollingLyrics(false);
    }, 4000);
  };

  useEffect(() => {
    if (activeTab === "lyrics" && lyricsScrollRef.current && lyricsContentHeight > 0 && totalDuration > 0 && !userIsScrollingLyrics) {
      const pct = (progress / totalDuration);
      const targetOffset = pct * (lyricsContentHeight - 200);
      lyricsScrollRef.current.scrollTo({ y: Math.max(0, targetOffset), animated: true });
    }
  }, [progress, totalDuration, activeTab, lyricsContentHeight, userIsScrollingLyrics]);

  const [translationLang, setTranslationLang] = useState<"original" | "en">("original");
  const [translatedLyrics, setTranslatedLyrics] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  const translateLyrics = async (targetLang: "en") => {
    if (!lyrics || !currentSong) return;
    const cacheKey = `${currentSong.id}_${targetLang}`;
    if (translatedLyrics[cacheKey]) return;

    setTranslating(true);
    try {
      const hasIndic = hasIndicCharacters(lyrics);
      let resolvedText = "";

      const romanizeChunk = async (chunk: string): Promise<string> => {
        if (!chunk.trim()) return chunk;

        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(chunk)}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            let roman = "";
            if (data && Array.isArray(data[0])) {
              for (const item of data[0]) {
                if (item) {
                  if (typeof item[3] === "string" && item[3].trim()) {
                    roman += item[3];
                  } else if (typeof item[0] === "string" && item[0].trim()) {
                    roman += item[0];
                  }
                }
              }
            }
            if (roman.trim()) return roman.trim();
          }
        } catch (err) {
          console.warn("Romanization API failed:", err);
        }

        return chunk;
      };

      if (hasIndic) {
        // Process in batches of 15 lines to avoid URL size limit
        const lines = lyrics.split("\n");
        const romanLines: string[] = [];
        for (let i = 0; i < lines.length; i += 15) {
          const batch = lines.slice(i, i + 15).join("\n");
          const romanBatch = await romanizeChunk(batch);
          romanLines.push(romanBatch);
        }
        resolvedText = romanLines.join("\n");
      } else {
        resolvedText = lyrics;
      }

      setTranslatedLyrics((prev) => ({
        ...prev,
        [cacheKey]: resolvedText.trim() || lyrics,
      }));
    } catch (err) {
      console.warn("Transliteration failed:", err);
      if (currentSong) {
        setTranslatedLyrics((prev) => ({
          ...prev,
          [`${currentSong.id}_${targetLang}`]: lyrics,
        }));
      }
    } finally {
      setTranslating(false);
    }
  };

  const handleLangSelect = (lang: "original" | "en") => {
    setTranslationLang(lang);
    if (lang !== "original") {
      translateLyrics(lang);
    }
  };

  // Reset states when song changes
  useEffect(() => {
    setActiveTab("cover");
    setLyrics(null);
    setTranslationLang("original");
    setVideoStreams([]);
    setSelectedStream(null);
    setVideoError(null);
  }, [currentSong?.id]);

  // Load video streams when Video tab is active — keep audio playing, video is muted and synced
  const videoLoadIdRef = useRef(0); // cancel stale fetches when song changes mid-load

  useEffect(() => {
    if (activeTab !== "video" || !currentSong || !showPlayer) return;

    // Reset and re-fetch whenever song changes or tab becomes active
    const loadId = ++videoLoadIdRef.current;
    videoReadyRef.current = false;
    lastVideoSyncRef.current = -1;
    setSelectedStream(null);
    setVideoStreams([]);
    setVideoLoading(true);
    setVideoError(null);

    resolveVideoStreams(currentSong)
      .then((streams) => {
        if (loadId !== videoLoadIdRef.current) return; // stale, song changed
        if (streams.length > 0) {
          setVideoStreams(streams);
          setSelectedStream(streams[0]);
        } else {
          setVideoError("No video available for this song.");
        }
      })
      .catch(() => {
        if (loadId !== videoLoadIdRef.current) return;
        setVideoError("Failed to load video.");
      })
      .finally(() => {
        if (loadId !== videoLoadIdRef.current) return;
        setVideoLoading(false);
      });
  }, [activeTab, currentSong?.id, showPlayer]);

  // Sync video position to song progress every ~2 seconds
  useEffect(() => {
    if (activeTab !== "video" || !videoRef.current || !videoReadyRef.current) return;
    const diff = Math.abs(progress - lastVideoSyncRef.current);
    // Seek if drift > 2s to keep in sync
    if (diff > 2) {
      lastVideoSyncRef.current = progress;
      videoRef.current.setPositionAsync(Math.floor(progress * 1000)).catch(() => {});
    }
  }, [progress, activeTab]);

  // Load lyrics
  useEffect(() => {
    if (!currentSong || !showPlayer) return;
    setLyricsLoading(true);
    fetchLyrics(currentSong.id).then((l) => {
      setLyrics(l ?? "");
      setLyricsLoading(false);
    });
  }, [currentSong?.id, showPlayer]);

  if (!currentSong || !showPlayer) return null;

  const handleAddToQueue = () => {
    addToQueue(currentSong);
    setQueuedFlash(true);
    setTimeout(() => setQueuedFlash(false), 2000);
  };

  const handleDownload = () => {
    if (!currentSong || downloading) return;
    if (downloaded) {
      deleteDownloadedSong(currentSong.id);
    } else {
      downloadSong(currentSong);
    }
  };

  // Keep animPct in sync with progress (and drag overrides)
  useEffect(() => {
    const displayPct = totalDuration > 0
      ? Math.min(100, ((dragProgress !== null ? dragProgress : progress) / totalDuration) * 100)
      : 0;
    animPct.setValue(displayPct);
  }, [progress, dragProgress, totalDuration]);

  // Synchronize/clear dragProgress when real progress catches up to target position
  useEffect(() => {
    if (dragProgress !== null) {
      const diff = Math.abs(progress - dragProgress);
      if (diff < 2.5) {
        dragProgressRef.current = null;
        setDragProgress(null);
      }
    }
  }, [progress, dragProgress]);

  // Update drag progress immediately during pan (bypasses render cycle for animPct)
  const updateDragImmediate = useCallback((value: number) => {
    dragProgressRef.current = value;
    const pct = totalDuration > 0 ? Math.min(100, (value / totalDuration) * 100) : 0;
    animPct.setValue(pct);
    setDragProgress(value);
  }, [totalDuration, animPct]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        isDraggingRef.current = true;
        const { locationX } = evt.nativeEvent;
        trackLeftRef.current = gestureState.x0 - locationX;
        const activeWidth = progressBarWidth > 0 ? progressBarWidth : (Dimensions.get("window").width - 48);
        const ratio = Math.max(0, Math.min(1, locationX / activeWidth));
        updateDragImmediate(ratio * totalDuration);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (totalDuration <= 0) return;
        const activeWidth = progressBarWidth > 0 ? progressBarWidth : (Dimensions.get("window").width - 48);
        const currentX = gestureState.moveX - trackLeftRef.current;
        const ratio = Math.max(0, Math.min(1, currentX / activeWidth));
        updateDragImmediate(ratio * totalDuration);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (totalDuration <= 0) {
          isDraggingRef.current = false;
          dragProgressRef.current = null;
          setDragProgress(null);
          return;
        }
        
        const activeWidth = progressBarWidth > 0 ? progressBarWidth : (Dimensions.get("window").width - 48);
        let finalProgress = 0;
        if (Math.abs(gestureState.dx) > 2) {
          const currentX = gestureState.moveX - trackLeftRef.current;
          const ratio = Math.max(0, Math.min(1, currentX / activeWidth));
          finalProgress = Math.floor(ratio * totalDuration);
        } else {
          const { locationX } = evt.nativeEvent;
          const ratio = Math.max(0, Math.min(1, locationX / activeWidth));
          finalProgress = Math.floor(ratio * totalDuration);
        }
        
        setProgress(finalProgress);
        updateDragImmediate(finalProgress);
        
        if (lastSeekTimeRef.current) clearTimeout(lastSeekTimeRef.current);
        lastSeekTimeRef.current = setTimeout(() => {
          dragProgressRef.current = null;
          setDragProgress(null);
          isDraggingRef.current = false;
        }, 4000) as any;
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        dragProgressRef.current = null;
        setDragProgress(null);
      }
    })
  );

  const displayProgress = dragProgress !== null ? dragProgress : progress;

  return (
    <Modal
      visible={showPlayer}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setShowPlayer(false)}
    >
      <View style={styles.container}>
        {/* Blurred background representation */}
        {currentSong.albumArt && (
          <Image
            source={{ uri: currentSong.albumArt }}
            style={styles.backgroundImage}
            blurRadius={Platform.OS === 'ios' ? 25 : 12}
            resizeMode="cover"
          />
        )}
        <View style={styles.overlay} />

        {/* Inner Content wrapper */}
        <View style={styles.contentContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity delayPressIn={0} onPress={() => setShowPlayer(false)} style={styles.headerButton} activeOpacity={0.7}>
              <MaterialCommunityIcons name="chevron-down" size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Now Playing</Text>

            <TouchableOpacity delayPressIn={0} onPress={handleAddToQueue} style={styles.headerButton} activeOpacity={0.7}>
              <MaterialCommunityIcons
                name="playlist-play"
                size={22}
                color={queuedFlash ? "#1DB954" : "rgba(255,255,255,0.7)"}
              />
            </TouchableOpacity>
          </View>

          {/* Tab Switcher - always show Video; show Lyrics only when available */}
          <View style={styles.tabBar}>
            {(["cover", ...((!lyricsLoading && lyrics && lyrics.trim().length > 0) ? ["lyrics"] : []), "video"] as TabType[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity delayPressIn={0} key={tab} onPress={() => setActiveTab(tab)} style={[styles.tabButton, isActive && styles.activeTabButton]} activeOpacity={0.7}>
                  <Text style={[styles.tabButtonText, isActive && styles.activeTabButtonText]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === "lyrics" && lyricsLoading ? " ●" : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Body content based on tab selection */}
          <View style={styles.mainContent}>
            {/* Cover Tab - album art only, no video */}
            {activeTab === "cover" && (
              <View style={styles.coverWrapper}>
                <View style={styles.largeArtShadow}>
                  {currentSong.albumArt ? (
                    <Image
                      source={{ uri: currentSong.albumArt }}
                      style={styles.largeArt}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.largeArt, styles.largeArtPlaceholder]}>
                      <MaterialCommunityIcons name="music" size={80} color="rgba(0,0,0,0.3)" />
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Lyrics Tab */}
            {activeTab === "lyrics" && (
              <View style={styles.lyricsWrapper}>
                {lyrics && lyrics.length > 0 && (
                  <View style={styles.translationContainer}>
                    {(["original", "en"] as const).map((lang) => {
                      const labelMap = {
                        original: "Original",
                        en: "English Script",
                      };
                      const isActive = translationLang === lang;
                      return (
                        <TouchableOpacity
                          key={lang}
                          onPress={() => handleLangSelect(lang)}
                          style={[styles.transButton, isActive && styles.transButtonActive]}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.transButtonText, isActive && styles.transButtonTextActive]}>
                            {labelMap[lang]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                <ScrollView 
                  ref={lyricsScrollRef}
                  style={styles.lyricsScroll} 
                  contentContainerStyle={styles.lyricsScrollContent}
                  onScroll={handleUserScroll}
                  scrollEventThrottle={16}
                  onContentSizeChange={(w, h) => setLyricsContentHeight(h)}
                >
                  {lyricsLoading ? (
                    <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 60 }} />
                  ) : lyrics && lyrics.length > 0 ? (
                    translating ? (
                      <View style={styles.translatingContainer}>
                        <ActivityIndicator size="small" color="#1DB954" style={{ marginBottom: 10 }} />
                        <Text style={styles.translatingText}>Translating lyrics...</Text>
                      </View>
                    ) : (
                      <Text style={styles.lyricsText}>
                        {translationLang === "original"
                          ? lyrics
                          : (translatedLyrics[`${currentSong.id}_${translationLang}`] || lyrics)}
                      </Text>
                    )
                  ) : (
                    <View style={styles.emptyLyrics}>
                      <MaterialCommunityIcons name="microphone-off" size={48} color="rgba(255,255,255,0.2)" />
                      <Text style={styles.emptyLyricsText}>Lyrics not available for this song</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {/* Video Tab */}
            {activeTab === "video" && (
              <View style={styles.videoWrapper}>
                {videoLoading ? (
                  <View style={styles.videoCenter}>
                    <ActivityIndicator size="large" color="#1DB954" />
                    <Text style={styles.videoStatusText}>Loading video...</Text>
                  </View>
                ) : videoError ? (
                  <View style={styles.videoCenter}>
                    <MaterialCommunityIcons name="video-off-outline" size={52} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.videoErrorText}>{videoError}</Text>
                  </View>
                ) : selectedStream ? (
                  <View style={styles.videoPlayerContainer}>
                    <Video
                      ref={videoRef}
                      source={{
                        uri: selectedStream.url,
                        overrideFileExtensionAndroid: selectedStream.quality.includes("HLS") ? "m3u8" : undefined
                      }}
                      rate={1.0}
                      volume={0}
                      isMuted={true}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={isPlaying}
                      style={styles.nativeVideo}
                      onReadyForDisplay={() => {
                        videoReadyRef.current = true;
                        // Seek video to current song position on load
                        if (videoRef.current && progress > 0) {
                          lastVideoSyncRef.current = progress;
                          videoRef.current.setPositionAsync(Math.floor(progress * 1000)).catch(() => {});
                        }
                      }}
                      onPlaybackStatusUpdate={(status: any) => {
                        if (!status.isLoaded) return;
                        // Keep video play-state in sync with audio player
                        if (status.isPlaying !== isPlaying) {
                          if (isPlaying) {
                            videoRef.current?.playAsync().catch(() => {});
                          } else {
                            videoRef.current?.pauseAsync().catch(() => {});
                          }
                        }
                      }}
                    />
                    {/* Sync indicator badge */}
                    <View style={styles.syncBadge}>
                      <MaterialCommunityIcons name="headphones" size={13} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.syncBadgeText}>Audio from player • Video synced</Text>
                    </View>
                    {/* Quality selector */}
                    {videoStreams.length > 1 && (
                      <ScrollView horizontal style={styles.qualityList} contentContainerStyle={styles.qualityListContent} showsHorizontalScrollIndicator={false}>
                        {videoStreams.map((stream) => {
                          const isSel = selectedStream.quality === stream.quality;
                          return (
                            <TouchableOpacity
                              key={stream.quality}
                              onPress={() => {
                                setSelectedStream(stream);
                                videoReadyRef.current = false;
                              }}
                              style={[styles.qualityPill, isSel && styles.activeQualityPill]}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.qualityText, isSel && styles.activeQualityText]}>
                                {stream.quality}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                ) : null}
              </View>
            )}


          </View>

          {/* Song Info Section */}
          <View style={styles.songMeta}>
            <View style={styles.metaTextContainer}>
              <Text style={styles.metaTitle} numberOfLines={1}>{currentSong.title}</Text>
              <Text style={styles.metaArtist} numberOfLines={1}>{currentSong.artist}</Text>
              {currentSong.movie ? (
                <Text style={styles.metaMovie} numberOfLines={1}>{currentSong.movie}</Text>
              ) : null}
            </View>

            <View style={styles.metaActions}>
              <TouchableOpacity delayPressIn={0} onPress={handleDownload} style={styles.metaButton} activeOpacity={0.7} disabled={downloading}>
                {downloading ? (
                  <ActivityIndicator size="small" color="#1DB954" />
                ) : (
                  <MaterialCommunityIcons
                    name={downloaded ? "check-circle" : "download"}
                    size={20}
                    color={downloaded ? "#1DB954" : "#fff"}
                  />
                )}
              </TouchableOpacity>

              <View style={styles.metaLikeWrapper}>
                <LikeButton song={currentSong} onRequireAuth={onRequireAuth} size="lg" />
              </View>
            </View>
          </View>

          {/* Progress Seek Bar */}
          <View style={styles.progressSection}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={(evt) => {
                const { locationX } = evt.nativeEvent;
                const activeWidth = progressBarWidth > 0 ? progressBarWidth : (Dimensions.get("window").width - 48);
                if (totalDuration > 0) {
                  const ratio = Math.max(0, Math.min(1, locationX / activeWidth));
                  const finalProgress = Math.floor(ratio * totalDuration);
                  setProgress(finalProgress);
                  updateDragImmediate(finalProgress);
                }
              }}
              style={styles.progressBarTrack}
              onLayout={(e: any) => setProgressBarWidth(e.nativeEvent.layout.width)}
              {...panResponder.current.panHandlers}
            >
              {/* Animated fill and thumb driven on native thread */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.progressBarFill,
                  {
                    width: animPct.interpolate({
                      inputRange: [0, 100],
                      outputRange: ["0%", "100%"],
                      extrapolate: "clamp",
                    }),
                  },
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.progressBarThumb,
                  {
                    left: animPct.interpolate({
                      inputRange: [0, 100],
                      outputRange: ["0%", "100%"],
                      extrapolate: "clamp",
                    }),
                    marginLeft: -6,
                  },
                ]}
              />
            </TouchableOpacity>

            <View style={styles.timeLabels}>
              <Text style={styles.timeText}>
                {totalDuration > 0 ? formatDuration(Math.floor(displayProgress)) : "0:00"}
              </Text>
              <Text style={styles.percentageText}>
                {totalDuration > 0 ? `${Math.round(Math.min(100, (displayProgress / totalDuration) * 100))}%` : "--"}
              </Text>
              <Text style={styles.timeText}>
                {totalDuration > 0 ? formatDuration(Math.floor(totalDuration)) : "0:00"}
              </Text>
            </View>
          </View>

          {/* Playback controls */}
          <View style={styles.controlsSection}>
            <TouchableOpacity delayPressIn={0} onPress={toggleShuffle} style={styles.controlBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons
                name="shuffle"
                size={22}
                color={shuffle ? "#1DB954" : "rgba(255,255,255,0.5)"}
              />
              {shuffle && <View style={styles.dotIndicator} />}
            </TouchableOpacity>

            <TouchableOpacity delayPressIn={0} onPress={prevSong} style={styles.controlBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="skip-previous" size={36} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity delayPressIn={0} onPress={togglePlay} style={styles.playPauseBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons
                name={isPlaying ? "pause" : "play"}
                size={36}
                color="#000"
              />
            </TouchableOpacity>

            <TouchableOpacity delayPressIn={0} onPress={nextSong} style={styles.controlBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="skip-next" size={36} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity delayPressIn={0} onPress={cycleRepeat} style={styles.controlBtn} activeOpacity={0.7}>
              <View style={{ position: "relative" }}>
                <MaterialCommunityIcons
                  name="repeat"
                  size={22}
                  color={repeat !== "off" ? "#1DB954" : "rgba(255,255,255,0.5)"}
                />
                {repeat === "one" && (
                  <View style={styles.repeatOneTextWrapper}>
                    <Text style={styles.repeatOneText}>1</Text>
                  </View>
                )}
              </View>
              {repeat !== "off" && <View style={styles.dotIndicator} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    position: "relative",
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 10, 10, 0.85)",
  },
  contentContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : 24,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    marginTop: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 4,
    marginVertical: 12,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  activeTabButton: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  tabButtonText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "600",
  },
  activeTabButtonText: {
    color: "#fff",
  },
  mainContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
    minHeight: 220,
  },
  // Cover View
  coverWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  largeArtShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  largeArt: {
    width: 230,
    height: 230,
    borderRadius: 16,
  },
  largeArtPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Lyrics View
  lyricsWrapper: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    overflow: "hidden",
  },
  lyricsScroll: {
    flex: 1,
  },
  lyricsScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  lyricsText: {
    fontSize: 14,
    lineHeight: 28,
    color: "rgba(255, 255, 255, 0.82)",
    textAlign: "center",
  },
  emptyLyrics: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyLyricsText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.35)",
    marginTop: 10,
  },
  // Video View
  videoWrapper: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  videoCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  videoStatusText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    marginTop: 8,
  },
  videoErrorText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 24,
  },
  videoPlayerContainer: {
    flex: 1,
    width: "100%",
  },
  nativeVideo: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000",
  },
  qualityList: {
    maxHeight: 44,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  qualityListContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  qualityPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginHorizontal: 4,
  },
  activeQualityPill: {
    backgroundColor: "#1DB954",
    borderColor: "#1DB954",
  },
  qualityText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "600",
  },
  activeQualityText: {
    color: "#000",
    fontWeight: "bold",
  },
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    gap: 5,
  },
  syncBadgeText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontStyle: "italic",
  },
  // Meta block
  songMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
  },
  metaTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  metaTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  metaArtist: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  metaMovie: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    marginTop: 2,
  },
  metaActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  metaLikeWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  // Progress bar
  progressSection: {
    marginVertical: 10,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    position: "relative",
    justifyContent: "center",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#1DB954",
  },
  progressBarThumb: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  timeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  timeText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  percentageText: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
  },
  // Controls
  controlsSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 16,
    paddingHorizontal: 8,
  },
  controlBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  playPauseBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1DB954",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  dotIndicator: {
    position: "absolute",
    bottom: -2,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#1DB954",
  },
  repeatOneTextWrapper: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#1DB954",
    borderRadius: 5,
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatOneText: {
    color: "#000",
    fontSize: 7,
    fontWeight: "bold",
  },
  translationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginVertical: 12,
    paddingHorizontal: 8,
  },
  transButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  transButtonActive: {
    backgroundColor: "#1DB954",
    borderColor: "#1DB954",
  },
  transButtonText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "600",
  },
  transButtonTextActive: {
    color: "#000000",
    fontWeight: "bold",
  },
  translatingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  translatingText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
  },
  eqWrapper: {
    padding: 16,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    marginVertical: 10,
    alignItems: "center",
  },
  eqTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 16,
  },
  eqVisualizerContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    height: 48,
    width: "100%",
    marginBottom: 20,
  },
  eqVisualizerBar: {
    width: 6,
    marginHorizontal: 3,
    borderRadius: 3,
  },
  eqSectionTitle: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  presetsList: {
    flexDirection: "row",
    width: "100%",
    marginBottom: 16,
  },
  presetCard: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    marginRight: 10,
  },
  presetCardActive: {
    backgroundColor: "#1DB954",
  },
  presetText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
  },
  presetTextActive: {
    color: "#000",
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginVertical: 10,
  },
  sliderLabel: {
    width: 60,
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  sliderTrackContainer: {
    flex: 1,
    height: 30,
    justifyContent: "center",
    marginHorizontal: 12,
  },
  sliderTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    position: "relative",
  },
  sliderFill: {
    height: "100%",
    backgroundColor: "#1DB954",
    borderRadius: 2,
  },
  sliderThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
    position: "absolute",
    top: -6,
  },
  sliderValueText: {
    width: 50,
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    textAlign: "right",
  },
});
