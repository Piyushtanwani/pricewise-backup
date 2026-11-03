#!/usr/bin/env python3
"""
PriceWise ML Service Universal Runner
Compatible with Windows, macOS, and Linux out of the box.
Usage:
    python start_ml.py               # Starts Uvicorn server on http://127.0.0.1:8000
    python start_ml.py --pipeline    # Runs provenance, training, backtesting, then starts server
"""

import os
import sys
import subprocess
from pathlib import Path

# Resolve paths
ROOT_DIR = Path(__file__).resolve().parent
ML_DIR = ROOT_DIR / "ml-service" if (ROOT_DIR / "ml-service").is_dir() else ROOT_DIR
VENV_DIR = ML_DIR / ".venv"

# Determine OS-specific virtual environment Python executable
if sys.platform == "win32":
    VENV_PYTHON = VENV_DIR / "Scripts" / "python.exe"
    VENV_PIP = VENV_DIR / "Scripts" / "pip.exe"
else:
    VENV_PYTHON = VENV_DIR / "bin" / "python"
    VENV_PIP = VENV_DIR / "bin" / "pip"


def run_command(cmd, cwd=ML_DIR):
    """Executes a command and streams output."""
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        sys.exit(result.returncode)


def main():
    print("=" * 45)
    print("  PriceWise ML Service Runner (Cross-Platform)")
    print(f"  Detected OS: {sys.platform.capitalize()} | Python: {sys.version.split()[0]}")
    print("=" * 45)

    # 1. Check or create virtual environment
    if not VENV_PYTHON.exists():
        print(f"\n[1/3] Creating virtual environment at {VENV_DIR.name}...")
        run_command([sys.executable, "-m", "venv", str(VENV_DIR)], cwd=ML_DIR)

        print("[2/3] Installing dependencies from requirements.txt...")
        requirements_file = ML_DIR / "requirements.txt"
        if requirements_file.exists():
            run_command([str(VENV_PYTHON), "-m", "pip", "install", "--upgrade", "pip"], cwd=ML_DIR)
            run_command([str(VENV_PYTHON), "-m", "pip", "install", "-r", str(requirements_file)], cwd=ML_DIR)
        else:
            print(f"Warning: {requirements_file} not found.")
    else:
        print(f"\nVirtual environment verified at: {VENV_DIR}")

    # 2. Check for pipeline flags (--pipeline, --train, --all)
    pipeline_flags = {"--pipeline", "--train", "--all", "-p"}
    should_run_pipeline = any(arg in pipeline_flags for arg in sys.argv[1:])

    if should_run_pipeline:
        print("\n[Optional Pipeline Execution]")
        pipeline_steps = [
            ("Data Provenance", ML_DIR / "data_provenance.py"),
            ("Data Extraction", ML_DIR / "pipeline" / "extract_data.py"),
            ("Model Training", ML_DIR / "pipeline" / "train_forecaster.py"),
            ("Backtest Evaluation", ML_DIR / "pipeline" / "backtest_eval.py"),
        ]

        for step_name, script_path in pipeline_steps:
            if script_path.exists():
                print(f">> Running {step_name} ({script_path.name})...")
                run_command([str(VENV_PYTHON), str(script_path)], cwd=ML_DIR)
            else:
                print(f"Skipping {step_name} (script not found at {script_path}).")

    # 3. Start Uvicorn ML Service
    print("\n[3/3] Starting ML Uvicorn Server on http://127.0.0.1:8000...")
    try:
        run_command([
            str(VENV_PYTHON),
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--reload",
        ], cwd=ML_DIR)
    except KeyboardInterrupt:
        print("\nML Service stopped cleanly by user.")


if __name__ == "__main__":
    main()

