import { setCanvasSize, loadShaders, parseOBJ, mat4, hexToRgb01 } from "./utils.js";

const canvas = document.getElementById("gpu-canvas");

let device, context, pipeline;
let projectionMatrix, viewMatrix;
let meshes = {}; 



// Scene data
let renderableObjects = [];
let sceneBounds = null;

const shaderPaths = {
    vertex: "./vertex.wgsl",
    fragment: "./fragment.wgsl",
};

async function init() {
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
    }
    device = await adapter.requestDevice();

    context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: "premultiplied",
    });
    setCanvasSize(canvas);

    const { vertex, fragment } = await loadShaders(shaderPaths);

    // Create pipeline
    pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: device.createShaderModule({ code: vertex }),
            entryPoint: "main",
            buffers: [
                {
                    arrayStride: 24, 
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" }, // Position
                        { shaderLocation: 1, offset: 12, format: "float32x3" }, // Normal
                    ],
                },
            ],
        },
        fragment: {
            module: device.createShaderModule({ code: fragment }),
            entryPoint: "main",
            targets: [{ format: canvasFormat }],
        },
        primitive: {
            topology: "triangle-list",
            cullMode: "back",
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus",
        },
    });

    const aspect = canvas.width / canvas.height;
    projectionMatrix = mat4.perspective(Math.PI / 4, aspect, 1.0, 5000.0);
    setCameraView('iso');
    
    // TODO: Add event listeners for UI buttons
    // 1. Get button elements by ID
    // 2. Add 'click' event listeners to call setCameraView with appropriate arguments ('front', 'top', 'iso')

    // Load resources
    await loadResources();

    requestAnimationFrame(render);
}

async function loadResources() {
    const timestamp = Date.now();

    const sceneFile = "scene.json"; 
    const resScene = await fetch(`./resources/${sceneFile}?t=${timestamp}`);
    const sceneDataRaw = await resScene.json();

    const brickIds = [...new Set(sceneDataRaw.map(b => b.brick_id))];
    
    // Process meshes
    for (const id of brickIds) {
        const res = await fetch(`./resources/${id}.obj`);
        const text = await res.text();
        const data = parseOBJ(text); 
        
        // Calculate bounding box for centering
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        
        for (let i = 0; i < data.positions.length; i += 3) {
            const x = data.positions[i];
            const y = data.positions[i+1];
            const z = data.positions[i+2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        
        console.log(`Brick ${id}: Center=[${centerX.toFixed(2)}, ${centerY.toFixed(2)}, ${centerZ.toFixed(2)}]`);

        // Apply uniform scaling
        const globalScale = 1.0;

        for (let i = 0; i < data.positions.length; i += 3) {
            data.positions[i] = (data.positions[i] - centerX) * globalScale;
            data.positions[i+1] = (data.positions[i+1] - minY) * globalScale; // Align bottom to 0
            data.positions[i+2] = (data.positions[i+2] - centerZ) * globalScale;
        }

        // Normalize normals
        // TODO: Compute/Normalize normals for the mesh.


        // Create vertex buffer
        // TODO: Create a vertex buffer to hold the interleaved data.
        // Use device.createBuffer with proper size and usage (VERTEX).
        const buffer = null; 
        
        if (buffer) {
             meshes[id] = {
                buffer: buffer,
                count: data.vertexCount
            };
        }
    }

    const viewProjection = mat4.multiply(projectionMatrix, viewMatrix);
    let minXScene = Infinity, maxXScene = -Infinity;
    let minYScene = Infinity, maxYScene = -Infinity;
    let minZScene = Infinity, maxZScene = -Infinity;

    const UNIT_LENGTH = 20.0;
    const UNIT_HEIGHT = 24.0;
    
    const brickDimensions = {
        "3001": [4, 2], // e.g., 4 units along X, 2 units along Z (in OBJ space)
        "3002": [3, 2],
        "3003": [2, 2],
        "0": [50, 50]
    };

    // Create render objects
    for (const brick of sceneDataRaw) {
        const mesh = meshes[brick.brick_id];
        if (!mesh) continue;

        // Calculate dimensions and rotation
        const dims = brickDimensions[brick.brick_id] || [2, 2];
        const rawSizeX = dims[0] * UNIT_LENGTH;
        const rawSizeZ = dims[1] * UNIT_LENGTH;

        let rotationAngle = 0;
        let currentSizeX = rawSizeX;
        let currentSizeZ = rawSizeZ;

        // TODO: Handle rotation logic
        // If brick.rotation === 0, it means Z-aligned (90 degree rotation for our default X-aligned OBJ).
        // If brick.rotation === 1, it means X-aligned (0 degree rotation).
        // Update rotationAngle, currentSizeX, and currentSizeZ accordingly.
        

        // TODO: Calculate transformation coordinates (tx, ty, tz)
        // Convert grid coordinates (brick.position) to world coordinates.
        // Consider UNIT_LENGTH, UNIT_HEIGHT, and the object's center position.
        const tx = 0;
        const ty = 0;
        const tz = 0;

        // Update scene bounds (for camera)
        const oMinX = tx - currentSizeX / 2;
        const oMaxX = tx + currentSizeX / 2;
        const oMinY = ty;
        const oMaxY = ty + UNIT_HEIGHT;
        const oMinZ = tz - currentSizeZ / 2;
        const oMaxZ = tz + currentSizeZ / 2;
        if (oMinX < minXScene) minXScene = oMinX;
        if (oMaxX > maxXScene) maxXScene = oMaxX;
        if (oMinY < minYScene) minYScene = oMinY;
        if (oMaxY > maxYScene) maxYScene = oMaxY;
        if (oMinZ < minZScene) minZScene = oMinZ;
        if (oMaxZ > maxZScene) maxZScene = oMaxZ;

        // Model matrix
        let model = mat4.identity();
        
        // TODO: Apply transformations to the model matrix
        // 1. Translation to (tx, ty, tz)
        // 2. Rotation around Y axis (rotationAngle)
        // 3. Flip logic (Translate up by UNIT_HEIGHT, then Rotate X by 180 degrees)
        

        // TODO: Handle Color
        let color = [1.0, 1.0, 1.0];
        
        
        // Uniform buffer per object
        const uniformBuffer = device.createBuffer({
            size: 144,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        device.queue.writeBuffer(uniformBuffer, 0, viewProjection);
        device.queue.writeBuffer(uniformBuffer, 64, model);
        // TODO: Write the color to the uniform buffer (offset 128)
        // Ensure the color is a Float32Array of size 4 (R, G, B, Alpha=1.0).

        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        renderableObjects.push({
            mesh: mesh,
            bindGroup: bindGroup,
            uniformBuffer: uniformBuffer
        });
    }
    
    console.log(`Loaded ${renderableObjects.length} renderable objects.`);

    sceneBounds = { minX: minXScene, maxX: maxXScene, minY: minYScene, maxY: maxYScene, minZ: minZScene, maxZ: maxZScene };
}

function render() {
    requestAnimationFrame(render);

    if (!device || !pipeline || !projectionMatrix || !viewMatrix) return;

    // Update ViewProjection Matrix for all objects
    const viewProjection = mat4.multiply(projectionMatrix, viewMatrix);
    
    for (const obj of renderableObjects) {
        device.queue.writeBuffer(obj.uniformBuffer, 0, viewProjection);
    }

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();
    
    const depthTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const renderPassDescriptor = {
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 }, // Background color
            loadOp: 'clear',
            storeOp: 'store',
        }],
        depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
        },
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);

    // Draw objects
    for (const obj of renderableObjects) {
        passEncoder.setVertexBuffer(0, obj.mesh.buffer);
        passEncoder.setBindGroup(0, obj.bindGroup);
        passEncoder.draw(obj.mesh.count);
    }

    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
}

