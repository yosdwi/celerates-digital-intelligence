"""Runtime smoke for the configured model provider.

Used during provider cutovers. It exercises embeddings, one bounded JSON generation,
and push-to-talk transcription without printing credentials or business data.
"""

import io
import wave

from .config import settings
from .gateway import ModelGateway, structured, transcribe


def _silent_wav(seconds: float = 0.35, rate: int = 16000) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(b"\x00\x00" * int(rate * seconds))
    return out.getvalue()


def main() -> None:
    cfg = settings()
    if cfg.generation_mode != "litellm" or cfg.embedding_mode != "litellm":
        raise RuntimeError("Provider smoke requires litellm generation and embeddings")

    vector, embedding_model = ModelGateway().embed("celerates provider smoke")
    if not vector:
        raise RuntimeError("Embedding provider returned an empty vector")
    print(f"EMBEDDING_SMOKE_OK model={embedding_model} dimensions={len(vector)}")

    reply, meta = structured(
        [
            {"role": "system", "content": "Return only a JSON object."},
            {"role": "user", "content": 'Return exactly {"ok": true}.'},
        ],
        use_case="provider-smoke",
        max_tokens=96,
        timeout=25,
    )
    if reply.get("ok") is not True:
        raise RuntimeError("Generation provider did not satisfy the JSON smoke contract")
    print(f"GENERATION_SMOKE_OK model={meta['model']} tokens={meta['tokens']}")

    transcript, voice_meta = transcribe(_silent_wav(), "speech.wav")
    print(f"VOICE_SMOKE_OK model={voice_meta['model']} transcript_chars={len(transcript)}")


if __name__ == "__main__":
    main()
