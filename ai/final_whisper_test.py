from faster_whisper import WhisperModel

AUDIO_PATH = "ai/call1.mp4"

model = WhisperModel(
    "base",
    device="cpu",
    compute_type="int8",
    cpu_threads=2
)

print("Loading audio:", AUDIO_PATH)

segments, info = model.transcribe(AUDIO_PATH)

print("\nDetected language:", info.language)
print("------ TRANSCRIPT ------\n")

for segment in segments:
    print(f"[{segment.start:.2f}s → {segment.end:.2f}s] {segment.text}")

print("\n------ DONE ------")
