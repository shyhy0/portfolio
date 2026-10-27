(function () {
  'use strict';

  /* ============================================================
     설정 / 콘텐츠
     ============================================================ */
  const DATA_VERSION = '1'; // data.json 수정 시 올리면 캐시가 무효화됩니다
  const SITE_NAME = '문혜영 · 프론트엔드 개발자 포트폴리오';
  const CATEGORIES = ['전체', '지자체', '국가기관', '교육기관', '연구기관', '박물관', '병원', '기타'];
  // 프로젝트 구분 — data.json의 "type" 값과 일치해야 합니다. 한 프로젝트가 여러 구분이면 배열로 씁니다: "type": ["아카이브", "홈페이지"]
  // (값이 없으면 필터 '전체'에서만 보입니다)
  const TYPES = ['전체', '홈페이지', '아카이브', '내부시스템', 'KIOSK', '빅데이터'];

  /* ============================================================
     유틸
     ============================================================ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const hasText = (v) => typeof v === 'string' && v.trim() !== '';
  // type은 문자열 하나 또는 배열 모두 허용 → 항상 배열로 통일
  const typesOf = (d) => (Array.isArray(d.type) ? d.type : [d.type]).filter(Boolean);
  // JSON 문장 안의 <br> 또는 줄바꿈(\n)만 줄바꿈으로 인정하고, 그 외 HTML은 전부 이스케이프합니다.
  const BR_RE = /(?:<br\s*\/?>\s*)+|\r?\n/gi;
  const escBr = (s) => String(s == null ? '' : s).split(BR_RE).map(esc).join('<br>');
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');

  function periodKey(p) {
    const years = String(p).match(/\d{4}/g) || [];
    return [parseInt(years[0] || 0, 10), parseInt(years[years.length - 1] || 0, 10)];
  }

  /* ============================================================
     테마
     ============================================================ */
  const SUN = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>';
  const MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path>';
  const root = document.documentElement;
  const themeBtn = $('#themeToggle');
  const themeIcon = $('#themeIcon');

  function currentTheme() {
    const t = root.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(mode) {
    root.setAttribute('data-theme', mode);
    // 아이콘은 "현재 모드"를 보여주고, 레이블은 눌렀을 때 일어나는 동작을 알려줍니다.
    themeIcon.innerHTML = mode === 'dark' ? MOON : SUN;
    themeBtn.setAttribute('aria-label', mode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
  }
  applyTheme(currentTheme());
  themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    themeIcon.classList.remove('spin');
    void themeIcon.getBoundingClientRect();
    themeIcon.classList.add('spin');
    try { localStorage.setItem('portfolio-theme', next); } catch (e) { /* storage unavailable */ }
  });

  /* ============================================================
     데이터 로딩 (한 번만 불러와 캐시)
     ============================================================ */
  // data.json(프로젝트)과 profile.json(소개·경력·역량)을 같은 방식으로 한 번만 불러와 캐시합니다.
  const jsonCache = {};
  function loadJson(name) {
    if (!jsonCache[name]) {
      jsonCache[name] = fetch('./' + name + '?v=' + encodeURIComponent(DATA_VERSION))
        .then((res) => {
          if (!res.ok) throw new Error(name + ' HTTP ' + res.status);
          return res.json();
        })
        .catch((err) => {
          delete jsonCache[name]; // 다시 시도할 수 있도록 초기화
          throw err;
        });
    }
    return jsonCache[name];
  }
  const loadData = () => loadJson('data.json');
  const loadProfile = () => loadJson('profile.json');


  /* ============================================================
     모션 (1단계: 미세 모션 · 2단계: 도트 그리드/카드 틸트)
     - prefers-reduced-motion이면 전부 정지 상태로 두고, 터치 기기는 도트 그리드를 정적으로 그립니다.
     ============================================================ */
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = window.matchMedia('(pointer: fine)');

  // Genesis의 유일한 장식 요소: 포인터에 반응하는 도트 그리드 (2D canvas, 라이브러리 없음)
  function initDotGrid(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'dotgrid';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return () => canvas.remove();

    const GAP = 24;     // 4px 그리드의 배수
    const RADIUS = 140; // 포인터 영향 반경
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, e: 0, target: 0 };
    let w = 0, h = 0, cols = 0, rows = 0;
    let raf = 0, visible = true, colors = { base: '#6B6B6B', hot: '#6366F1' };

    const readColors = () => {
      const cs = getComputedStyle(root);
      colors = {
        base: cs.getPropertyValue('--text-2').trim() || colors.base,
        hot: cs.getPropertyValue('--primary').trim() || colors.hot
      };
    };

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          let x = j * GAP + GAP / 2;
          let y = i * GAP + GAP / 2;
          let k = 0;
          if (ptr.e > 0.01) {
            const dx = x - ptr.x, dy = y - ptr.y;
            const d = Math.hypot(dx, dy);
            k = Math.max(0, 1 - d / RADIUS);
            k = k * k * ptr.e;
            if (d > 0.01) { x += (dx / d) * k * 8; y += (dy / d) * k * 8; } // 포인터에서 살짝 밀려남
          }
          ctx.globalAlpha = k > 0.02 ? 0.35 + 0.6 * k : 0.35;
          ctx.fillStyle = k > 0.02 ? colors.hot : colors.base;
          ctx.beginPath();
          ctx.arc(x, y, 1 + k * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    function tick() {
      ptr.x += (ptr.tx - ptr.x) * 0.18;
      ptr.y += (ptr.ty - ptr.y) * 0.18;
      ptr.e += (ptr.target - ptr.e) * 0.12;
      draw();
      // 포인터가 떠나 잔상이 사라지면 루프를 멈춰 CPU를 쓰지 않습니다.
      raf = visible && (ptr.target > 0 || ptr.e > 0.01) ? requestAnimationFrame(tick) : 0;
    }
    const kick = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };

    function resize() {
      const r = host.getBoundingClientRect();
      w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / GAP);
      rows = Math.ceil(h / GAP);
      draw();
    }

    const interactive = () => mqFine.matches && !mqReduce.matches;
    const onMove = (e) => {
      if (e.pointerType !== 'mouse' || !interactive()) return;
      const r = host.getBoundingClientRect();
      ptr.tx = e.clientX - r.left;
      ptr.ty = e.clientY - r.top;
      if (ptr.e < 0.01) { ptr.x = ptr.tx; ptr.y = ptr.ty; } // 처음 들어올 때 멀리서 끌려오지 않게
      ptr.target = 1;
      kick();
    };
    const onLeave = () => { ptr.target = 0; kick(); };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);

    const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', resize);

    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) kick(); })
      : null;
    if (io) io.observe(host);

    // 라이트/다크 전환 시 색을 다시 읽어 즉시 반영
    const mo = new MutationObserver(() => { readColors(); draw(); });
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    readColors();
    resize();

    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      if (io) io.disconnect();
      mo.disconnect();
      canvas.remove();
    };
  }

  // 스크롤로 화면에 들어올 때 순서대로 나타남 (모션 축소 설정이면 아예 적용하지 않아 내용이 항상 보입니다)
  function initReveal(scope) {
    if (mqReduce.matches || !('IntersectionObserver' in window)) return () => {};
    const items = $$('.career li', scope);
    items.forEach((el, i) => { el.classList.add('will-reveal'); el.style.setProperty('--i', i % 4); });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => io.observe(el));
    const safety = setTimeout(() => items.forEach((el) => el.classList.add('in')), 3000); // 만일의 경우 대비
    return () => { io.disconnect(); clearTimeout(safety); };
  }

  // 카드 입체감: 최대 4° 기울기 (마우스 전용)
  function initTilt(scope) {
    if (mqReduce.matches || !mqFine.matches) return;
    const MAX = 4;
    $$('[data-tilt]', scope).forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * MAX * 2).toFixed(2)}deg) rotateY(${(px * MAX * 2).toFixed(2)}deg) translateY(-2px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ============================================================
     라우터 (#/ , #/projects?cat=&sort=&dir=)
     ============================================================ */
  const view = $('#view');
  const routes = {
    '/': { title: '이력서', render: renderResume },
    '/projects': { title: '프로젝트', render: renderProjects }
  };

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    return { path: path || '/', params: new URLSearchParams(query) };
  }

  // 내비 로고·푸터처럼 모든 페이지에 보이는 영역은 프로필 값으로 채웁니다.
  function applyProfileChrome(p) {
    const logo = $('.logo'); if (logo) logo.textContent = p.name;
    const fn = $('#footerName'); if (fn) fn.textContent = '© ' + p.name;
    const fe = $('#footerEmail'); if (fe) fe.textContent = p.email;
  }

  let renderToken = 0;
  let teardown = null; // 페이지를 떠날 때 정리할 것(애니메이션 루프, 옵저버 등)
  async function navigate(isFirst) {
    const { path, params } = parseHash();
    const route = routes[path] || routes['/'];
    const token = ++renderToken;
    if (teardown) { teardown(); teardown = null; }

    $$('.nav-links a').forEach((a) => {
      const active = a.dataset.route === (routes[path] ? path : '/');
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const profile = await loadProfile().catch(() => null);
    if (token !== renderToken) return;
    if (profile) applyProfileChrome(profile);
    document.title = route.title + ' · ' + (profile ? profile.name : SITE_NAME);

    // 페이지 전환 페이드 (160ms)
    view.classList.remove('enter');
    void view.offsetWidth;
    view.classList.add('enter');

    await route.render(params, () => token === renderToken, profile);
    if (token !== renderToken) return; // 렌더 도중 다른 페이지로 이동한 경우

    if (!isFirst) {
      window.scrollTo(0, 0);
      const h1 = $('h1', view);
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
  }
  window.addEventListener('hashchange', () => navigate(false));

  /* ============================================================
     뷰: 이력서
     ============================================================ */
  function renderResume(params, isCurrent, p) {
    if (!p) {
      view.innerHTML = `
        <div class="container">
          <div class="empty" role="alert">
            <p>프로필 데이터를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.</p>
            <button class="btn btn-primary" type="button" id="retry">다시 불러오기</button>
          </div>
        </div>`;
      $('#retry').addEventListener('click', () => navigate(false));
      return;
    }
    const intro = p.intro || [];
    const skills = p.skills || [];
    const career = p.career || [];
    view.innerHTML = `
      <div class="container">
        <section class="hero" aria-labelledby="heroName">
          <h1 id="heroName" class="rise">${esc(p.name)}</h1>
          <p class="role rise" style="--i:1">${esc(p.role)}</p>
          <div class="lead rise" style="--i:2">${intro.map((t) => `<p>${escBr(t)}</p>`).join('')}</div>
          <div class="hero-actions rise" style="--i:3">
            <a class="btn btn-primary" href="#/projects">전체 프로젝트 이력 보기</a>
          </div>
        </section>

        <section class="section">
          <div class="panel-grid">
            <div class="panel" data-tilt>
              <h2>기본 정보</h2>
              <ul class="facts">
                <li>경력 <b class="num">${esc(p.years)}</b></li>
                <li>전공 <b>${esc(p.major)}</b></li>
                <li>연락처 <b><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></b></li>
              </ul>
            </div>
            <div class="panel" data-tilt>
              <h2>보유 역량</h2>
              ${skills.map((g) => `
                <div class="skill-group">
                  <h3>${esc(g.label)}</h3>
                  <div class="chips">${(g.items || []).map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>
                </div>`).join('')}
            </div>
          </div>
        </section>

        <section class="section" aria-labelledby="careerTitle">
          <div class="section-head"><h2 id="careerTitle">경력</h2></div>
          <ol class="career">
            ${career.map((c) => `
              <li>
                <div class="period num">${esc(c.period)}</div>
                <div>
                  <h3>${esc(c.title)}</h3>
                  <p>${escBr(c.desc)}</p>
                </div>
              </li>`).join('')}
          </ol>
        </section>

      </div>`;

    const cleanups = [initDotGrid($('.hero', view)), initReveal(view)];
    initTilt(view);
    teardown = () => cleanups.forEach((fn) => fn && fn());
  }

  /* ============================================================
     뷰: 프로젝트 (분포 + 검색/필터/정렬 목록 + 사례 모달)
     ============================================================ */
  const pState = { cat: '전체', type: '전체', sortKey: 'period', sortDir: 'desc' };

  function readState(params) {
    const cat = params.get('cat');
    pState.cat = CATEGORIES.includes(cat) ? cat : '전체';
    const type = params.get('type');
    pState.type = TYPES.includes(type) ? type : '전체';
    const sort = params.get('sort');
    pState.sortKey = ['category', 'organization', 'project', 'type', 'period'].includes(sort) ? sort : 'period';
    const dir = params.get('dir');
    pState.sortDir = dir === 'asc' || dir === 'desc' ? dir : (pState.sortKey === 'period' ? 'desc' : 'asc');
  }

  // 상태를 URL에 반영 (링크를 복사해 같은 화면을 공유할 수 있음). hashchange는 발생하지 않습니다.
  function syncUrl() {
    const sp = new URLSearchParams();
    if (pState.cat !== '전체') sp.set('cat', pState.cat);
    if (pState.type !== '전체') sp.set('type', pState.type);
    if (pState.sortKey !== 'period' || pState.sortDir !== 'desc') {
      sp.set('sort', pState.sortKey);
      sp.set('dir', pState.sortDir);
    }
    const qs = sp.toString();
    history.replaceState(null, '', '#/projects' + (qs ? '?' + qs : ''));
  }

  async function renderProjects(params, isCurrent) {
    readState(params);
    view.innerHTML = '<div class="container"><p class="empty">프로젝트를 불러오는 중입니다.</p></div>';

    let DATA;
    try {
      DATA = await loadData();
    } catch (err) {
      if (!isCurrent()) return;
      view.innerHTML = `
        <div class="container">
          <div class="empty" role="alert">
            <p>프로젝트 데이터를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.</p>
            <button class="btn btn-primary" type="button" id="retry">다시 불러오기</button>
          </div>
        </div>`;
      $('#retry').addEventListener('click', () => navigate(false));
      return;
    }
    if (!isCurrent()) return;

    view.innerHTML = `
      <div class="container">
        <div class="page-head">
          <h1>프로젝트</h1>
          <p>다양한 프로젝트 수행 경험과 축적된 운영 노하우를 바탕으로 잠재 리스크를 선제적으로 식별·관리하고, 안정적인 운영 환경을 확보합니다.</p>
          <p>문제 해결의 방향은 결국 그 문제를 어떻게 추상화하고 정의하느냐에서 갈린다고 생각합니다. 해결책을 고민하기 전에 문제 자체를 명확히 정의하는 것을 우선시하고, <br>정의가 끝나면 하나의 미션을 완수하듯 순서대로 풀어나가는 방식을 선호합니다.</p>
        </div>

        <section class="section" aria-label="전체 프로젝트 이력">
          <div class="toolbar">
            <div class="filter-groups">
              <div class="filter-group">
                <span class="filter-label" id="typeLabel">구분</span>
                <div class="filters" role="group" aria-labelledby="typeLabel">
                  ${TYPES.map((t) => `<button class="filter" type="button" data-group="type" data-value="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
                </div>
              </div>
              <div class="filter-group">
                <span class="filter-label" id="catLabel">기관 유형</span>
                <div class="filters" role="group" aria-labelledby="catLabel">
                  ${CATEGORIES.map((c) => `<button class="filter" type="button" data-group="cat" data-value="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}
                </div>
              </div>
            </div>
            <button class="link-btn" type="button" id="resetInline" hidden>필터 초기화</button>
          </div>
          <p class="sr-only" id="liveCount" role="status" aria-live="polite"></p>
          <div class="table-wrap">
            <table id="fullTable">
              <caption class="sr-only">프로젝트 이력 목록</caption>
              <thead>
                <tr>
                  ${[['category', '기관 유형'], ['organization', '기관명'], ['project', '프로젝트명'], ['type', '구분'], ['period', '기간']].map(([k, l]) => `
                    <th scope="col" data-key="${k}" aria-sort="none">
                      <button class="th-btn" type="button">${l}<span class="arrow" aria-hidden="true"></span></button>
                    </th>`).join('')}
                  <th scope="col"><span class="th-static">사이트</span></th>
                </tr>
              </thead>
              <tbody id="tbody"></tbody>
            </table>
          </div>
        </section>
      </div>

      <dialog id="detailModal" class="dialog" aria-labelledby="detailTitle">
        <div class="dialog-inner">
          <div class="dialog-head">
            <div>
              <p class="dialog-org" id="detailOrg"></p>
              <h2 id="detailTitle"></h2>
            </div>
            <button type="button" class="icon-btn" id="detailClose" aria-label="닫기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>
            </button>
          </div>
          <div class="dialog-meta" id="detailMeta"></div>
          <section class="dialog-section" id="detailRole" hidden>
            <h3>주요 성과 및 역할</h3>
            <p class="dialog-body" id="detailRoleText"></p>
          </section>
          <section class="dialog-section" id="detailCase" hidden>
            <h3>문제해결 사례</h3>
            <p class="dialog-body" id="detailCaseText"></p>
          </section>
        </div>
      </dialog>`;

    // 프로젝트 페이지 상단에도 도트 그리드 적용 (페이지를 떠나면 라우터가 정리)
    teardown = initDotGrid($('.page-head', view));

    const tbody = $('#tbody');
    const filterBtns = $$('.filters .filter');
    const heads = $$('#fullTable thead th[data-key]');
    const modal = $('#detailModal');
    let rows = [];

    function updateControls() {
      filterBtns.forEach((b) => {
        const g = b.dataset.group;
        const v = b.dataset.value;
        const selected = v === pState[g];
        b.setAttribute('aria-pressed', String(selected));
        // 다른 필터와 조합했을 때 결과가 0건이면 비활성화해서 빈 화면으로 가는 길을 막습니다.
        let disabled = false;
        if (v !== '전체' && !selected) {
          disabled = !DATA.some((d) => (g === 'cat' ? d.category === v : typesOf(d).includes(v))
            && (g === 'cat'
              ? (pState.type === '전체' || typesOf(d).includes(pState.type))
              : (pState.cat === '전체' || d.category === pState.cat)));
        }
        b.disabled = disabled;
      });
      $('#resetInline').hidden = pState.cat === '전체' && pState.type === '전체';
      heads.forEach((th) => {
        const active = th.dataset.key === pState.sortKey;
        $('.arrow', th).textContent = active ? (pState.sortDir === 'asc' ? '▲' : '▼') : '';
        th.setAttribute('aria-sort', active ? (pState.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      });
    }

    function renderRows() {
      rows = DATA.filter((d) =>
        (pState.cat === '전체' || d.category === pState.cat) &&
        (pState.type === '전체' || typesOf(d).includes(pState.type)));

      const dir = pState.sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        if (pState.sortKey === 'period') {
          const [as, ae] = periodKey(a.period);
          const [bs, be] = periodKey(b.period);
          return ((as - bs) || (ae - be)) * dir;
        }
        const k = pState.sortKey;
        const val = (o) => (k === 'type' ? typesOf(o).join(' ') : String(o[k] || ''));
        return val(a).localeCompare(val(b), 'ko') * dir;
      });

      $('#liveCount').textContent = rows.length + '건';

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty">
          <p>조건에 맞는 프로젝트가 없습니다. 필터를 초기화해 보세요.</p>
          <button class="btn btn-secondary" type="button" id="resetFilters">필터 초기화</button>
        </div></td></tr>`;
        $('#resetFilters').addEventListener('click', () => {
          pState.cat = '전체'; pState.type = '전체';
          update();
        });
        return;
      }

      tbody.innerHTML = rows.map((d, i) => {
        const hasRole = hasText(d.role);
        const hasDetail = hasRole || hasText(d.caseStudy);
        const hint = hasRole ? '역할 보기' : '상세 보기';
        const url = safeUrl(d.url);
        return `
          <tr class="${hasDetail ? 'has-detail' : ''}${i < 20 ? ' row-in' : ''}" style="--i:${Math.min(i, 14)}">
            <td><span class="cat-badge">${esc(d.category)}</span></td>
            <td class="col-org">${esc(d.organization)}</td>
            <td>${hasDetail
              ? `<button type="button" class="detail-btn" data-idx="${i}" aria-haspopup="dialog" aria-label="${esc(d.project)} ${hint}"><span class="detail-name">${esc(d.project)}</span></button>`
              : esc(d.project)}</td>
            <td>${typesOf(d).length ? `<div class="type-badges">${typesOf(d).map((t) => `<span class="type-badge">${esc(t)}</span>`).join('')}</div>` : '<span class="muted" aria-label="구분 없음">-</span>'}</td>
            <td class="col-period num">${esc(d.period)}</td>
            <td>${url ? `<a class="visit" href="${esc(url)}" target="_blank" rel="noopener">사이트 방문<span class="sr-only"> (새 창)</span></a>` : '<span class="muted" aria-label="사이트 없음">-</span>'}</td>
          </tr>`;
      }).join('');
    }

    function update() {
      updateControls();
      renderRows();
      syncUrl();
    }

    function openDetail(d) {
      if (!d) return;
      $('#detailOrg').textContent = d.organization;
      $('#detailTitle').textContent = d.project;

      // 기간 · 기관 유형 · 구분을 칩으로 표시 (textContent만 사용)
      const meta = $('#detailMeta');
      meta.textContent = '';
      [d.period, d.category, ...typesOf(d)].filter(Boolean).forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = t;
        meta.appendChild(chip);
      });

      const showRole = hasText(d.role);
      const showCase = hasText(d.caseStudy);
      $('#detailRole').hidden = !showRole;
      $('#detailRoleText').textContent = showRole ? d.role.replace(BR_RE, '\n') : '';
      $('#detailCase').hidden = !showCase;
      $('#detailCaseText').textContent = showCase ? d.caseStudy.replace(BR_RE, '\n') : '';

      const url = safeUrl(d.url);
      //$('#detailFoot').hidden = !url;
      //if (url) $('#detailLink').href = url;
      modal.showModal();
    }

    // 상세가 있는 행은 행 아무 곳이나 클릭해도 열리고, 키보드는 프로젝트명 버튼으로 접근합니다.
    tbody.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const btn = e.target.closest('.detail-btn');
      const tr = e.target.closest('tr.has-detail');
      const target = btn || (tr && $('.detail-btn', tr));
      if (target) openDetail(rows[Number(target.dataset.idx)]);
    });
    $('#detailClose').addEventListener('click', () => modal.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

    filterBtns.forEach((b) => b.addEventListener('click', () => {
      const g = b.dataset.group;
      // 이미 선택된 칩을 다시 누르면 '전체'로 되돌립니다.
      pState[g] = pState[g] === b.dataset.value ? '전체' : b.dataset.value;
      update();
    }));
    $('#resetInline').addEventListener('click', () => {
      pState.cat = '전체'; pState.type = '전체';
      update();
    });
    heads.forEach((th) => $('.th-btn', th).addEventListener('click', () => {
      const key = th.dataset.key;
      if (pState.sortKey === key) {
        pState.sortDir = pState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        pState.sortKey = key;
        pState.sortDir = key === 'period' ? 'desc' : 'asc';
      }
      update();
    }));

    updateControls();
    renderRows();
  }

  /* ============================================================
     시작
     ============================================================ */
  document.title = SITE_NAME;
  if (location.protocol === 'file:') {
    // file://에서는 브라우저가 data.json fetch를 막으므로 로컬 서버 실행 방법을 안내합니다.
    view.innerHTML = `
      <div class="container">
        <div class="empty" role="alert">
          <p>파일을 직접 열면 데이터를 불러올 수 없습니다. 로컬 서버로 실행해 주세요.</p>
          <p><code>npm start</code> 실행 후 <a href="http://localhost:5173/">http://localhost:5173/</a> 접속</p>
        </div>
      </div>`;
  } else {
    navigate(true);
  }
})();
