// WebGL2 renderer. Owns the GL context, one shader program, and all GPU
// buffers. The render() method is pure GPU work — no per-frame geometry
// processing happens on the CPU, which is what makes pan/rotate fast even
// with millions of power-line vertices resident.
import { VERT_SRC, FRAG_SRC } from './shaders.js';
import { sphereMesh, domainBoundary, rawCircle, rawRing } from './geometry.js';
import { RENDER_COLORS, AREA_DEFS, AREA_COLORS } from '../config.js';

const GEO = 0, DOMAIN = 1, RAW = 2;
const FLAT = 0, OCEAN = 1, POINT = 2, GLOW = 3, PULSE = 4;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

export class GlobeRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    this.canvas = canvas;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    gl.useProgram(prog);

    this.attr = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aOther: gl.getAttribLocation(prog, 'aOther'),
      aColor: gl.getAttribLocation(prog, 'aColor'),
      aSize: gl.getAttribLocation(prog, 'aSize'),
    };
    this.uni = {};
    for (const name of [
      'uRotate', 'uProj', 'uGeoMode', 'uScale', 'uOffset', 'uViewport', 'uConic',
      'uClipCos', 'uDpr', 'uSizeBase', 'uSizeScale', 'uFragMode', 'uSeamFrag',
      'uGradCenter', 'uGradRadius', 'uGradOuter', 'uTime',
    ]) {
      this.uni[name] = gl.getUniformLocation(prog, name);
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // static geometry
    this.sphere = this._indexedBuffer(sphereMesh(2));
    this.boundary = this._geoBuffer(domainBoundary(1));
    this.horizon = this._geoBuffer(rawCircle(1, 240));
    this.ring = null;
    this.ringScale = 0;

    // data-dependent buffers (filled later)
    this.countries = null;
    this.graticule = null;
    this.grid = {
      mv: null, hv: null, cable: null, rail: null, telecom: null, subsea: null,
    };
    this.points = {
      substations: null,
      plants: null,
      railNodes: null,
      telecomPoints: null,
    };
    // Boundary areas, category -> { fill, outline }. Populated by setAreas();
    // a category with no data never gets a key and so never draws.
    this.areas = {};
    this.reactors = null; // { pos, coreColor, glowColor, size, count, pulsePos, pulseCount }
    this.hoverBuf = this.gl.createBuffer();
  }

  // --- buffer helpers ------------------------------------------------------

  _geoBuffer({ data, vertexCount }, type = 'float') {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return {
      buf,
      count: vertexCount,
      glType: type === 'int16' ? gl.SHORT : gl.FLOAT,
      normalized: type === 'int16',
      stride: type === 'int16' ? 8 : 16,
      compBytes: type === 'int16' ? 2 : 4,
    };
  }

  _indexedBuffer({ data, indices, indexCount }) {
    const gl = this.gl;
    const b = this._geoBuffer({ data, vertexCount: 0 });
    b.index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    b.indexCount = indexCount;
    return b;
  }

  _pointBuffer(positions) {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    return { buf, count: positions.length / 2 };
  }

  setCountries(tris) {
    this.countries = this._geoBuffer(tris);
  }

  setGraticule(segs) {
    this.graticule = this._geoBuffer(segs);
  }

  setGrid(byCategory) {
    for (const [cat, segs] of Object.entries(byCategory)) {
      if (segs && segs.vertexCount) this.grid[cat] = this._geoBuffer(segs, 'int16');
    }
  }

  setPoints(byLayer) {
    for (const [layer, positions] of Object.entries(byLayer)) {
      if (positions && positions.length) this.points[layer] = this._pointBuffer(positions);
    }
  }

  setAreas(byCategory) {
    for (const [cat, bufs] of Object.entries(byCategory)) {
      if (!bufs) continue;
      const entry = {};
      if (bufs.fill && bufs.fill.vertexCount) entry.fill = this._geoBuffer(bufs.fill);
      if (bufs.outline && bufs.outline.vertexCount) {
        entry.outline = this._geoBuffer(bufs.outline);
      }
      if (entry.fill || entry.outline) this.areas[cat] = entry;
    }
  }

  // Re-callable: a theme switch rebuilds the colour buffers, so the previous
  // set is released rather than orphaned on the GPU.
  setReactors({ positions, coreColors, glowColors, sizes, pulsePositions }) {
    if (!positions.length) return;
    const gl = this.gl;
    if (this.reactors) {
      const r = this.reactors;
      for (const b of [r.pos, r.coreColor, r.glowColor, r.size, r.pulsePos]) {
        if (b) gl.deleteBuffer(b);
      }
    }
    const mk = (arr) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      return b;
    };
    this.reactors = {
      pos: mk(positions),
      coreColor: mk(coreColors),
      glowColor: mk(glowColors),
      size: mk(sizes),
      count: positions.length / 2,
      pulsePos: pulsePositions.length ? mk(pulsePositions) : null,
      pulseCount: pulsePositions.length / 2,
    };
  }

  // --- attribute binding ---------------------------------------------------

  _bindGeo(b) {
    const gl = this.gl;
    const { aPos, aOther } = this.attr;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, b.glType, b.normalized, b.stride, 0);
    gl.enableVertexAttribArray(aOther);
    gl.vertexAttribPointer(aOther, 2, b.glType, b.normalized, b.stride, 2 * b.compBytes);
  }

  _bindPoints(b, colorBuf) {
    const gl = this.gl;
    const { aPos, aOther, aColor } = this.attr;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buf ?? b);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 8, 0);
    gl.disableVertexAttribArray(aOther);
    gl.vertexAttrib2f(aOther, 0, 0);
    if (colorBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    }
  }

  _constColor([r, g, b, a]) {
    const gl = this.gl;
    gl.disableVertexAttribArray(this.attr.aColor);
    gl.vertexAttrib4f(this.attr.aColor, r, g, b, a);
  }

  _constSize(v) {
    const gl = this.gl;
    gl.disableVertexAttribArray(this.attr.aSize);
    gl.vertexAttrib1f(this.attr.aSize, v);
  }

  // --- rendering -----------------------------------------------------------

  render(s) {
    // s: { gpu: {gpuId, clipCos, conic, hasSeam}, rotateMat3, scale, offset,
    //      viewport (css), dpr, layers, isGlobe, time, gradient, hover }
    const gl = this.gl;
    const u = this.uni;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);

    gl.uniformMatrix3fv(u.uRotate, false, s.rotateMat3);
    gl.uniform1i(u.uProj, s.gpu.gpuId);
    gl.uniform1f(u.uScale, s.scale);
    gl.uniform2f(u.uOffset, s.offset[0], s.offset[1]);
    gl.uniform2f(u.uViewport, s.viewport[0], s.viewport[1]);
    gl.uniform3f(u.uConic, s.gpu.conic[0], s.gpu.conic[1], s.gpu.conic[2]);
    gl.uniform1f(u.uClipCos, s.gpu.clipCos);
    gl.uniform1f(u.uDpr, s.dpr);
    gl.uniform1f(u.uTime, s.time);
    const seam = s.gpu.hasSeam ? 1 : 0;

    const setMode = (geoMode, fragMode, seamFrag) => {
      gl.uniform1i(u.uGeoMode, geoMode);
      gl.uniform1i(u.uFragMode, fragMode);
      gl.uniform1i(u.uSeamFrag, seamFrag);
    };
    const setSize = (base, scale) => {
      gl.uniform1f(u.uSizeBase, base);
      gl.uniform1f(u.uSizeScale, scale);
    };
    setSize(0, 1);
    this._constSize(0);

    // 1. Ocean / projection footprint
    setMode(DOMAIN, s.isGlobe ? OCEAN : FLAT, 0);
    if (s.isGlobe) {
      this._constColor(RENDER_COLORS.oceanInner);
      gl.uniform2f(u.uGradCenter, s.gradient.center[0], s.gradient.center[1]);
      gl.uniform1f(u.uGradRadius, s.gradient.radius);
      const oc = RENDER_COLORS.oceanOuter;
      gl.uniform4f(u.uGradOuter, oc[0], oc[1], oc[2], oc[3]);
    } else {
      this._constColor(RENDER_COLORS.oceanFlat);
    }
    this._bindGeo(this.sphere);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphere.index);
    gl.drawElements(gl.TRIANGLES, this.sphere.indexCount, gl.UNSIGNED_INT, 0);

    // 2. Sphere outline
    this._constColor(RENDER_COLORS.sphereOutline);
    if (s.isGlobe) {
      setMode(RAW, FLAT, 0);
      this._bindGeo(this.horizon);
      gl.drawArrays(gl.LINES, 0, this.horizon.count);
    } else {
      setMode(DOMAIN, FLAT, 0);
      this._bindGeo(this.boundary);
      gl.drawArrays(gl.LINES, 0, this.boundary.count);
    }

    // 3. Country fills. Under the graticule, not over it: the dark theme paints
    // land at alpha 0 and does not care, but the light theme's land is opaque
    // and would otherwise erase every meridian that crosses a continent.
    if (this.countries) {
      setMode(GEO, FLAT, seam);
      this._constColor(RENDER_COLORS.land);
      this._bindGeo(this.countries);
      gl.drawArrays(gl.TRIANGLES, 0, this.countries.count);
    }

    // 4. Graticule
    if (this.graticule) {
      setMode(GEO, FLAT, seam);
      this._constColor(RENDER_COLORS.graticule);
      this._bindGeo(this.graticule);
      gl.drawArrays(gl.LINES, 0, this.graticule.count);
    }

    // 4b. Boundary areas. Every fill draws before any outline, so a large
    // region laid over a small one cannot bury the smaller one's border — the
    // border is what identifies the layer, and the fill is only a tint.
    setMode(GEO, FLAT, seam);
    for (const d of AREA_DEFS) {
      const a = this.areas[d.category];
      if (!a || !a.fill || !s.layers[d.layerId]) continue;
      this._constColor(AREA_COLORS[d.category].fill);
      this._bindGeo(a.fill);
      gl.drawArrays(gl.TRIANGLES, 0, a.fill.count);
    }
    for (const d of AREA_DEFS) {
      const a = this.areas[d.category];
      if (!a || !a.outline || !s.layers[d.layerId]) continue;
      this._constColor(AREA_COLORS[d.category].outline);
      this._bindGeo(a.outline);
      gl.drawArrays(gl.LINES, 0, a.outline.count);
    }

    // 5. Infrastructure lines — rail and telecom underneath, power on top.
    setMode(GEO, FLAT, seam);
    const gridDraw = (buf, color) => {
      if (!buf) return;
      this._constColor(color);
      this._bindGeo(buf);
      gl.drawArrays(gl.LINES, 0, buf.count);
    };
    if (s.layers.railLines) gridDraw(this.grid.rail, RENDER_COLORS.railLines);
    if (s.layers.subseaCables) gridDraw(this.grid.subsea, RENDER_COLORS.subseaCables);
    if (s.layers.telecom) gridDraw(this.grid.telecom, RENDER_COLORS.telecomLines);
    if (s.layers.mvLines) gridDraw(this.grid.mv, RENDER_COLORS.mvLines);
    if (s.layers.hvLines) gridDraw(this.grid.hv, RENDER_COLORS.hvLines);
    if (s.layers.cables) gridDraw(this.grid.cable, RENDER_COLORS.cables);

    // 6. Point features
    setMode(GEO, POINT, 0);
    const pointDraw = (buf, color, size) => {
      if (!buf) return;
      this._constColor(color);
      this._constSize(size);
      this._bindPoints(buf, null);
      gl.drawArrays(gl.POINTS, 0, buf.count);
    };
    if (s.layers.railNodes) pointDraw(this.points.railNodes, RENDER_COLORS.railNodes, 2);
    if (s.layers.telecom) {
      pointDraw(this.points.telecomPoints, RENDER_COLORS.telecomPoints, 4);
    }
    if (s.layers.substations) {
      pointDraw(this.points.substations, RENDER_COLORS.substations, 3);
    }
    if (s.layers.plants) pointDraw(this.points.plants, RENDER_COLORS.plants, 4);

    // 7. Reactors: glow halo, pulse rings, cores
    if (s.layers.reactors && this.reactors) {
      const r = this.reactors;
      const bindSizes = () => {
        gl.bindBuffer(gl.ARRAY_BUFFER, r.size);
        gl.enableVertexAttribArray(this.attr.aSize);
        gl.vertexAttribPointer(this.attr.aSize, 1, gl.FLOAT, false, 0, 0);
      };
      setMode(GEO, GLOW, 0);
      setSize(8, 1); // glow diameter = core + 8px
      this._bindPoints(r.pos, r.glowColor);
      bindSizes();
      gl.drawArrays(gl.POINTS, 0, r.count);

      if (r.pulsePos) {
        setMode(GEO, PULSE, 0);
        setSize(19, 0);
        this._bindPoints(r.pulsePos, null);
        this._constColor([16 / 255, 185 / 255, 129 / 255, 1]);
        this._constSize(0);
        gl.drawArrays(gl.POINTS, 0, r.pulseCount);
      }

      setMode(GEO, POINT, 0);
      setSize(0, 1);
      this._bindPoints(r.pos, r.coreColor);
      bindSizes();
      gl.drawArrays(gl.POINTS, 0, r.count);

      // hovered reactor: enlarged core + white center dot
      if (s.hover && s.hover.kind === 'reactor') {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.hoverBuf);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([s.hover.lon / 180, s.hover.lat / 90]),
          gl.DYNAMIC_DRAW
        );
        this._bindPoints(this.hoverBuf, null);
        this._constColor(s.hover.colorVec4);
        this._constSize(10);
        gl.drawArrays(gl.POINTS, 0, 1);
        this._constColor([1, 1, 1, 1]);
        this._constSize(3);
        gl.drawArrays(gl.POINTS, 0, 1);
      }
    }

    // 8. Atmosphere halo (globe only)
    if (s.isGlobe) {
      if (!this.ring || Math.abs(this.ringScale - s.scale) > 0.5) {
        if (this.ring) gl.deleteBuffer(this.ring.buf);
        const w = 2 / s.scale; // ±2px around the horizon
        this.ring = this._geoBuffer(rawRing(1 - w, 1 + w, 180));
        this.ringScale = s.scale;
      }
      setMode(RAW, FLAT, 0);
      this._constColor(RENDER_COLORS.atmosphere);
      this._bindGeo(this.ring);
      gl.drawArrays(gl.TRIANGLES, 0, this.ring.count);
    }
  }
}

// Build the column-major mat3 for d3-style rotation [a, b, 0] (radians):
// M = RotY(b) · RotZ(a), matching d3.geoRotation composition.
export function rotationMatrix(a, b) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  // column-major
  return new Float32Array([
    cb * ca, sa, sb * ca,
    -cb * sa, ca, -sb * sa,
    -sb, 0, cb,
  ]);
}
