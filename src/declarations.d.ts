// Ambient type definitions for React Native and Expo modules
// Ensures clean IDE diagnostics in environments before node_modules is populated

declare module 'react' {
  export function createContext<T = any>(defaultValue?: T): any;
  export function useContext<T = any>(context: any): T;
  export function useState<T = any>(initialState?: T | (() => T) | any): [T, (value: any) => void];
  export function useEffect(effect: any, deps?: any[]): void;
  export function useCallback<T = any>(callback: T, deps?: any[]): T;
  export function useMemo<T = any>(factory: () => T, deps?: any[]): T;
  export function useRef<T = any>(initialValue?: T | any): { current: T };
  export function useImperativeHandle<T = any>(ref: any, init: () => T, deps?: any[]): void;
  export function useLayoutEffect(effect: any, deps?: any[]): void;
  export function memo<T = any>(Component: T, propsAreEqual?: any): T;
  export function forwardRef<T = any, P = any>(render: (props: P, ref: any) => any): any;
  export function createRef<T = any>(): { current: T | null };
  export const Fragment: any;
  export const Children: any;
  export function cloneElement<P = any>(element: any, props?: any, ...children: any[]): any;
  export function isValidElement(object: any): boolean;

  export type ReactNode = any;
  export type ReactElement<P = any, T = any> = any;
  export type Key = any;
  export type ComponentType<P = any> = any;
  export type FC<P = any> = any;
  export type FunctionComponent<P = any> = any;
  export type Component<P = any, S = any> = any;
  export type PropsWithChildren<P = any> = any;
  export type MutableRefObject<T = any> = any;
  export type RefObject<T = any> = any;
  export type Dispatch<A = any> = any;
  export type SetStateAction<S = any> = any;
  export type Context<T = any> = any;
  export type Ref<T = any> = any;
  export type EffectCallback = any;
  export type DependencyList = any;

  const React: any;
  export default React;
}

declare module 'react-native' {
  export const View: any;
  export const Text: any;
  export const StyleSheet: {
    create<T = any>(styles: T | any): T;
    flatten: any;
    hairlineWidth: number;
    absoluteFill: any;
    absoluteFillObject: any;
    [key: string]: any;
  };
  export const TouchableOpacity: any;
  export const TextInput: any;
  export const ScrollView: any;
  export const Image: any;
  export const AppState: any;
  export const DeviceEventEmitter: any;
  export const ActivityIndicator: any;
  export const Platform: any;
  export const Modal: any;
  export const Dimensions: any;
  export const Animated: any;
  export const PanResponder: any;
  export const Linking: any;
  export const Keyboard: any;
  export const RefreshControl: any;
  export const useWindowDimensions: any;
  export const Alert: any;
  export const NativeModules: any;
  export const StatusBar: any;
  export const FlatList: any;
  export const Pressable: any;
  export const BackHandler: any;
  export const Share: any;
  export const SafeAreaView: any;
  export const KeyboardAvoidingView: any;

  export type AppStateStatus = any;
  export type GestureResponderEvent = any;
  export type NativeSyntheticEvent<T = any> = any;
  export type ViewStyle = any;
  export type TextStyle = any;
  export type ImageStyle = any;
  export type LayoutChangeEvent = any;
  export type ScaledSize = any;

  const RN: any;
  export default RN;
}

declare module '@expo/vector-icons' {
  export const MaterialCommunityIcons: any;
  export const Ionicons: any;
  export const Feather: any;
  export const FontAwesome: any;
  export const MaterialIcons: any;
  export const AntDesign: any;
  export const Entypo: any;
  const content: any;
  export default content;
}

declare module 'react-native-track-player' {
  export const Capability: any;
  export const State: any;
  export const Event: any;
  export const usePlaybackState: any;
  export const useProgress: any;
  export const useTrackPlayerEvents: any;
  export const Track: any;
  export const AppKilledPlaybackBehavior: any;
  const TrackPlayer: any;
  export default TrackPlayer;
}

declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: any;
  export default AsyncStorage;
}

declare module 'expo-file-system' {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;
  export const downloadAsync: any;
  export const getInfoAsync: any;
  export const deleteAsync: any;
  export const makeDirectoryAsync: any;
  export const readAsStringAsync: any;
  export const writeAsStringAsync: any;
  const content: any;
  export default content;
}

declare module 'react-native-webview' {
  export const WebView: any;
  const content: any;
  export default content;
}

declare module 'react-native-paper' {
  export const MD3DarkTheme: any;
  export const MD3LightTheme: any;
  export const Provider: any;
  const content: any;
  export default content;
}

declare module 'react-native-safe-area-context' {
  export const SafeAreaProvider: any;
  export const useSafeAreaInsets: any;
  export const SafeAreaView: any;
  const content: any;
  export default content;
}

declare module 'react-native-screens' {
  export const enableScreens: any;
  const content: any;
  export default content;
}

declare module 'expo-av' {
  export const Audio: any;
  const content: any;
  export default content;
}

declare module 'expo-updates' {
  export const checkForUpdateAsync: any;
  export const fetchUpdateAsync: any;
  export const reloadAsync: any;
  const content: any;
  export default content;
}
