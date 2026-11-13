import os
from dotenv import load_dotenv
from sarvamai import SarvamAI
from sarvamai.play import save

load_dotenv()

key = os.getenv("SARVAM_API_KEY", "")
if not key or key.startswith("xxx"):
    raise SystemExit("SARVAM_API_KEY is missing in backend/.env — paste your real key first.")

client = SarvamAI(api_subscription_key=key)

audio = client.text_to_speech.convert(
    language_code="en-IN",
    text="Queen please jaane ko rehne de. Main toh sirf ek AI hoon.",
    model="bulbul:v4-flash",
    speaker="simran_en_sales",
)

save(audio, "test_tts.wav")
print("Done — audio saved to backend/test_tts.wav")