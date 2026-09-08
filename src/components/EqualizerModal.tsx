import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Switch,
  Dimensions,
  Platform,
  DeviceEventEmitter,
  PanResponder,
  NativeModules,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

export interface EQPreset {
  name: string;
  bass: number; // 0 to 100
  bands: number[]; // 5 bands: 60Hz, 230Hz, 910Hz, 4kHz, 14kHz (-10 to +10 dB)
  surround: boolean;
}

export const EQ_PRESETS: EQPreset[] = [
  { name: "Flat", bass: 0, bands: [0, 0, 0, 0, 0], surround: false },
  { name: "Bass Booster", bass: 100, bands: [12, 10, 2, -2, -4], surround: true },
  { name: "Vocal", bass: 10, bands: [-6, -4, 10, 8, 2], surround: false },
  { name: "Rock", bass: 75, bands: [8, 5, -2, 6, 9], surround: true },
  { name: "Pop", bass: 45, bands: [2, 5, 8, 5, 2], surround: false },
  { name: "Hip-Hop", bass: 95, bands: [11, 8, 2, 4, 6], surround: true },
  { name: "Electronic", bass: 85, bands: [9, 6, -1, 6, 10], surround: true },
];

interface EqualizerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({ visible, onClose }) => {
  const [selectedPreset, setSelectedPreset] = useState<string>("Bass Booster");
  const [bassLevel, setBassLevel] = useState<number>(85); // 0 to 100
  const [bands, setBands] = useState<number[]>([8, 6, 2, 0, 0]); // 5 bands: -10 to +10
  const [surroundEnabled, setSurroundEnabled] = useState<boolean>(true);
  const [eqEnabled, setEqEnabled] = useState<boolean>(true);
  const [meterWidth, setMeterWidth] = useState<number>(0);

  const bandsRef = React.useRef(bands);
  bandsRef.current = bands;
  const surroundRef = React.useRef(surroundEnabled);
  surroundRef.current = surroundEnabled;
  const eqRef = React.useRef(eqEnabled);
  eqRef.current = eqEnabled;

