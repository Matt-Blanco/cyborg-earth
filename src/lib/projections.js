// Projection registry.
//
// Each projection exists twice: as a D3 projection object (GeoJSON management,
// hover picking, uniform calibration) and as a GLSL branch in the vertex
// shader (see webgl/shaders.js), selected by `gpuId`. The GLSL formulas are
// ports of the d3-geo / d3-geo-projection "raw" projections, so CPU picking
// and GPU rendering agree pixel-for-pixel.
import {
  geoOrthographic,
  geoEquirectangular,
  geoMercator,
  geoTransverseMercator,
  geoNaturalEarth1,
  geoAlbers,
  geoConicEquidistant,
  geoConicEqualArea,
  geoAzimuthalEqualArea,
  geoAzimuthalEquidistant,
  geoStereographic,
  geoGnomonic,
} from 'd3-geo';
import { geoMollweide, geoSinusoidal, geoEckert4 } from 'd3-geo-projection';

// GPU projection ids — must match the uProj branches in shaders.js.
export const GPU = {
  ORTHOGRAPHIC: 0,
  EQUIRECTANGULAR: 1,
  MERCATOR: 2,
  TRANSVERSE_MERCATOR: 3,
  NATURAL_EARTH1: 4,
  MOLLWEIDE: 5,
  SINUSOIDAL: 6,
  ECKERT4: 7,
  CONIC_EQUAL_AREA: 8,
  CONIC_EQUIDISTANT: 9,
  AZIMUTHAL_EQUAL_AREA: 10,
  AZIMUTHAL_EQUIDISTANT: 11,
  STEREOGRAPHIC: 12,
  GNOMONIC: 13,
};

const rad = Math.PI / 180;

