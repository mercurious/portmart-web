// The background layer under the TUI foreground. Two effects, one API:
//
//   mosaic  retro: the media sampled per block (a third of a cell), ordered-dither posterize, half-block
//           scanlines, a mosaic dissolve between titles; smooth light ribbons through the focal band
//   depth   modern: the still becomes a 2.5D plate. A depth field (blurred luminance + height in frame) drives
//           parallax under a slowly drifting camera, depth of field around the near plane, bloom, light shafts
//           from above the frame, atmospheric mist in the category colours, film grain. Titles change by a
//           depth sweep: the new media arrives near-to-far behind a lit edge.
//
// WebGPU when the browser has it, else Canvas 2D (mosaic: same pixelation; depth: a plain crossfade).
//
//   const atmo = await createAtmosphere(canvas, { fps, gpu })
//   atmo.setMedia({ src, kind: 'img' | 'video' } | null)
//   atmo.setFx('mosaic' | 'depth')
//   atmo.setAccent(['#rrggbb' x3])
//   atmo.setLayout({ cell, focalY, dim })        cell width and focal-band centre in CSS px; dim 0..1

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TRANSITION_MS = { mosaic: 520, depth: 900 };
const PLATE = [256, 144];   // depth/bloom field resolution

const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const ease = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const easeInOut = (u) => { u = Math.min(1, Math.max(0, u)); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };

function loadMedia(m) {
  if (!m) return Promise.resolve(null);
  if (m.kind === 'video') {
    const v = document.createElement('video');
    Object.assign(v, { src: m.src, muted: true, loop: true, playsInline: true, autoplay: true, crossOrigin: 'anonymous' });
    return new Promise((res) => {
      v.addEventListener('loadeddata', () => {
        v.play().catch(() => {});
        const vm = { el: v, w: v.videoWidth, h: v.videoHeight, video: true, fresh: true };
        // copy (and re-plate) only when the video presents a new frame, not on every display refresh
        if (v.requestVideoFrameCallback) { const cb = () => { vm.fresh = true; v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb); }
        else vm.always = true;
        res(vm);
      }, { once: true });
      v.addEventListener('error', () => res(null), { once: true });
    });
  }
  const img = new Image();
  img.decoding = 'async';
  img.crossOrigin = 'anonymous';   // catalog media comes from the catalog's Pages origin (CORS *)
  img.src = m.src;
  return img.decode().then(() => createImageBitmap(img)).then((bm) => ({ el: bm, w: bm.width, h: bm.height, video: false }), () => null);
}

const COMMON = /* wgsl */`
struct U { p0: vec4f, p1: vec4f, p2: vec4f, p3: vec4f, c0: vec4f, c1: vec4f, c2: vec4f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(p[i], 0., 1.);
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453); }
`;

const MOSAIC = COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var ta: texture_2d<f32>;
@group(0) @binding(3) var tb: texture_2d<f32>;

