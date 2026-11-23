/**
 * Voice messages in the browser: the browser's own recorder, and a plain <audio> to play.
 *
 * MP4 (AAC) comes first because every phone plays it: iPhone Safari records it, and so does a
 * recent Chrome. Older Chrome falls back to WebM and Firefox to Ogg, which iPhones may not play.
 * The microphone is released after every clip, so the browser's "recording" light goes off.
 */
export const VOICE_MAX_SECONDS = 20;

const TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

/** Browsers only give the microphone to a secure page: https, or localhost. */
export function voiceAvailable() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window.MediaRecorder === 'function'
  );
}

export function voiceUnavailableReason() {
  if (typeof window !== 'undefined' && window.isSecureContext !== true) {
    return 'Voice needs the https address of the game. On a Wi-Fi address it can’t use the microphone.';
  }
  return 'This browser can’t record voice messages.';
}

const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The recording could not be read.'));
    reader.readAsDataURL(blob);
  });

/**
 * Starts recording. Resolves to { stop, cancel }: stop() gives { data, seconds }, a data URL of
 * the clip and its length; cancel() throws the clip away.
 */
export async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    if (err?.name === 'NotAllowedError') throw new Error('Allow the microphone to send voice messages.');
    throw new Error('No microphone found.');
  }
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const mimeType = TYPES.find((t) => window.MediaRecorder.isTypeSupported?.(t));
  let recorder;
  try {
    recorder = new window.MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
  } catch {
    release();
    throw new Error('This browser can’t record voice messages.');
  }
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  const started = Date.now();
  recorder.start();
  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          release();
          const seconds = Math.min(VOICE_MAX_SECONDS, (Date.now() - started) / 1000);
          // The server wants the plain type, without ";codecs=…".
          const type = (recorder.mimeType || mimeType || chunks[0]?.type || 'audio/webm').split(';')[0];
          try {
            resolve({ data: await readAsDataUrl(new Blob(chunks, { type })), seconds });
          } catch (err) {
            reject(err);
          }
        };
        recorder.onerror = () => {
          release();
          reject(new Error('The recording failed.'));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      try {
        recorder.stop();
      } catch {
        release();
      }
    },
  };
}

/** Plays a clip. onDone(error?) runs when it ends, fails or is stopped; stop() stops it. */
export function playVoice(data, onDone) {
  const audio = new Audio(data);
  let done = false;
  const end = (err) => {
    if (done) return;
    done = true;
    audio.onended = null;
    audio.onerror = null;
    onDone?.(err);
  };
  audio.onended = () => end();
  audio.onerror = () => end(new Error('This voice message can’t play on this phone.'));
  audio.play().catch((err) => end(err?.name === 'NotAllowedError' ? new Error('Tap again to play.') : err));
  return {
    stop: () => {
      audio.pause();
      end();
    },
  };
}
