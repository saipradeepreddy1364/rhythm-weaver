import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Modal, ActivityIndicator, Linking, Platform } from 'react-native'
import React, { useState, useEffect } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePlayer } from "../context/PlayerContext";
import { formatDuration } from "../data/songs";
import { LikeButton } from "./LikeButton";
import { useLibrary } from "../context/LibraryContext";

interface FullPlayerProps {
  onRequireAuth?: () => void;
}

type TabType = "cover" | "lyrics";

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

  const [activeTab, setActiveTab] = useState<TabType>("cover");
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [queuedFlash, setQueuedFlash] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const [translationLang, setTranslationLang] = useState<"original" | "hi" | "te" | "en">("original");
  const [translatedLyrics, setTranslatedLyrics] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  const translateLyrics = async (targetLang: "hi" | "te" | "en") => {
    if (!lyrics || !currentSong) return;
    const cacheKey = `${currentSong.id}_${targetLang}`;
    if (translatedLyrics[cacheKey]) return;

    setTranslating(true);
    try {
      const hasIndic = hasIndicCharacters(lyrics);
      let resolvedText = "";

      // Helper: romanize a chunk via Google Translate dt=rm ONLY (no dt=t)
      // With dt=rm only: data[0][i][0] = phonetic romanization (e.g. "Nenu")
      // With dt=t included: data[0][i][0] = English meaning (e.g. "I") — WRONG
      const romanizeChunk = async (chunk: string): Promise<string> => {
        if (!chunk.trim()) return chunk;
        // Use dt=rm ONLY — this gives phonetic script, not English meaning
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(chunk)}`;
        const res = await fetch(url);
        if (!res.ok) return chunk;
        const data = await res.json();
        let roman = "";
        // With dt=rm only: data[0][i][0] is the romanized phonetic text
        if (data && Array.isArray(data[0])) {
          for (const item of data[0]) {
            if (item && typeof item[0] === "string") roman += item[0];
          }
        }
        return roman.trim() || chunk;
      };

      if (targetLang === "en") {
        if (hasIndic) {
          // Romanize line-by-line for reliability
          const lines = lyrics.split("\n");
          const romanLines: string[] = [];
          // Process in batches of 5 lines
          for (let i = 0; i < lines.length; i += 5) {
            const batch = lines.slice(i, i + 5).join("\n");
            const romanBatch = await romanizeChunk(batch);
            romanLines.push(romanBatch);
          }
          resolvedText = romanLines.join("\n");
        } else {
          resolvedText = lyrics;
        }
      } else if (targetLang === "te") {
        if (!hasIndic) {
          // Romanized -> Telugu script via Google Input Tools, line by line
          const lines = lyrics.split("\n");
          const teLines: string[] = [];
          for (const line of lines) {
            if (!line.trim()) { teLines.push(""); continue; }
            try {
              const url = `https://inputtools.google.com/request?text=${encodeURIComponent(line.trim())}&itc=te-t-i0-und&num=1&cp=0&cs=0&ie=utf-8&oe=utf-8&app=demopage`;
              const res = await fetch(url);
              if (res.ok) {
                const data = await res.json();
                if (data && data[0] === "SUCCESS" && data[1]?.[0]?.[1]?.[0]) {
                  teLines.push(data[1][0][1][0]);
                } else { teLines.push(line); }
              } else { teLines.push(line); }
            } catch { teLines.push(line); }
          }
          resolvedText = teLines.join("\n");
        } else {
          resolvedText = lyrics;
        }
      } else if (targetLang === "hi") {
        if (!hasIndic) {
          // Romanized -> Hindi script, line by line
          const lines = lyrics.split("\n");
          const hiLines: string[] = [];
          for (const line of lines) {
            if (!line.trim()) { hiLines.push(""); continue; }
            try {
              const url = `https://inputtools.google.com/request?text=${encodeURIComponent(line.trim())}&itc=hi-t-i0-und&num=1&cp=0&cs=0&ie=utf-8&oe=utf-8&app=demopage`;
              const res = await fetch(url);
              if (res.ok) {
                const data = await res.json();
                if (data && data[0] === "SUCCESS" && data[1]?.[0]?.[1]?.[0]) {
                  hiLines.push(data[1][0][1][0]);
                } else { hiLines.push(line); }
              } else { hiLines.push(line); }
            } catch { hiLines.push(line); }
          }
          resolvedText = hiLines.join("\n");
        } else {
          // Telugu/Hindi script -> Hindi script via translation
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=hi&dt=t&q=${encodeURIComponent(lyrics)}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data && data[0]) {
              for (const item of data[0]) {
                if (item && item[0]) resolvedText += item[0];
              }
            }
          }
        }
      }

      setTranslatedLyrics((prev) => ({
        ...prev,
        [cacheKey]: resolvedText.trim() || lyrics,
      }));
    } catch (err) {
      console.warn("Transliteration/Translation failed:", err);
      // On error, fall back to original lyrics
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

  const handleLangSelect = (lang: "original" | "hi" | "te" | "en") => {
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
  }, [currentSong?.id]);

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

  const totalDuration =
    duration && isFinite(duration) && duration > 1
      ? duration
      : (currentSong.duration && currentSong.duration > 1 ? currentSong.duration : 0);

  const pct = totalDuration > 0 ? Math.min(100, (progress / totalDuration) * 100) : 0;

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

  const handleProgressBarPress = (event: any) => {
    if (totalDuration <= 0 || progressBarWidth <= 0) return;
    const { locationX } = event.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / progressBarWidth));
    setProgress(Math.floor(ratio * totalDuration));
  };

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

          {/* Tab Switcher - show Lyrics tab only when lyrics exist or still loading */}
          {(lyricsLoading || (lyrics && lyrics.trim().length > 0)) && (
            <View style={styles.tabBar}>
              {(["cover", "lyrics"] as TabType[]).map((tab) => {
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
          )}

          {/* Body content based on tab selection */}
          <View style={styles.mainContent}>
            {/* Cover Tab */}
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
                    {(["original", "en", "hi", "te"] as const).map((lang) => {
                      const labelMap = {
                        original: "Original",
                        en: "English Script",
                        hi: "Hindi Script",
                        te: "Telugu Script",
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
                <ScrollView style={styles.lyricsScroll} contentContainerStyle={styles.lyricsScrollContent}>
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
            <TouchableOpacity delayPressIn={0} style={styles.progressBarTrack} onLayout={(e: any) => setProgressBarWidth(e.nativeEvent.layout.width)} onPress={handleProgressBarPress} activeOpacity={1}>
              <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
              <View style={[styles.progressBarThumb, { left: `${pct}%`, marginLeft: -6 }]} />
            </TouchableOpacity>

            <View style={styles.timeLabels}>
              <Text style={styles.timeText}>
                {totalDuration > 0 ? formatDuration(Math.floor(progress)) : "0:00"}
              </Text>
              <Text style={styles.percentageText}>
                {totalDuration > 0 ? `${Math.round(pct)}%` : "--"}
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
    alignItems: "center",
    justifyContent: "center",
  },
  videoErrorContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoErrorText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginTop: 8,
  },
  videoPlayerContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nativeVideo: {
    width: "100%",
    height: 150,
    borderRadius: 12,
    backgroundColor: "#000",
  },
  qualityList: {
    flexDirection: "row",
    maxHeight: 38,
    marginTop: 8,
  },
  qualityListContent: {
    alignItems: "center",
    paddingHorizontal: 10,
  },
  qualityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 4,
  },
  activeQualityPill: {
    backgroundColor: "#1DB954",
    borderColor: "#1DB954",
  },
  qualityText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "rgba(255,255,255,0.6)",
  },
  activeQualityText: {
    color: "#000",
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
});