import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const API = "http://127.0.0.1:8000";
const GLOW = 0xff8a2a;

const canvas = document.querySelector("#c");
const sepSlider = document.querySelector("#sep");
const wallsToggle = document.querySelector("#wallsToggle");

const chatEl = document.querySelector("#chat");
const msgEl = document.querySelector("#msg");
const sendBtn = document.querySelector("#send");
const listEl = document.querySelector("#list");

const selectedEmpty = document.querySelector("#selectedEmpty");
const selectedCard = document.querySelector("#selectedCard");
const acName = document.querySelector("#acName");
const acMeta = document.querySelector("#acMeta");
const acStatus = document.querySelector("#acStatus");
const acCurrent = document.querySelector("#acCurrent");
const acSet = document.querySelector("#acSet");
const acMode = document.querySelector("#acMode");
const acHealth = document.querySelector("#acHealth");
const acService = document.querySelector("#acService");

let state = [];
let selectedId = null;

// ------------------------------------------------------------
// Renderer / Scene / Camera (opaque, stable)
// ------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xeef3ff, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef3ff);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 250);
camera.position.set(14, 10, 18);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 3.4, 0);

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe7ff, 0.95));

const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.position.set(22, 28, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(sun);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0xf2f5ff, roughness: 1.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------
// Corporate building model (bigger)
// ------------------------------------------------------------
const BUILD_W = 10.5;
const BUILD_D = 7.2;
const BUILD_H = 7.0;
const BUILD_CENTER = new THREE.Vector3(0, 4.2, 0);

const buildingGroup = new THREE.Group();
scene.add(buildingGroup);

const floorsGroup = new THREE.Group();
buildingGroup.add(floorsGroup);

// Plinth
const plinth = new THREE.Mesh(
  new THREE.BoxGeometry(BUILD_W + 10, 0.35, BUILD_D + 10),
  new THREE.MeshStandardMaterial({ color: 0xe9eefc, roughness: 0.95 })
);
plinth.position.set(0, 0.18, 0);
plinth.receiveShadow = true;
scene.add(plinth);

// Frame
const frame = new THREE.Mesh(
  new THREE.BoxGeometry(BUILD_W + 0.22, BUILD_H + 0.22, BUILD_D + 0.22),
  new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.96, metalness: 0.06 })
);
frame.position.copy(BUILD_CENTER);
frame.castShadow = true;
frame.receiveShadow = true;
buildingGroup.add(frame);

// Glass walls + roof (for toggle + cutaway)
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xaecbff,
  transmission: 0.92,
  roughness: 0.06,
  thickness: 0.8,
  transparent: true,
  opacity: 0.28,
  ior: 1.45,
  reflectivity: 0.75,
});

const glassWalls = { front: null, back: null, left: null, right: null };
let glassRoof = null;

function glassWall(name, w, h, pos, rotY) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat.clone());
  wall.position.copy(pos);
  wall.rotation.y = rotY;
  buildingGroup.add(wall);
  glassWalls[name] = wall;
}

const gw = BUILD_W - 0.55;
const gh = BUILD_H - 0.55;
const gz = BUILD_D / 2 - 0.22;
const gx = BUILD_W / 2 - 0.22;

glassWall("front", gw, gh, new THREE.Vector3(0, BUILD_CENTER.y, gz), 0);
glassWall("back",  gw, gh, new THREE.Vector3(0, BUILD_CENTER.y, -gz), Math.PI);
glassWall("right", BUILD_D - 0.55, gh, new THREE.Vector3(gx, BUILD_CENTER.y, 0), -Math.PI / 2);
glassWall("left",  BUILD_D - 0.55, gh, new THREE.Vector3(-gx, BUILD_CENTER.y, 0), Math.PI / 2);

glassRoof = new THREE.Mesh(new THREE.PlaneGeometry(gw, BUILD_D - 0.55), glassMat.clone());
glassRoof.position.set(0, BUILD_CENTER.y + gh / 2, 0);
glassRoof.rotation.x = -Math.PI / 2;
buildingGroup.add(glassRoof);

// Door
const door = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 2.1, 0.08),
  new THREE.MeshStandardMaterial({ color: 0x121826, roughness: 0.7 })
);
door.position.set(0, 1.25, BUILD_D / 2 + 0.12);
door.castShadow = true;
buildingGroup.add(door);

