/* Hunyuan3D Backend Tester Client Logic */

// App State
let state = {
    activeBackend: 'local', // 'local', 'pod', 'serverless'
    uploadedImageBase64: null, // raw base64 string (no data URL prefix)
    uploadedImageMime: null, // e.g. 'image/png'
    uploadedImageFilename: null,
    
    // Timer/Pollers
    pollIntervalId: null,
    timerIntervalId: null,
    startTime: null,
    currentJobId: null,
    abortController: null,
    
    // Viewer states
    isViewerModelLoaded: false,
    savedMaterials: null,
    savedExposure: null,
    
    // Params Mode
    paramsMode: 'form', // 'form', 'json'
    
    // Model Binary
    generatedModelBlob: null,
    generatedModelFilename: 'hunyuan3d_model.glb'
};

// DOM References
const DOM = {
    // Tabs
    tabLocal: document.getElementById('tab-local'),
    tabPod: document.getElementById('tab-pod'),
    tabServerless: document.getElementById('tab-serverless'),
    
    // Forms
    groupUrl: document.getElementById('group-url'),
    groupServerless: document.getElementById('group-serverless'),
    groupRequestType: document.getElementById('group-request-type'),
    inputUrl: document.getElementById('input-url'),
    inputApiKey: document.getElementById('input-api-key'),
    inputEndpointId: document.getElementById('input-endpoint-id'),
    urlTip: document.getElementById('url-tip'),
    
    // Image Uploader
    imageDropZone: document.getElementById('image-drop-zone'),
    inputFile: document.getElementById('input-file'),
    imagePreviewContainer: document.getElementById('image-preview-container'),
    imagePreview: document.getElementById('image-preview'),
    
    // Params
    paramRemoveBg: document.getElementById('param-remove-bg'),
    paramTexture: document.getElementById('param-texture'),
    paramSteps: document.getElementById('param-steps'),
    paramGuidance: document.getElementById('param-guidance'),
    paramSeed: document.getElementById('param-seed'),
    paramResolution: document.getElementById('param-resolution'),
    paramFormat: document.getElementById('param-format'),
    paramRequestType: document.getElementById('param-request-type'),
    
    valSteps: document.getElementById('val-steps'),
    valGuidance: document.getElementById('val-guidance'),
    
    // Mode toggle
    btnModeForm: document.getElementById('btn-mode-form'),
    btnModeJson: document.getElementById('btn-mode-json'),
    paramsFormContainer: document.getElementById('params-form-container'),
    paramsJsonContainer: document.getElementById('params-json-container'),
    jsonPayloadEditor: document.getElementById('json-payload-editor'),
    
    // Action buttons
    btnGenerate: document.getElementById('btn-generate'),
    btnCancel: document.getElementById('btn-cancel'),
    
    // Viewport
    viewportContainer: document.getElementById('viewport-container'),
    modelViewerWrapper: document.getElementById('model-viewer-wrapper'),
    viewerPlaceholder: document.getElementById('viewer-placeholder'),
    btnDownload: document.getElementById('btn-download'),
    
    // Progress Overlay
    progressOverlay: document.getElementById('progress-overlay'),
    progressStatusText: document.getElementById('progress-status-text'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    progressTimeCounter: document.getElementById('progress-time-counter'),
    
    // Viewer Controls
    btnViewTexture: document.getElementById('btn-view-texture'),
    btnViewGeometry: document.getElementById('btn-view-geometry'),
    btnToggleRotate: document.getElementById('btn-toggle-rotate'),
    btnToggleGrid: document.getElementById('btn-toggle-grid'),
    btnResetCamera: document.getElementById('btn-reset-camera'),
    
    // Console logs
    consoleLogs: document.getElementById('console-logs')
};

// Load saved RunPod credentials if available
document.addEventListener('DOMContentLoaded', () => {
    const savedApiKey = localStorage.getItem('hunyuan_runpod_api_key');
    const savedEndpointId = localStorage.getItem('hunyuan_runpod_endpoint_id');
    const savedLocalUrl = localStorage.getItem('hunyuan_local_url');
    
    if (savedApiKey) DOM.inputApiKey.value = savedApiKey;
    if (savedEndpointId) DOM.inputEndpointId.value = savedEndpointId;
    if (savedLocalUrl) DOM.inputUrl.value = savedLocalUrl;
    
    // Initialize JSON editor payload
    updateJsonPayloadFromForm();
    
    // Attach event listeners to sync form changes back to JSON payload
    const formInputs = [
        DOM.paramRemoveBg, DOM.paramTexture, DOM.paramSteps, 
        DOM.paramGuidance, DOM.paramSeed, DOM.paramResolution, DOM.paramFormat
    ];
    formInputs.forEach(input => {
        input.addEventListener('change', updateJsonPayloadFromForm);
        if (input.type === 'range' || input.type === 'number') {
            input.addEventListener('input', updateJsonPayloadFromForm);
        }
    });

    // Image drag & drop listeners
    setupImageDragAndDrop();
    
    // Handle image paste on page
    window.addEventListener('paste', handleImagePaste);
});

// Switch Backend View
function switchBackend(backend) {
    state.activeBackend = backend;
    
    // Toggle active tab classes
    DOM.tabLocal.classList.toggle('active', backend === 'local');
    DOM.tabPod.classList.toggle('active', backend === 'pod');
    DOM.tabServerless.classList.toggle('active', backend === 'serverless');
    
    // Toggle input field displays
    if (backend === 'local') {
        DOM.groupUrl.classList.remove('hidden');
        DOM.groupServerless.classList.add('hidden');
        DOM.groupRequestType.classList.remove('hidden');
        DOM.inputUrl.placeholder = "http://localhost:8081";
        if (DOM.inputUrl.value.includes('proxy.runpod.net')) {
            DOM.inputUrl.value = "http://localhost:8081";
        }
        DOM.urlTip.innerText = "The URL where api_server.py is running.";
    } else if (backend === 'pod') {
        DOM.groupUrl.classList.remove('hidden');
        DOM.groupServerless.classList.add('hidden');
        DOM.groupRequestType.classList.remove('hidden');
        DOM.inputUrl.placeholder = "https://xxxxxx-8081.proxy.runpod.net";
        DOM.urlTip.innerText = "The public proxy URL or IP of your RunPod GPU Pod instance.";
    } else if (backend === 'serverless') {
        DOM.groupUrl.classList.add('hidden');
        DOM.groupServerless.classList.remove('hidden');
        DOM.groupRequestType.classList.add('hidden'); // RunPod serverless is always async polling
    }
    
    logConsole(`Switched backend type to: ${backend.toUpperCase()}`);
    updateJsonPayloadFromForm();
}

// Password visibility toggle
function togglePasswordVisibility(id) {
    const el = document.getElementById(id);
    const eye = document.getElementById(id + '-eye');
    if (el.type === 'password') {
        el.type = 'text';
        eye.classList.remove('fa-eye');
        eye.classList.add('fa-eye-slash');
    } else {
        el.type = 'password';
        eye.classList.remove('fa-eye-slash');
        eye.classList.add('fa-eye');
    }
}

// Console Logging Utility
function logConsole(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `console-line ${type}-line`;
    line.innerText = `[${timestamp}] ${message}`;
    
    DOM.consoleLogs.appendChild(line);
    DOM.consoleLogs.scrollTop = DOM.consoleLogs.scrollHeight;
    
    // Log clean console message to developer console as well
    if (type === 'error') console.error(`[Tester] ${message}`);
    else console.log(`[Tester] ${message}`);
}

function clearConsole() {
    DOM.consoleLogs.innerHTML = '<div class="console-line system-line">[System] Console cleared.</div>';
}

// Test backend connection
async function testConnection() {
    const backend = state.activeBackend;
    
    if (backend === 'local' || backend === 'pod') {
        const url = DOM.inputUrl.value.trim() || DOM.inputUrl.placeholder;
        const targetUrl = `${url}/health`;
        logConsole(`Testing connection to: ${targetUrl}...`, 'req');
        
        try {
            // Store local url
            localStorage.setItem('hunyuan_local_url', url);
            
            // Try fetching directly, fallback to proxy if CORS fails
            let response;
            try {
                response = await fetch(targetUrl, { method: 'GET', mode: 'cors' });
            } catch (corsErr) {
                logConsole(`Direct fetch failed (possibly CORS). Routing via local proxy...`, 'system');
                response = await fetch('/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: targetUrl, method: 'GET' })
                });
            }
            
            if (response.ok) {
                const data = await response.json();
                logConsole(`Success! Health response: ${JSON.stringify(data)}`, 'success');
            } else {
                logConsole(`Server responded with status: ${response.status} ${response.statusText}`, 'error');
            }
        } catch (err) {
            logConsole(`Connection failed: ${err.message}`, 'error');
        }
    } else if (backend === 'serverless') {
        const apiKey = DOM.inputApiKey.value.trim();
        const endpointId = DOM.inputEndpointId.value.trim();
        
        if (!apiKey || !endpointId) {
            logConsole("Connection test failed: API Key and Endpoint ID are required.", "error");
            return;
        }
        
        // Save credentials
        localStorage.setItem('hunyuan_runpod_api_key', apiKey);
        localStorage.setItem('hunyuan_runpod_endpoint_id', endpointId);
        
        // RunPod serverless health endpoint structure
        const targetUrl = `https://api.runpod.ai/v1/${endpointId}/health`;
        logConsole(`Testing connection to RunPod Serverless: ${targetUrl}...`, 'req');
        
        try {
            let response;
            try {
                response = await fetch(targetUrl, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
            } catch (corsErr) {
                logConsole(`Direct request failed (CORS). Routing via local proxy...`, 'system');
                response = await fetch('/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: targetUrl,
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    })
                });
            }
            
            if (response.ok) {
                const data = await response.json();
                logConsole(`Success! RunPod health response: ${JSON.stringify(data)}`, 'success');
            } else {
                const errorText = await response.text();
                logConsole(`RunPod responded with status: ${response.status}. Detail: ${errorText}`, 'error');
            }
        } catch (err) {
            logConsole(`Connection failed: ${err.message}`, 'error');
        }
    }
}

