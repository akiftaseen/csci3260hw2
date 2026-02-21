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
    let normal = normalize(vNormal);

    let lightDir = normalize(vec3<f32>(0.4, 1.0, 0.2));
    let viewPos = vec3<f32>(700.0, 700.0, 700.0);
    let viewDir = normalize(viewPos - vWorldPos);

    let ambientStrength = 0.22;
    let ambient = ambientStrength * vColor;

    let diffuseFactor = max(dot(normal, lightDir), 0.0);
    let diffuse = diffuseFactor * vColor;

    let halfVector = normalize(lightDir + viewDir);
    let specularFactor = pow(max(dot(normal, halfVector), 0.0), 42.0);
    let specular = specularFactor * vec3<f32>(0.55, 0.55, 0.55);

    let finalColor = ambient + diffuse + specular;
    return vec4<f32>(finalColor, 1.0);
}
