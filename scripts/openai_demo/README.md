# OpenAI API demo

This demo calls the OpenAI Responses API and prints raw + parsed JSON output.

## Setup

1. Copy the example env file to repo root and fill your key:
   Copy scripts/openai_demo/.env.example to .env
   OpenAI_Key=your_api_key
2. Create and activate a virtual environment:
   python -m venv scripts/openai_demo/.venv
   scripts/openai_demo/.venv/Scripts/Activate.ps1
3. Install dependencies:
   pip install -r scripts/openai_demo/requirements.txt

## Run

python scripts/openai_demo/main.py
