import { setCanvasSize, loadShaders, parseOBJ, mat4 } from "./utils.js";

const canvas = document.getElementById("gpu-canvas");
const statusEl = document.getElementById("status");
const frontBtn = document.getElementById("btn-front");
const topBtn = document.getElementById("btn-top");
const isoBtn = document.getElementById("btn-iso");
const reloadBtn = document.getElementById("btn-reload");
const exportBtn = document.getElementById("btn-export");
const sceneFileInput = document.getElementById("scene-file");
const widthSlider = document.getElementById("scale-width");
const depthSlider = document.getElementById("scale-depth");
const heightSlider = document.getElementById("scale-height");
const widthValue = document.getElementById("scale-width-value");
const depthValue = document.getElementById("scale-depth-value");
const heightValue = document.getElementById("scale-height-value");

let device;
let context;
let pipeline;
let projectionMatrix;
let viewMatrix;
let depthTexture;

let meshes = {};
let renderableObjects = [];
let sceneBounds = null;

let baseSceneBricks = [];
let transformedSceneBricks = [];
let sceneSource = { type: "url", value: "scene.json", fileName: "scene.json" };

const UNIT_LENGTH = 20.0;
const UNIT_HEIGHT = 24.0;
const DEFAULT_UP = [0, 1, 0];

const brickDimensions = {
  "3001": [4, 2],
  "3002": [3, 2],
  "3003": [2, 2],
  "0": [50, 50],
};

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
    device,
    format: canvasFormat,
    alphaMode: "premultiplied",
  });

  setCanvasSize(canvas);

  const { vertex, fragment } = await loadShaders(shaderPaths);
  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: vertex }),
      entryPoint: "main",
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: fragment }),
      entryPoint: "main",
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus",
    },
  });

  setProjectionMatrix();
  setCameraView("iso");
  bindUI();
  await reloadScene();
  requestAnimationFrame(render);
}

function bindUI() {
  frontBtn.addEventListener("click", () => setCameraView("front"));
  topBtn.addEventListener("click", () => setCameraView("top"));
  isoBtn.addEventListener("click", () => setCameraView("iso"));
  reloadBtn.addEventListener("click", () => reloadScene());
  exportBtn.addEventListener("click", exportSceneAsOBJ);

  const updateSliderLabels = () => {
    widthValue.textContent = widthSlider.value;
    depthValue.textContent = depthSlider.value;
    heightValue.textContent = heightSlider.value;
  };

  const onScaleChanged = () => {
    updateSliderLabels();
    rebuildRenderableObjects();
  };

  widthSlider.addEventListener("input", onScaleChanged);
  depthSlider.addEventListener("input", onScaleChanged);
  heightSlider.addEventListener("input", onScaleChanged);
  updateSliderLabels();

  sceneFileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    sceneSource = {
      type: "upload",
      value: text,
      fileName: file.name,
    };
    await reloadScene();
  });
}

function setProjectionMatrix() {
  const aspect = canvas.width / canvas.height;
  projectionMatrix = mat4.perspective(Math.PI / 4, aspect, 1.0, 6000.0);
}

async function loadSceneData() {
  if (sceneSource.type === "upload") {
    return JSON.parse(sceneSource.value);
  }

  const timestamp = Date.now();
  const scenePath = `./resources/${sceneSource.value}?t=${timestamp}`;
  const res = await fetch(scenePath);
  if (!res.ok) {
    throw new Error(`Failed to load scene file: ${sceneSource.value}`);
  }
  return res.json();
}

async function loadMeshesForScene(sceneDataRaw) {
  const brickIds = [...new Set(sceneDataRaw.map((brick) => brick.brick_id))];

  for (const id of brickIds) {
    if (meshes[id]) continue;

    const res = await fetch(`./resources/${id}.obj`);
    if (!res.ok) {
      throw new Error(`Missing OBJ file for brick ${id}`);
    }

    const text = await res.text();
    const data = parseOBJ(text);

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < data.positions.length; i += 3) {
      const x = data.positions[i];
      const y = data.positions[i + 1];
      const z = data.positions[i + 2];

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxZ = Math.max(maxZ, z);
    }

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    for (let i = 0; i < data.positions.length; i += 3) {
      data.positions[i] -= centerX;
      data.positions[i + 1] -= minY;
      data.positions[i + 2] -= centerZ;
    }

    for (let i = 0; i < data.normals.length; i += 3) {
      const nx = data.normals[i];
      const ny = data.normals[i + 1];
      const nz = data.normals[i + 2];
      const len = Math.hypot(nx, ny, nz);
      if (len > 0) {
        data.normals[i] = nx / len;
        data.normals[i + 1] = ny / len;
        data.normals[i + 2] = nz / len;
      }
    }

    const interleaved = new Float32Array(data.vertexCount * 6);
    for (let v = 0; v < data.vertexCount; v++) {
      const pIdx = v * 3;
      const oIdx = v * 6;
      interleaved[oIdx] = data.positions[pIdx];
      interleaved[oIdx + 1] = data.positions[pIdx + 1];
      interleaved[oIdx + 2] = data.positions[pIdx + 2];
      interleaved[oIdx + 3] = data.normals[pIdx];
      interleaved[oIdx + 4] = data.normals[pIdx + 1];
      interleaved[oIdx + 5] = data.normals[pIdx + 2];
    }

    const vertexBuffer = device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(interleaved);
    vertexBuffer.unmap();

    meshes[id] = {
      buffer: vertexBuffer,
      count: data.vertexCount,
      positions: data.positions,
      normals: data.normals,
    };
  }
}

