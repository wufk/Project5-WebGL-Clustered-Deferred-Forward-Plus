export default function(params) {
  return `
  // TODO: This is pretty much just a clone of forward.frag.glsl.js

  #version 100
  precision highp float;

  // TODO: Read this buffer to determine the lights influencing a cluster
  uniform sampler2D u_colmap;
  uniform sampler2D u_normap;
  uniform sampler2D u_lightbuffer;
  uniform sampler2D u_clusterbuffer;

  uniform float u_width;
  uniform float u_height;
  uniform float u_near;
  uniform float u_far;

  uniform mat4 u_viewMatrix;
  varying vec3 v_position;
  varying vec3 v_normal;
  varying vec2 v_uv;


  vec3 applyNormalMap(vec3 geomnor, vec3 normap) {
    normap = normap * 2.0 - 1.0;
    vec3 up = normalize(vec3(0.001, 1, 0.001));
    vec3 surftan = normalize(cross(geomnor, up));
    vec3 surfbinor = cross(geomnor, surftan);
    return normap.y * surftan + normap.x * surfbinor + normap.z * geomnor;
  }

  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };

  float ExtractFloat(sampler2D texture, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture2D(texture, vec2(u, v));
    int pixelComponent = component - pixel * 4;
    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.num_lights + 1});
    vec4 v1 = texture2D(u_lightbuffer, vec2(u, 0.3));
    vec4 v2 = texture2D(u_lightbuffer, vec2(u, 0.6));
    light.position = v1.xyz;

    // LOOK: This extracts the 4th float (radius) of the (index)th light in the buffer
    // Note that this is just an example implementation to extract one float.
    // There are more efficient ways if you need adjacent values
    light.radius = v1.w;//ExtractFloat(u_lightbuffer, ${params.num_lights}, 2, index, 3);

    light.color = v2.rgb;
    return light;
  }

  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }

  const int xSlices = ${params.xSlices};
  const int ySlices = ${params.ySlices};
  const int zSlices = ${params.zSlices};
  const int num_clusters = xSlices * ySlices * zSlices;

  void main() {
    vec3 albedo = texture2D(u_colmap, v_uv).rgb;
    vec3 normap = texture2D(u_normap, v_uv).xyz;
    vec3 normal = applyNormalMap(v_normal, normap);

    float x_spacing = float(u_width) / float(xSlices);
    float y_spacing = float(u_height)/ float(ySlices);
    int cluster_x = int( gl_FragCoord.x / x_spacing);
    int cluster_y = int( gl_FragCoord.y / y_spacing);

    vec4 fragCamPos = u_viewMatrix * vec4(v_position, 1.0);
    float z_spacing = float(u_far - u_near) / float(zSlices);
    int cluster_z = - int((fragCamPos.z + u_near) / z_spacing);

    int cluster_idx = cluster_x + cluster_y * xSlices + cluster_z * xSlices * ySlices;
    float Ucoord = float(cluster_idx + 1) / float(num_clusters + 1);
    int clusterLightCount = int(texture2D(u_clusterbuffer, vec2(Ucoord, 0))[0]);

    int num_texels_col = 1 + int(float(${params.maxLightsPerCluster} + 1) * 0.25);

    vec3 fragColor = vec3(0.0);

    for (int i = 0; i < ${params.num_lights}; i++) {

        if(i >= clusterLightCount) break;
        int texel_idx = int(float(i + 1) * 0.25);
        float Vcoord = float(texel_idx + 1) / float(num_texels_col + 1);
        vec4 texel = texture2D(u_clusterbuffer, vec2(Ucoord, Vcoord));
        
        int light_idx;
        int texelComponent = (i + 1) - (texel_idx * 4);

        if (texelComponent == 0) {
            light_idx = int(texel[0]);
        } else if (texelComponent == 1) {
            light_idx = int(texel[1]);
        } else if (texelComponent == 2) {
            light_idx = int(texel[2]);
        } else if (texelComponent == 3) {
            light_idx = int(texel[3]);
        }

      Light light = UnpackLight(light_idx);
      float lightDistance = distance(light.position, v_position);
      vec3 L = (light.position - v_position) / lightDistance;

      float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
      float lambertTerm = max(dot(L, normal), 0.0);

      fragColor += albedo * lambertTerm * light.color * vec3(lightIntensity);
    }

    const vec3 ambientLight = vec3(0.025);
    fragColor += albedo * ambientLight;

    gl_FragColor = vec4(fragColor, 1.0);
  }
  `;
}
