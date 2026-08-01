import { AUDIO } from '@live-translator/shared';

export type AudioCaptureHandle = {
  stop: () => Promise<void>;
};

/**
 * Capture tab audio via streamId, preserve playback to destination,
 * and route a processing branch through AudioWorklet.
 */
export async function startAudioCapture(
  streamId: string,
  onPcmChunk: (chunk: ArrayBuffer) => void,
): Promise<AudioCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // @ts-expect-error Chrome tab capture constraint
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);

  // Preserve original tab audio for the user (tabCapture mutes the tab otherwise)
  source.connect(audioContext.destination);

  await audioContext.audioWorklet.addModule(chrome.runtime.getURL('audio-worklet.js'));

  const worklet = new AudioWorkletNode(audioContext, 'pcm-capture-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    processorOptions: {
      targetSampleRate: AUDIO.sampleRate,
      chunkSize: AUDIO.samplesPerChunk,
    },
  });

  worklet.port.onmessage = (event: MessageEvent<{ type: string; buffer: ArrayBuffer }>) => {
    if (event.data?.type === 'pcm' && event.data.buffer) {
      onPcmChunk(event.data.buffer);
    }
  };

  source.connect(worklet);

  return {
    async stop() {
      worklet.port.onmessage = null;
      try {
        worklet.disconnect();
      } catch {
        // ignore
      }
      try {
        source.disconnect();
      } catch {
        // ignore
      }
      for (const track of stream.getTracks()) {
        track.stop();
      }
      if (audioContext.state !== 'closed') {
        await audioContext.close();
      }
    },
  };
}
