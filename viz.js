// career-viz: 경력을 나타내는 3D 인터랙션 오브젝트.
// data.json의 전체 프로젝트를 연도순으로 나선(helix)에 배치해
// "18년간 이어진 하나의 궤적"을 형상화한다. 노드를 클릭하거나
// ?org=<기관명> 파라미터로 접속하면 해당 프로젝트에 초점을 맞추고,
// 그 상태 그대로 주소창 URL을 복사해 공유할 수 있다.
import * as THREE from 'three';
import { fetchCareerItems, copyToClipboard } from './shared.js';

const stage = document.getElementById('career-viz');
const canvas = document.getElementById('career-viz-canvas');
const tooltip = document.getElementById('viz-tooltip');
const hint = document.getElementById('viz-hint');
const panel = document.getElementById('focus-panel');
const tagEl = document.getElementById('focus-tag');
const orgEl = document.getElementById('focus-org');
const projectEl = document.getElementById('focus-project');
const linkEl = document.getElementById('focus-link');
const copyBtn = document.getElementById('copy-link');
const resetBtn = document.getElementById('focus-reset');

const CareerViz = (function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let scene, camera, renderer, group, raycaster, clock;
  let nodeMeshes = [];
  let hoveredMesh = null;
  let currentFocused = null;
  let dragging = false;
  let dragMoved = 0;
  let lastX = 0;
  let lastY = 0;
  let autoRotate = true;

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

  function displayScale(mesh) {
    if (mesh === currentFocused) return mesh.userData.baseScale * 1.9;
    if (mesh === hoveredMesh) return mesh.userData.baseScale * 1.5;
    return mesh.userData.baseScale;
  }

  function buildScene(items) {
    const sorted = items.slice().sort((a, b) => parseYear(a.period) - parseYear(b.period));
    const n = sorted.length;

    scene = new THREE.Scene();

    const rect = stage.getBoundingClientRect();
    const w = rect.width || 320;
    const h = rect.height || 320;

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
      mesh.userData.item = sorted[i];
      mesh.userData.angle = angle;
      mesh.userData.baseScale = isLatest ? 1.8 : 1;
      mesh.scale.setScalar(mesh.userData.baseScale);
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

  function positionTooltip(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    tooltip.style.left = `${clientX - rect.left}px`;
    tooltip.style.top = `${clientY - rect.top}px`;
  }

  function setHovered(mesh, clientX, clientY) {
    if (hoveredMesh === mesh) {
      if (mesh) positionTooltip(clientX, clientY);
      return;
    }
    const prev = hoveredMesh;
    hoveredMesh = mesh;
    if (prev) prev.scale.setScalar(displayScale(prev));
    if (mesh) {
      mesh.scale.setScalar(displayScale(mesh));
      canvas.style.cursor = dragging ? 'grabbing' : 'pointer';
      tooltip.textContent = `${mesh.userData.item.organization} · ${mesh.userData.item.period}`;
      tooltip.hidden = false;
      positionTooltip(clientX, clientY);
    } else {
      canvas.style.cursor = dragging ? 'grabbing' : 'grab';
      tooltip.hidden = true;
    }
  }

  function faceNode(mesh) {
    group.rotation.y = Math.PI / 2 - mesh.userData.angle;
  }

  function showPanel(item) {
    if (!panel) return;
    tagEl.textContent = `${item.category} · ${item.period}`;
    orgEl.textContent = item.organization;
    projectEl.textContent = item.project;
    linkEl.href = `./projects.html?q=${encodeURIComponent(item.organization)}`;
    panel.hidden = false;
  }

  function hidePanel() {
    if (panel) panel.hidden = true;
  }

  function focusNode(mesh, updateUrl) {
    const prevFocused = currentFocused;
    currentFocused = mesh;
    if (prevFocused && prevFocused !== mesh) prevFocused.scale.setScalar(displayScale(prevFocused));
    mesh.scale.setScalar(displayScale(mesh));
    faceNode(mesh);
    autoRotate = false;
    showPanel(mesh.userData.item);
    if (updateUrl) {
      const p = new URLSearchParams();
      p.set('org', mesh.userData.item.organization);
      history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
    }
  }

  function clearFocus() {
    if (currentFocused) {
      const m = currentFocused;
      currentFocused = null;
      m.scale.setScalar(displayScale(m));
    }
    autoRotate = true;
    hidePanel();
    history.replaceState(null, '', location.pathname);
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
    setHovered(pickNode(e.clientX, e.clientY), e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    dragging = false;
    canvas.style.cursor = hoveredMesh ? 'pointer' : 'grab';
    if (dragMoved < 5) {
      const hit = pickNode(e.clientX, e.clientY);
      if (hit) focusNode(hit, true);
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

    if (resetBtn) resetBtn.addEventListener('click', clearFocus);
    if (copyBtn) copyBtn.addEventListener('click', (e) => copyToClipboard(location.href, e.currentTarget));

    const ro = new ResizeObserver(() => handleResize());
    ro.observe(stage);
    window.addEventListener('resize', handleResize);
  }

  function handleResize() {
    if (!renderer || !camera) return;
    const rect = stage.getBoundingClientRect();
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

  function applyUrlFocus() {
    const org = new URLSearchParams(location.search).get('org');
    if (!org) return;
    const match = nodeMeshes.find(m => m.userData.item.organization === org) ||
      nodeMeshes.find(m => m.userData.item.organization.toLowerCase().includes(org.toLowerCase()));
    if (match) {
      focusNode(match, false);
    } else if (hint) {
      hint.textContent = `"${org}" 프로젝트를 3D에서 찾지 못했습니다. 아래 링크에서 전체 목록을 확인해보세요.`;
    }
  }

  function init(items) {
    if (!stage || !canvas || !items || !items.length) return;
    if (!supportsWebGL()) {
      stage.hidden = true;
      if (hint) hint.textContent = '이 브라우저는 3D(WebGL)를 지원하지 않아 시각화를 표시할 수 없습니다. 프로젝트 목록에서 전체 이력을 확인해주세요.';
      return;
    }
    try {
      buildScene(items);
      attachEvents();
      applyUrlFocus();
      animate();
    } catch (err) {
      console.error('career-viz init failed', err);
      stage.hidden = true;
      if (hint) hint.textContent = '3D 시각화를 불러오는 중 문제가 발생했습니다. 프로젝트 목록에서 전체 이력을 확인해주세요.';
    }
  }

  return { init };
})();

fetchCareerItems()
  .then(items => CareerViz.init(items))
  .catch(err => {
    console.error(err);
    if (stage) stage.hidden = true;
    if (hint) hint.textContent = 'data.json을 불러오지 못했습니다. http(s)로 서빙되고 있는지 확인해주세요 (file://로 열면 차단됩니다).';
  });
