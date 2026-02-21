export function setCanvasSize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

export async function loadShaders(shaderPaths) {
    const [vertex, fragment] = await Promise.all(
        [shaderPaths.vertex, shaderPaths.fragment].map(async (path) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
            return res.text();
        })
    );
    return { vertex, fragment };
}

export function hexToRgb01(hex) {
    const v = hex.startsWith("#") ? hex.slice(1) : hex;
    const bigint = parseInt(v, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255].map((c) => c / 255);
}

// OBJ Parser
export function parseOBJ(text) {
    const finalPositions = [];
    const finalNormals = [];
    
    // Temporary arrays
    const v = [];
    const vn = [];

    const lines = text.split('\n');
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('v ')) {
            const parts = line.split(/\s+/);
            v.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
        } else if (line.startsWith('vn ')) {
            const parts = line.split(/\s+/);
            vn.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
        } else if (line.startsWith('f ')) {
            const parts = line.split(/\s+/);
            const vertices = parts.slice(1);

            const getIndex = (str) => parseInt(str.split('/')[0]) - 1;
            const getNormalIndex = (str) => {
                const segs = str.split('/');
                return segs.length > 2 ? parseInt(segs[2]) - 1 : -1;
            };

            const pushVert = (vIdx, triNormal, vnIdx) => {
                finalPositions.push(...v[vIdx]);
                if (vnIdx >= 0 && vn[vnIdx]) {
                    finalNormals.push(...vn[vnIdx]);
                } else {
                    finalNormals.push(triNormal[0], triNormal[1], triNormal[2]);
                }
            };

            // Triangulate
            for (let i = 1; i < vertices.length - 1; i++) {
                const v0 = getIndex(vertices[0]);
                const v1 = getIndex(vertices[i]);
                const v2 = getIndex(vertices[i+1]);

                const p0 = v[v0];
                const p1 = v[v1];
                const p2 = v[v2];

                // Calculate flat normal as fallback
                const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
                const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
                let nx = uy * vz - uz * vy;
                let ny = uz * vx - ux * vz;
                let nz = ux * vy - uy * vx;
                const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
                if (len > 0) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }
                const triN = [nx, ny, nz];
                
                const vn0 = getNormalIndex(vertices[0]);
                const vn1 = getNormalIndex(vertices[i]);
                const vn2 = getNormalIndex(vertices[i+1]);

                pushVert(v0, (vn0 >= 0 ? vn[vn0] : triN), vn0);
                pushVert(v1, (vn1 >= 0 ? vn[vn1] : triN), vn1);
                pushVert(v2, (vn2 >= 0 ? vn[vn2] : triN), vn2);
            }
        }
    }

    return {
        positions: new Float32Array(finalPositions),
        normals: new Float32Array(finalNormals),
        vertexCount: finalPositions.length / 3
    };
}

// Math helpers
export const mat4 = {
    identity: () => {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
    },

    perspective: (fov, aspect, near, far) => {
        const f = 1.0 / Math.tan(fov / 2);
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, far / (near - far), -1,
            0, 0, (near * far) / (near - far), 0
        ]);
    },

    lookAt: (eye, center, up) => {
        const z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
        const len = Math.hypot(z0, z1, z2);
        const z = [z0/len, z1/len, z2/len];
        
        const x0 = up[1]*z[2] - up[2]*z[1], x1 = up[2]*z[0] - up[0]*z[2], x2 = up[0]*z[1] - up[1]*z[0];
        const lenX = Math.hypot(x0, x1, x2);
        const x = [x0/lenX, x1/lenX, x2/lenX];
        
        const y0 = z[1]*x[2] - z[2]*x[1], y1 = z[2]*x[0] - z[0]*x[2], y2 = z[0]*x[1] - z[1]*x[0];
        const y = [y0, y1, y2];

        return new Float32Array([
            x[0], y[0], z[0], 0,
            x[1], y[1], z[1], 0,
            x[2], y[2], z[2], 0,
            -(x[0]*eye[0] + x[1]*eye[1] + x[2]*eye[2]),
            -(y[0]*eye[0] + y[1]*eye[1] + y[2]*eye[2]),
            -(z[0]*eye[0] + z[1]*eye[1] + z[2]*eye[2]),
            1
        ]);
    },

    multiply: (a, b) => {
        const out = new Float32Array(16);
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
        out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
        b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
        out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
        b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
        out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
        b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
        out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
        return out;
    },

    translation: (tx, ty, tz) => {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            tx, ty, tz, 1
        ]);
    },

    rotationY: (rad) => {
        const s = Math.sin(rad), c = Math.cos(rad);
        return new Float32Array([
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1
        ]);
    },

    rotationX: (rad) => {
        const s = Math.sin(rad), c = Math.cos(rad);
        return new Float32Array([
            1, 0, 0, 0,
            0, c, s, 0,
            0, -s, c, 0,
            0, 0, 0, 1
        ]);
    }
};