fn bayer(p: vec2u) -> f32 {
  var m = array<f32, 16>(0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[(p.y % 4u) * 4u + p.x % 4u] + .5) / 16.;
}
fn cover(px: vec2f, img: vec2f, zoom: f32, pan: vec2f) -> vec2f {
  let res = u.p0.xy;
  let sc = max(res.x / img.x, res.y / img.y) * zoom;
  return (px - res * .5 + pan) / (img * sc) + .5;
}
fn aura(px: vec2f, t: f32) -> vec3f {
  let res = u.p0.xy;
  let q = px / res.y;
  let f = sin(q.x * 2.1 + t * .21) + sin(q.y * 3.3 - t * .17) + sin((q.x + q.y) * 1.7 + t * .13);
  let tint = mix(mix(u.c0.rgb, u.c1.rgb, .5 + .5 * sin(f)), u.c2.rgb, .5 + .5 * cos(f * .7));
  return vec3f(.043, .051, .071) + tint * (.10 + .06 * sin(f * 1.3)) * smoothstep(1.2, .1, abs(px.y - u.p1.w) / res.y * 2.);
}

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let res = u.p0.xy; let cell = u.p0.z; let t = u.p0.w;
  let mixT = u.p1.x; let block = u.p1.y; let dimI = u.p1.z; let fy = u.p1.w;
  let drift = u.p3.z;
  let bi = floor(pos.xy / block);
  let bc = (bi + .5) * block;
  let th = bayer(vec2u(bi));
  let pan = vec2f(sin(t * .07), cos(t * .05)) * cell * 1.5 * drift;
  let zoom = 1.04 + .03 * sin(t * .11) * drift;
  var ca = aura(bc, t);
  var cb = ca;
  if (u.p3.x > .5) { ca = textureSampleLevel(ta, s, cover(bc, u.p2.xy, zoom, pan), 0.).rgb; }
  if (u.p3.y > .5) { cb = textureSampleLevel(tb, s, cover(bc, u.p2.zw, zoom, pan), 0.).rgb; }
  var col = select(ca, cb, th < mixT);
  col = floor(col * 18. + th) / 18.;
  if ((u32(floor(pos.y / (cell * .5))) & 1u) == 1u) { col *= .9; }
  col *= 1. - .38 * dimI;
  let x = pos.x / res.x;
  var glow = vec3f(0.);
  for (var k = 0; k < 3; k++) {
    let fk = f32(k);
    let ph = t * (.23 + fk * .07) + fk * 2.1;
    let y = fy + (sin(x * (5.2 + fk * 1.7) + ph) * .6 + sin(x * (2.3 - fk * .5) - ph * .8) * .4) * cell * (1.6 + fk * .5);
    let d = abs(pos.y - y);
    let core = exp(-d * d / (2. * pow(cell * .05 + 1., 2.)));
    let halo = exp(-d / (cell * (.9 + fk * .4)));
    var c = u.c0.rgb;
    if (k == 1) { c = u.c1.rgb; }
    if (k == 2) { c = u.c2.rgb; }
    glow += c * (core * .55 + halo * .16) * (.65 + .35 * sin(x * 9. + ph * 1.7));
  }
  col += glow * (1. - .5 * dimI);
  let v = (pos.xy / res - .5) * vec2f(1., res.y / res.x);
  col *= 1. - .55 * dot(v, v);
  return vec4f(col, 1.);
}`;

// pre-pass: media -> 256x144 field. rgb = soft colour (bloom, light shafts), a = nearness (0 far .. 1 near):
// wide-blurred luminance plus height in frame (lower is nearer, as in most game and app captures)
const PLATE_WGSL = COMMON + /* wgsl */`
@group(0) @binding(0) var s: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let OUT = vec2f(${PLATE[0]}., ${PLATE[1]}.);
  let uv = pos.xy / OUT;
  var c = vec3f(0.); var cd = vec3f(0.); var w = 0.;
  for (var j = -3; j <= 3; j++) {
    for (var i = -3; i <= 3; i++) {
      let g = exp(-f32(i * i + j * j) / 6.);
      let o = vec2f(f32(i), f32(j)) / OUT;
      c += textureSampleLevel(src, s, uv + o * 1.2, 0.).rgb * g;
      cd += textureSampleLevel(src, s, uv + o * 5., 0.).rgb * g;
      w += g;
    }
  }
  c /= w; cd /= w;
  let lum = dot(cd, vec3f(.299, .587, .114));
  return vec4f(c, clamp(.62 * uv.y + .38 * lum, 0., 1.));
}`;

const DEPTH = COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var ta: texture_2d<f32>;
@group(0) @binding(3) var tb: texture_2d<f32>;
@group(0) @binding(4) var da: texture_2d<f32>;
@group(0) @binding(5) var db: texture_2d<f32>;

fn cover(px: vec2f, img: vec2f, zoom: f32) -> vec2f {
  let res = u.p0.xy;
  let sc = max(res.x / img.x, res.y / img.y) * zoom;
  return (px - res * .5) / (img * sc) + .5;
}

// one plate: parallax through the depth field, then depth of field around the near plane, then bloom
fn plate(t: texture_2d<f32>, d: texture_2d<f32>, uv0: vec2f, cam: vec2f, img: vec2f) -> vec4f {
  var uv = uv0;
  var n = textureSampleLevel(d, s, uv, 0.).a;
  for (var i = 0; i < 3; i++) { uv = uv0 + cam * (n - .55); n = textureSampleLevel(d, s, uv, 0.).a; }
  let r = abs(n - .7) * .009 + u.p1.z * .006;
  let asp = vec2f(1., img.x / img.y);
  var col = textureSampleLevel(t, s, uv, 0.).rgb;
  for (var k = 1; k <= 12; k++) {
    let fk = f32(k);
    let a = fk * 2.39996;
    col += textureSampleLevel(t, s, uv + vec2f(cos(a), sin(a)) * r * sqrt(fk / 12.) * asp, 0.).rgb;
  }
  col /= 13.;
  let soft = textureSampleLevel(d, s, uv, 0.).rgb;
  col += max(soft - vec3f(.55), vec3f(0.)) * .9;
  return vec4f(col, n);
}

// no media: deep ground, slow bokeh in the category colours
fn ground(px: vec2f, t: f32) -> vec3f {
  let res = u.p0.xy;
  var col = vec3f(.035, .04, .058) + u.c2.rgb * .05 * smoothstep(res.y, 0., px.y);
  for (var k = 0; k < 7; k++) {
    let fk = f32(k);
    let c = vec2f(res.x * (.15 + .7 * fract(fk * .618 + t * (.004 + fk * .0015))),
                  res.y * (.25 + .5 * fract(fk * .382 + sin(t * .05 + fk) * .08)));
    let rad = res.y * (.08 + .05 * fract(fk * .73));
    let disc = smoothstep(rad, rad * .55, length(px - c));
    var tint = u.c0.rgb;
    if (k % 3 == 1) { tint = u.c1.rgb; }
    if (k % 3 == 2) { tint = u.c2.rgb; }
    col += tint * disc * .07;
  }
  return col;
}

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let res = u.p0.xy; let t = u.p0.w;
  let mixT = u.p1.x; let dimI = u.p1.z; let fy = u.p1.w;
  let drift = u.p3.z;
  let px = pos.xy;
  let cam = vec2f(sin(t * .19), cos(t * .13) * .6) * .03 * drift + vec2f(u.p3.w, u.p3.w * .3);
  let zoom = 1.07;
  let hasA = u.p3.x > .5; let hasB = u.p3.y > .5;
  let g = ground(px, t);
  var A = vec4f(g, 0.);
  var B = A;
  if (hasA) { A = plate(ta, da, cover(px, u.p2.xy, zoom), cam, u.p2.xy); }
  if (hasB) { B = plate(tb, db, cover(px, u.p2.zw, zoom * (1. + .05 * (1. - mixT))), cam, u.p2.zw); }

  // depth sweep: the new plate arrives near-to-far behind a lit edge
  let edge = mix(1.15, -.2, mixT);
  let nz = hash(floor(px / 2.)) * .035;
  let m = smoothstep(edge - .05, edge + .05, B.a + nz);
  var col = mix(A.rgb, B.rgb, m);
  let near = mix(A.a, B.a, m);
  col += u.c1.rgb * exp(-abs(B.a + nz - edge) * 38.) * sin(mixT * 3.14159) * .85;

  let media = hasA || hasB;
  if (media) {
    // atmospheric mist: far planes recede into the category colour
    let mist = mix(u.c2.rgb, u.c0.rgb, px.y / res.y) * .32 + vec3f(.02);
    col = mix(col, mist, (1. - near) * .2);
    // light shafts from above the frame, gathered from the soft field
    let useB = hasB && mixT > .5;
    let Lp = vec2f(res.x * (.64 + .12 * sin(t * .07)), -res.y * .25);
    let stepv = (Lp - px) * (.5 / 16.);
    var q = px; var decay = 1.; var rays = vec3f(0.);
    for (var i = 0; i < 16; i++) {
      q += stepv;
      var c: vec3f;
      if (useB) { c = textureSampleLevel(db, s, cover(q, u.p2.zw, zoom), 0.).rgb; }
      else { c = textureSampleLevel(da, s, cover(q, u.p2.xy, zoom), 0.).rgb; }
      rays += max(c - vec3f(.42), vec3f(0.)) * decay;
      decay *= .9;
    }
    col += rays * .1 * mix(vec3f(1.), u.c0.rgb, .35);
  }
  // a low light sheet through the focal band, in the accent
  col += u.c1.rgb * exp(-abs(px.y - fy) / (res.y * .1)) * .05;

  col *= 1. - .38 * dimI;
  col += (hash(px + fract(t * 7.) * 91.) - .5) * .035;
  let v = (px / res - .5) * vec2f(1., res.y / res.x);
  col *= 1. - .6 * dot(v, v);
  return vec4f(col, 1.);
}`;