// conic parameter helpers — mirror d3-geo's conicEqualAreaRaw / conicEquidistantRaw
function conicEqualAreaParams(p) {
  const [y0d, y1d] = p.parallels();
  const y0 = y0d * rad;
  const y1 = y1d * rad;
  const sy0 = Math.sin(y0);
  const n = (sy0 + Math.sin(y1)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  return [n, c, Math.sqrt(c) / n];
}

function conicEquidistantParams(p) {
  const [y0d, y1d] = p.parallels();
  const y0 = y0d * rad;
  const y1 = y1d * rad;
  const cy0 = Math.cos(y0);
  const n = y0 === y1 ? Math.sin(y0) : (cy0 - Math.cos(y1)) / (y1 - y0);
  return [n, cy0 / n + y0, 0];
}

// clipDeg: angular clip from projection center in degrees (null = no clip).
// "robinson" intentionally reuses Natural Earth, as the original page did.
export const PROJECTIONS = {
  orthographic: {
    factory: () => geoOrthographic().clipAngle(90).precision(0.5),
    gpuId: GPU.ORTHOGRAPHIC,
    clipDeg: 90,
  },
  equirectangular: {
    factory: () => geoEquirectangular().precision(0.5),
    gpuId: GPU.EQUIRECTANGULAR,
    clipDeg: null,
  },
  mercator: {
    factory: () => geoMercator().precision(0.5),
    gpuId: GPU.MERCATOR,
    clipDeg: null,
  },
  transverseMercator: {
    factory: () => geoTransverseMercator().precision(0.5),
    gpuId: GPU.TRANSVERSE_MERCATOR,
    clipDeg: null,
  },
  naturalEarth1: {
    factory: () => geoNaturalEarth1().precision(0.5),
    gpuId: GPU.NATURAL_EARTH1,
    clipDeg: null,
  },
  mollweide: {
    factory: () => geoMollweide().precision(0.5),
    gpuId: GPU.MOLLWEIDE,
    clipDeg: null,
  },
  robinson: {
    factory: () => geoNaturalEarth1().precision(0.5),
    gpuId: GPU.NATURAL_EARTH1,
    clipDeg: null,
  },
  sinusoidal: {
    factory: () => geoSinusoidal().precision(0.5),
    gpuId: GPU.SINUSOIDAL,
    clipDeg: null,
  },
  eckert4: {
    factory: () => geoEckert4().precision(0.5),
    gpuId: GPU.ECKERT4,
    clipDeg: null,
  },
  albers: {
    factory: () => geoAlbers().precision(0.5),
    gpuId: GPU.CONIC_EQUAL_AREA,
    clipDeg: null,
    conicParams: conicEqualAreaParams,
  },
  conicEquidistant: {
    factory: () => geoConicEquidistant().precision(0.5),
    gpuId: GPU.CONIC_EQUIDISTANT,
    clipDeg: null,
    conicParams: conicEquidistantParams,
  },
  conicEqualArea: {
    factory: () => geoConicEqualArea().precision(0.5),
    gpuId: GPU.CONIC_EQUAL_AREA,
    clipDeg: null,
    conicParams: conicEqualAreaParams,
  },
  azimuthalEqualArea: {
    factory: () => geoAzimuthalEqualArea().clipAngle(180).precision(0.5),
    gpuId: GPU.AZIMUTHAL_EQUAL_AREA,
    clipDeg: 179.5,
  },
  azimuthalEquidistant: {
    factory: () => geoAzimuthalEquidistant().clipAngle(180).precision(0.5),
    gpuId: GPU.AZIMUTHAL_EQUIDISTANT,
    clipDeg: 179.5,
  },
  stereographic: {
    factory: () => geoStereographic().clipAngle(150).precision(0.5),
    gpuId: GPU.STEREOGRAPHIC,
    clipDeg: 150,
  },
  gnomonic: {
    factory: () => geoGnomonic().clipAngle(70).precision(0.5),
    gpuId: GPU.GNOMONIC,
    clipDeg: 70,
  },
};

// Grouped list for the <select> UI.
export const PROJECTION_GROUPS = [
  { label: '3D Globe', options: [{ value: 'orthographic', label: 'Orthographic' }] },
  {
    label: '2D — Cylindrical',
    options: [
      { value: 'equirectangular', label: 'Equirectangular (Plate Carrée)' },
      { value: 'mercator', label: 'Mercator' },
      { value: 'transverseMercator', label: 'Transverse Mercator' },
      { value: 'naturalEarth1', label: 'Natural Earth' },
    ],
  },
  {
    label: '2D — Pseudocylindrical',
    options: [
      { value: 'mollweide', label: 'Mollweide' },
      { value: 'robinson', label: 'Robinson (via Natural Earth)' },
      { value: 'sinusoidal', label: 'Sinusoidal' },
      { value: 'eckert4', label: 'Eckert IV' },
    ],
  },
  {
    label: '2D — Conic',
    options: [
      { value: 'albers', label: 'Albers Equal-Area' },
      { value: 'conicEquidistant', label: 'Conic Equidistant' },
      { value: 'conicEqualArea', label: 'Conic Equal-Area' },
    ],
  },
  {
    label: '2D — Azimuthal',
    options: [
      { value: 'azimuthalEqualArea', label: 'Azimuthal Equal-Area' },
      { value: 'azimuthalEquidistant', label: 'Azimuthal Equidistant' },
      { value: 'stereographic', label: 'Stereographic' },
      { value: 'gnomonic', label: 'Gnomonic' },
    ],
  },
];

export function isGlobeKey(key) {
  return key === 'orthographic';
}

// GPU uniform bundle for a projection key + its live D3 projection instance.
export function gpuParamsFor(key, d3proj) {
  const meta = PROJECTIONS[key];
  return {
    gpuId: meta.gpuId,
    clipCos: meta.clipDeg == null ? -2.0 : Math.cos(meta.clipDeg * rad),
    conic: meta.conicParams ? meta.conicParams(d3proj) : [0, 0, 0],
    // Seam handling (antimeridian unwrap + out-of-domain discard) applies to
    // cylindrical / pseudocylindrical / conic projections only.
    hasSeam: meta.gpuId >= 1 && meta.gpuId <= 9,
  };
}