// Drag and drop image upload setup
function setupImageDragAndDrop() {
    const dropZone = DOM.imageDropZone;
    
    dropZone.addEventListener('click', () => DOM.inputFile.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, () => {
            dropZone.classList.remove('dragover');
        });
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length) {
            handleImageFile(e.dataTransfer.files[0]);
        }
    });
    
    DOM.inputFile.addEventListener('change', () => {
        if (DOM.inputFile.files.length) {
            handleImageFile(DOM.inputFile.files[0]);
        }
    });
}

function handleImagePaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        let item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            let blob = item.getAsFile();
            handleImageFile(blob);
            break;
        }
    }
}

function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
        logConsole('Error: Uploaded file is not an image.', 'error');
        return;
    }
    
    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxBytes) {
        logConsole('Error: Image is too large (max 10MB).', 'error');
        return;
    }
    
    state.uploadedImageFilename = file.name;
    state.uploadedImageMime = file.type;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const fullBase64 = e.target.result;
        // Strip data:image/...;base64, prefix for the model payload
        state.uploadedImageBase64 = fullBase64.replace(/^data:image\/\w+;base64,/, '');
        
        // Show preview
        DOM.imagePreview.src = fullBase64;
        DOM.imagePreviewContainer.classList.remove('hidden');
        
        logConsole(`Image loaded: ${file.name} (${Math.round(file.size / 1024)} KB)`);
        updateJsonPayloadFromForm();
    };
    
    reader.readAsDataURL(file);
}

