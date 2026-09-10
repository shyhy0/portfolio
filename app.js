let ITEMS = [];
let state = { sortKey: '_date', sortDir: 'desc', cat: '전체', q: '' };

function parseDate(period) {
  const m = period.match(/(\d{4})/);
  return m ? m[1] : '0000';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

document.getElementById('search').addEventListener('input', (e) => { state.q = e.target.value.trim(); render(); });

document.getElementById('cat-chips').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  state.cat = e.target.dataset.cat;
  document.querySelectorAll('#cat-chips .chip').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  e.target.classList.add('active');
  e.target.setAttribute('aria-pressed', 'true');
  render();
});

fetch('./data.json')
  .then(r => r.json())
  .then(data => {
    ITEMS = data.map(it => Object.assign({}, it, { _date: parseDate(it.period) }));
    updateSortArrows();
    render();
  })
  .catch(err => {
    document.getElementById('table-body').innerHTML =
      '<tr><td colspan="5" class="empty-note">data.json을 불러오지 못했습니다. index.html·app.js·data.json이 같은 폴더에 있는지, http(s)로 서빙되고 있는지 확인해주세요 (file:// 로 더블클릭해서 열면 fetch가 차단됩니다. GitHub Pages에 올리면 정상 동작합니다).</td></tr>';
    console.error(err);
  });