// Canopy
const canopy = new THREE.Mesh(
  new THREE.BoxGeometry(4.2, 0.14, 1.8),
  new THREE.MeshStandardMaterial({ color: 0xdfe6fb, roughness: 0.55 })
);
canopy.position.set(0, 2.5, BUILD_D / 2 + 1.35);
canopy.castShadow = true;
buildingGroup.add(canopy);

// Stairs
const stepMat = new THREE.MeshStandardMaterial({ color: 0xcfd8f5, roughness: 0.85 });
for (let i = 0; i < 7; i++) {
  const step = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.12, 0.55), stepMat);
  step.position.set(0, 0.08 + i * 0.12, BUILD_D / 2 + 0.55 + i * 0.55);
  step.castShadow = true;
  step.receiveShadow = true;
  buildingGroup.add(step);
}

// Floors
function makeFloor(y, color) {
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(9.5, 0.45, 6.6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  slab.position.set(0, y, 0);
  slab.castShadow = true;
  slab.receiveShadow = true;
  floorsGroup.add(slab);
  return slab;
}
const floor1 = makeFloor(1.4, 0x2a3c74);
const floor2 = makeFloor(3.7, 0x253664);
const floor3 = makeFloor(6.0, 0x1f2f58);

const floorBaseY = { 1: 1.4, 2: 3.7, 3: 6.0 };
let sepTarget = 0;
let sepCurrent = 0;
sepSlider?.addEventListener("input", () => (sepTarget = Number(sepSlider.value)));

// ------------------------------------------------------------
// Walls toggle state
// ------------------------------------------------------------
let wallsOn = true;

function applyWallsVisibility(on) {
  wallsOn = on;

  // Show/hide walls + roof
  for (const w of Object.values(glassWalls)) w.visible = on;
  if (glassRoof) glassRoof.visible = on;
}

wallsToggle?.addEventListener("change", () => {
  applyWallsVisibility(!!wallsToggle.checked);
});

// default ON
applyWallsVisibility(true);

// ------------------------------------------------------------
// Smart cutaway fade (only when walls are ON)
// ------------------------------------------------------------
function updateCutawayFade() {
  if (!wallsOn) return;

  const v = new THREE.Vector3().subVectors(camera.position, BUILD_CENTER);
  const ax = Math.abs(v.x);
  const az = Math.abs(v.z);

  const base = 0.28;
  const faded = 0.06;

  // reset visibility & opacity
  for (const w of Object.values(glassWalls)) {
    w.visible = true;
    w.material.opacity = base;
  }

  // fade the wall facing camera
  if (ax > az) {
    if (v.x > 0) glassWalls.right.material.opacity = faded;
    else        glassWalls.left.material.opacity  = faded;
  } else {
    if (v.z > 0) glassWalls.front.material.opacity = faded;
    else        glassWalls.back.material.opacity  = faded;
  }
}

// ------------------------------------------------------------
// CSS2D labels renderer
// ------------------------------------------------------------
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.left = "0";
labelRenderer.domElement.style.pointerEvents = "none";
document.querySelector("#canvasWrap").appendChild(labelRenderer.domElement);

function makeLabel(text) {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.padding = "4px 8px";
  div.style.borderRadius = "999px";
  div.style.fontSize = "11px";
  div.style.color = "#121827";
  div.style.background = "rgba(255,255,255,0.92)";
  div.style.border = "1px solid rgba(18,24,39,0.14)";
  div.style.boxShadow = "0 10px 24px rgba(18,24,39,0.12)";
  div.style.whiteSpace = "nowrap";
  return div;
}

// Tooltip
const tip = document.createElement("div");
tip.style.position = "absolute";
tip.style.padding = "7px 10px";
tip.style.borderRadius = "10px";
tip.style.background = "rgba(255,255,255,0.96)";
tip.style.border = "1px solid rgba(18,24,39,0.14)";
tip.style.color = "#121827";
tip.style.fontSize = "12px";
tip.style.pointerEvents = "none";
tip.style.display = "none";
tip.style.boxShadow = "0 12px 30px rgba(18,24,39,0.14)";
document.querySelector("#canvasWrap").appendChild(tip);

// ------------------------------------------------------------
// AC unit model
// ------------------------------------------------------------
function makeACUnitModel(ac_id) {
  const g = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.46, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xf2f5ff, roughness: 0.35, metalness: 0.05 })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.36, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xd9e2ff, roughness: 0.4 })
  );
  panel.position.z = 0.225;
  panel.castShadow = true;
  g.add(panel);

  const slatMat = new THREE.MeshStandardMaterial({ color: 0xb8c6ef, roughness: 0.6 });
  for (let i = 0; i < 7; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.02, 0.02), slatMat);
    slat.position.set(0, -0.11 + i * 0.033, 0.245);
    g.add(slat);
  }

  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 12, 12),
    new THREE.MeshStandardMaterial({ color: GLOW, emissive: GLOW, emissiveIntensity: 1.8 })
  );
  led.position.set(0.48, 0.14, 0.245);
  g.add(led);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.58, 36),
    new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.34;
  g.add(ring);

  g.userData = { ac_id };
  return { root: g, ring, led };
}