function clearImage(e) {
    if (e) e.stopPropagation();
    
    state.uploadedImageBase64 = null;
    state.uploadedImageMime = null;
    state.uploadedImageFilename = null;
    DOM.inputFile.value = '';
    DOM.imagePreview.src = '';
    DOM.imagePreviewContainer.classList.add('hidden');
    
    logConsole('Image removed.');
    updateJsonPayloadFromForm();
}

async function loadSampleImage(path) {
    logConsole(`Loading demo sample image: ${path}...`);
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error('File not found');
        const blob = await response.blob();
        
        const file = new File([blob], "demo.png", { type: "image/png" });
        handleImageFile(file);
    } catch(err) {
        logConsole(`Failed to load sample image: ${err.message}. Creating colored placeholder fallback...`, 'system');
        
        // Fallback canvas drawing to base64
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px Outfit';
        ctx.fillText('Hunyuan3D', 50, 130);
        ctx.fillText('Test Image', 60, 160);
        
        const dataUrl = canvas.toDataURL('image/png');
        state.uploadedImageBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        state.uploadedImageMime = 'image/png';
        state.uploadedImageFilename = 'fallback_canvas.png';
        
        DOM.imagePreview.src = dataUrl;
        DOM.imagePreviewContainer.classList.remove('hidden');
        logConsole(`Created placeholder canvas image successfully.`);
        updateJsonPayloadFromForm();
    }
}

// Sliders mapping
function updateSliderVal(id, val) {
    const valEl = document.getElementById(`val-${id}`);
    if (valEl) {
        // If guidance scale, add .0 to integer values for formatting
        if (id === 'guidance') {
            valEl.innerText = parseFloat(val).toFixed(1);
        } else {
            valEl.innerText = val;
        }
    }
}

function randomizeSeed() {
    const randSeed = Math.floor(Math.random() * 100000);
    DOM.paramSeed.value = randSeed;
    logConsole(`Seed randomized to: ${randSeed}`);
    updateJsonPayloadFromForm();
}

// Form Parameter toggling Mode (Form / JSON)
function toggleParametersMode(mode) {
    state.paramsMode = mode;
    DOM.btnModeForm.classList.toggle('active', mode === 'form');
    DOM.btnModeJson.classList.toggle('active', mode === 'json');
    
    if (mode === 'form') {
        DOM.paramsFormContainer.classList.remove('hidden');
        DOM.paramsJsonContainer.classList.add('hidden');
        
        // Try applying JSON edits back to form if valid
        try {
            const rawJson = DOM.jsonPayloadEditor.value.trim();
            if (rawJson) {
                const parsed = JSON.parse(rawJson);
                // Extract parameters
                let params = parsed;
                if (parsed.input) params = parsed.input; // Handle RunPod serverless wrapping
                
                if (params.remove_background !== undefined) DOM.paramRemoveBg.checked = params.remove_background;
                if (params.texture !== undefined) DOM.paramTexture.checked = params.texture;
                if (params.seed !== undefined) DOM.paramSeed.value = params.seed;
                if (params.num_inference_steps !== undefined) {
                    DOM.paramSteps.value = params.num_inference_steps;
                    updateSliderVal('steps', params.num_inference_steps);
                }
                if (params.guidance_scale !== undefined) {
                    DOM.paramGuidance.value = params.guidance_scale;
                    updateSliderVal('guidance', params.guidance_scale);
                }
                if (params.octree_resolution !== undefined) DOM.paramResolution.value = params.octree_resolution;
                if (params.type !== undefined) DOM.paramFormat.value = params.type;
                
                logConsole('Synced manual JSON modifications back to UI inputs.');
            }
        } catch (e) {
            logConsole(`Could not sync JSON changes to form: Invalid JSON.`, 'error');
        }
    } else {
        DOM.paramsFormContainer.classList.add('hidden');
        DOM.paramsJsonContainer.classList.remove('hidden');
        updateJsonPayloadFromForm();
    }
}

