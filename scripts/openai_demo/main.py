import json
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = REPO_ROOT / ".env"

load_dotenv(ENV_PATH)

api_key = os.getenv("OpenAI_Key")

if not api_key:
    raise ValueError("Missing OpenAI_Key in environment")

client = OpenAI(api_key=api_key)

prompt = """
You are a professional garden landscape AI.

Return ONLY valid JSON.

Schema:
{
  "style": string,
  "area_m2": number,
  "waterfall": {
    "tiers": number,
    "height_m": number
  },
  "pond": {
    "shape": string,
    "fish": boolean
  },
  "rocks": [
    {
      "role": string,
      "size": string
    }
  ],
  "trees": [string]
}

User request:
"San 20m2 kieu Nhat, co ho ca koi va thac nuoc 2 tang"
"""

response = client.responses.create(
    model="gpt-4.1-mini",
    input=prompt
)

text = response.output_text

print("=== RAW OUTPUT ===")
print(text)

try:
    data = json.loads(text)

    print("\n=== PARSED JSON ===")
    print(json.dumps(data, indent=2, ensure_ascii=False))
except json.JSONDecodeError:
    print("\nJSON INVALID")
