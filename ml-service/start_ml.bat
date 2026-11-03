@echo off
cd /d "%~dp0"

echo === PriceWise ML Service ===

if not exist ".venv" (
    echo Creating virtual environment .venv...
    python -m venv .venv
    call .\.venv\Scripts\python.exe -m pip install -r requirements.txt
)

echo Starting ML Server on http://127.0.0.1:8000...
call .\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
pause