const acMarkers = new Map(); // ac_id -> { root, ring, led, labelObj }
let pulsePhase = 0;

function makeACMarker(ac_id, floor) {
  const { root, ring, led } = makeACUnitModel(ac_id);

  const y = floor === 1 ? 1.9 : floor === 2 ? 4.2 : 6.5;
  const x = ac_id.endsWith("AC1") ? -3.2 : 3.2;
  const z = floor === 2 ? -1.2 : 1.2;

  root.position.set(x, y, z);
  root.userData.floor = floor;

  const labelDiv = makeLabel(ac_id);
  const labelObj = new CSS2DObject(labelDiv);
  labelObj.position.set(0, 0.65, 0);
  root.add(labelObj);

  floorsGroup.add(root);
  acMarkers.set(ac_id, { root, ring, led, labelObj });
}

function rebuildMarkers() {
  for (const row of state) {
    if (!acMarkers.has(row.ac_id)) makeACMarker(row.ac_id, Number(row.floor));
  }
}

// Picking + tooltip
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function findAcRoot(obj) {
  let cur = obj;
  while (cur && !(cur.userData && cur.userData.ac_id)) cur = cur.parent;
  return cur;
}

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

  raycaster.setFromCamera(pointer, camera);
  const roots = Array.from(acMarkers.values()).map(v => v.root);
  const hits = raycaster.intersectObjects(roots, true);
  if (!hits.length) return;

  const root = findAcRoot(hits[0].object);
  if (root?.userData?.ac_id) selectAC(root.userData.ac_id);
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

  raycaster.setFromCamera(pointer, camera);
  const roots = Array.from(acMarkers.values()).map(v => v.root);
  const hits = raycaster.intersectObjects(roots, true);

  if (!hits.length) {
    tip.style.display = "none";
    return;
  }

  const root = findAcRoot(hits[0].object);
  const id = root?.userData?.ac_id;
  if (!id) {
    tip.style.display = "none";
    return;
  }

  const row = state.find(r => r.ac_id === id);
  tip.style.display = "block";
  tip.style.left = (e.clientX - rect.left + 14) + "px";
  tip.style.top = (e.clientY - rect.top + 14) + "px";
  tip.textContent = row
    ? `${id} • ${row.status} • ${row.current_temp}°C (set ${row.set_temp}°C)`
    : id;
});

// UI helpers
function addBubble(text, who = "bot") {
  const div = document.createElement("div");
  div.className = `bubble ${who}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function renderSelected(row) {
  selectedEmpty.classList.add("hidden");
  selectedCard.classList.remove("hidden");

  acName.textContent = row.ac_id;
  acMeta.textContent = `Floor ${row.floor} • ${row.room}`;
  acStatus.textContent = row.status;

  acCurrent.textContent = row.current_temp;
  acSet.textContent = row.set_temp;
  acMode.textContent = row.mode;
  acHealth.textContent = row.health;
  acService.textContent = `Last service: ${row.last_service} • Snapshot: ${row.timestamp}`;
}

function setGlow(ac_id) {
  for (const [id, obj] of acMarkers.entries()) {
    if (id === ac_id) {
      obj.led.material.emissiveIntensity = 2.2;
      obj.ring.material.opacity = 0.28;
      obj.root.scale.set(1.18, 1.18, 1.18);
      obj.labelObj.element.style.borderColor = "rgba(255,138,42,0.9)";
    } else {
      obj.led.material.emissiveIntensity = 1.6;
      obj.ring.material.opacity = 0.16;
      obj.root.scale.set(1, 1, 1);
      obj.labelObj.element.style.borderColor = "rgba(18,24,39,0.14)";
    }
  }
}

function selectAC(ac_id) {
  selectedId = ac_id;
  const row = state.find(r => r.ac_id === ac_id);
  if (row) renderSelected(row);

  setGlow(ac_id);

  const obj = acMarkers.get(ac_id);
  if (obj) controls.target.copy(obj.root.position);
}

function renderList() {
  listEl.innerHTML = "";
  for (const row of state) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="lefty">
        <div class="id">${row.ac_id}</div>
        <div class="meta">Floor ${row.floor} • ${row.room} • ${row.status} • Set ${row.set_temp}°C</div>
      </div>
      <div class="pill">${row.current_temp}°C</div>
    `;
    div.addEventListener("click", () => selectAC(row.ac_id));
    listEl.appendChild(div);
  }
}