  const bassPanResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (!eqRef.current) return;
        const touchX = evt.nativeEvent.locationX;
        const w = meterWidth || (width - 64);
        const pct = Math.max(0, Math.min(100, Math.round((touchX / w) * 100)));
        setBassLevel(pct);
        setSelectedPreset("Custom");
        saveSettings("Custom", pct, bandsRef.current, surroundRef.current, eqRef.current);
      },
      onPanResponderMove: (evt) => {
        if (!eqRef.current) return;
        const touchX = evt.nativeEvent.locationX;
        const w = meterWidth || (width - 64);
        const pct = Math.max(0, Math.min(100, Math.round((touchX / w) * 100)));
        setBassLevel(pct);
        setSelectedPreset("Custom");
        saveSettings("Custom", pct, bandsRef.current, surroundRef.current, eqRef.current);
      },
    })
  ).current;

  const applyNativeAudioEffect = (bassPct: number, bandsArr: number[], enabled: boolean) => {
    if (Platform.OS === 'android') {
      try {
        const TrackPlayerModule = NativeModules.TrackPlayerModule;
        if (TrackPlayerModule && typeof TrackPlayerModule.setEqualizerBands === 'function') {
          if (!enabled) {
            TrackPlayerModule.setEqualizerBands(5, 5, 5).catch(() => {});
            return;
          }
          const b0 = bandsArr[0] || 0; // 60Hz
          const b1 = bandsArr[1] || 0; // 230Hz
          const maxBassDb = Math.max(b0, b1);
          // Map bass: 0% -> 5 (neutral), 100% -> 10 (MAXIMUM INTENSE HARDWARE BASS BOOST)
          const bassVal = Math.min(10, Math.max(0, Math.round(5 + (bassPct / 100) * 5 + (maxBassDb / 12) * 3)));

          const t0 = bandsArr[3] || 0; // 4kHz
          const t1 = bandsArr[4] || 0; // 14kHz
          const maxTrebleDb = Math.max(t0, t1);
          const trebleVal = Math.min(10, Math.max(0, Math.round(5 + (maxTrebleDb / 10) * 5)));

          const vocalDb = bandsArr[2] || 0; // 910Hz
          const vocalVal = Math.min(10, Math.max(0, Math.round(5 + (vocalDb / 10) * 5)));

          TrackPlayerModule.setEqualizerBands(bassVal, trebleVal, vocalVal).catch(() => {});
        }
      } catch (err) {}
    }
  };

  // Load saved EQ settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem("rw_eq_settings");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.preset) setSelectedPreset(parsed.preset);
          if (typeof parsed.bass === "number") setBassLevel(parsed.bass);
          if (Array.isArray(parsed.bands)) setBands(parsed.bands);
          if (typeof parsed.surround === "boolean") setSurroundEnabled(parsed.surround);
          if (typeof parsed.enabled === "boolean") setEqEnabled(parsed.enabled);
          applyNativeAudioEffect(parsed.bass ?? 85, parsed.bands ?? [8, 6, 2, 0, 0], parsed.enabled ?? true);
        } else {
          applyNativeAudioEffect(85, [8, 6, 2, 0, 0], true);
        }
      } catch {
        applyNativeAudioEffect(85, [8, 6, 2, 0, 0], true);
      }
    };
    loadSettings();
  }, []);

  // Save settings whenever changed
  const saveSettings = async (
    preset: string,
    bass: number,
    b: number[],
    surround: boolean,
    enabled: boolean
  ) => {
    try {
      const payload = { preset, bass, bands: b, surround, enabled };
      await AsyncStorage.setItem(
        "rw_eq_settings",
        JSON.stringify(payload)
      );
      applyNativeAudioEffect(bass, b, enabled);
      DeviceEventEmitter.emit("EQ_SETTINGS_CHANGED", payload);
    } catch {}
  };

  const handleSelectPreset = (preset: EQPreset) => {
    setSelectedPreset(preset.name);
    setBassLevel(preset.bass);
    setBands([...preset.bands]);
    setSurroundEnabled(preset.surround);
    saveSettings(preset.name, preset.bass, preset.bands, preset.surround, eqEnabled);
  };

  const handleBassChange = (delta: number) => {
    const next = Math.max(0, Math.min(100, bassLevel + delta));
    setBassLevel(next);
    setSelectedPreset("Custom");
    saveSettings("Custom", next, bands, surroundEnabled, eqEnabled);
  };

  const handleBandChange = (index: number, delta: number) => {
    const nextBands = [...bands];
    nextBands[index] = Math.max(-10, Math.min(10, nextBands[index] + delta));
    setBands(nextBands);
    setSelectedPreset("Custom");
    saveSettings("Custom", bassLevel, nextBands, surroundEnabled, eqEnabled);
  };

  const bandLabels = ["60 Hz", "230 Hz", "910 Hz", "4 kHz", "14 kHz"];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="tune-vertical" size={24} color="#1DB954" style={{ marginRight: 8 }} />
              <View>
                <Text style={styles.title}>Sound Equalizer & Bass</Text>
                <Text style={styles.subtitle}>Audio Enhancer & 3D Bass Boost</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Switch
                value={eqEnabled}
                onValueChange={(val) => {
                  setEqEnabled(val);
                  saveSettings(selectedPreset, bassLevel, bands, surroundEnabled, val);
                }}
                trackColor={{ false: "#333", true: "rgba(29, 185, 84, 0.5)" }}
                thumbColor={eqEnabled ? "#1DB954" : "#888"}
                style={{ marginRight: 12 }}
              />
              <TouchableOpacity delayPressIn={0} onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* 1. Bass Booster Meter */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="speaker" size={20} color="#1DB954" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Bass Boost Controller</Text>
                <Text style={styles.sectionValue}>{bassLevel}%</Text>
              </View>

              {/* Dynamic Bass Level Bar (Interactive Touch & Drag Slider) */}
              <View
                {...(eqEnabled ? bassPanResponder.panHandlers : {})}
                onLayout={(e) => setMeterWidth(e.nativeEvent.layout.width)}
                style={styles.meterTrack}
              >
                <View
                  style={[
                    styles.meterFill,
                    { width: `${bassLevel}%` },
                    !eqEnabled && { backgroundColor: "#555" },
                  ]}
                />
              </View>

              {/* Adjust Buttons */}
              <View style={styles.controlRow}>
                <TouchableOpacity
                  delayPressIn={0}
                  onPress={() => handleBassChange(-10)}
                  style={styles.adjustBtn}
                  disabled={!eqEnabled}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="minus" size={20} color={eqEnabled ? "#fff" : "#555"} />
                </TouchableOpacity>

                <View style={styles.bassPresetBadges}>
                  {[0, 30, 65, 85, 100].map((level) => (
                    <TouchableOpacity
                      delayPressIn={0}
                      key={level}
                      onPress={() => {
                        setBassLevel(level);
                        setSelectedPreset("Custom");
                        saveSettings("Custom", level, bands, surroundEnabled, eqEnabled);
                      }}
                      style={[
                        styles.badgeBtn,
                        bassLevel === level && styles.activeBadgeBtn,
                      ]}
                      disabled={!eqEnabled}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.badgeText, bassLevel === level && styles.activeBadgeText]}>
                        {level === 0 ? "Off" : level === 100 ? "MAX" : `${level}%`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  delayPressIn={0}
                  onPress={() => handleBassChange(10)}
                  style={styles.adjustBtn}
                  disabled={!eqEnabled}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="plus" size={20} color={eqEnabled ? "#fff" : "#555"} />
                </TouchableOpacity>
              </View>
            </View>

            {/* 2. 5-Band Equalizer */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="equalizer" size={20} color="#1DB954" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>5-Band Frequency Response</Text>
              </View>

              <View style={styles.bandsContainer}>
                {bandLabels.map((label, idx) => (
                  <View key={label} style={styles.bandCol}>
                    <Text style={styles.bandDbText}>
                      {bands[idx] > 0 ? `+${bands[idx]}` : bands[idx]}dB
                    </Text>

                    <TouchableOpacity
                      delayPressIn={0}
                      onPress={() => handleBandChange(idx, 1)}
                      style={styles.bandBtn}
                      disabled={!eqEnabled}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="chevron-up" size={20} color={eqEnabled ? "#1DB954" : "#555"} />
                    </TouchableOpacity>

                    {/* Band Visual Slider Track */}
                    <View style={styles.bandTrack}>
                      <View
                        style={[
                          styles.bandThumb,
                          { bottom: `${((bands[idx] + 10) / 20) * 80}%` },
                          !eqEnabled && { backgroundColor: "#555" },
                        ]}
                      />
                    </View>

                    <TouchableOpacity
                      delayPressIn={0}
                      onPress={() => handleBandChange(idx, -1)}
                      style={styles.bandBtn}
                      disabled={!eqEnabled}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="chevron-down" size={20} color={eqEnabled ? "#1DB954" : "#555"} />
                    </TouchableOpacity>

                    <Text style={styles.bandLabelText}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 3. 3D Surround Sound Toggle */}
            <View style={styles.sectionCard}>
              <View style={styles.surroundRow}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <MaterialCommunityIcons name="surround-sound" size={24} color="#1DB954" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.surroundTitle}>3D Surround & Spatial Audio</Text>
                    <Text style={styles.surroundSub}>Immersive headphone sound stage</Text>
                  </View>
                </View>
                <Switch
                  value={surroundEnabled && eqEnabled}
                  disabled={!eqEnabled}
                  onValueChange={(val) => {
                    setSurroundEnabled(val);
                    saveSettings(selectedPreset, bassLevel, bands, val, eqEnabled);
                  }}
                  trackColor={{ false: "#333", true: "rgba(29, 185, 84, 0.5)" }}
                  thumbColor={surroundEnabled && eqEnabled ? "#1DB954" : "#888"}
                />
              </View>
            </View>

            {/* 4. EQ Presets */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Equalizer Presets</Text>
              <View style={styles.presetGrid}>
                {EQ_PRESETS.map((preset) => (
                  <TouchableOpacity
                    delayPressIn={0}
                    key={preset.name}
                    onPress={() => handleSelectPreset(preset)}
                    disabled={!eqEnabled}
                    style={[
                      styles.presetChip,
                      selectedPreset === preset.name && styles.activePresetChip,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.presetText, selectedPreset === preset.name && styles.activePresetText]}>
                      {preset.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "82%",
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#181818",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  subtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    gap: 14,
  },
  sectionCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  sectionValue: {
    color: "#1DB954",
    fontSize: 14,
    fontWeight: "bold",
  },
  meterTrack: {
    width: "100%",
    height: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 12,
  },
  meterFill: {
    height: "100%",
    backgroundColor: "#1DB954",
    borderRadius: 5,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  adjustBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  bassPresetBadges: {
    flexDirection: "row",
    gap: 6,
  },
  badgeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  activeBadgeBtn: {
    backgroundColor: "#1DB954",
  },
  badgeText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "600",
  },
  activeBadgeText: {
    color: "#000",
    fontWeight: "bold",
  },
  bandsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  bandCol: {
    alignItems: "center",
    flex: 1,
  },
  bandDbText: {
    color: "#1DB954",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 4,
  },
  bandBtn: {
    padding: 2,
  },
  bandTrack: {
    width: 6,
    height: 80,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    position: "relative",
    marginVertical: 4,
  },
  bandThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#1DB954",
    left: -4,
  },
  bandLabelText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    marginTop: 4,
  },
  surroundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  surroundTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  surroundSub: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 2,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  activePresetChip: {
    backgroundColor: "#1DB954",
  },
  presetText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "500",
  },
  activePresetText: {
    color: "#000",
    fontWeight: "bold",
  },
});
