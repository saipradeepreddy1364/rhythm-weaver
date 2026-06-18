import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import React, { useEffect, useState, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "../services/api";

interface LyricsPanelProps {
  /** JioSaavn song ID of the currently playing song */
  songId: string | null;
  /** Song title — shown while loading / on error */
  songTitle?: string;
  /** Called when the user taps the close/collapse button */
  onClose?: () => void;
}

type LyricsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found";   text: string }
  | { status: "missing" }
  | { status: "error" };

function parseLyrics(raw: string): string[] {
  return raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const lyricsCache = new Map<string, string | null>();

export function LyricsPanel({ songId, songTitle, onClose }: LyricsPanelProps) {
  const [state, setState] = useState<LyricsState>({ status: "idle" });
  const abortRef          = useRef<AbortController | null>(null);

  const fetchLyrics = async (id: string) => {
    if (lyricsCache.has(id)) {
      const cached = lyricsCache.get(id);
      setState(cached ? { status: "found", text: cached } : { status: "missing" });
      return;
    }

    setState({ status: "loading" });

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const result = await api.getSongLyrics(id);

      if (abortRef.current?.signal.aborted) return;

      if (result.success && result.data?.lyrics) {
        lyricsCache.set(id, result.data.lyrics);
        setState({ status: "found", text: result.data.lyrics });
      } else {
        lyricsCache.set(id, null);
        setState({ status: "missing" });
      }
    } catch {
      if (!abortRef.current?.signal.aborted) {
        setState({ status: "error" });
      }
    }
  };

  const [translationLang, setTranslationLang] = useState<"original" | "hi" | "te" | "en">("original");
  const [translatedLyrics, setTranslatedLyrics] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  const translateLyrics = async (targetLang: "hi" | "te" | "en", currentLyricsText: string) => {
    if (!songId) return;
    const cacheKey = `${songId}_${targetLang}`;
    if (translatedLyrics[cacheKey]) return;

    setTranslating(true);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(currentLyricsText)}`;
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

  const handleLangSelect = (lang: "original" | "hi" | "te" | "en", currentLyricsText: string) => {
    setTranslationLang(lang);
    if (lang !== "original") {
      translateLyrics(lang, currentLyricsText);
    }
  };

  useEffect(() => {
    if (!songId) {
      setState({ status: "idle" });
      setTranslationLang("original");
      return;
    }
    setTranslationLang("original");
    fetchLyrics(songId);
    return () => abortRef.current?.abort();
  }, [songId]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="microphone" size={16} color="#1DB954" style={{ marginRight: 6 }} />
          <Text style={styles.headerTitle}>Lyrics</Text>
          {songTitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {" "}· {songTitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.headerRight}>
          {(state.status === "error" || state.status === "missing") && songId && (
            <TouchableOpacity delayPressIn={0} onPress={() => fetchLyrics(songId)} style={styles.circleBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="refresh" size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
          {onClose && (
            <TouchableOpacity delayPressIn={0} onPress={onClose} style={styles.circleBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Translation switcher above scroll */}
      {state.status === "found" && (
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
                onPress={() => handleLangSelect(lang, state.text)}
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

      {/* Body scroll */}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {state.status === "idle" && (
          <EmptyState icon="music-note" message="Play a song to see lyrics" />
        )}

        {state.status === "loading" && <LoadingSpinner />}

        {state.status === "found" && (
          translating ? (
            <View style={styles.translatingContainer}>
              <ActivityIndicator size="small" color="#1DB954" style={{ marginBottom: 10 }} />
              <Text style={styles.translatingText}>Translating lyrics...</Text>
            </View>
          ) : (
            <LyricsBody text={translationLang === "original" ? state.text : (translatedLyrics[`${songId}_${translationLang}`] || state.text)} />
          )
        )}

        {state.status === "missing" && (
          <EmptyState icon="file-document-outline" message="Lyrics not available for this song" />
        )}

        {state.status === "error" && (
          <EmptyState icon="alert-circle-outline" message="Could not load lyrics. Tap retry to try again." />
        )}
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#1DB954" />
      <Text style={styles.loadingText}>Fetching lyrics…</Text>
    </View>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <View style={styles.centerContainer}>
      <MaterialCommunityIcons name={icon as any} size={48} color="rgba(255,255,255,0.15)" />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function LyricsBody({ text }: { text: string }) {
  const paragraphs = parseLyrics(text);

  return (
    <View style={styles.lyricsContainer}>
      {paragraphs.map((para, i) => (
        <Text key={i} style={styles.lyricsParagraph}>
          {para}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  circleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
  },
  emptyText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },
  lyricsContainer: {
    paddingBottom: 40,
  },
  lyricsParagraph: {
    fontSize: 14,
    lineHeight: 26,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
    marginVertical: 10,
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

export default LyricsPanel;