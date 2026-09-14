// 두 페이지(index.html의 3D 시각화, projects.html의 표)가 함께 쓰는 유틸리티.

// data.json을 수정했는데 브라우저가 예전 버전을 계속 보여준다면
// 이 값만 바꿔주세요 (날짜-순번 등 아무 문자열이나 OK). 값이 바뀌면
// 브라우저는 완전히 새로운 URL로 인식해서 캐시를 쓰지 않고 새로 받아옵니다.
export const DATA_VERSION = '2026-09-11-01';

export function parseDateToken(period) {
  const m = String(period).match(/(\d{4})/);
  return m ? m[1] : '0000';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function fetchCareerItems() {
  const res = await fetch(`./data.json?v=${DATA_VERSION}`);
  if (!res.ok) throw new Error(`data.json 요청 실패 (HTTP ${res.status})`);
  const data = await res.json();
  return data.map(it => Object.assign({}, it, { _date: parseDateToken(it.period) }));
}

// 클립보드 복사 + 버튼에 짧은 시각 피드백을 준다. Clipboard API를 못 쓰는
// 환경(오래된 브라우저, http 비보안 컨텍스트 등)에서는 textarea 방식으로 대체한다.
export async function copyToClipboard(text, buttonEl, doneLabel = '복사됨!') {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e2) {
      ok = false;
    }
  }
  if (buttonEl) {
    const original = buttonEl.textContent;
    buttonEl.textContent = ok ? doneLabel : '복사 실패 (직접 선택해주세요)';
    buttonEl.classList.add('copy-fx');
    buttonEl.disabled = true;
    setTimeout(() => {
      buttonEl.textContent = original;
      buttonEl.classList.remove('copy-fx');
      buttonEl.disabled = false;
    }, 1600);
  }
  if (!ok) {
    window.prompt('아래 링크를 직접 복사해주세요:', text);
  }
  return ok;
}
