#!/bin/bash

# If RunPod network volume is mounted, redirect caching to it
if [ -d "/runpod-volume" ]; then
    echo "RunPod network volume detected at /runpod-volume. Redirecting cache paths..."
    export HF_HOME="/runpod-volume/huggingface"
    export TORCH_HOME="/runpod-volume/torch"
    export GRADIO_CACHE_DIR="/runpod-volume/gradio_cache"
    export GRADIO_TEMP_DIR="/runpod-volume/tmp"
else
    echo "No RunPod network volume detected. Using default container paths..."
    export HF_HOME="/workspace/huggingface"
    export TORCH_HOME="/workspace/torch"
    export GRADIO_CACHE_DIR="/workspace/gradio_cache"
    export GRADIO_TEMP_DIR="/workspace/tmp"
fi

# Ensure all cache and temp directories exist
mkdir -p "$HF_HOME" "$TORCH_HOME" "$GRADIO_CACHE_DIR" "$GRADIO_TEMP_DIR"

# Execute the main command (e.g., api_server.py) passed from Docker's CMD
exec "$@"