// Generate payload representation
function updateJsonPayloadFromForm() {
    const payload = {
        image: state.uploadedImageBase64 || "[Base64 encoded image string]",
        remove_background: DOM.paramRemoveBg.checked,
        texture: DOM.paramTexture.checked,
        seed: parseInt(DOM.paramSeed.value) || 1234,
        octree_resolution: parseInt(DOM.paramResolution.value) || 256,
        num_inference_steps: parseInt(DOM.paramSteps.value) || 5,
        guidance_scale: parseFloat(DOM.paramGuidance.value) || 5.0,
        type: DOM.paramFormat.value || 'glb'
    };
    
    let containerPayload = payload;
    
    // RunPod Serverless expects wrapping input
    if (state.activeBackend === 'serverless') {
        containerPayload = {
            input: payload
        };
    }
    
    DOM.jsonPayloadEditor.value = JSON.stringify(containerPayload, null, 2);
}

// Retrieve outgoing payload based on active editor/form state
function getFinalPayload() {
    if (state.paramsMode === 'json') {
        try {
            const parsed = JSON.parse(DOM.jsonPayloadEditor.value);
            // Replace placeholder with base64 if not edited
            let inner = parsed.input ? parsed.input : parsed;
            if (inner.image === "[Base64 encoded image string]") {
                inner.image = state.uploadedImageBase64;
            }
            return parsed;
        } catch (e) {
            logConsole(`JSON payload syntax error! Fallback to form parameters.`, 'error');
        }
    }
    
    // Form Mode / Fallback
    const payload = {
        image: state.uploadedImageBase64,
        remove_background: DOM.paramRemoveBg.checked,
        texture: DOM.paramTexture.checked,
        seed: parseInt(DOM.paramSeed.value) || 1234,
        octree_resolution: parseInt(DOM.paramResolution.value) || 256,
        num_inference_steps: parseInt(DOM.paramSteps.value) || 5,
        guidance_scale: parseFloat(DOM.paramGuidance.value) || 5.0,
        type: DOM.paramFormat.value || 'glb'
    };
    
    if (state.activeBackend === 'serverless') {
        return { input: payload };
    }
    return payload;
}

// Start generation process
async function startGeneration() {
    if (!state.uploadedImageBase64) {
        alert("Please upload or select a source image first.");
        logConsole("Generation failed: No source image uploaded.", "error");
        return;
    }
    
    state.abortController = new AbortController();
    
    // Clear old viewer and state
    state.generatedModelBlob = null;
    state.currentJobId = null;
    clearViewer();
    
    // Configure Progress display
    DOM.progressOverlay.classList.remove('hidden');
    DOM.progressStatusText.innerText = "Initializing connection...";
    DOM.progressBarFill.style.width = '10%';
    
    // Actions Toggle
    DOM.btnGenerate.classList.add('hidden');
    DOM.btnCancel.classList.remove('hidden');
    
    // Start Time tracking
    state.startTime = Date.now();
    DOM.progressTimeCounter.innerText = "0.0s elapsed";
    state.timerIntervalId = setInterval(() => {
        const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
        DOM.progressTimeCounter.innerText = `${elapsed}s elapsed`;
    }, 100);
    
    // Choose appropriate workflow
    const payload = getFinalPayload();
    const isAsync = DOM.paramRequestType.value === 'async';
    
    if (state.activeBackend === 'local' || state.activeBackend === 'pod') {
        const url = DOM.inputUrl.value.trim() || DOM.inputUrl.placeholder;
        
        // Save current url
        localStorage.setItem('hunyuan_local_url', url);
        
        if (isAsync) {
            runAsyncWorkflow(url, payload);
        } else {
            runSyncWorkflow(url, payload);
        }
    } else if (state.activeBackend === 'serverless') {
        const apiKey = DOM.inputApiKey.value.trim();
        const endpointId = DOM.inputEndpointId.value.trim();
        
        if (!apiKey || !endpointId) {
            logConsole("Error: RunPod Serverless credentials missing.", "error");
            endGenerationProcess(false, "Credentials missing");
            return;
        }
        
        // Save credentials
        localStorage.setItem('hunyuan_runpod_api_key', apiKey);
        localStorage.setItem('hunyuan_runpod_endpoint_id', endpointId);
        
        runServerlessWorkflow(endpointId, apiKey, payload);
    }
}

