#!/usr/bin/env bash
# Script to run PriceWise ML Service

set -e

# Navigate to ml-service directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=== PriceWise ML Service ==="

# Check/Create Virtual Environment
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment .venv..."
    python -m venv .venv
    echo "Activating and installing requirements..."
    if [ -f ".venv/Scripts/activate" ]; then
        source .venv/Scripts/activate
    else
        source .venv/bin/activate
    fi
    pip install -r requirements.txt
else
    if [ -f ".venv/Scripts/activate" ]; then
        source .venv/Scripts/activate
    else
        source .venv/bin/activate
    fi
fi

# Optional Pipeline flag
if [[ "$1" == "--pipeline" || "$1" == "--train" || "$1" == "--all" ]]; then
    echo ">> Running Data Provenance..."
    python data_provenance.py

    echo ">> Running Data Extraction Pipeline..."
    python pipeline/extract_data.py

    echo ">> Training ML Forecasters..."
    python pipeline/train_forecaster.py

    echo ">> Running Backtest Evaluation..."
    python pipeline/backtest_eval.py
fi

echo ">> Starting Uvicorn ML Server on http://127.0.0.1:8000..."
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
