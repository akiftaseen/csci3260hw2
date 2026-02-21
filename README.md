# CSCI3260 Programming Assignment #2 — WebGPU LEGO Scene

## What is implemented (how marks are gained)
### Basic requirements
- **OBJ model loading**: `parseOBJ` is used to read vertices/normals from the provided LEGO OBJ files; data is centered/aligned, normals are normalized, and uploaded to GPU vertex buffers.
- **Scene file loading**: `scene.json` is parsed; each brick instance uses `brick_id`, `color`, `position [x,z,y]`, and `rotation`.
- **WebGPU rendering + depth test**: a WebGPU render pipeline with depth buffer (`depth24plus`) is created and used every frame.
- **Scene assembly + transforms**: each brick gets a model matrix from grid placement, rotation around Y, and orientation fix so studs face up. Scene RGB colors are passed per-object.
- **Preset views**: buttons switch camera to **Front**, **Top-Down**, and **Isometric**.

### Advanced requirements implemented
- **User-defined scene loading**: upload your own JSON scene file from the UI.
- **Scene reloading**: click **Reload Scene** to reload current scene data.
- **Scene export**: click **Export OBJ** to export the merged assembled scene as one OBJ file.
- **Parametric scaling**: **Width / Depth / Height** sliders procedurally replicate the arrangement.

## How to run (after pulling on your own computer)
1. Open a terminal in this project folder (where `index.html` is located).
2. Start a local server (recommended for Chrome):
   - `python3 -m http.server 4173`
3. Open Google Chrome and visit:
   - `http://127.0.0.1:4173`
4. You should see the scene and UI controls.

> Note: A local HTTP server is recommended because browsers may restrict module/resource loading from `file://`.

## Quick check list
- Scene appears with colored LEGO bricks and shading.
- Depth works (hidden surfaces are not drawn over front surfaces).
- Front/Top/Isometric buttons change view.
- Reload button refreshes scene.
- File input can load your custom JSON.
- Export button downloads merged OBJ.
- Width/Depth/Height sliders rebuild a scaled scene.

## Submission notes
- The package includes `index.html` at project root.
- Official grading browser: **Google Chrome**.
- If runtime issues happen on another environment, demo in person to TA if requested.
