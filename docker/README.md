# Docker setup

This Docker setup is tested on Windows 10/11 and Linux environments.

Make sure you are in the repository root directory (`yourworkspace/Hunyuan3D-2.1`).

Build docker image:

```bash
docker build -t hunyuan3d21:latest -f docker/Dockerfile .
```

Run Docker container for the API server (exposing port 8081 for integration, matching default configuration):

```bash
docker run -d --name hy3d21 -p 8081:8081 --gpus all hunyuan3d21
```

Or run the Gradio UI demo (exposing port 7860):

```bash
docker run -it --name hy3d21-ui -p 7860:7860 --gpus all hunyuan3d21 python gradio_app.py --port 7860 --host 0.0.0.0
```

After the first run, you can manage the container:

```bash
# Start container
docker start hy3d21

# Stop container
docker stop hy3d21

# View logs
docker logs -f hy3d21
```

Notes:
1. The compilation of custom rasterizers and CUDA kernels during build takes time (up to 30-45 minutes depending on processor/GPU).
2. The final Docker image is optimized (conda and pip caches are cleaned, and duplicate CUDA toolkits are removed) to fit easily in standard disk budgets.

## RunPod Network Volume & Weights Caching

To reduce cold start times and bandwidth usage when running the image in RunPod Serverless or Pods, the container detects if a network volume is mounted at `/runpod-volume` and automatically redirects model caches to it.

### How it Works

When the container boots, the entrypoint script checks for the existence of `/runpod-volume`. If present, it creates and exports the following paths:
- `HF_HOME=/runpod-volume/huggingface` (for caching Hugging Face model weights like `tencent/Hunyuan3D-2.1`)
- `TORCH_HOME=/runpod-volume/torch` (for caching PyTorch Hub models)
- `GRADIO_CACHE_DIR=/runpod-volume/gradio_cache` (for temporary Gradio files)
- `GRADIO_TEMP_DIR=/runpod-volume/tmp` (for temporary inputs/outputs)

If no network volume is mounted, it falls back to standard container-local directories under `/workspace/`.

### RunPod Setup

1. **Create a Network Volume:** In the RunPod console, create a network volume in the same data center where you plan to run your Serverless workers.
2. **Mount Path:** Configure the network volume to mount at `/runpod-volume` (this is the default mount path for RunPod network volumes).
3. **First-Run Weight Pre-caching (Optional but Recommended):**
   To completely avoid a cold start on the first worker invocation, you can spin up a normal GPU Pod, attach the network volume to it at `/runpod-volume`, and run the following command to download the weights onto the volume:
   ```bash
   python -c "import huggingface_hub; huggingface_hub.snapshot_download(repo_id='tencent/Hunyuan3D-2.1')"
   ```
   Once downloaded, terminate the GPU Pod and hook the volume up to your Serverless workers. Subsequent boots will load the cached weights directly from the network storage.