"""
Usage: python transcribe.py <input_audio_path> [output_txt_path]
If output_txt_path is omitted, writes transcript to stdout.
"""

import sys
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except Exception as exc:
    print(f"Failed to import faster_whisper: {exc}", file=sys.stderr)
    sys.exit(1)

# 🔥 Load model ONCE (huge performance win)
MODEL = WhisperModel(
    "base",
    device="cpu",
    compute_type="int8",
    cpu_threads=2
)


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python transcribe.py <input_audio_path> [output_txt_path]",
            file=sys.stderr,
        )
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not Path(input_path).exists():
        print(f"File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        segments, info = MODEL.transcribe(input_path)

        texts = []
        for seg in segments:
            if seg and getattr(seg, "text", None):
                text = seg.text.strip()
                if text:
                    texts.append(text)

        final_text = " ".join(texts).strip()

        if not final_text:
            print("Transcription produced empty text", file=sys.stderr)
            sys.exit(1)

        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(final_text)
            print(f"Transcript saved to {output_path}")
        else:
            # 👈 This is what Node will read from stdout
            print(final_text)

        sys.exit(0)

    except Exception as exc:
        print(f"Transcription error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