window.addEventListener("resize", () => {
    setCanvasSize(canvas);
    
    const aspect = canvas.width / canvas.height;
    projectionMatrix = mat4.perspective(Math.PI / 4, aspect, 1.0, 5000.0);
    render();
});

function setCameraView(type) {
    console.log(`Switching camera to: ${type}`);
    let cx, cy, cz, dx, dy, dz;
    if (sceneBounds) {
        cx = (sceneBounds.minX + sceneBounds.maxX) / 2;
        cy = (sceneBounds.minY + sceneBounds.maxY) / 2;
        cz = (sceneBounds.minZ + sceneBounds.maxZ) / 2;
        dx = sceneBounds.maxX - sceneBounds.minX;
        dy = sceneBounds.maxY - sceneBounds.minY;
        dz = sceneBounds.maxZ - sceneBounds.minZ;
    } else {
        cx = 24; cy = 48; cz = 0; dx = 400; dy = 100; dz = 400;
    }
    const margin = Math.max(dx, dy, dz) * 1.5;
    let eye, up;
    
    // For iso view, we want to look at the center of the scene from a diagonal angle.
    // The current implementation uses positive offsets for eye position.
    
    switch (type) {
        case 'front':
            // TODO: Calculate eye position and up vector for Front view
            eye = [0, 0, 0];
            up = [0, 1, 0];
            break;
        case 'top':
            // TODO: Calculate eye position and up vector for Top view
            eye = [0, 0, 0];
            up = [0, 0, -1];
            break;
        case 'iso':
        default:
            // TODO: Calculate eye position and up vector for Isometric view
            eye = [0, 0, 0];
            up = [0, 1, 0];
            break;
    }

    viewMatrix = mat4.lookAt(eye, [cx, cy, cz], up);
    console.log("New view matrix:", viewMatrix);
}

init().catch(console.error);
