import os
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../backend/.env'))

groq_key = os.getenv('GROQ_API_KEY')
model = os.getenv('GROQ_MODEL', 'qwen/qwen3.8-27b')

headers = {
    "Authorization": f"Bearer {groq_key}",
    "Content-Type": "application/json"
}
payload = {
    "model": model,
    "messages": [
        {"role": "system", "content": "You are the PriceWise AI Shopping Assistant. Answer concisely."},
        {"role": "user", "content": "What is PriceWise?"}
    ],
    "max_tokens": 60
}

r = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=8)
print("Status:", r.status_code)
if r.status_code == 200:
    print("Response:\n", r.json()['choices'][0]['message']['content'])
else:
    print("Error:", r.text)