async function webgpu(canvas) {
  if (!navigator.gpu) throw new Error('no navigator.gpu');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter) throw new Error('no adapter');
  // timestamp-query (the Flip 2's Turnip has it) times the main pass and the plate pre-pass for ?bench
  const ts = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice(ts ? { requiredFeatures: ['timestamp-query'] } : {});
  const tq = ts && {
    set: device.createQuerySet({ type: 'timestamp', count: 4 }),
    res: device.createBuffer({ size: 32, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
    rb: [0, 1, 2].map(() => ({ buf: device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false })),
  };
  let plated = false;
  const timing = { onGpu: null };
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  const pipe = (code, fmt) => {
    const mod = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout: 'auto', vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: fmt }] }, primitive: { topology: 'triangle-list' },
    });
  };
  const pipes = { mosaic: pipe(MOSAIC, format), depth: pipe(DEPTH, format) };
  const platePipe = pipe(PLATE_WGSL, 'rgba8unorm');
  const ubuf = device.createBuffer({ size: 28 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const blank = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING });

  // media texture + its plate field; stills are done once, video every frame
  const prep = (m, enc) => {
    if (!m.tex) {
      m.tex = device.createTexture({
        size: [m.w, m.h], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      m.plate = device.createTexture({ size: PLATE, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      m.plateBind = device.createBindGroup({ layout: platePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: samp }, { binding: 1, resource: m.tex.createView() }] });
      m.dirty = true;
      if (!m.video) device.queue.copyExternalImageToTexture({ source: m.el }, { texture: m.tex }, [m.w, m.h]);
    }
    if (m.video && (m.fresh || m.always) && m.el.readyState >= 2) {
      device.queue.copyExternalImageToTexture({ source: m.el }, { texture: m.tex }, [m.w, m.h]);
      m.dirty = true; m.fresh = false;
    }
    if (m.dirty && m.wantPlate) {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: m.plate.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
        ...(tq && !plated ? { timestampWrites: { querySet: tq.set, beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3 } } : {}),
      });
      plated = true;
      p.setPipeline(platePipe); p.setBindGroup(0, m.plateBind); p.draw(3); p.end();
      m.dirty = false;
    }
  };
  const info = adapter.info || {};
  return {
    kind: `WebGPU ${[info.vendor, info.architecture].filter(Boolean).join(' ')}${ts ? ' +ts' : ''}`.trim(),
    timing,
    draw(st, a, b) {
      const enc = device.createCommandEncoder();
      plated = false;
      const depth = st.fx === 'depth';
      for (const m of [a, b]) if (m) { m.wantPlate = depth; prep(m, enc); }
      const P = pipes[st.fx];
      const entries = [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: samp },
        { binding: 2, resource: (a ? a.tex : blank).createView() }, { binding: 3, resource: (b ? b.tex : blank).createView() }];
      if (depth) entries.push({ binding: 4, resource: (a ? a.plate : blank).createView() }, { binding: 5, resource: (b ? b.plate : blank).createView() });
      const bind = device.createBindGroup({ layout: P.getBindGroupLayout(0), entries });
      const U = new Float32Array(28);
      U.set([canvas.width, canvas.height, st.cell, st.t, st.mixT, st.block, st.dim, st.focalY,
        a ? a.w : 1, a ? a.h : 1, b ? b.w : 1, b ? b.h : 1, a ? 1 : 0, b ? 1 : 0, st.drift, st.push,
        ...st.c0, 1, ...st.c1, 1, ...st.c2, 1]);
      device.queue.writeBuffer(ubuf, 0, U);
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        ...(tq ? { timestampWrites: { querySet: tq.set, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}),
      });
      pass.setPipeline(P);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
      const rb = tq && timing.onGpu && tq.rb.find((x) => !x.busy);
      const n = plated ? 4 : 2;
      if (rb) { enc.resolveQuerySet(tq.set, 0, n, tq.res, 0); enc.copyBufferToBuffer(tq.res, 0, rb.buf, 0, n * 8); }
      device.queue.submit([enc.finish()]);
      if (rb) {
        rb.busy = true;
        rb.buf.mapAsync(GPUMapMode.READ, 0, n * 8).then(() => {
          const v = new BigUint64Array(rb.buf.getMappedRange(0, n * 8));
          const main = Number(v[1] - v[0]) / 1e6, plate = n === 4 ? Number(v[3] - v[2]) / 1e6 : 0;
          rb.buf.unmap(); rb.busy = false;
          if (timing.onGpu && main > 0 && main < 1000) timing.onGpu(main, plate);
        }, () => { rb.busy = false; });
      }
    },
    release(m) { if (m && m.tex) { m.tex.destroy(); m.plate.destroy(); } },
  };
}

