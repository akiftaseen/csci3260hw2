struct Uniforms {
    viewProjection : mat4x4<f32>,
    model : mat4x4<f32>,
    color : vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct VertexInput {
    @location(0) position : vec3<f32>,
    @location(1) normal : vec3<f32>,
};

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) vNormal : vec3<f32>,
    @location(1) vColor : vec3<f32>,
    @location(2) vWorldPos : vec3<f32>,
};

@vertex
fn main(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;
    
    let worldPos = uniforms.model * vec4<f32>(input.position, 1.0);
    output.vWorldPos = worldPos.xyz;

    // Clip Space Position
    output.Position = uniforms.viewProjection * worldPos;
    
    // World Space Normal
    output.vNormal = (uniforms.model * vec4<f32>(input.normal, 0.0)).xyz;
    
    output.vColor = uniforms.color.rgb;
    
    return output;
}