function getScalingParameters() {
  return {
    width: Number(widthSlider.value),
    depth: Number(depthSlider.value),
    height: Number(heightSlider.value),
  };
}

function generateScaledScene(baseBricks) {
  const { width, depth, height } = getScalingParameters();
  const generated = [];

  const bricksOnly = baseBricks.filter((b) => b.brick_id !== "0");
  const baseplate = baseBricks.find((b) => b.brick_id === "0");

  if (baseplate) {
    generated.push(baseplate);
  }

  const sceneFootprintX = 50;
  const sceneFootprintZ = 50;

  for (let hx = 0; hx < width; hx++) {
    for (let dz = 0; dz < depth; dz++) {
      for (let vy = 0; vy < height; vy++) {
        for (const brick of bricksOnly) {
          generated.push({
            ...brick,
            position: [
              brick.position[0] + hx * sceneFootprintX,
              brick.position[1] + dz * sceneFootprintZ,
              brick.position[2] + vy * 3,
            ],
          });
        }
      }
    }
  }

  return generated;
}

function buildModelMatrix(tx, ty, tz, rotationAngle) {
  const translation = mat4.translation(tx, ty, tz);
  const rotationY = mat4.rotationY(rotationAngle);
  const flipTranslate = mat4.translation(0, UNIT_HEIGHT, 0);
  const flipX = mat4.rotationX(Math.PI);

  let model = mat4.identity();
  model = mat4.multiply(model, translation);
  model = mat4.multiply(model, rotationY);
  model = mat4.multiply(model, flipTranslate);
  model = mat4.multiply(model, flipX);
  return model;
}

function applyModelToPoint(model, x, y, z) {
  const outX = x * model[0] + y * model[4] + z * model[8] + model[12];
  const outY = x * model[1] + y * model[5] + z * model[9] + model[13];
  const outZ = x * model[2] + y * model[6] + z * model[10] + model[14];
  return [outX, outY, outZ];
}

function applyModelToNormal(model, x, y, z) {
  const outX = x * model[0] + y * model[4] + z * model[8];
  const outY = x * model[1] + y * model[5] + z * model[9];
  const outZ = x * model[2] + y * model[6] + z * model[10];
  const len = Math.hypot(outX, outY, outZ) || 1;
  return [outX / len, outY / len, outZ / len];
}