// Workflow: Sync Endpoint for Local/Pod
async function runSyncWorkflow(baseUrl, payload) {
    const targetUrl = `${baseUrl}/generate`;
    logConsole(`Starting Synchronous Generation: ${targetUrl}`, 'req');
    DOM.progressStatusText.innerText = "Generating 3D model (Synchronous direct wait)...";
    DOM.progressBarFill.style.width = '40%';
    
    try {
        let response;
        try {
            response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: state.abortController.signal
            });
        } catch (corsErr) {
            if (corsErr.name === 'AbortError') throw corsErr;
            logConsole(`Direct request blocked (CORS). Retrying via proxy...`, 'system');
            response = await fetch('/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: targetUrl,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }),
                signal: state.abortController.signal
            });
        }
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server returned error: ${response.status}. Detail: ${errText.substring(0, 200)}`);
        }
        
        DOM.progressStatusText.innerText = "Downloading model assets...";
        DOM.progressBarFill.style.width = '85%';
        
        // We received raw GLB file
        const blob = await response.blob();
        state.generatedModelBlob = blob;
        state.generatedModelFilename = `sync_model_${Date.now()}.glb`;
        
        logConsole(`Successfully retrieved 3D model. Size: ${Math.round(blob.size / 1024)} KB`, 'success');
        
        // Load model in viewer
        const objectUrl = URL.createObjectURL(blob);
        loadModelInViewer(objectUrl);
        endGenerationProcess(true);
        
    } catch (err) {
        if (err.name === 'AbortError') {
            logConsole(`Generation aborted by user.`, 'system');
        } else {
            logConsole(`Generation failed: ${err.message}`, 'error');
            endGenerationProcess(false, err.message);
        }
    }
}

// Workflow: Async Endpoint (/send & /status) for Local/Pod
async function runAsyncWorkflow(baseUrl, payload) {
    const sendUrl = `${baseUrl}/send`;
    logConsole(`Starting Asynchronous Generation. Posting to: ${sendUrl}`, 'req');
    DOM.progressStatusText.innerText = "Submitting task to background queue...";
    DOM.progressBarFill.style.width = '20%';
    
    try {
        let response;
        try {
            response = await fetch(sendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: state.abortController.signal
            });
        } catch (corsErr) {
            if (corsErr.name === 'AbortError') throw corsErr;
            logConsole(`Direct request blocked (CORS). Retrying via proxy...`, 'system');
            response = await fetch('/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: sendUrl,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }),
                signal: state.abortController.signal
            });
        }
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server submission failed: ${response.status}. Detail: ${errText.substring(0, 200)}`);
        }
        
        const startResult = await response.json();
        const taskId = startResult.uid;
        
        if (!taskId) {
            throw new Error(`Server did not return a valid Task ID (uid). Response: ${JSON.stringify(startResult)}`);
        }
        
        state.currentJobId = taskId;
        logConsole(`Task accepted. ID: ${taskId}. Initiating status polling...`, 'success');
        
        // Start Polling
        pollAsyncLocalStatus(baseUrl, taskId);
        
    } catch (err) {
        if (err.name === 'AbortError') {
            logConsole(`Generation aborted by user.`, 'system');
        } else {
            logConsole(`Async initiation failed: ${err.message}`, 'error');
            endGenerationProcess(false, err.message);
        }
    }
}

// Polling status helper for local async
function pollAsyncLocalStatus(baseUrl, taskId) {
    const statusUrl = `${baseUrl}/status/${taskId}`;
    let pollCount = 0;
    
    DOM.progressStatusText.innerText = "Processing geometry (Hunyuan3D Diffusion)...";
    DOM.progressBarFill.style.width = '35%';
    
    state.pollIntervalId = setInterval(async () => {
        pollCount++;
        
        try {
            let response;
            try {
                response = await fetch(statusUrl, {
                    method: 'GET',
                    signal: state.abortController.signal
                });
            } catch (corsErr) {
                if (corsErr.name === 'AbortError') throw corsErr;
                response = await fetch('/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: statusUrl, method: 'GET' }),
                    signal: state.abortController.signal
                });
            }
            
            if (!response.ok) {
                logConsole(`Status poll error (${response.status}). Retrying...`, 'system');
                return;
            }
            
            const data = await response.json();
            
            // Output status change in logs occasionally
            if (pollCount % 3 === 1) {
                logConsole(`Polling status: ${data.status.toUpperCase()}`, 'resp');
            }
            
            if (data.status === 'processing') {
                DOM.progressStatusText.innerText = "Processing model geometry...";
                DOM.progressBarFill.style.width = '45%';
            } else if (data.status === 'texturing') {
                DOM.progressStatusText.innerText = "Applying materials and textures...";
                DOM.progressBarFill.style.width = '70%';
            } else if (data.status === 'completed') {
                clearInterval(state.pollIntervalId);
                state.pollIntervalId = null;
                
                DOM.progressStatusText.innerText = "Decoding 3D model assets...";
                DOM.progressBarFill.style.width = '90%';
                
                logConsole('Task completed! Downloading base64 payload...', 'success');
                
                // base64 model decoding
                if (!data.model_base64) {
                    throw new Error("API returned completed status but missing model_base64 data.");
                }
                
                const modelBlob = base64ToBlob(data.model_base64, 'model/gltf-binary');
                state.generatedModelBlob = modelBlob;
                state.generatedModelFilename = `async_model_${taskId}.glb`;
                
                logConsole(`Model parsed successfully. Size: ${Math.round(modelBlob.size / 1024)} KB`, 'success');
                
                const objectUrl = URL.createObjectURL(modelBlob);
                loadModelInViewer(objectUrl);
                endGenerationProcess(true);
            } else if (data.status === 'error' || data.status === 'failed') {
                throw new Error(data.message || "Model worker generation crashed.");
            }
            
        } catch (err) {
            if (err.name === 'AbortError') {
                logConsole(`Generation aborted by user.`, 'system');
            } else {
                clearInterval(state.pollIntervalId);
                state.pollIntervalId = null;
                logConsole(`Polling failed: ${err.message}`, 'error');
                endGenerationProcess(false, err.message);
            }
        }
    }, 2000);
}

