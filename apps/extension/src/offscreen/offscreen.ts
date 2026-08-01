import type { ExtensionMessage } from '../shared/messages.js';
import { startAudioCapture, type AudioCaptureHandle } from './audio-capture.js';
import { RealtimeClient } from './realtime-client.js';

let capture: AudioCaptureHandle | null = null;
let client: RealtimeClient | null = null;

async function stopAll(): Promise<void> {
  await client?.stop();
  client = null;
  await capture?.stop();
  capture = null;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  void (async () => {
    if (message.type === 'offscreen.start') {
      await stopAll();

      client = new RealtimeClient({
        onStatus: (status, msg) => {
          void chrome.runtime.sendMessage({
            type: 'offscreen.status',
            status,
            message: msg,
          } satisfies ExtensionMessage);
        },
        onEvent: (event) => {
          void chrome.runtime.sendMessage({
            type: 'offscreen.serverEvent',
            event,
          } satisfies ExtensionMessage);
        },
      });

      try {
        capture = await startAudioCapture(message.streamId, (chunk) => {
          client?.sendAudio(chunk);
        });
        await client.start({
          apiBase: message.apiBase,
          sessionId: message.sessionId,
          targetLanguage: message.targetLanguage,
          platform: 'twitch',
        });
        sendResponse({ ok: true });
      } catch (error) {
        await stopAll();
        void chrome.runtime.sendMessage({
          type: 'offscreen.error',
          code: 'AUDIO_CAPTURE_FAILED',
          message: error instanceof Error ? error.message : 'Audio capture failed',
        } satisfies ExtensionMessage);
        sendResponse({ ok: false });
      }
      return;
    }

    if (message.type === 'offscreen.stop') {
      await stopAll();
      sendResponse({ ok: true });
    }
  })();
  return true;
});

console.info('[live-translator] offscreen ready');
