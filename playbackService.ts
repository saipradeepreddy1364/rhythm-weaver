import TrackPlayer, { Event } from 'react-native-track-player';

export const PlaybackService = async () => {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    TrackPlayer.skipToNext().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    TrackPlayer.skipToPrevious().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    TrackPlayer.seekTo(event.position).catch(() => {});
  });
};