// Workflow: RunPod Serverless Workflow
async function runServerlessWorkflow(endpointId, apiKey, payload) {
    const runUrl = `https://api.runpod.ai/v1/${endpointId}/run`;
    logConsole(`Triggering RunPod Serverless Job: ${runUrl}`, 'req');
    DOM.progressStatusText.innerText = "Spawning serverless worker container...";
    DOM.progressBarFill.style.width = '20%';
    
    try {
        let response;
        try {
            response = await fetch(runUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload),
                signal: state.abortController.signal
            });
        } catch (corsErr) {
            if (corsErr.name === 'AbortError') throw corsErr;
            logConsole(`Direct Serverless fetch blocked (CORS). Retrying via proxy...`, 'system');
            response = await fetch('/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: runUrl,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(payload)
                }),
                signal: state.abortController.signal
            });
        }
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`RunPod serverless request rejected: ${response.status}. Detail: ${errText.substring(0, 200)}`);
        }
        
        const jobResult = await response.json();
        const jobId = jobResult.id;
        
        if (!jobId) {
            throw new Error(`No Job ID returned from RunPod. Response: ${JSON.stringify(jobResult)}`);
        }
        
        state.currentJobId = jobId;
        logConsole(`Job queued successfully. Job ID: ${jobId}. Status: ${jobResult.status || 'QUEUED'}. Polling status...`, 'success');
        
        // Start Polling RunPod
        pollServerlessStatus(endpointId, apiKey, jobId);
        
    } catch (err) {
        if (err.name === 'AbortError') {
            logConsole(`Generation aborted by user.`, 'system');
        } else {
            logConsole(`RunPod serverless call failed: ${err.message}`, 'error');
            endGenerationProcess(false, err.message);
        }
    }
}

// Polling status helper for RunPod serverless
function pollServerlessStatus(endpointId, apiKey, jobId) {
    const statusUrl = `https://api.runpod.ai/v1/${endpointId}/status/${jobId}`;
    let pollCount = 0;
    
    state.pollIntervalId = setInterval(async () => {
        pollCount++;
        
        try {
            let response;
            try {
                response = await fetch(statusUrl, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    signal: state.abortController.signal
                });
            } catch (corsErr) {
                if (corsErr.name === 'AbortError') throw corsErr;
                response = await fetch('/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: statusUrl,
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    }),
                    signal: state.abortController.signal
                });
            }
            
            if (!response.ok) {
                logConsole(`RunPod status poll error (${response.status}). Retrying...`, 'system');
                return;
            }
            
            const data = await response.json();
            
            if (pollCount % 3 === 1) {
                logConsole(`RunPod job status: ${data.status}`, 'resp');
            }
            
            if (data.status === 'IN_QUEUE') {
                DOM.progressStatusText.innerText = "Waiting in Serverless Worker Queue...";
                DOM.progressBarFill.style.width = '25%';
            } else if (data.status === 'IN_PROGRESS') {
                DOM.progressStatusText.innerText = "Running generation pipeline in container...";
                DOM.progressBarFill.style.width = '55%';
            } else if (data.status === 'COMPLETED') {
                clearInterval(state.pollIntervalId);
                state.pollIntervalId = null;
                
                DOM.progressStatusText.innerText = "Parsing output 3D assets...";
                DOM.progressBarFill.style.width = '90%';
                
                logConsole('RunPod generation job completed!', 'success');
                
                // Parse RunPod Output
                // Typically outputs { model_base64: "...", or "gltf": "url" }
                const output = data.output;
                if (!output) {
                    throw new Error("Job completed but 'output' field is empty.");
                }
                
                // Look for base64 or URL in output
                let modelData = null;
                let isBase64 = false;
                let targetFormat = 'glb';
                
                if (typeof output === 'string') {
                    // Output itself is the result
                    if (output.startsWith('http://') || output.startsWith('https://')) {
                        modelData = output;
                        isBase64 = false;
                    } else {
                        modelData = output;
                        isBase64 = true;
                    }
                } else {
                    // Nested object
                    modelData = output.model_base64 || output.glb || output.model || output.file || output.output;
                    if (typeof modelData === 'string' && (modelData.startsWith('http') || modelData.includes('/')) && !modelData.includes(';base64,')) {
                        isBase64 = false;
                    } else if (modelData) {
                        isBase64 = true;
                    }
                }
                
                if (!modelData) {
                    logConsole(`Failed to find model string in output: ${JSON.stringify(output)}`, 'error');
                    throw new Error("Failed to extract model data from RunPod output schema.");
                }
                
                if (isBase64) {
                    // Stripping any header tags
                    const cleanedBase64 = modelData.replace(/^data:image\/\w+;base64,/, '').replace(/^data:application\/\w+;base64,/, '');
                    const modelBlob = base64ToBlob(cleanedBase64, 'model/gltf-binary');
                    state.generatedModelBlob = modelBlob;
                    state.generatedModelFilename = `serverless_model_${jobId}.glb`;
                    
                    logConsole(`Retrieved base64 model from RunPod. Size: ${Math.round(modelBlob.size / 1024)} KB`, 'success');
                    
                    const objectUrl = URL.createObjectURL(modelBlob);
                    loadModelInViewer(objectUrl);
                    endGenerationProcess(true);
                } else {
                    // It is a remote download link
                    logConsole(`Model returned as remote URL: ${modelData}. Fetching...`, 'info');
                    DOM.progressStatusText.innerText = "Downloading 3D model from storage...";
                    
                    let modelResponse;
                    try {
                        modelResponse = await fetch(modelData, { signal: state.abortController.signal });
                    } catch (fetchErr) {
                        logConsole(`Direct URL fetch blocked (CORS). Fetching through proxy...`, 'system');
                        modelResponse = await fetch('/proxy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: modelData, method: 'GET' }),
                            signal: state.abortController.signal
                        });
                    }
                    
                    if (!modelResponse.ok) {
                        throw new Error(`Failed to download GLB from remote storage link: ${modelResponse.status}`);
                    }
                    
                    const blob = await modelResponse.blob();
                    state.generatedModelBlob = blob;
                    state.generatedModelFilename = `serverless_model_${jobId}.glb`;
                    logConsole(`Downloaded model from RunPod link. Size: ${Math.round(blob.size / 1024)} KB`, 'success');
                    
                    const objectUrl = URL.createObjectURL(blob);
                    loadModelInViewer(objectUrl);
                    endGenerationProcess(true);
                }
                
            } else if (data.status === 'FAILED') {
                throw new Error(data.error || "RunPod execution failed inside container.");
            } else if (data.status === 'CANCELLED') {
                throw new Error("RunPod job cancelled on server.");
            }
            
        } catch (err) {
            if (err.name === 'AbortError') {
                logConsole(`Generation aborted by user.`, 'system');
            } else {
                clearInterval(state.pollIntervalId);
                state.pollIntervalId = null;
                logConsole(`RunPod Polling failed: ${err.message}`, 'error');
                endGenerationProcess(false, err.message);
            }
        }
    }, 2000);
}

