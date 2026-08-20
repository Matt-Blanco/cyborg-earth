// GLSL 300 es shaders. One program renders everything (lines, triangles,
// point sprites); per-draw uniforms select projection math and fragment style.
//
// The vertex shader is a GPU port of d3-geo's projection pipeline:
//   lon/lat -> unit sphere -> rotate (mat3) -> "raw" projection -> screen.
// Because rotation is a uniform, panning the globe never touches the CPU —
// the entire power grid stays resident in GPU buffers.
//
// Geometry modes (uGeoMode):
//   0 GEO    — aPos is lon/lat, rotation applies (countries, grid, points)
//   1 DOMAIN — aPos is rotated-frame lon/lat, rotation skipped (ocean mesh,
//              projection outline: these are fixed in projected space)
//   2 RAW    — aPos is already in raw projection units (globe horizon circle,
//              atmosphere ring)
//
// Antimeridian seam: for cylindrical/pseudocylindrical/conic projections
// (uProj 1..9) each vertex carries a shared reference point (segment midpoint
// or triangle centroid) in aOther. Vertices unwrap their longitude toward the
// reference, and fragments outside the ±180° domain are discarded — so
// geometry never streaks across the map when the rotation moves the seam.

export const VERT_SRC = `#version 300 es
precision highp float;

in vec2 aPos;    // lon/180, lat/90 in [-1,1]
in vec2 aOther;  // shared seam reference (segment midpoint / tri centroid)
in vec4 aColor;  // per-point color (constant attrib for most draws)
in float aSize;  // point core diameter in css px (constant attrib usually)

uniform mat3  uRotate;
uniform int   uProj;
uniform int   uGeoMode;     // 0 geo, 1 domain-fixed, 2 raw passthrough
uniform float uScale;
uniform vec2  uOffset;      // css px
uniform vec2  uViewport;    // css px
uniform vec3  uConic;
uniform float uClipCos;
uniform float uDpr;
uniform float uSizeBase;    // point size = (uSizeBase + aSize*uSizeScale)*uDpr
uniform float uSizeScale;
uniform int   uFragMode;    // shared with fragment stage; >=2 means point sprite

out float vClip;    // >0 -> inside angular clip
out float vLambda;  // unwrapped rotated longitude (seam discard)
out vec4  vColor;

const float PI = 3.141592653589793;
const float TWO_PI = 6.283185307179586;
const float HALF_PI = 1.5707963267948966;

vec3 toSphere(vec2 ll) {
  float lam = ll.x * PI, phi = ll.y * HALF_PI;
  float c = cos(phi);
  return vec3(c * cos(lam), c * sin(lam), sin(phi));
}

// d3-geo raw projections; q is the rotated unit vector, lam the (possibly
// unwrapped) rotated longitude, phi the rotated latitude.
vec2 rawProject(vec3 q, float lam, float phi) {
  if (uProj == 0) return vec2(q.y, q.z);                          // orthographic
  if (uProj >= 10) {                                              // azimuthal family
    float X = q.x;
    float k;
    if (uProj == 10) k = sqrt(2.0 / max(1.0 + X, 1e-6));          // equal-area
    else if (uProj == 11) {                                       // equidistant
      float c = acos(clamp(X, -1.0, 1.0));
      float s = sqrt(max(1.0 - X * X, 1e-12));
      k = c < 1e-6 ? 1.0 : c / s;
    }
    else if (uProj == 12) k = 1.0 / max(1.0 + X, 1e-6);           // stereographic
    else k = 1.0 / max(X, 1e-4);                                  // gnomonic
    return vec2(q.y * k, q.z * k);
  }
  if (uProj == 1) return vec2(lam, phi);                          // equirectangular
  if (uProj == 2) {                                               // mercator
    float p = clamp(phi, -1.4844, 1.4844);
    return vec2(lam, log(tan((HALF_PI + p) * 0.5)));
  }
  if (uProj == 3) {                                               // transverse mercator
    float p = clamp(phi, -1.4844, 1.4844);
    return vec2(log(tan((HALF_PI + p) * 0.5)), -lam);
  }
  if (uProj == 4) {                                               // natural earth I
    float p2 = phi * phi, p4 = p2 * p2;
    return vec2(
      lam * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
      phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))));
  }
  if (uProj == 5) {                                               // mollweide
    float k = PI * sin(phi), t = phi;
    for (int i = 0; i < 8; i++) {
      float den = 1.0 + cos(t);
      if (den < 1e-7) break;
      t -= (t + sin(t) - k) / den;
    }
    t *= 0.5;
    return vec2(0.900316316157106 * lam * cos(t), 1.4142135623730951 * sin(t));
  }
  if (uProj == 6) return vec2(lam * cos(phi), phi);               // sinusoidal
  if (uProj == 7) {                                               // eckert iv
    float k = (2.0 + HALF_PI) * sin(phi), t = phi * 0.5;
    for (int i = 0; i < 8; i++) {
      float c = cos(t);
      float den = 2.0 * c * (1.0 + c);
      if (abs(den) < 1e-7) break;
      t -= (t + sin(t) * (c + 2.0) - k) / den;
    }
    return vec2(0.4222382003157712 * lam * (1.0 + cos(t)), 1.3265004281770023 * sin(t));
  }
  if (uProj == 8) {                                               // conic equal-area (n, c, r0)
    float r = sqrt(max(uConic.y - 2.0 * uConic.x * sin(phi), 0.0)) / uConic.x;
    float nx = lam * uConic.x;
    return vec2(r * sin(nx), uConic.z - r * cos(nx));
  }
  float gy = uConic.y - phi;                                      // conic equidistant (n, G)
  float nx = lam * uConic.x;
  return vec2(gy * sin(nx), uConic.y - gy * cos(nx));
}

void main() {
  vColor = aColor;
  gl_PointSize = (uSizeBase + aSize * uSizeScale) * uDpr;

  vec2 raw;
  if (uGeoMode == 2) {
    vClip = 1.0;
    vLambda = 0.0;
    raw = aPos;
  } else {
    vec3 q, qo;
    if (uGeoMode == 0) {
      q = uRotate * toSphere(aPos);
      qo = uRotate * toSphere(aOther);
    } else {
      q = toSphere(aPos);
      qo = q;
    }
    vClip = q.x - uClipCos;
    float lam = atan(q.y, q.x);
    float phi = asin(clamp(q.z, -1.0, 1.0));
    // Unwrap longitude toward the segment midpoint / triangle centroid so
    // seam-crossing geometry stays contiguous. Point sprites (uFragMode >= 2)
    // have no meaningful aOther and must never unwrap.
    if (uProj >= 1 && uProj <= 9 && uGeoMode == 0 && uFragMode < 2) {
      float lc = atan(qo.y, qo.x);
      float d = lam - lc;
      if (d > PI) lam -= TWO_PI;
      else if (d < -PI) lam += TWO_PI;
    }
    vLambda = lam;
    raw = rawProject(q, lam, phi);
  }

  vec2 px = vec2(uOffset.x + uScale * raw.x, uOffset.y - uScale * raw.y);
  vec2 ndc = (px / uViewport * 2.0 - 1.0) * vec2(1.0, -1.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;

in float vClip;
in float vLambda;
in vec4  vColor;

uniform int   uFragMode;    // 0 flat, 1 ocean gradient, 2 point, 3 glow
uniform int   uSeamFrag;    // 1 -> discard fragments outside lon domain
uniform vec2  uGradCenter;  // device px, y-up (gl_FragCoord space)
uniform float uGradRadius;
uniform vec4  uGradOuter;

out vec4 fragColor;

const float PI = 3.141592653589793;

void main() {
  if (vClip < 0.0) discard;
  if (uSeamFrag == 1 && abs(vLambda) > PI + 5e-4) discard;

  if (uFragMode == 0) {
    fragColor = vColor;
    return;
  }
  if (uFragMode == 1) {
    float d = distance(gl_FragCoord.xy, uGradCenter) / uGradRadius;
    fragColor = mix(vColor, uGradOuter, clamp(d, 0.0, 1.0));
    return;
  }

  // point sprite modes
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float r = length(pc);
  if (uFragMode == 2) {                       // hard circle, aa edge
    float a = 1.0 - smoothstep(0.85, 1.0, r);
    if (a <= 0.0) discard;
    fragColor = vec4(vColor.rgb, vColor.a * a);
    return;
  }
  // soft glow (uFragMode 3)
  float a = 1.0 - smoothstep(0.0, 1.0, r);
  if (a <= 0.0) discard;
  fragColor = vec4(vColor.rgb, vColor.a * a * a);
}
`;