function rebuildRenderableObjects() {
  renderableObjects = [];
  transformedSceneBricks = generateScaledScene(baseSceneBricks);

  let minXScene = Infinity;
  let maxXScene = -Infinity;
  let minYScene = Infinity;
  let maxYScene = -Infinity;
  let minZScene = Infinity;
  let maxZScene = -Infinity;

  const viewProjection = mat4.multiply(projectionMatrix, viewMatrix);

  for (const brick of transformedSceneBricks) {
    const mesh = meshes[brick.brick_id];
    if (!mesh) continue;

    const dims = brickDimensions[brick.brick_id] || [2, 2];
    const rawSizeX = dims[0] * UNIT_LENGTH;
    const rawSizeZ = dims[1] * UNIT_LENGTH;

    let rotationAngle = 0;
    let currentSizeX = rawSizeX;
    let currentSizeZ = rawSizeZ;

    if (brick.rotation === 0) {
      rotationAngle = Math.PI / 2;
      currentSizeX = rawSizeZ;
      currentSizeZ = rawSizeX;
    }

    const tx = brick.position[0] * UNIT_LENGTH + currentSizeX / 2;
    const tz = brick.position[1] * UNIT_LENGTH + currentSizeZ / 2;
    const ty = brick.position[2] * UNIT_HEIGHT;

    minXScene = Math.min(minXScene, tx - currentSizeX / 2);
    maxXScene = Math.max(maxXScene, tx + currentSizeX / 2);
    minYScene = Math.min(minYScene, ty);
    maxYScene = Math.max(maxYScene, ty + UNIT_HEIGHT);
    minZScene = Math.min(minZScene, tz - currentSizeZ / 2);
    maxZScene = Math.max(maxZScene, tz + currentSizeZ / 2);

    const model = buildModelMatrix(tx, ty, tz, rotationAngle);
    const color = [brick.color[0] / 255, brick.color[1] / 255, brick.color[2] / 255, 1.0];

    const uniformBuffer = device.createBuffer({
      size: 144,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, viewProjection);
    device.queue.writeBuffer(uniformBuffer, 64, model);
    device.queue.writeBuffer(uniformBuffer, 128, new Float32Array(color));

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    renderableObjects.push({
      brick,
      mesh,
      model,
      bindGroup,
      uniformBuffer,
    });
  }

  sceneBounds = {
    minX: minXScene,
    maxX: maxXScene,
    minY: minYScene,
    maxY: maxYScene,
    minZ: minZScene,
    maxZ: maxZScene,
  };

  setCameraView("iso");
  setStatus(`Loaded ${renderableObjects.length} bricks from ${sceneSource.fileName}`);
}

async function reloadScene() {
  try {
    setStatus("Loading scene...");
    const sceneData = await loadSceneData();
    baseSceneBricks = sceneData;
    await loadMeshesForScene(sceneData);
    rebuildRenderableObjects();
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function render() {
  requestAnimationFrame(render);
  if (!device || !pipeline || renderableObjects.length === 0) return;

  const viewProjection = mat4.multiply(projectionMatrix, viewMatrix);
  for (const obj of renderableObjects) {
    device.queue.writeBuffer(obj.uniformBuffer, 0, viewProjection);
  }

  if (!depthTexture || depthTexture.width !== canvas.width || depthTexture.height !== canvas.height) {
    depthTexture?.destroy();
    depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const renderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0.08, g: 0.08, b: 0.1, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  };

  const pass = commandEncoder.beginRenderPass(renderPassDescriptor);
  pass.setPipeline(pipeline);

  for (const obj of renderableObjects) {
    pass.setVertexBuffer(0, obj.mesh.buffer);
    pass.setBindGroup(0, obj.bindGroup);
    pass.draw(obj.mesh.count);
  }

  pass.end();
  device.queue.submit([commandEncoder.finish()]);
}

function setCameraView(type) {
  let cx = 200;
  let cy = 40;
  let cz = 200;
  let dx = 300;
  let dy = 120;
  let dz = 300;

  if (sceneBounds) {
    cx = (sceneBounds.minX + sceneBounds.maxX) / 2;
    cy = (sceneBounds.minY + sceneBounds.maxY) / 2;
    cz = (sceneBounds.minZ + sceneBounds.maxZ) / 2;
    dx = sceneBounds.maxX - sceneBounds.minX;
    dy = sceneBounds.maxY - sceneBounds.minY;
    dz = sceneBounds.maxZ - sceneBounds.minZ;
  }

  const margin = Math.max(dx, dy, dz) * 1.4;
  let eye = [cx + margin, cy + margin * 0.7, cz + margin];
  let up = DEFAULT_UP;

  if (type === "front") {
    eye = [cx, cy + dy * 0.3 + margin * 0.15, sceneBounds ? sceneBounds.minZ - margin : cz - margin];
    up = DEFAULT_UP;
  } else if (type === "top") {
    eye = [cx, sceneBounds ? sceneBounds.maxY + margin : cy + margin, cz];
    up = [0, 0, -1];
  }

  viewMatrix = mat4.lookAt(eye, [cx, cy, cz], up);
}

function exportSceneAsOBJ() {
  if (renderableObjects.length === 0) {
    setStatus("Nothing to export.");
    return;
  }

  const lines = ["# Exported LEGO scene"]; 
  let vertexOffset = 1;

  for (const [index, obj] of renderableObjects.entries()) {
    lines.push(`o brick_${index}_${obj.brick.brick_id}`);
    const { positions, normals } = obj.mesh;

    for (let i = 0; i < positions.length; i += 3) {
      const transformed = applyModelToPoint(obj.model, positions[i], positions[i + 1], positions[i + 2]);
      lines.push(`v ${transformed[0].toFixed(6)} ${transformed[1].toFixed(6)} ${transformed[2].toFixed(6)}`);
    }

    for (let i = 0; i < normals.length; i += 3) {
      const transformedNormal = applyModelToNormal(obj.model, normals[i], normals[i + 1], normals[i + 2]);
      lines.push(`vn ${transformedNormal[0].toFixed(6)} ${transformedNormal[1].toFixed(6)} ${transformedNormal[2].toFixed(6)}`);
    }

    for (let i = 0; i < obj.mesh.count; i += 3) {
      const a = vertexOffset + i;
      const b = vertexOffset + i + 1;
      const c = vertexOffset + i + 2;
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    }

    vertexOffset += obj.mesh.count;
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "lego_scene_export.obj";
  anchor.click();
  URL.revokeObjectURL(url);

  setStatus(`Exported ${renderableObjects.length} bricks as merged OBJ.`);
}

window.addEventListener("resize", () => {
  setCanvasSize(canvas);
  setProjectionMatrix();
});

init().catch((error) => {
  console.error(error);
  setStatus(`Fatal error: ${error.message}`);
});
