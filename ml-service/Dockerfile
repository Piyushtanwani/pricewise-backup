FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed for compiling and running Prophet and XGBoost
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency definition
COPY requirements.txt .

# Install dependencies (no-cache-dir to minimize image size)
RUN pip install --no-cache-dir -r requirements.txt

# Copy service source code and artifacts
COPY . .

# Expose standard port
EXPOSE 8000

# Start FastAPI service listening on dynamic PORT or fallback to 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
