// Milestone 12, task O: original low-poly meshes for the outdoor-life objects (picnic blanket, sun lounger, kite,
// snowman). They are built at runtime, so their ObjectDef assets start with 'proc:' and need no manifest entry.
// Rot-0 local space follows every object (core/geometry.ts): origin at the footprint's min corner, front = +z.

import * as THREE from 'three';

type Builder = () => THREE.Group;

function mat(name: string, color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0 });
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** A 2 x 2 checked picnic blanket with a basket and two plates. */
function picnicBlanket(): THREE.Group {
  const g = new THREE.Group();
  const red = mat('cloth', 0xc9483f), cream = mat('clothLight', 0xf2e6d2);
  const base = box(1.9, 0.04, 1.9, 1, 0.02, 1, red);
  g.add(base);
  // checker: four cream squares and a cream border
  for (const [x, z] of [[0.52, 0.52], [1.48, 0.52], [0.52, 1.48], [1.48, 1.48]] as const) {
    g.add(box(0.82, 0.012, 0.82, x, 0.045, z, cream));
  }
  for (const [w, d, x, z] of [[1.9, 0.09, 1, 0.07], [1.9, 0.09, 1, 1.93], [0.09, 1.9, 0.07, 1], [0.09, 1.9, 1.93, 1]] as const) {
    g.add(box(w, 0.012, d, x, 0.046, z, cream));
  }
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.28, 12), mat('wicker', 0xa9793f));
  basket.position.set(1.5, 0.18, 0.48);
  g.add(basket);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 16, Math.PI), mat('wicker', 0xa9793f));
  handle.position.set(1.5, 0.33, 0.48);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  for (const [x, z] of [[0.55, 1.4], [1.35, 1.45]] as const) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16), mat('plate', 0xf6f2ea));
    plate.position.set(x, 0.06, z);
    g.add(plate);
  }
  return g;
}

/** A folding sun lounger, back raised at the -z end, on a striped pad. */
function sunLounger(): THREE.Group {
  const g = new THREE.Group();
  const frame = mat('frame', 0xd8d2c4, 0.5);
  const pad = mat('pad', 0xe8e2d2), stripe = mat('stripe', 0x3f7f8c);
  // legs
  for (const [x, z] of [[0.16, 0.25], [0.84, 0.25], [0.16, 1.55], [0.84, 1.55]] as const) {
    g.add(box(0.06, 0.32, 0.06, x, 0.16, z, frame));
  }
  // seat pad and backrest, both tilted like a real lounger
  const seat = box(0.82, 0.09, 1.18, 0.5, 0.37, 1.12, pad);
  seat.rotation.x = -0.06;
  g.add(seat);
  const back = box(0.82, 0.09, 0.72, 0.5, 0.6, 0.31, pad);
  back.rotation.x = 0.72;
  g.add(back);
  for (let i = 0; i < 3; i++) {
    const s = box(0.84, 0.095, 0.1, 0.5, 0.375 + 0.005, 0.8 + i * 0.3, stripe);
    s.rotation.x = -0.06;
    g.add(s);
  }
  // side frame rails
  for (const x of [0.1, 0.9]) {
    const rail = box(0.05, 0.05, 1.9, x, 0.34, 0.98, frame);
    rail.rotation.x = 0.02;
    g.add(rail);
  }
  return g;
}

/** A diamond kite leaning against its line, with a tail of bows. */
function kite(): THREE.Group {
  const g = new THREE.Group();
  const sail = mat('sail', 0xe36a4a), trim = mat('trim', 0xf3d36b), line = mat('line', 0x6b6459);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.65);
  shape.lineTo(0.42, 0);
  shape.lineTo(0, -0.65);
  shape.lineTo(-0.42, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
  const body = new THREE.Mesh(geo, sail);
  body.position.set(0.5, 0.85, 0.5);
  body.rotation.set(0.16, 0, 0.35);
  g.add(body);
  const crossV = box(0.03, 1.3, 0.03, 0.5, 0.85, 0.5, trim);
  crossV.rotation.z = 0.35;
  crossV.rotation.x = 0.16;
  g.add(crossV);
  const crossH = box(0.84, 0.03, 0.03, 0.5, 0.85, 0.5, trim);
  crossH.rotation.z = 0.35;
  crossH.rotation.x = 0.16;
  g.add(crossH);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), line);
  string.position.set(0.72, 0.42, 0.68);
  string.rotation.z = 0.5;
  g.add(string);
  for (let i = 0; i < 3; i++) {
    const bow = box(0.14, 0.02, 0.02, 0.76 + i * 0.1, 0.18 - i * 0.06, 0.5 + i * 0.05, trim);
    bow.rotation.z = 0.3;
    g.add(bow);
  }
  return g;
}

