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