// API + Chat
async function fetchState() {
  const res = await fetch(`${API}/ac`);
  if (!res.ok) throw new Error("Failed to fetch /ac");
  const data = await res.json();
  state = data.items || [];
  rebuildMarkers();
  renderList();

  if (selectedId) {
    const row = state.find(r => r.ac_id === selectedId);
    if (row) renderSelected(row);
    setGlow(selectedId);
  }
}

function parseCommand(text) {
  const t = text.trim();

  let m = t.match(/^set\s+(F\d-AC\d)\s+to\s+(\d+(\.\d+)?)$/i);
  if (m) return { action: "set_temp", ac_id: m[1].toUpperCase(), value: Number(m[2]), note: text };

  m = t.match(/^turn\s+(on|off)\s+(F\d-AC\d)$/i);
  if (m) return { action: "set_status", ac_id: m[2].toUpperCase(), value: m[1].toUpperCase(), note: text };

  m = t.match(/^mode\s+(F\d-AC\d)\s+(cooling|heating|fan)$/i);
  if (m) {
    const v = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
    return { action: "set_mode", ac_id: m[1].toUpperCase(), value: v, note: text };
  }

  return null;
}

async function sendCommand(text) {
  const parsed = parseCommand(text);
  if (!parsed) {
    addBubble("Try: set F3-AC1 to 21 • turn off F1-AC2 • mode F2-AC1 cooling", "bot");
    return;
  }

  addBubble(text, "me");

  const payload = { user: "Admin", ...parsed };
  const res = await fetch(`${API}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    addBubble(`Error: ${err.detail || "Failed to apply command"}`, "bot");
    return;
  }

  const out = await res.json();
  addBubble(`✅ Applied: ${out.action} on ${out.ac_id} → ${out.new_value}`, "bot");
  await fetchState();
}

sendBtn.addEventListener("click", async () => {
  const text = msgEl.value;
  if (!text.trim()) return;
  msgEl.value = "";
  await sendCommand(text);
});

msgEl.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const text = msgEl.value;
    if (!text.trim()) return;
    msgEl.value = "";
    await sendCommand(text);
  }
});

// Separation + pulse
function applySeparation() {
  sepCurrent += (sepTarget - sepCurrent) * 0.16;
  floor1.position.y = floorBaseY[1] + sepCurrent * 0.0;
  floor2.position.y = floorBaseY[2] + sepCurrent * 1.1;
  floor3.position.y = floorBaseY[3] + sepCurrent * 2.2;
}

function pulseSelected() {
  if (!selectedId) return;
  const obj = acMarkers.get(selectedId);
  if (!obj) return;

  pulsePhase += 0.07;
  const p = 1.18 + Math.sin(pulsePhase) * 0.05;
  obj.root.scale.set(p, p, p);
}

// Resize
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  labelRenderer.setSize(w, h);
}
window.addEventListener("resize", resize);
resize();

// Animate
function animate() {
  controls.update();
  applySeparation();
  pulseSelected();

  // ✅ Only fade walls if walls are ON
  updateCutawayFade();

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);

  requestAnimationFrame(animate);
}
animate();

// Start
(async function start() {
  addBubble("✅ Added Walls toggle. Turn OFF walls to see floors clearly.", "bot");
  await fetchState();
  setInterval(fetchState, 5000);
})();