function canvas2d(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d');
  const coverDraw = (c, m, W, H, z = 1.04) => {
    const sc = Math.max(W / m.w, H / m.h) * z;
    c.drawImage(m.el, (W - m.w * sc) / 2, (H - m.h * sc) / 2, m.w * sc, m.h * sc);
  };
  return {
    kind: 'Canvas 2D (no WebGPU)',
    draw(st, a, b) {
      const W = canvas.width, H = canvas.height;
      if (st.fx === 'depth') {
        ctx.imageSmoothingEnabled = true;
        ctx.fillStyle = '#090a0f';
        ctx.fillRect(0, 0, W, H);
        if (a) coverDraw(ctx, a, W, H, 1.07);
        if (b) { ctx.globalAlpha = st.mixT; coverDraw(ctx, b, W, H, 1.07); ctx.globalAlpha = 1; }
      } else {
        const sw = Math.max(1, Math.ceil(W / st.block)), sh = Math.max(1, Math.ceil(H / st.block));
        if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
        sctx.fillStyle = '#0b0d12';
        sctx.fillRect(0, 0, sw, sh);
        if (a) coverDraw(sctx, a, sw, sh);
        if (b) { sctx.globalAlpha = Math.round(st.mixT * 4) / 4; coverDraw(sctx, b, sw, sh); sctx.globalAlpha = 1; }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, sw * st.block, sh * st.block);
      }
      if (st.dim) { ctx.fillStyle = `rgb(11 13 18 / ${0.38 * st.dim})`; ctx.fillRect(0, 0, W, H); }
    },
    release() {},
  };
}

