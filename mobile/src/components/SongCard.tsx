import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image, Modal, ActivityIndicator } from 'react-native'
import React, { useState, useEffect, useCallback } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Song, formatDuration } from "../data/songs";
import { usePlayer } from "../context/PlayerContext";
import { api } from "../services/api";
import { useLibrary } from "../context/LibraryContext";

interface SongCardProps {
  song: Song;
  queue?: Song[];
  index?: number;
}

// ─── Lyrics Panel ─────────────────────────────────────────────────────────────
// A slide-up full-screen overlay that fetches and displays lyrics for a song.
function LyricsPanel({
  song,
  onClose,
}: {
  song: Song;
  onClose: () => void;
}) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [translationLang, setTranslationLang] = useState<"original" | "hi" | "te" | "en">("original");
  const [translatedLyrics, setTranslatedLyrics] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  const translateLyrics = async (targetLang: "hi" | "te" | "en") => {
    if (!lyrics) return;
    const cacheKey = `${song.id}_${targetLang}`;
    if (translatedLyrics[cacheKey]) return;

    setTranslating(true);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(lyrics)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        let translatedText = "";
        if (data && data[0]) {
          for (const item of data[0]) {
            if (item && item[0]) {
              translatedText += item[0];
            }
          }
        }
        if (translatedText.trim()) {
          setTranslatedLyrics((prev) => ({
            ...prev,
            [cacheKey]: translatedText,
          }));
        }
      }
    } catch (err) {
      console.warn("Translation failed:", err);
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setLyrics(null);
    setTranslationLang("original");

    api.getSongLyrics(song.id)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data?.lyrics) {
          setLyrics(res.data.lyrics);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [song.id]);

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalSubtitle}>Lyrics</Text>
            <Text style={styles.modalTitle} numberOfLines={1}>{song.title}</Text>
            <Text style={styles.modalArtist} numberOfLines={1}>{song.artist}</Text>
          </View>
          <TouchableOpacity delayPressIn={0} onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
            <MaterialCommunityIcons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Translation Selector */}
        {!loading && !error && lyrics && (
          <View style={styles.translationContainer}>
            {(["original", "en", "hi", "te"] as const).map((lang) => {
              const labelMap = {
                original: "Original",
                en: "English",
                hi: "Hindi",
                te: "Telugu",
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

        {/* Body */}
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={styles.loadingText}>Fetching lyrics…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="file-document-outline" size={40} color="rgba(255,255,255,0.2)" />
              <Text style={styles.errorTitle}>Lyrics not available</Text>
              <Text style={styles.errorSubtitle}>
                We couldn't find lyrics for this song. Try again later.
              </Text>
            </View>
          )}

          {!loading && !error && lyrics && (
            translating ? (
              <View style={styles.translatingContainer}>
                <ActivityIndicator size="small" color="#1DB954" style={{ marginBottom: 10 }} />
                <Text style={styles.translatingText}>Translating lyrics...</Text>
              </View>
            ) : (
              <Text style={styles.lyricsText}>
                {translationLang === "original"
                  ? lyrics
                  : (translatedLyrics[`${song.id}_${translationLang}`] || lyrics)}
              </Text>
            )
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── SongCard ─────────────────────────────────────────────────────────────────

export function SongCard({ song, queue, index }: SongCardProps) {
  const { playSong, currentSong, isPlaying, togglePlay } =
    usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const isActive = currentSong?.id === song.id;
  const [showLyrics, setShowLyrics] = useState(false);

  const handleClick = () => {
    if (isActive) {
      togglePlay();
    } else {
      playSong(song, queue);
    }
  };

  const handleLyricsClick = () => {
    // Start the song first if it isn't already the active one
    if (!isActive) playSong(song, queue);
    setShowLyrics(true);
  };

  const isFav = isLiked(song);

  return (
    <>
      <TouchableOpacity delayPressIn={0} style={[styles.card, isActive && styles.activeCard]} onPress={handleClick} activeOpacity={0.7}>
        {/* Index or play icon */}
        {index !== undefined && (
          <Text style={styles.indexText}>
            {index + 1}
          </Text>
        )}

        {/* Album art */}
        <View style={styles.albumArtContainer}>
          {song.albumArt ? (
            <Image
              source={{ uri: song.albumArt }}
              style={styles.albumArt as any}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.albumArt, styles.albumArtPlaceholder]} />
          )}

          {isActive && isPlaying && (
            <View style={styles.playingOverlay}>
              <MaterialCommunityIcons name="volume-high" size={16} color="#1DB954" />
            </View>
          )}
        </View>

        {/* Song info */}
        <View style={styles.infoContainer}>
          <Text
            style={[styles.titleText, isActive ? styles.activeText : styles.normalText]}
            numberOfLines={1}
          >
            {song.title}
          </Text>
          <Text style={styles.artistText} numberOfLines={1}>
            {song.artist}
          </Text>
        </View>

        {/* Lyrics button */}
        <TouchableOpacity delayPressIn={0} onPress={handleLyricsClick} style={styles.actionButton} activeOpacity={0.7}>
          <MaterialCommunityIcons
            name="file-music-outline"
            size={18}
            color={isActive ? "#1DB954" : "rgba(255,255,255,0.5)"}
          />
        </TouchableOpacity>

        {/* Favorite button */}
        <TouchableOpacity delayPressIn={0} onPress={() => toggleLike(song)} style={styles.actionButton} activeOpacity={0.7}>
          <MaterialCommunityIcons
            name={isFav ? "heart" : "heart-outline"}
            size={18}
            color={isFav ? "#f43f5e" : "rgba(255,255,255,0.5)"}
          />
        </TouchableOpacity>

        {/* Duration */}
        <Text style={styles.durationText}>
          {formatDuration(song.duration)}
        </Text>
      </TouchableOpacity>

      {/* Lyrics full-screen overlay */}
      {showLyrics && (
        <LyricsPanel song={song} onClose={() => setShowLyrics(false)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 2,
  },
  activeCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  indexText: {
    width: 24,
    textAlign: "center",
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    marginRight: 6,
  },
  albumArtContainer: {
    width: 40,
    height: 40,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#282828",
    position: "relative",
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumArtPlaceholder: {
    backgroundColor: "#e11d48", // fallback placeholder gradient color representation
  },
  playingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  infoContainer: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  titleText: {
    fontSize: 14,
    fontWeight: "500",
  },
  normalText: {
    color: "#fff",
  },
  activeText: {
    color: "#1DB954",
  },
  artistText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 2,
  },
  actionButton: {
    padding: 8,
  },
  durationText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.5)",
    width: 38,
    textAlign: "right",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(10, 10, 10, 0.98)",
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  modalSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: "#1DB954",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  modalArtist: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 30,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 12,
    textAlign: "center",
  },
  errorSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.4)",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
  },
  lyricsText: {
    fontSize: 15,
    lineHeight: 28,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
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