// Cancel active operation
function cancelGeneration() {
    logConsole('Cancelling current active generation job...', 'system');
    
    if (state.abortController) {
        state.abortController.abort();
    }
    
    // Stop intervals
    if (state.pollIntervalId) {
        clearInterval(state.pollIntervalId);
        state.pollIntervalId = null;
    }
    
    // Attempt to cancel on RunPod server if possible
    if (state.activeBackend === 'serverless' && state.currentJobId) {
        const apiKey = DOM.inputApiKey.value.trim();
        const cancelUrl = `https://api.runpod.ai/v1/${DOM.inputEndpointId.value.trim()}/cancel/${state.currentJobId}`;
        
        logConsole(`Sending cancel request to RunPod for Job ID: ${state.currentJobId}`, 'system');
        fetch(cancelUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        }).catch(e => console.warn("Failed to request remote job cancellation", e));
    }
    
    endGenerationProcess(false, "Cancelled by user");
}

// Tear down loading states
function endGenerationProcess(success, reason = '') {
    // Actions Toggle
    DOM.btnGenerate.classList.remove('hidden');
    DOM.btnCancel.classList.add('hidden');
    
    // Stop timers
    if (state.timerIntervalId) {
        clearInterval(state.timerIntervalId);
        state.timerIntervalId = null;
    }
    if (state.pollIntervalId) {
        clearInterval(state.pollIntervalId);
        state.pollIntervalId = null;
    }
    
    // Hide overlay
    DOM.progressOverlay.classList.add('hidden');
    
    const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
    
    if (success) {
        logConsole(`Generation complete! Total elapsed time: ${elapsed}s`, 'success');
    } else {
        logConsole(`Generation stopped after ${elapsed}s. Reason: ${reason}`, 'error');
    }
}

// Convert Base64 string to Blob
function base64ToBlob(base64, mime) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mime });
}

// 3D Model Viewer Controls
function clearViewer() {
    DOM.modelViewerWrapper.innerHTML = '';
    DOM.viewerPlaceholder.classList.remove('hidden');
    
    // Disable controls
    DOM.btnViewTexture.disabled = true;
    DOM.btnViewGeometry.disabled = true;
    DOM.btnToggleRotate.disabled = true;
    DOM.btnToggleGrid.disabled = true;
    DOM.btnResetCamera.disabled = true;
    DOM.btnDownload.disabled = true;
    
    state.isViewerModelLoaded = false;
    state.savedMaterials = null;
    state.savedExposure = null;
}

function loadModelInViewer(objectUrl) {
    // Clear old elements
    DOM.modelViewerWrapper.innerHTML = '';
    DOM.viewerPlaceholder.classList.add('hidden');
    
    // Create new <model-viewer> element
    const viewer = document.createElement('model-viewer');
    viewer.id = 'modelviewer';
    viewer.src = objectUrl;
    viewer.setAttribute('camera-controls', '');
    viewer.setAttribute('auto-rotate', '');
    viewer.setAttribute('shadow-intensity', '0.9');
    viewer.setAttribute('environment-image', 'neutral');
    viewer.setAttribute('camera-target', '0m 0m 0m');
    viewer.setAttribute('camera-orbit', '0deg 90deg auto');
    viewer.style.width = '100%';
    viewer.style.height = '100%';
    
    // Add grid background overlay inside model-viewer (using absolute shadows)
    // Three.js helper grid will render directly if enabled
    
    DOM.modelViewerWrapper.appendChild(viewer);
    
    // Setup model-viewer events
    viewer.addEventListener('load', () => {
        logConsole('Model loaded in viewport. Materials available: ' + viewer.model.materials.length, 'success');
        state.isViewerModelLoaded = true;
        
        // Enable Controls
        DOM.btnViewTexture.disabled = false;
        DOM.btnViewGeometry.disabled = false;
        DOM.btnToggleRotate.disabled = false;
        DOM.btnToggleGrid.disabled = false;
        DOM.btnResetCamera.disabled = false;
        DOM.btnDownload.disabled = false;
        
        DOM.btnViewTexture.classList.add('checked');
        DOM.btnViewGeometry.classList.remove('checked');
        DOM.btnToggleRotate.classList.add('checked');
        DOM.btnToggleGrid.classList.add('checked');
        
        state.savedMaterials = null;
        state.savedExposure = viewer.exposure;
    });
    
    viewer.addEventListener('error', (err) => {
        logConsole('Model Viewer failed to render GLB: ' + err.detail, 'error');
    });
}