/** Three snowballs, coal eyes and buttons, a carrot nose and a scarf. */
function snowman(): THREE.Group {
  const g = new THREE.Group();
  const snow = mat('snow', 0xf4f7fb, 0.95), coal = mat('coal', 0x25262b), carrot = mat('carrot', 0xe08a32), scarf = mat('scarf', 0xb8443c, 0.8);
  for (const [r, y] of [[0.42, 0.4], [0.31, 0.96], [0.22, 1.4]] as const) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), snow);
    ball.position.set(0.5, y, 0.5);
    g.add(ball);
  }
  for (const x of [0.44, 0.56]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), coal);
    eye.position.set(x, 1.46, 0.7);
    g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 8), carrot);
  nose.position.set(0.5, 1.4, 0.74);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  for (const y of [1.0, 0.86, 0.72]) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), coal);
    button.position.set(0.5, y, 0.75);
    g.add(button);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 8, 18), scarf);
  band.position.set(0.5, 1.24, 0.5);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  g.add(box(0.12, 0.25, 0.05, 0.34, 1.12, 0.62, scarf));
  for (const side of [-1, 1]) {
    const arm = box(0.42, 0.035, 0.035, 0.5 + side * 0.42, 1.08, 0.5, mat('stick', 0x6a4a2f));
    arm.rotation.z = side * 0.5;
    g.add(arm);
  }
  return g;
}

const BUILDERS: Record<string, Builder> = {
  'proc:picnic-blanket': picnicBlanket,
  'proc:sun-lounger': sunLounger,
  'proc:kite': kite,
  'proc:snowman': snowman,
};

/** The outdoor-life procedural mesh for an asset id, or null. */
export function outdoorModel(asset: string): THREE.Group | null {
  const b = BUILDERS[asset];
  return b ? b() : null;
}

/** Catalogue picture (inline SVG) for an outdoor-life procedural asset, or null. */
export function outdoorThumb(asset: string): string | null {
  const art: Record<string, string> = {
    'proc:picnic-blanket':
      '<rect x="14" y="34" width="68" height="42" rx="3" fill="#c9483f"/><g fill="#f2e6d2"><rect x="30" y="46" width="20" height="16"/><rect x="58" y="46" width="20" height="16"/><rect x="20" y="60" width="20" height="14"/><rect x="48" y="60" width="20" height="14"/></g><ellipse cx="34" cy="42" rx="9" ry="4" fill="#f6f2ea"/><ellipse cx="60" cy="72" rx="9" ry="4" fill="#f6f2ea"/><rect x="58" y="26" width="18" height="13" rx="2" fill="#a9793f"/><path d="M61 27 q6 -9 12 0" stroke="#a9793f" stroke-width="2" fill="none"/>',
    'proc:sun-lounger':
      '<rect x="20" y="52" width="56" height="16" rx="4" fill="#e8e2d2"/><rect x="20" y="58" width="56" height="4" fill="#3f7f8c"/><rect x="20" y="30" width="20" height="26" rx="4" fill="#e8e2d2" transform="rotate(24 30 43)"/><path d="M22 68 L18 80 M74 68 L78 80 M36 68 L33 80 M60 68 L63 80" stroke="#b9b2a4" stroke-width="3"/>',
    'proc:kite':
      '<path d="M48 12 L72 46 L48 80 L24 46Z" fill="#e36a4a"/><path d="M48 12 L48 80 M24 46 L72 46" stroke="#f3d36b" stroke-width="2"/><path d="M48 80 q10 8 2 14 q-8 4 -2 10" stroke="#6b6459" stroke-width="2" fill="none"/><path d="M50 88 l8 3 M52 98 l8 3" stroke="#f3d36b" stroke-width="3"/>',
    'proc:snowman':
      '<circle cx="48" cy="70" r="18" fill="#f4f7fb"/><circle cx="48" cy="46" r="14" fill="#f4f7fb"/><circle cx="48" cy="28" r="10" fill="#f4f7fb"/><circle cx="44" cy="26" r="1.6" fill="#25262b"/><circle cx="52" cy="26" r="1.6" fill="#25262b"/><path d="M48 29 L58 31 L48 33Z" fill="#e08a32"/><rect x="37" y="35" width="22" height="4" rx="2" fill="#b8443c"/><circle cx="48" cy="46" r="1.8" fill="#25262b"/><circle cx="48" cy="56" r="1.8" fill="#25262b"/><circle cx="48" cy="66" r="1.8" fill="#25262b"/><path d="M30 40 L38 44 M66 40 L58 44" stroke="#6a4a2f" stroke-width="2"/>',
  };
  const body = art[asset];
  if (!body) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="10" fill="#f4ede1"/>${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
