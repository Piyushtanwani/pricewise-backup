# PowerShell script to run PriceWise ML Service
param(
    [switch]$Pipeline
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "=== PriceWise ML Service ===" -ForegroundColor Cyan

# 1. Check/Create .venv
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment .venv..." -ForegroundColor Yellow
    python -m venv .venv
    & .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}

# 2. Pipeline if requested
if ($Pipeline) {
    Write-Host ">> Running Data Provenance..." -ForegroundColor Green
    & .\.venv\Scripts\python.exe data_provenance.py

    Write-Host ">> Running Data Extraction Pipeline..." -ForegroundColor Green
    & .\.venv\Scripts\python.exe pipeline/extract_data.py

    Write-Host ">> Training ML Forecasters..." -ForegroundColor Green
    & .\.venv\Scripts\python.exe pipeline/train_forecaster.py

    Write-Host ">> Running Backtest Evaluation..." -ForegroundColor Green
    & .\.venv\Scripts\python.exe pipeline/backtest_eval.py
}

# 3. Start ML Uvicorn Service
Write-Host ">> Starting ML Server on http://127.0.0.1:8000..." -ForegroundColor Cyan
& .\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
