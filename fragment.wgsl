struct Uniforms {
    viewProjection : mat4x4<f32>,
    model : mat4x4<f32>,
    color : vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

@fragment
fn main(
    @location(0) vNormal : vec3<f32>,
    @location(1) vColor : vec3<f32>,
    @location(2) vWorldPos : vec3<f32>
) -> @location(0) vec4<f32> {
    // Lighting setup
    // TODO: Define lighting direction, view position, etc.
    // e.g. let lightDir = ...
    
    // TODO: Calculate Ambient component
    
    // TODO: Calculate Diffuse component (Lambert or similar)
    
    // TODO: Calculate Specular component (Blinn-Phong)
    
    // TODO: Combine components and return final color
    
    // Placeholder output (just the raw color)
    return vec4<f32>(vColor, 1.0);
}
