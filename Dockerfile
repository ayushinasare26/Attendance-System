FROM python:3.11-slim

# Install system dependencies required for dlib, face_recognition, and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgtk-3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Limit CMake to 1 core so compilation uses under 1.5 GB RAM instead of running out of 8 GB on multi-core servers
ENV CMAKE_BUILD_PARALLEL_LEVEL=1

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir gunicorn
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application code
COPY . .

# Set environment variables
ENV PORT=5000
ENV FLASK_ENV=production

EXPOSE 5000

# Run Flask using Gunicorn
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 120 "app:app"