// rs: render scale of the background (0.5 = half resolution, upscaled by the compositor)
export async function createAtmosphere(canvas, { fps = 60, gpu = true, rs = 1 } = {}) {
  let r;
  try { if (!gpu) throw new Error('WebGPU off (?gpu=0)'); r = await webgpu(canvas); } catch (e) { console.info('atmosphere: falling back to Canvas 2D:', e.message); r = canvas2d(canvas); }
  const dpr = Math.min(2, window.devicePixelRatio || 1) * rs;
  const st = { fx: 'depth', cell: 24, focalY: 600, dim: 0, mixT: 1, block: 6, drift: REDUCED ? 0 : 1, push: 0, t: 0,
    c0: [1, .69, 0], c1: [1, .31, .85], c2: [.58, .38, .96] };
  let cur = null, next = null, t0 = 0, want = 0, last = 0;
  const target = { dim: 0 };

  const fit = () => { canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr); };
  fit();
  addEventListener('resize', fit);

  // bench: frame intervals (rAF to rAF, drawn frames only) and GPU pass times, read by window.__bench
  const B = { iv: [], gpu: [], plate: [], prev: 0 };
  if (r.timing) r.timing.onGpu = (main, plate) => { B.gpu.push(main); if (plate > 0) B.plate.push(plate); };
  const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
  const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
  window.__bench = {
    kind: r.kind,
    reset() { B.iv.length = 0; B.gpu.length = 0; B.plate.length = 0; B.prev = 0; },
    snapshot() {
      return { fx: st.fx, w: canvas.width, h: canvas.height, frames: B.iv.length, fps: B.iv.length ? +(1000 / mean(B.iv)).toFixed(1) : null,
        ivP50: pct(B.iv, 0.5), ivP95: pct(B.iv, 0.95), gpuMean: mean(B.gpu), gpuP50: pct(B.gpu, 0.5), gpuP95: pct(B.gpu, 0.95),
        plateMean: mean(B.plate), plateN: B.plate.length };
    },
  };

  function frame(now) {
    requestAnimationFrame(frame);
    // half a 120 Hz refresh of slack, so a 30 fps cap lands on every 4th vsync instead of drifting to the 5th
    if (document.hidden || now - last < 1000 / fps - 4) return;
    last = now;
    if (B.prev) B.iv.push(now - B.prev);
    B.prev = now;
    st.t = REDUCED ? 0 : now / 1000;
    const settled = Math.max(2, Math.round(st.cell / 3));
    if (t0) {
      const u = REDUCED ? 1 : (now - t0) / TRANSITION_MS[st.fx];
      if (st.fx === 'depth') { st.mixT = easeInOut(u); st.block = settled; }
      else {
        st.mixT = ease(u);
        st.block = Math.round(settled + (st.cell * 2 - settled) * (1 - ease(u * 1.15)));
      }
      if (u >= 1) { r.release(cur); cur = next; next = null; t0 = 0; st.mixT = 1; st.block = settled; }
    } else st.block = settled;
    st.dim += (target.dim - st.dim) * 0.2;
    st.push *= 0.94;
    st.block = Math.max(2, st.block);
    if (!t0) r.draw({ ...st, mixT: 0 }, cur, null);
    else r.draw(st, cur, next);
  }
  requestAnimationFrame(frame);

  return {
    kind: r.kind,
    async setMedia(m) {
      const id = ++want;
      const loaded = await loadMedia(m);
      if (id !== want) { if (loaded && loaded.video) loaded.el.pause(); return; }
      if (t0 && next) { r.release(cur); cur = next; }
      if (cur && cur.video) cur.el.pause();
      next = loaded;
      t0 = performance.now();
      if (!REDUCED) st.push = 0.025;
      if (!loaded && !cur) { t0 = 0; next = null; }
    },
    setFx(fx) { st.fx = fx; },
    setAccent(cols) { [st.c0, st.c1, st.c2] = cols.map(hex); },
    setLayout({ cell, focalY, dim }) { st.cell = cell * dpr; st.focalY = focalY * dpr; target.dim = dim; },
  };
}
