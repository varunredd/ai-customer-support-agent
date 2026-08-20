"use client";

function canStreamMpeg() {
  return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg");
}

function sourceBufferChunk(chunk: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(chunk);
  return copy.buffer;
}

function appendChunk(sourceBuffer: SourceBuffer, chunk: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    const onUpdate = () => {
      sourceBuffer.removeEventListener("updateend", onUpdate);
      sourceBuffer.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      sourceBuffer.removeEventListener("updateend", onUpdate);
      sourceBuffer.removeEventListener("error", onError);
      reject(new Error("Unable to buffer spoken audio."));
    };
    sourceBuffer.addEventListener("updateend", onUpdate);
    sourceBuffer.addEventListener("error", onError);
    sourceBuffer.appendBuffer(sourceBufferChunk(chunk));
  });
}

async function playViaMediaSource(stream: ReadableStream<Uint8Array>, audio: HTMLAudioElement) {
  const mediaSource = new MediaSource();
  const url = URL.createObjectURL(mediaSource);
  audio.src = url;

  await new Promise<void>((resolve, reject) => {
    mediaSource.addEventListener("sourceopen", async () => {
      try {
        const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        const reader = stream.getReader();
        let started = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          await appendChunk(sourceBuffer, value);
          if (!started) {
            started = true;
            resolve();
            void audio.play();
          }
        }
        if (mediaSource.readyState === "open") mediaSource.endOfStream();
        if (!started) resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Unable to stream spoken audio."));
      }
    }, { once: true });
  });

  return url;
}

export async function attachSpeechAudio(response: Response, audio: HTMLAudioElement) {
  const fallback = canStreamMpeg() ? response.clone() : null;
  if (response.body && canStreamMpeg()) {
    try {
      return await playViaMediaSource(response.body, audio);
    } catch {
      const blob = await (fallback ?? response).blob();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      await audio.play();
      return url;
    }
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  audio.src = url;
  await audio.play();
  return url;
}
