/* WebGL renderer built on Three.js (vendor/three.min.js).
 *
 * The simulation stays in (d, x) world coordinates. This renderer keeps the
 * player at the origin facing -z and lays the road out ahead of it every frame:
 *   position(dz, x) = (x * RW + curve(dz), hill(dz), -dz)
 * where dz = d - player.d. Cars are real meshes with paint, glass, wheels and
 * lights, lit by a sun with shadows and an environment map baked from the sky.
 *
 * The 2D Renderer is extended only for its overlay duties (particles, flash,
 * vignette) which are drawn on a transparent canvas above the WebGL canvas.
 */
class Renderer3D extends Renderer {
  static available() {
    if (!window.THREE) return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (_) {
      return false;
    }
  }

  constructor(canvas) {
    const overlay = document.createElement('canvas');
    overlay.id = 'fx';
    canvas.parentNode.insertBefore(overlay, canvas.nextSibling);
    super(overlay);
    this.gl = canvas;
    this.RW = (CONFIG.LANES * CONFIG.RENDER3D.laneWidth) / 2; // road half-width in metres
    this.entityMeshes = new Map();
    this._initThree();
    this.resize();
  }

  /* ---------- setup ---------- */
  _initThree() {
    const R3 = CONFIG.RENDER3D;
    const renderer = new THREE.WebGLRenderer({ canvas: this.gl, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.three = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(new THREE.Color(R3.fogColor), R3.fogNear, R3.fogFar);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(R3.fov, 1, 0.5, 2000);
    this.camera.position.set(0, 3.2, 7.5);

    // sky dome (also used to bake the environment map for reflections)
    this.sky = this._makeSky();
    scene.add(this.sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(this._makeSky());
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();

    // lights: warm low sun ahead (long shadows) + cool fill from behind the camera so
    // the sides of the cars we actually see are lit
    scene.add(new THREE.HemisphereLight(0x8ea0d6, 0x2d3d22, 0.85));
    const fill = new THREE.DirectionalLight(0xe4ecff, 1.3);
    fill.position.set(-18, 22, 45);
    scene.add(fill);
    this.fill = fill;
    const sun = new THREE.DirectionalLight(0xffd2a0, 2.4);
    sun.position.set(40, 30, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.textures = this._makeTextures3D();
    this._buildTerrain();
    this._buildProps();
    this._buildMountains();

    this.playerCar = this._buildCar('#d81b3a', 'sport');
    scene.add(this.playerCar.group);
    this._buildHeadlights();
    this._tmp = { v: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), e: new THREE.Euler() };
  }

  resize() {
    super.resize();
    if (!this.three) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : 1.75);
    this.three.setPixelRatio(dpr);
    this.three.setSize(this.W, this.H, false);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
  }

  /* ---------- world mapping ---------- */
  curveM(dz, curve) {
    const t = U.clamp(dz / CONFIG.ROAD.viewRange, 0, 1);
    return curve * t * t * CONFIG.RENDER3D.curveAmount;
  }
  hillM(dz, hill) {
    const t = U.clamp(dz / CONFIG.ROAD.viewRange, 0, 1);
    return hill * t * t * CONFIG.RENDER3D.hillAmount;
  }
  yawAt(dz, curve) {
    const t = U.clamp(dz / CONFIG.ROAD.viewRange, 0, 1);
    const slope = (2 * curve * t * CONFIG.RENDER3D.curveAmount) / CONFIG.ROAD.viewRange; // dx/ddz
    return -Math.atan(slope);
  }
  place(obj, dz, x, game, yaw = 0, y = 0) {
    obj.position.set(x * this.RW + this.curveM(dz, game.curve), this.hillM(dz, game.hill) + y, -dz);
    obj.rotation.set(0, this.yawAt(dz, game.curve) + yaw, 0);
  }

  /* ---------- sky ---------- */
  _makeSky() {
    const P = CONFIG.PALETTE.sky;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(P[0]) },
        mid: { value: new THREE.Color(P[2]) },
        horizon: { value: new THREE.Color(P[4]) },
        sunDir: { value: new THREE.Vector3(0.45, 0.12, -0.88).normalize() },
        sunColor: { value: new THREE.Color(0xffd9a8) },
      },
      vertexShader: `varying vec3 vW; void main(){ vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top,mid,horizon,sunDir,sunColor; varying vec3 vW;
        void main(){ vec3 d=normalize(vW-cameraPosition); float h=clamp(d.y,0.,1.);
        vec3 c=mix(horizon,mid,smoothstep(0.,0.16,h)); c=mix(c,top,smoothstep(0.16,0.75,h));
        float s=max(dot(d,sunDir),0.); c+=sunColor*(pow(s,1200.)*4.+pow(s,10.)*0.45);
        if(d.y<0.) c=mix(horizon,vec3(0.16,0.24,0.14),clamp(-d.y*6.,0.,1.));
        gl_FragColor=vec4(c,1.); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    sky.frustumCulled = false;
    return sky;
  }

  /* ---------- textures ---------- */
  _canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = this.three.capabilities.getMaxAnisotropy();
    return t;
  }
  _speckle(ctx, w, h, base, specks) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (const [color, n, rmin, rmax] of specks) {
      ctx.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const r = U.rand(rmin, rmax);
        ctx.fillRect(Math.random() * w, Math.random() * h, r, r);
      }
    }
  }
  _makeTextures3D() {
    const R = CONFIG.ROAD;
    const lanes = CONFIG.LANES;
    // road texture covers the full asphalt width (u) and one dash period (v)
    const road = this._canvasTex(1024, 768, (ctx, w, h) => {
      this._speckle(ctx, w, h, '#3b3e45', [
        ['rgba(255,255,255,0.06)', 9000, 1, 3],
        ['rgba(0,0,0,0.25)', 8000, 1, 3.5],
        ['rgba(120,124,135,0.25)', 2500, 1, 2],
      ]);
      // tyre wear
      ctx.fillStyle = `rgba(0,0,0,${R.wearAlpha})`;
      for (let k = 0; k < lanes; k++) {
        const lc = ((k + 0.5) / lanes) * w;
        for (const off of [-0.045, 0.045]) ctx.fillRect(lc + off * w - w * 0.017, 0, w * 0.034, h);
      }
      // edge lines
      ctx.fillStyle = '#f2f2ec';
      const ew = w * 0.009;
      ctx.fillRect(((1 + R.edgeLine) / 2) * w - ew / 2, 0, ew, h);
      ctx.fillRect(((1 - R.edgeLine) / 2) * w - ew / 2, 0, ew, h);
      // lane dashes
      ctx.fillStyle = 'rgba(245,245,240,0.92)';
      for (let k = 1; k < lanes; k++) ctx.fillRect((k / lanes) * w - ew * 0.6, 0, ew * 1.2, (R.dashLen / R.dashPeriod) * h);
    });
    const gravel = this._canvasTex(256, 256, (ctx, w, h) => this._speckle(ctx, w, h, '#6f665c', [['rgba(255,255,255,0.14)', 1800, 1, 3], ['rgba(0,0,0,0.3)', 1600, 1, 3], ['rgba(150,120,90,0.35)', 600, 1, 2]]), 1, 4);
    const grass = this._canvasTex(256, 256, (ctx, w, h) => this._speckle(ctx, w, h, '#2f4d26', [['rgba(90,140,60,0.35)', 2400, 1, 3], ['rgba(0,0,0,0.3)', 1800, 1, 3], ['rgba(140,120,60,0.18)', 500, 1, 2]]), 12, 4);
    const stripes = this._canvasTex(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e63946';
      for (let x = -h; x < w + h; x += h * 1.6) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h * 0.8, 0);
        ctx.lineTo(x + h * 0.8 + h, h);
        ctx.lineTo(x + h, h);
        ctx.closePath();
        ctx.fill();
      }
    });
    const cone = this._canvasTex(64, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#ff9a2e');
      g.addColorStop(0.5, '#ff6a00');
      g.addColorStop(1, '#b84300');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f5f5f0';
      ctx.fillRect(0, h * 0.45, w, h * 0.16);
    });
    const checker = this._canvasTex(256, 32, (ctx, w, h) => {
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i & 1 ? '#f2f2ee' : '#15151a';
        ctx.fillRect((i / 16) * w, 0, w / 16, h);
      }
    });
    return { road, gravel, grass, stripes, cone, checker };
  }

  /* ---------- terrain ---------- */
  _ribbon(x0, x1, segs, texRepeatU, texLen, material) {
    const n = (segs + 1) * 2;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData = { x0, x1, segs, texRepeatU, texLen };
    return mesh;
  }
  _buildTerrain() {
    const R3 = CONFIG.RENDER3D;
    const R = CONFIG.ROAD;
    const T = this.textures;
    const segs = R3.roadSegments;
    const mk = (x0, x1, ru, len, mat) => {
      const m = this._ribbon(x0, x1, segs, ru, len, mat);
      this.scene.add(m);
      return m;
    };
    const roadMat = new THREE.MeshStandardMaterial({ map: T.road, roughness: 0.92, metalness: 0.0 });
    const gravelMat = new THREE.MeshStandardMaterial({ map: T.gravel, roughness: 1 });
    const grassMat = new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1 });
    this.ribbons = [
      mk(-1, 1, 1, R.dashPeriod, roadMat),
      mk(-R.shoulder, -1, 1, 8, gravelMat),
      mk(1, R.shoulder, 1, 8, gravelMat),
      mk(-9, -R.shoulder, 12, 24, grassMat),
      mk(R.shoulder, 9, 12, 24, grassMat),
    ];
    // guardrail: a thin vertical ribbon on each side (built as a normal ribbon, then lifted in update)
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb9bec8, metalness: 0.85, roughness: 0.35 });
    this.rails = [-1, 1].map((side) => {
      const m = this._ribbon(side * R.rail, side * R.rail, segs, 1, 1, railMat);
      m.userData.vertical = [0.5, 0.78];
      m.material.side = THREE.DoubleSide;
      m.castShadow = true;
      this.scene.add(m);
      return m;
    });
    // rail posts + lamp light pools + skid marks as instanced meshes
    const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12);
    postGeo.translate(0, 0.4, 0);
    this.posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.8 }), 2 * Math.ceil(R.viewRange / 8) + 8);
    this.posts.castShadow = true;
    this.scene.add(this.posts);
    const poolGeo = new THREE.CircleGeometry(5.5, 24);
    poolGeo.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }), 16);
    this.scene.add(this.pools);
    const skidGeo = new THREE.PlaneGeometry(0.3, 1);
    skidGeo.rotateX(-Math.PI / 2);
    this.skidMesh = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x0a0a0e, transparent: true, opacity: 0.55, depthWrite: false }), CONFIG.SKIDS.maxCount * 2);
    this.scene.add(this.skidMesh);
  }
  _updateRibbon(mesh, game) {
    const { x0, x1, segs, texRepeatU, texLen, vertical } = mesh.userData;
    const pos = mesh.geometry.attributes.position.array;
    const uv = mesh.geometry.attributes.uv.array;
    const start = -CONFIG.RENDER3D.roadBehind;
    const step = (CONFIG.ROAD.viewRange + CONFIG.RENDER3D.roadBehind) / segs;
    const pd = game.player.d;
    for (let i = 0; i <= segs; i++) {
      const dz = start + i * step;
      const cx = this.curveM(dz, game.curve);
      const y = this.hillM(dz, game.hill);
      const j = i * 2;
      if (vertical) {
        pos[j * 3] = x0 * this.RW + cx;
        pos[j * 3 + 1] = y + vertical[0];
        pos[j * 3 + 2] = -dz;
        pos[j * 3 + 3] = x1 * this.RW + cx;
        pos[j * 3 + 4] = y + vertical[1];
        pos[j * 3 + 5] = -dz;
      } else {
        pos[j * 3] = x0 * this.RW + cx;
        pos[j * 3 + 1] = y;
        pos[j * 3 + 2] = -dz;
        pos[j * 3 + 3] = x1 * this.RW + cx;
        pos[j * 3 + 4] = y;
        pos[j * 3 + 5] = -dz;
      }
      const v = (pd + dz) / texLen;
      uv[j * 2] = 0;
      uv[j * 2 + 1] = v;
      uv[j * 2 + 2] = texRepeatU;
      uv[j * 2 + 3] = v;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.uv.needsUpdate = true;
    if (!vertical) mesh.geometry.computeVertexNormals();
  }

  /* ---------- props ---------- */
  _buildProps() {
    const R3 = CONFIG.RENDER3D;
    const maxTrees = R3.maxTrees;
    // deciduous: trunk + canopy share the same instance matrices
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 8);
    trunk.translate(0, 1.2, 0);
    const canopy = new THREE.IcosahedronGeometry(2.2, 1);
    canopy.translate(0, 3.6, 0);
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6a34, roughness: 0.9, flatShading: true });
    this.trunks = new THREE.InstancedMesh(trunk, barkMat, maxTrees);
    this.canopies = new THREE.InstancedMesh(canopy, leafMat, maxTrees);
    // pines: trunk + stacked cone
    const pineTrunk = new THREE.CylinderGeometry(0.15, 0.22, 1.6, 8);
    pineTrunk.translate(0, 0.8, 0);
    const pine = new THREE.ConeGeometry(1.7, 5.2, 9);
    pine.translate(0, 3.9, 0);
    this.pineTrunks = new THREE.InstancedMesh(pineTrunk, barkMat, maxTrees);
    this.pines = new THREE.InstancedMesh(pine, new THREE.MeshStandardMaterial({ color: 0x1f4d2a, roughness: 0.95, flatShading: true }), maxTrees);
    for (const m of [this.trunks, this.canopies, this.pineTrunks, this.pines]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // lamp posts: pole + arm + head (emissive)
    const pole = new THREE.CylinderGeometry(0.09, 0.13, 8, 10);
    pole.translate(0, 4, 0);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.7, roughness: 0.4 });
    const maxLamps = Math.ceil(CONFIG.ROAD.viewRange / 48) + 3;
    this.poles = new THREE.InstancedMesh(pole, lampMat, maxLamps);
    const arm = new THREE.BoxGeometry(2.6, 0.12, 0.12);
    arm.translate(-1.3, 8, 0);
    this.arms = new THREE.InstancedMesh(arm, lampMat, maxLamps);
    const head = new THREE.BoxGeometry(0.7, 0.18, 0.32);
    head.translate(-2.5, 7.95, 0);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 2.5 }), maxLamps);
    for (const m of [this.poles, this.arms, this.heads]) {
      m.castShadow = m !== this.heads;
      this.scene.add(m);
    }
    // sign / billboard / overpass pools
    this.signPool = [0, 1, 2, 3].map(() => this._buildSign());
    this.boardPool = [0, 1, 2].map(() => this._buildBillboard());
    this.overpassPool = [0, 1].map(() => this._buildOverpass(false));
    this.gantry = this._buildOverpass(true);
    for (const m of [...this.signPool, ...this.boardPool, ...this.overpassPool, this.gantry]) {
      m.visible = false;
      this.scene.add(m);
    }
  }
  _textPlane(w, h, draw) {
    const tex = this._canvasTex(Math.round(w * 128), Math.round(h * 128), draw);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
  }
  _buildSign() {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6, roughness: 0.5 }));
    post.position.y = 1.3;
    post.castShadow = true;
    g.add(post);
    const panel = this._textPlane(1.6, 1.1, () => {});
    panel.position.y = 3.1;
    panel.rotation.y = Math.PI; // face the driver
    g.add(panel);
    g.userData.panel = panel;
    return g;
  }
  _paintSign(sign, variant, d, curve) {
    const key = `${variant}:${variant === 1 ? Math.round(d) : 0}:${variant === 2 ? Math.sign(curve) : 0}`;
    if (sign.userData.key === key) return;
    sign.userData.key = key;
    const tex = sign.userData.panel.material.map;
    const c = tex.image;
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (variant === 0) {
      ctx.fillStyle = '#f5f5f0';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.48, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = '#d62828';
      ctx.lineWidth = h * 0.1;
      ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.font = `700 ${h * 0.4}px Rajdhani, Inter, sans-serif`;
      ctx.fillText('120', w / 2, h / 2);
    } else if (variant === 1) {
      ctx.fillStyle = '#1b7a3d';
      ctx.fillRect(0, h * 0.15, w, h * 0.7);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, h * 0.15 + 4, w - 8, h * 0.7 - 8);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${h * 0.34}px Rajdhani, Inter, sans-serif`;
      ctx.fillText(`${(d / 1000).toFixed(1)} km`, w / 2, h / 2);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, h * 0.2, w, h * 0.6);
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = h * 0.08;
      const dir = curve >= 0 ? 1 : -1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + i * w * 0.28 - dir * w * 0.08, h * 0.3);
        ctx.lineTo(w / 2 + i * w * 0.28 + dir * w * 0.08, h * 0.5);
        ctx.lineTo(w / 2 + i * w * 0.28 - dir * w * 0.08, h * 0.7);
        ctx.stroke();
      }
    }
    tex.needsUpdate = true;
  }
  _buildBillboard() {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.8 });
    for (const x of [-2.6, 2.6]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6, 0.25), postMat);
      p.position.set(x, 3, 0);
      p.castShadow = true;
      g.add(p);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.8, 0.25), new THREE.MeshStandardMaterial({ color: 0x1c1e26, roughness: 0.7 }));
    frame.position.y = 7.6;
    frame.castShadow = true;
    g.add(frame);
    const face = this._textPlane(8, 3.4, () => {});
    face.position.set(0, 7.6, 0.15);
    face.rotation.y = Math.PI;
    face.material.emissive = new THREE.Color(0xffffff);
    face.material.emissiveMap = face.material.map;
    face.material.emissiveIntensity = 0.55;
    g.add(face);
    g.userData.face = face;
    return g;
  }
  _paintBillboard(board, variant) {
    if (board.userData.variant === variant) return;
    board.userData.variant = variant;
    const texts = [
      ['NEON RUSH', 'SEASON ONE', '#0fa3b1', '#062a30'],
      ['NITRO', 'FUEL THE RUSH', '#f9a825', '#3a2400'],
      ['● LIVE', 'RACE WITH CHAT', '#e63946', '#2a0a0e'],
      ['GARAGE', 'NEW BODY KITS', '#8338ec', '#1c0b33'],
    ][variant % 4];
    const tex = board.userData.face.material.map;
    const c = tex.image;
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, texts[3]);
    g.addColorStop(1, U.shade(texts[3], 30));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = texts[2];
    ctx.font = `700 ${h * 0.36}px Rajdhani, Inter, sans-serif`;
    ctx.fillText(texts[0], w / 2, h * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `600 ${h * 0.16}px Inter, sans-serif`;
    ctx.fillText(texts[1], w / 2, h * 0.72);
    tex.needsUpdate = true;
  }
  _buildOverpass(gantry) {
    const g = new THREE.Group();
    const RW = this.RW;
    const span = RW * (gantry ? 1.45 : 1.6);
    const h = gantry ? 6.5 : 6.8;
    const mat = new THREE.MeshStandardMaterial({ color: gantry ? 0x2b2f3a : 0x8e909a, roughness: 0.8 });
    for (const x of [-span, span]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(gantry ? 0.5 : 1.6, h, gantry ? 0.5 : 2), mat);
      pillar.position.set(x, h / 2, 0);
      pillar.castShadow = true;
      g.add(pillar);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 2, gantry ? 1.2 : 1.8, gantry ? 0.6 : 8), mat);
    deck.position.y = h + (gantry ? 0.6 : 0.9);
    deck.castShadow = true;
    g.add(deck);
    if (gantry) {
      const face = this._textPlane(span * 2, 1.1, (ctx, w, hh) => {
        ctx.fillStyle = '#15151a';
        ctx.fillRect(0, 0, w, hh);
        for (let i = 0; i < 24; i++) {
          ctx.fillStyle = i & 1 ? '#f2f2ee' : '#15151a';
          ctx.fillRect((i / 24) * w, 0, w / 24, hh * 0.18);
        }
        ctx.fillStyle = '#f2f2ee';
        ctx.font = `700 ${hh * 0.6}px Rajdhani, Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FINISH', w / 2, hh * 0.58);
      });
      face.position.set(0, h + 0.6, 0.35);
      face.rotation.y = Math.PI;
      g.add(face);
      // chequered strip on the road
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, 3), new THREE.MeshStandardMaterial({ map: this.textures.checker, roughness: 0.9 }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.y = 0.02;
      g.add(strip);
    } else {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 2, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: 0xb9bcc5, roughness: 0.6 }));
      rail.position.set(0, h + 2.2, 3.9);
      g.add(rail);
      const rail2 = rail.clone();
      rail2.position.z = -3.9;
      g.add(rail2);
    }
    return g;
  }
  _buildMountains() {
    const g = new THREE.Group();
    const H = U.hash;
    // two overlapping ridges of wide, low, irregular cones read as distant hills
    for (const [count, rBase, tint, scale] of [[26, 620, 0x2f3a5c, 1], [18, 480, 0x3a4770, 0.8]]) {
      const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 1, flatShading: true });
      for (let i = 0; i < count; i++) {
        const a = -1.05 + (i / (count - 1)) * 2.1 + (H(i + 31) - 0.5) * 0.08; // arc across the forward horizon
        const r = rBase + H(i + 2) * 120;
        const radius = (160 + H(i) * 140) * scale;
        const height = (38 + H(i + 9) * 60) * scale;
        const m = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7 + Math.floor(H(i + 5) * 4)), mat);
        m.position.set(Math.sin(a) * r, -6, -Math.cos(a) * r);
        m.rotation.y = H(i + 4) * 3;
        m.scale.x = 0.8 + H(i + 7) * 0.7;
        g.add(m);
      }
    }
    this.mountains = g;
    this.scene.add(g);
  }

  /* ---------- cars ---------- */
  _carMaterials(color) {
    return {
      paint: new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.75, roughness: 0.28, envMapIntensity: 1.3 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x0b1424, metalness: 0.9, roughness: 0.12, envMapIntensity: 1.6 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x15161c, metalness: 0.4, roughness: 0.6 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f13, roughness: 0.95 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xd8dbe2, metalness: 0.95, roughness: 0.25 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xcfd3da, metalness: 1, roughness: 0.2 }),
      tail: new THREE.MeshStandardMaterial({ color: 0x3a0008, emissive: 0xff2030, emissiveIntensity: 1.2 }),
      head: new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c8, emissiveIntensity: 1.6 }),
      plate: new THREE.MeshStandardMaterial({ color: 0xe9ecf5, roughness: 0.6 }),
    };
  }
  /* Body silhouettes are side profiles (x = length, y = height) extruded across the width. */
  _bodyShape(S) {
    const s = new THREE.Shape();
    const L = 2.3 * S.length;
    s.moveTo(-L, 0.32);
    s.lineTo(-L, 0.72 * S.height);
    s.quadraticCurveTo(-L + 0.3, 0.9 * S.height, -L + 0.7, 0.92 * S.height);
    s.lineTo(L - 1.1, 0.9 * S.height);
    s.quadraticCurveTo(L - 0.3, 0.86 * S.height, L, 0.68 * S.height);
    s.lineTo(L + 0.05, 0.32);
    s.lineTo(L - 0.35, 0.26);
    s.lineTo(-L + 0.35, 0.26);
    s.closePath();
    return s;
  }
  _cabinShape(S) {
    const s = new THREE.Shape();
    const back = -2.3 * S.length + 0.75 + S.cabinShift;
    const front = 1.25 + S.cabinShift;
    const top = 1.32 * S.height;
    s.moveTo(back, 0.88 * S.height);
    s.quadraticCurveTo(back + 0.45, top - 0.02, back + 1.05, top);
    s.lineTo(front - 0.85, top);
    s.quadraticCurveTo(front - 0.35, top - 0.06, front, 0.88 * S.height);
    s.closePath();
    return s;
  }
  _buildCar(color, style, stripe = null) {
    const C = CONFIG.CARS[style] || CONFIG.CARS.sport;
    const S = { length: 1.0, height: C.height || 1, width: (C.width || 1) * 1.95, cabinShift: style === 'muscle' ? -0.2 : 0 };
    const M = this._carMaterials(color);
    const inner = new THREE.Group();
    const extrude = (shape, depth, bevel) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 10 });
      g.translate(0, 0, -depth / 2);
      return g;
    };
    const body = new THREE.Mesh(extrude(this._bodyShape(S), S.width - 0.2, 0.1), M.paint);
    body.castShadow = true;
    body.receiveShadow = true;
    inner.add(body);
    const cabin = new THREE.Mesh(extrude(this._cabinShape(S), S.width * 0.78, 0.06), M.glass);
    cabin.castShadow = true;
    inner.add(cabin);
    // roof panel in paint over the glass
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, S.width * 0.7), M.paint);
    roof.position.set(0.05 + S.cabinShift, 1.33 * S.height, 0);
    inner.add(roof);
    if (stripe) {
      const sm = new THREE.MeshStandardMaterial({ color: new THREE.Color(stripe), roughness: 0.5 });
      for (const z of [-0.22, 0.18]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.02, 0.16), sm);
        st.position.set(0, 0.93 * S.height, z);
        inner.add(st);
        const st2 = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.02, 0.16), sm);
        st2.position.set(0.05 + S.cabinShift, 1.36 * S.height, z);
        inner.add(st2);
      }
    }
    // wheels
    const wheels = [];
    const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 24);
    tyre.rotateX(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 12);
    rim.rotateX(Math.PI / 2);
    for (const [x, z] of [[1.45, S.width / 2 - 0.02], [1.45, -S.width / 2 + 0.02], [-1.45, S.width / 2 - 0.02], [-1.45, -S.width / 2 + 0.02]]) {
      const w = new THREE.Group();
      const t = new THREE.Mesh(tyre, M.rubber);
      t.castShadow = true;
      w.add(t);
      w.add(new THREE.Mesh(rim, M.rim));
      w.position.set(x, 0.34, z);
      inner.add(w);
      wheels.push(w);
    }
    // lights
    const tailW = C.lights === 'bar' ? S.width - 0.5 : 0.35;
    if (C.lights === 'bar') {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, tailW), M.tail);
      t.position.set(-2.32 * S.length, 0.72 * S.height, 0);
      inner.add(t);
    } else {
      for (const z of [-0.65, 0.65]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, tailW), M.tail);
        t.position.set(-2.32 * S.length, 0.72 * S.height, z);
        inner.add(t);
      }
    }
    for (const z of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.42), M.head);
      hl.position.set(2.3 * S.length, 0.62 * S.height, z);
      inner.add(hl);
    }
    // grille, plate, mirrors, exhausts, spoiler
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.9), M.trim);
    grille.position.set(2.33 * S.length, 0.44, 0);
    inner.add(grille);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.44), M.plate);
    plate.position.set(-2.33 * S.length, 0.5, 0);
    inner.add(plate);
    for (const z of [-1, 1]) {
      const mr = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), M.paint);
      mr.position.set(0.95 + S.cabinShift, 1.0 * S.height, z * (S.width / 2 + 0.08));
      inner.add(mr);
    }
    const exZ = C.exhaust === 'center' ? [-0.16, 0.16] : [-(S.width / 2 - 0.35), S.width / 2 - 0.35];
    for (const z of exZ) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), M.chrome);
      ex.rotation.z = Math.PI / 2;
      ex.position.set(-2.35 * S.length, 0.3, z);
      inner.add(ex);
    }
    if (C.spoiler === 'wing') {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, S.width - 0.1), M.trim);
      wing.position.set(-2.0 * S.length, 1.1 * S.height, 0);
      wing.castShadow = true;
      inner.add(wing);
      for (const z of [-0.6, 0.6]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.06), M.trim);
        st.position.set(-2.05 * S.length, 0.99 * S.height, z);
        inner.add(st);
      }
    } else if (C.spoiler === 'duck') {
      const duck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, S.width - 0.4), M.paint);
      duck.position.set(-2.15 * S.length, 0.96 * S.height, 0);
      inner.add(duck);
    } else if (C.spoiler === 'lip') {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, S.width - 0.5), M.trim);
      lip.position.set(-2.2 * S.length, 0.94 * S.height, 0);
      inner.add(lip);
    }
    // nitro flames (hidden until boosting)
    const flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x6fd6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const z of exZ) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 10), flameMat);
      f.rotation.z = Math.PI / 2;
      f.position.set(-3.0 * S.length, 0.3, z);
      f.visible = false;
      inner.add(f);
      flames.push(f);
    }
    inner.rotation.y = Math.PI / 2; // profile +x becomes world -z (forward)
    const group = new THREE.Group();
    group.add(inner);
    return { group, inner, wheels, materials: M, flames, style, color };
  }
  _buildTruck(color) {
    const M = this._carMaterials(color);
    const inner = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 2.3), M.paint);
    cab.position.set(3.2, 1.65, 0);
    cab.castShadow = true;
    inner.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 2.0), M.glass);
    glass.position.set(4.36, 2.1, 0);
    inner.add(glass);
    const box = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.9, 2.45), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35), roughness: 0.7, metalness: 0.2 }));
    box.position.set(-1.1, 2.0, 0);
    box.castShadow = true;
    inner.add(box);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.4, 2.0), M.trim);
    chassis.position.set(0.3, 0.55, 0);
    inner.add(chassis);
    const tyre = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 18);
    tyre.rotateX(Math.PI / 2);
    const wheels = [];
    for (const x of [3.3, -1.0, -2.4]) {
      for (const z of [-1.05, 1.05]) {
        const w = new THREE.Mesh(tyre, M.rubber);
        w.position.set(x, 0.5, z);
        w.castShadow = true;
        inner.add(w);
        wheels.push(w);
      }
    }
    for (const z of [-0.9, 0.9]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.4), M.tail);
      t.position.set(-4.2, 0.9, z);
      inner.add(t);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.4), M.head);
      h.position.set(4.37, 1.0, z);
      inner.add(h);
    }
    inner.rotation.y = Math.PI / 2;
    const group = new THREE.Group();
    group.add(inner);
    return { group, inner, wheels, materials: M, flames: [] };
  }
  _buildHeadlights() {
    this.headlights = [];
    for (const x of [-0.6, 0.6]) {
      const l = new THREE.SpotLight(0xfff0d0, 0, 70, 0.42, 0.6, 1.2);
      l.position.set(x, 0.7, -2.2);
      l.target.position.set(x * 2, -0.5, -40);
      this.playerCar.group.add(l);
      this.playerCar.group.add(l.target);
      this.headlights.push(l);
    }
  }

  /* ---------- obstacle & pickup meshes ---------- */
  _makeEntityMesh(kind, e) {
    const T = this.textures;
    if (kind === 'rival') return this._buildCar(e.color, e.style, e.stripe);
    if (kind === 'obstacle') {
      switch (e.type) {
        case 'car':
          return this._buildCar(e.color, e.style || 'sport');
        case 'truck':
          return this._buildTruck(e.color);
        case 'cone': {
          const g = new THREE.Group();
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 18), new THREE.MeshStandardMaterial({ map: T.cone, roughness: 0.7 }));
          cone.position.y = 0.42;
          cone.castShadow = true;
          g.add(cone);
          const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
          base.position.y = 0.03;
          g.add(base);
          return { group: g };
        }
        case 'barrier': {
          const g = new THREE.Group();
          const board = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 0.16), new THREE.MeshStandardMaterial({ map: T.stripes, roughness: 0.7 }));
          board.position.y = 0.85;
          board.castShadow = true;
          g.add(board);
          for (const x of [-1.2, 1.2]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a3d44 }));
            leg.position.set(x, 0.3, 0);
            g.add(leg);
          }
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x553f00, emissive: 0xffcc33, emissiveIntensity: 2 }));
          lamp.position.y = 1.3;
          g.add(lamp);
          g.userData.lamp = lamp;
          return { group: g };
        }
        case 'rock': {
          const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: 0x6b6f7a, roughness: 0.95, flatShading: true }));
          m.position.y = 0.4;
          m.castShadow = true;
          const g = new THREE.Group();
          g.add(m);
          return { group: g };
        }
        case 'oil': {
          const m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), new THREE.MeshStandardMaterial({ color: 0x0a0a10, metalness: 0.9, roughness: 0.15 }));
          m.rotation.x = -Math.PI / 2;
          m.position.y = 0.015;
          const g = new THREE.Group();
          g.add(m);
          return { group: g };
        }
        case 'puddle': {
          const m = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshStandardMaterial({ color: 0x3c5170, metalness: 1, roughness: 0.05, transparent: true, opacity: 0.85 }));
          m.rotation.x = -Math.PI / 2;
          m.position.y = 0.015;
          const g = new THREE.Group();
          g.add(m);
          return { group: g };
        }
      }
    }
    if (kind === 'pickup') {
      const g = new THREE.Group();
      let m;
      if (e.type === 'coin') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0xffc107, metalness: 1, roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.6 }));
        m.rotation.x = Math.PI / 2;
      } else if (e.type === 'nitro') {
        m = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 14), new THREE.MeshStandardMaterial({ color: 0x00c8e0, metalness: 0.6, roughness: 0.3, emissive: 0x00a0c0, emissiveIntensity: 0.9 }));
      } else {
        m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0x8ea6ff, metalness: 0.4, roughness: 0.3, emissive: 0x4b4bff, emissiveIntensity: 0.8, flatShading: true }));
      }
      m.position.y = 0.9;
      m.castShadow = true;
      g.add(m);
      g.userData.spin = m;
      return { group: g };
    }
    return null;
  }
  _syncEntities(game) {
    const alive = new Set();
    const want = [];
    for (const r of game.rivals) want.push(['rival', r]);
    for (const o of game.obstacles) want.push(['obstacle', o]);
    for (const k of game.pickups) if (!k.taken) want.push(['pickup', k]);
    for (const [kind, e] of want) {
      alive.add(e);
      let rec = this.entityMeshes.get(e);
      if (!rec) {
        rec = this._makeEntityMesh(kind, e);
        if (!rec) continue;
        rec.kind = kind;
        this.entityMeshes.set(e, rec);
        this.scene.add(rec.group);
      }
      const dz = e.d - game.player.d;
      const visible = dz > -CONFIG.RENDER3D.roadBehind && dz < CONFIG.ROAD.viewRange;
      rec.group.visible = visible;
      if (!visible) continue;
      if (kind === 'rival') {
        const lat = (e.x - (e._px ?? e.x)) * this.RW;
        e._px = e.x;
        const yaw = -Math.atan2(lat, Math.max(e.speed, 8) * 0.016);
        this.place(rec.group, dz, e.x, game, yaw);
        this._animateCar(rec, e.speed, game.dt, e.braking, false);
      } else if (kind === 'obstacle') {
        let yaw = 0;
        let y = 0;
        if (e.hit && e.hitAt && e.knockable) {
          const k = U.clamp((game.time - e.hitAt) / 0.7, 0, 1);
          y = Math.sin(k * Math.PI) * 1.2;
          yaw = e.hitDir * k * 3;
          this.place(rec.group, dz, e.x + e.hitDir * 0.35 * k, game, yaw, y);
          rec.group.rotation.z = e.hitDir * k * 2.5;
        } else this.place(rec.group, dz, e.x, game, 0, 0);
        if (rec.wheels) this._animateCar(rec, e.speed || 0, game.dt, false, false);
        if (rec.group.userData.lamp) rec.group.userData.lamp.material.emissiveIntensity = Math.floor(game.time * 3 + e.seed * 10) % 2 ? 2.2 : 0.2;
      } else {
        const bob = Math.sin(game.time * 4 + e.phase) * 0.12;
        this.place(rec.group, dz, e.x, game, 0, bob);
        rec.group.userData.spin.rotation.y = game.time * 2.5 + e.phase;
        if (e.type === 'coin') rec.group.userData.spin.rotation.x = Math.PI / 2;
        if (e.type === 'coin') rec.group.userData.spin.rotation.z = game.time * 2.5 + e.phase;
      }
    }
    for (const [e, rec] of this.entityMeshes) {
      if (!alive.has(e)) {
        this.scene.remove(rec.group);
        this.entityMeshes.delete(e);
      }
    }
  }
  _animateCar(rec, speed, dt, braking, nitro) {
    const spin = (speed * dt) / 0.34;
    for (const w of rec.wheels) w.rotation.z -= spin;
    if (rec.materials) rec.materials.tail.emissiveIntensity = braking ? 3.2 : 1.1;
    for (const f of rec.flames) {
      f.visible = nitro;
      if (nitro) f.scale.set(1, U.rand(0.7, 1.4), 1);
    }
  }

  /* ---------- props per frame ---------- */
  _updateProps(game) {
    const M = this._tmp.m;
    const Q = this._tmp.q;
    const V = this._tmp.v;
    const S = this._tmp.s;
    const E = this._tmp.e;
    const setInst = (mesh, i, dz, x, yaw, scale, y = 0) => {
      V.set(x * this.RW + this.curveM(dz, game.curve), this.hillM(dz, game.hill) + y, -dz);
      E.set(0, this.yawAt(dz, game.curve) + yaw, 0);
      Q.setFromEuler(E);
      S.set(scale, scale, scale);
      M.compose(V, Q, S);
      mesh.setMatrixAt(i, M);
    };
    let nTree = 0, nPine = 0, nLamp = 0, nSign = 0, nBoard = 0, nOver = 0, nPool = 0;
    for (const m of [...this.signPool, ...this.boardPool, ...this.overpassPool, this.gantry]) m.visible = false;
    for (const pr of this.props(game)) {
      const dz = pr.d - game.player.d;
      if (dz < -CONFIG.RENDER3D.roadBehind) continue;
      switch (pr.kind) {
        case 'tree':
          if (pr.pine) {
            if (nPine < this.pines.count) {
              setInst(this.pineTrunks, nPine, dz, pr.x, 0, pr.size * 1.3);
              setInst(this.pines, nPine, dz, pr.x, 0, pr.size * 1.3);
              nPine++;
            }
          } else if (nTree < this.trunks.count) {
            setInst(this.trunks, nTree, dz, pr.x, 0, pr.size * 1.2);
            setInst(this.canopies, nTree, dz, pr.x, 0, pr.size * 1.2);
            nTree++;
          }
          break;
        case 'lamp':
          if (nLamp < this.poles.count) {
            const yaw = pr.side > 0 ? 0 : Math.PI; // arm reaches toward the road
            setInst(this.poles, nLamp, dz, pr.x, yaw, 1);
            setInst(this.arms, nLamp, dz, pr.x, yaw, 1);
            setInst(this.heads, nLamp, dz, pr.x, yaw, 1);
            setInst(this.pools, nPool++, dz, pr.side * 0.55, 0, 1, 0.02);
            nLamp++;
          }
          break;
        case 'sign':
          if (nSign < this.signPool.length) {
            const s = this.signPool[nSign++];
            this._paintSign(s, pr.variant, pr.d, game.curve);
            this.place(s, dz, pr.x, game);
            s.visible = true;
          }
          break;
        case 'billboard':
          if (nBoard < this.boardPool.length) {
            const b = this.boardPool[nBoard++];
            this._paintBillboard(b, pr.variant);
            this.place(b, dz, pr.x, game, pr.side > 0 ? -0.35 : 0.35);
            b.visible = true;
          }
          break;
        case 'overpass':
          if (nOver < this.overpassPool.length) {
            const o = this.overpassPool[nOver++];
            this.place(o, dz, 0, game);
            o.visible = true;
          }
          break;
        case 'gantry':
          this.place(this.gantry, dz, 0, game);
          this.gantry.visible = true;
          break;
      }
    }
    for (const [mesh, n] of [[this.trunks, nTree], [this.canopies, nTree], [this.pineTrunks, nPine], [this.pines, nPine], [this.poles, nLamp], [this.arms, nLamp], [this.heads, nLamp], [this.pools, nPool]]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    // guardrail posts every 8 m
    let nPost = 0;
    const start = Math.floor((game.player.d - CONFIG.RENDER3D.roadBehind) / 8) * 8;
    for (let d = start; d < game.player.d + CONFIG.ROAD.viewRange && nPost < this.posts.count - 1; d += 8) {
      const dz = d - game.player.d;
      setInst(this.posts, nPost++, dz, -CONFIG.ROAD.rail, 0, 1);
      setInst(this.posts, nPost++, dz, CONFIG.ROAD.rail, 0, 1);
    }
    this.posts.count = nPost;
    this.posts.instanceMatrix.needsUpdate = true;
    // skid marks
    let nSkid = 0;
    for (const sk of game.skids || []) {
      const dz = sk.d - game.player.d;
      for (const off of [-0.08, 0.08]) {
        if (nSkid >= this.skidMesh.count) break;
        V.set((sk.x + off) * this.RW + this.curveM(dz + sk.length / 2, game.curve), this.hillM(dz, game.hill) + 0.012, -(dz + sk.length / 2));
        E.set(0, this.yawAt(dz, game.curve), 0);
        Q.setFromEuler(E);
        S.set(1, 1, sk.length);
        M.compose(V, Q, S);
        this.skidMesh.setMatrixAt(nSkid++, M);
      }
    }
    this.skidMesh.count = nSkid;
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- frame ---------- */
  render(game) {
    const p = game.player;
    const R3 = CONFIG.RENDER3D;
    game.dt = game.dt || 1 / 60;

    // player car
    if (this.playerCar.color !== p.color || this.playerCar.style !== p.style) {
      this.scene.remove(this.playerCar.group);
      this.playerCar = this._buildCar(p.color, p.style);
      this.scene.add(this.playerCar.group);
      this._buildHeadlights();
    }
    const yaw = -Math.atan2(p.vx * this.RW, Math.max(p.speed, 6));
    this.playerCar.group.position.set(p.x * this.RW, 0, 0);
    this.playerCar.group.rotation.set(p.slide > 0 ? 0 : 0, yaw + (p.slide > 0 ? Math.sin(game.time * 18) * 0.12 : 0), -p.vx * 0.05);
    this.playerCar.group.visible = !(p.invuln > 0 && Math.floor(game.time * 14) % 2 === 0);
    this._animateCar(this.playerCar, p.speed, game.dt, game.input.brake && game.state === 'playing', p.nitroActive);
    for (const l of this.headlights) l.intensity = game.state === 'menu' ? 0 : 60;

    // world
    for (const r of this.ribbons) this._updateRibbon(r, game);
    for (const r of this.rails) this._updateRibbon(r, game);
    this._updateProps(game);
    this._syncEntities(game);
    this.mountains.rotation.y = -game.curve * 0.12;
    this.sky.position.copy(this.camera.position);
    this.sun.position.set(40 + this.camera.position.x, 30, this.camera.position.z + 25);
    this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z - 30);
    this.three.shadowMap.enabled = this.quality !== 'low';

    // camera: chase with lateral lag, curve anticipation, speed FOV, shake
    const speedFrac = U.clamp(p.speed / (CONFIG.PLAYER.maxSpeed * CONFIG.PLAYER.nitroMult), 0, 1);
    const targetFov = R3.fov + speedFrac * 8 + (p.nitroActive ? 6 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * 0.08;
    this.camera.updateProjectionMatrix();
    const cx = p.x * this.RW * 0.45;
    const cy = 3.1 + speedFrac * 0.3;
    const shake = (game.shakeEnabled === false ? 0 : game.shake) * 0.35;
    this.camera.position.set(cx + U.rand(-1, 1) * shake, cy + U.rand(-1, 1) * shake * 0.6, 7.6);
    const look = this._tmp.v.set(p.x * this.RW * 0.25 + this.curveM(30, game.curve) * 0.5, 1.1 + this.hillM(30, game.hill) * 0.6, -30);
    this.camera.lookAt(look);

    this.three.render(this.scene, this.camera);

    // 2D overlay: particles + flash + vignette
    this._measureScreen();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawParticles(game);
    this.drawPost(game);
  }
  _measureScreen() {
    const v = this._tmp.v;
    const proj = (x, y, z) => {
      v.set(x, y, z).project(this.camera);
      return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H };
    };
    const a = proj(-CONFIG.RENDER3D.laneWidth / 2, 0, 0);
    const b = proj(CONFIG.RENDER3D.laneWidth / 2, 0, 0);
    this.laneW = Math.max(40, Math.abs(b.x - a.x));
    const ps = proj(this.playerCar.group.position.x, 0.4, 0);
    this._playerPx = ps;
    this.playerY = ps.y;
  }
  playerScreen() {
    return this._playerPx || { x: this.W / 2, y: this.H * 0.85 };
  }
  drawPost(game) {
    const ctx = this.ctx;
    const { W, H } = this;
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.45, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,5,12,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    if (game.flash > 0.01) {
      ctx.fillStyle = `rgba(255,30,60,${0.35 * game.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (game.player.nitroActive) {
      // speed streaks from the edges
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + game.time * 0.7;
        const r0 = Math.max(W, H) * U.rand(0.45, 0.55);
        const r1 = r0 + U.rand(40, 120);
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(ang) * r0, H / 2 + Math.sin(ang) * r0);
        ctx.lineTo(W / 2 + Math.cos(ang) * r1, H / 2 + Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ---------- garage turntable ---------- */
  static showcase(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 100);
    camera.position.set(6.5, 2.6, 6.5);
    camera.lookAt(0, 0.6, 0);
    const helper = Object.create(Renderer3D.prototype);
    helper.three = renderer;
    helper.RW = 7;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(helper._makeSky());
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0x8fa3d9, 0x2a2a30, 1.1));
    const front = new THREE.DirectionalLight(0xffffff, 1.4);
    front.position.set(6, 4, 8);
    scene.add(front);
    const key = new THREE.DirectionalLight(0xffe2c0, 2.6);
    key.position.set(5, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x21c7d6, 1.2);
    rim.position.set(-6, 3, -6);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48), new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.35, metalness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    let car = null;
    const api = {
      setCar(color, style) {
        if (car) scene.remove(car.group);
        car = helper._buildCar(color, style);
        scene.add(car.group);
      },
      render(t) {
        const w = canvas.clientWidth || 360;
        const h = canvas.clientHeight || 240;
        if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
        if (car) car.group.rotation.y = t / 2600;
        renderer.render(scene, camera);
      },
    };
    return api;
  }
}