function toggleViewerTexture(showTexture) {
    const viewer = document.getElementById('modelviewer');
    if (!state.isViewerModelLoaded || !viewer || !viewer.model) return;
    
    DOM.btnViewTexture.classList.toggle('checked', showTexture);
    DOM.btnViewGeometry.classList.toggle('checked', !showTexture);
    
    const materials = viewer.model.materials;
    
    if (!showTexture) {
        logConsole('Geometry view enabled: disabling textures...', 'system');
        // Save current materials state if not saved yet
        if (!state.savedMaterials) {
            state.savedMaterials = [];
            for (let i = 0; i < materials.length; i++) {
                const mat = materials[i];
                const pbr = mat.pbrMetallicRoughness;
                
                state.savedMaterials.push({
                    baseColorTexture: pbr.baseColorTexture ? pbr.baseColorTexture.texture : null,
                    metallicRoughnessTexture: pbr.metallicRoughnessTexture ? pbr.metallicRoughnessTexture.texture : null,
                    normalTexture: mat.normalTexture ? mat.normalTexture.texture : null,
                    baseColorFactor: [...pbr.baseColorFactor],
                    metallicFactor: pbr.metallicFactor,
                    roughnessFactor: pbr.roughnessFactor
                });
            }
        }
        
        // Remove textures to show clay model
        for (let i = 0; i < materials.length; i++) {
            const mat = materials[i];
            const pbr = mat.pbrMetallicRoughness;
            
            if (pbr.baseColorTexture) pbr.baseColorTexture.setTexture(null);
            if (pbr.metallicRoughnessTexture) pbr.metallicRoughnessTexture.setTexture(null);
            if (mat.normalTexture) mat.normalTexture.setTexture(null);
            
            // Set base color factor to clean neutral grey clay
            pbr.setBaseColorFactor([0.65, 0.65, 0.65, 1.0]);
            pbr.setRoughnessFactor(0.8);
            pbr.setMetallicFactor(0.1);
        }
        viewer.exposure = 2.5; // adjust exposure for clean clay shadows
        
    } else {
        logConsole('Appearance view enabled: restoring textures...', 'system');
        if (!state.savedMaterials) return;
        
        // Restore materials state
        for (let i = 0; i < materials.length && i < state.savedMaterials.length; i++) {
            const mat = materials[i];
            const pbr = mat.pbrMetallicRoughness;
            const saved = state.savedMaterials[i];
            
            if (saved.baseColorTexture && pbr.baseColorTexture) {
                pbr.baseColorTexture.setTexture(saved.baseColorTexture);
            }
            if (saved.metallicRoughnessTexture && pbr.metallicRoughnessTexture) {
                pbr.metallicRoughnessTexture.setTexture(saved.metallicRoughnessTexture);
            }
            if (saved.normalTexture && mat.normalTexture) {
                mat.normalTexture.setTexture(saved.normalTexture);
            }
            
            pbr.setBaseColorFactor(saved.baseColorFactor);
            pbr.setRoughnessFactor(saved.roughnessFactor);
            pbr.setMetallicFactor(saved.metallicFactor);
        }
        viewer.exposure = state.savedExposure || 1.0;
    }
}

function toggleViewerAutoRotate() {
    const viewer = document.getElementById('modelviewer');
    if (!viewer) return;
    
    const active = viewer.hasAttribute('auto-rotate');
    if (active) {
        viewer.removeAttribute('auto-rotate');
        DOM.btnToggleRotate.classList.remove('checked');
        logConsole('Auto rotate off.');
    } else {
        viewer.setAttribute('auto-rotate', '');
        DOM.btnToggleRotate.classList.add('checked');
        logConsole('Auto rotate on.');
    }
}

function toggleViewerGrid() {
    const viewer = document.getElementById('modelviewer');
    if (!viewer) return;
    
    const hasShadow = viewer.getAttribute('shadow-intensity') === '0.9';
    if (hasShadow) {
        viewer.setAttribute('shadow-intensity', '0');
        // Toggle visual grid classes (we can simulate grid hide by updating styles)
        DOM.viewportContainer.style.background = '#0d0e15';
        DOM.btnToggleGrid.classList.remove('checked');
        logConsole('Grid and shadows hidden.');
    } else {
        viewer.setAttribute('shadow-intensity', '0.9');
        DOM.viewportContainer.style.background = 'radial-gradient(circle at center, #1b1d2a 0%, #0c0d15 100%)';
        DOM.btnToggleGrid.classList.add('checked');
        logConsole('Grid and shadows enabled.');
    }
}

function resetViewerCamera() {
    const viewer = document.getElementById('modelviewer');
    if (!viewer) return;
    
    viewer.cameraTarget = '0m 0m 0m';
    viewer.cameraOrbit = '0deg 90deg auto';
    logConsole('Recentered viewport camera.');
}

function downloadGeneratedModel() {
    if (!state.generatedModelBlob) return;
    
    const url = URL.createObjectURL(state.generatedModelBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.generatedModelFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logConsole(`Downloaded model: ${state.generatedModelFilename}`);
}
