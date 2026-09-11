// career-viz: 경력을 나타내는 3D 인터랙션 오브젝트.
// data.json의 전체 프로젝트를 연도순으로 나선(helix)에 배치해
// "18년간 이어진 하나의 궤적"을 형상화한다. 장식용 요소이므로
// aria-hidden 처리되어 있고, 동일한 정보는 아래 표로도 모두 제공된다.
import * as THREE from 'three';

const CareerViz = (function () {
  const container = document.getElementById('career-viz');
  const canvas = document.getElementById('career-viz-canvas');
  const tooltip = document.getElementById('viz-tooltip');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let scene, camera, renderer, group, raycaster, clock;
  let nodeMeshes = [];
  let hoveredMesh = null;
  let dragging = false;
  let dragMoved = 0;
  let lastX = 0;
  let lastY = 0;
  let autoRotate = true;
  let ready = false;

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function supportsWebGL() {
    try {
      const test = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (test.getContext('webgl') || test.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function parseYear(period) {
    const m = String(period).match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function buildScene(items) {
    const sorted = items.slice().sort((a, b) => parseYear(a.period) - parseYear(b.period));
    const n = sorted.length;

    scene = new THREE.Scene();

    const rect = container.getBoundingClientRect();
    const w = rect.width || 220;
    const h = rect.height || 220;

    camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.4);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);

    group = new THREE.Group();
    group.rotation.x = 0.32;
    scene.add(group);

    const colorOld = new THREE.Color(cssVar('--primary-70', '#083891'));
    const colorNew = new THREE.Color(cssVar('--primary-50', '#256ef4'));
    const colorNow = new THREE.Color(cssVar('--point-50', '#d63d4a'));
    const lineColor = new THREE.Color(cssVar('--gray-30', '#b1b8be'));

    const sphereGeo = new THREE.SphereGeometry(0.05, 12, 10);
    const linePoints = [];
    const totalTurns = 5.5;
    const totalHeight = 3.1;

    nodeMeshes = [];

    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const angle = t * totalTurns * Math.PI * 2;
      const radius = 1.05 + 0.14 * Math.sin(t * Math.PI * 3);
      const y = -totalHeight / 2 + t * totalHeight;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const isLatest = i === n - 1;
      const color = isLatest ? colorNow : colorOld.clone().lerp(colorNew, t);
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(sphereGeo, material);
      mesh.position.set(x, y, z);
      if (isLatest) mesh.scale.setScalar(1.8);
      mesh.userData.item = sorted[i];
      mesh.userData.baseScale = isLatest ? 1.8 : 1;
      group.add(mesh);
      nodeMeshes.push(mesh);
      linePoints.push(new THREE.Vector3(x, y, z));
    }

    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.45 });
    group.add(new THREE.Line(lineGeo, lineMat));

    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();
  }

  function pointerToNDC(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function pickNode(clientX, clientY) {
    const ndc = pointerToNDC(clientX, clientY);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(nodeMeshes);
    return hits.length ? hits[0].object : null;
  }

  function setHovered(mesh, clientX, clientY) {
    if (hoveredMesh === mesh) {
      if (mesh && tooltip) positionTooltip(clientX, clientY);
      return;
    }
    if (hoveredMesh) hoveredMesh.scale.setScalar(hoveredMesh.userData.baseScale);
    hoveredMesh = mesh;
    if (mesh) {
      mesh.scale.setScalar(mesh.userData.baseScale * 1.7);
      canvas.style.cursor = dragging ? 'grabbing' : 'pointer';
      if (tooltip) {
        const item = mesh.userData.item;
        tooltip.textContent = `${item.organization} · ${item.period}`;
        tooltip.hidden = false;
        positionTooltip(clientX, clientY);
      }
    } else {
      canvas.style.cursor = dragging ? 'grabbing' : 'grab';
      if (tooltip) tooltip.hidden = true;
    }
  }

  function positionTooltip(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    tooltip.style.left = `${clientX - rect.left}px`;
    tooltip.style.top = `${clientY - rect.top}px`;
  }

  function onPointerDown(e) {
    dragging = true;
    dragMoved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      group.rotation.y += dx * 0.006;
      group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + dy * 0.006));
      lastX = e.clientX;
      lastY = e.clientY;
      return;
    }
    const hit = pickNode(e.clientX, e.clientY);
    setHovered(hit, e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    dragging = false;
    canvas.style.cursor = hoveredMesh ? 'pointer' : 'grab';
    if (dragMoved < 5) {
      const hit = pickNode(e.clientX, e.clientY);
      if (hit && typeof window.focusOrganization === 'function') {
        window.focusOrganization(hit.userData.item.organization);
      }
    }
  }

  function onPointerLeave() {
    setHovered(null, 0, 0);
  }

  function attachEvents() {
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);

    const ro = new ResizeObserver(() => handleResize());
    ro.observe(container);
    window.addEventListener('resize', handleResize);
  }

  function handleResize() {
    if (!renderer || !camera) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (autoRotate && !dragging && !prefersReducedMotion) {
      group.rotation.y += delta * 0.15;
    }
    renderer.render(scene, camera);
  }

  function init(items) {
    if (ready || !container || !canvas || !items || !items.length) return;
    if (!supportsWebGL()) {
      container.hidden = true;
      return;
    }
    ready = true;
    try {
      buildScene(items);
      attachEvents();
      animate();
    } catch (err) {
      console.error('career-viz init failed', err);
      container.hidden = true;
    }
  }

  return { init };
})();

if (window.__careerItems) {
  CareerViz.init(window.__careerItems);
} else {
  window.addEventListener('career-data-ready', (e) => CareerViz.init(e.detail));
}
