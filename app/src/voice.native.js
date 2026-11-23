import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Voice messages in the app (expo-audio): AAC in an .m4a file, which every phone and browser can
 * play. Small on purpose: one voice channel at 32 kbit/s is plenty for talking.
 */
export const VOICE_MAX_SECONDS = 20;

const COMMON = { extension: '.m4a', sampleRate: 22050, numberOfChannels: 1, bitRate: 32000, isMeteringEnabled: false };
// expo-audio's recorder takes the options for this platform only, already merged.
const OPTIONS =
  Platform.OS === 'ios'
    ? {
        ...COMMON,
        outputFormat: IOSOutputFormat.MPEG4AAC,
        audioQuality: AudioQuality.MEDIUM,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      }
    : { ...COMMON, outputFormat: 'mpeg4', audioEncoder: 'aac' };

const EXTENSION = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };

export const voiceAvailable = () => true;
export const voiceUnavailableReason = () => null;

// Playing: the loudspeaker, even with the phone on silent, like any messaging app's voice notes.
const playMode = () => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

const deleteQuietly = (uri) => {
  try {
    if (uri) new File(uri).delete();
  } catch {
    // Already gone: the cache folder is the system's to clean anyway.
  }
};

/**
 * Starts recording. Resolves to { stop, cancel }: stop() gives { data, seconds }, a data URL of
 * the clip and its length; cancel() throws the clip away.
 */
export async function startRecording() {
  const { granted } = await requestRecordingPermissionsAsync();
  if (!granted) throw new Error('Allow the microphone to send voice messages.');
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  const recorder = new AudioModule.AudioRecorder(OPTIONS);
  await recorder.prepareToRecordAsync();
  recorder.record();
  const started = Date.now();
  const finish = async () => {
    try {
      await recorder.stop();
    } finally {
      await playMode();
    }
  };
  return {
    stop: async () => {
      const seconds = Math.min(VOICE_MAX_SECONDS, (Date.now() - started) / 1000);
      await finish();
      const { uri } = recorder;
      if (!uri) throw new Error('The recording failed.');
      try {
        const base64 = await new File(uri).base64();
        return { data: `data:audio/mp4;base64,${base64}`, seconds };
      } finally {
        deleteQuietly(uri);
      }
    },
    cancel: () => {
      finish()
        .catch(() => {})
        .finally(() => deleteQuietly(recorder.uri));
    },
  };
}

let count = 0;

/** Plays a clip. onDone(error?) runs when it ends, fails or is stopped; stop() stops it. */
export function playVoice(data, onDone) {
  let player = null;
  let file = null;
  let done = false;
  const end = (err) => {
    if (done) return;
    done = true;
    try {
      player?.remove();
    } catch {
      // Released already.
    }
    deleteQuietly(file?.uri);
    onDone?.(err);
  };
  (async () => {
    // The players want a file, not a data URL: write the clip to the cache first.
    const type = /^data:([^;]+);/.exec(data)?.[1] ?? 'audio/mp4';
    count += 1;
    file = new File(Paths.cache, `voice-${Date.now()}-${count}.${EXTENSION[type] ?? 'm4a'}`);
    file.create();
    await file.write(data.slice(data.indexOf(',') + 1), { encoding: 'base64' });
    if (done) return;
    await playMode();
    player = createAudioPlayer({ uri: file.uri });
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) end();
    });
    player.play();
  })().catch(() => end(new Error('This voice message can’t play on this phone.')));
  return { stop: () => end() };
}
