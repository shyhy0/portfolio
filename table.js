import { escapeHtml, fetchCareerItems, copyToClipboard } from './shared.js';

const VALID_SORT_KEYS = ['category', 'organization', 'project', '_date'];
const DEFAULT_STATE = { sortKey: '_date', sortDir: 'desc', cat: '전체', q: '' };

let ITEMS = [];
let state = Object.assign({}, DEFAULT_STATE);

function readStateFromUrl() {
  const p = new URLSearchParams(location.search);
  const cat = p.get('cat');
  const q = p.get('q');
  const sort = p.get('sort');
  const dir = p.get('dir');
  if (cat) state.cat = cat;
  if (q) state.q = q;
  if (sort && VALID_SORT_KEYS.includes(sort)) state.sortKey = sort;
  if (dir === 'asc' || dir === 'desc') state.sortDir = dir;
}

// 기본값과 다른 값만 쿼리스트링에 남겨서 링크를 짧고 읽기 쉽게 유지한다.
function syncUrl() {
  const p = new URLSearchParams();
  if (state.cat && state.cat !== DEFAULT_STATE.cat) p.set('cat', state.cat);
  if (state.q) p.set('q', state.q);
  if (state.sortKey !== DEFAULT_STATE.sortKey) p.set('sort', state.sortKey);
  if (state.sortDir !== DEFAULT_STATE.sortDir) p.set('dir', state.sortDir);
  const qs = p.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? '?' + qs : ''}`);
}

function applyStateToControls() {
  document.getElementById('search').value = state.q;
  document.querySelectorAll('#cat-chips .chip').forEach(b => {
    const active = b.dataset.cat === state.cat;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  updateSortArrows();
}

function render() {
  let filtered = ITEMS.filter(it => {
    if (state.cat !== '전체' && it.category !== state.cat) return false;
    if (state.q) {
      const q = state.q.toLowerCase();
      const hay = (it.organization + ' ' + it.project).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let av = state.sortKey === '_date' ? a._date : (a[state.sortKey] || '');
    let bv = state.sortKey === '_date' ? b._date : (b[state.sortKey] || '');
    let cmp = av.localeCompare(bv, 'ko');
    return state.sortDir === 'asc' ? cmp : -cmp;
  });

  const body = document.getElementById('table-body');
  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty-note">해당 조건에 맞는 프로젝트가 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(it => `
    <tr>
      <td><span class="proj-tag">${escapeHtml(it.category)}</span></td>
      <td class="col-org">${escapeHtml(it.organization)}</td>
      <td class="col-title">${escapeHtml(it.project)}</td>
      <td class="col-period">${escapeHtml(it.period)}</td>
      <td>${it.url ? `<a class="visit" href="${it.url}" target="_blank" rel="noopener" aria-label="${escapeHtml(it.organization)} 홈페이지 방문 (새 창 열림)">사이트 방문</a>` : `<span class="visit muted">-</span>`}</td>
    </tr>
  `).join('');
}

function updateSortArrows() {
  document.querySelectorAll('#proj-table thead th[data-key]').forEach(th => {
    const arrow = th.querySelector('.arrow');
    const isActive = th.dataset.key === state.sortKey;
    if (arrow) arrow.textContent = isActive ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
    th.setAttribute('aria-sort', isActive ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

function toggleSort(key) {
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = key;
    state.sortDir = key === '_date' ? 'desc' : 'asc';
  }
  updateSortArrows();
  syncUrl();
  render();
}

document.querySelectorAll('#proj-table thead th[data-key]').forEach(th => {
  th.addEventListener('click', () => toggleSort(th.dataset.key));
  th.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleSort(th.dataset.key);
    }
  });
});

document.getElementById('search').addEventListener('input', (e) => {
  state.q = e.target.value.trim();
  syncUrl();
  render();
});

document.getElementById('cat-chips').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  state.cat = e.target.dataset.cat;
  document.querySelectorAll('#cat-chips .chip').forEach(b => {
    const active = b === e.target;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  syncUrl();
  render();
});

document.getElementById('copy-link').addEventListener('click', (e) => {
  copyToClipboard(location.href, e.currentTarget);
});

// 뒤로/앞으로 가기로 URL이 바뀌면 화면도 그 상태로 맞춘다.
window.addEventListener('popstate', () => {
  state = Object.assign({}, DEFAULT_STATE);
  readStateFromUrl();
  applyStateToControls();
  render();
});

readStateFromUrl();
applyStateToControls();

fetchCareerItems()
  .then(items => {
    ITEMS = items;
    render();
  })
  .catch(err => {
    document.getElementById('table-body').innerHTML =
      '<tr><td colspan="5" class="empty-note">data.json을 불러오지 못했습니다. projects.html·table.js·shared.js·data.json이 같은 폴더에 있는지, http(s)로 서빙되고 있는지 확인해주세요 (file:// 로 더블클릭해서 열면 fetch가 차단됩니다. GitHub Pages에 올리면 정상 동작합니다).</td></tr>';
    console.error(err);
  });
