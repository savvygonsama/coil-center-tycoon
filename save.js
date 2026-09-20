/* ============================================================
   save.js — 중간 저장 · 명예의 전당 · 앱 설치

   저장은 전부 이 브라우저 안에서만 산다(localStorage). 서버도 계정도 없다.
   시크릿 창이나 저장소를 막아둔 환경에서는 읽기·쓰기가 그냥 실패한다.
   그래서 모든 접근을 try로 감싸고, 실패하면 저장 기능만 조용히 꺼진다 —
   게임 자체는 저장이 안 되는 채로 끝까지 돈다.
   ============================================================ */

const SAVE_KEY = 'coilcenter.save.v1';
const HALL_KEY = 'coilcenter.hall.v1';
const SAVE_VER = 1;

/* localStorage가 살아 있는가. 사파리 프라이빗은 쓰기에서 터진다 */
let storageOK = null;
function canStore() {
  if (storageOK !== null) return storageOK;
  try {
    localStorage.setItem('coilcenter.probe', '1');
    localStorage.removeItem('coilcenter.probe');
    storageOK = true;
  } catch { storageOK = false; }
  return storageOK;
}
function readJSON(key) {
  if (!canStore()) return null;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function writeJSON(key, val) {
  if (!canStore()) return false;
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch { return false; }   // 용량 초과도 여기로 떨어진다
}

/* ============================================================
   중간 저장 — 결재 도중에는 저장하지 않는다.
   한 달이 끝나고 공장 화면으로 돌아온 그 시점만 저장한다.
   결재 팝업 한가운데 상태를 되살리려면 카드 함수까지 직렬화해야 하는데,
   그건 저장 파일이 아니라 프로그램을 저장하는 일이다.
   ============================================================ */

/* G에서 저장할 것만 골라낸다. 함수와 DOM은 못 담는다.
   G.queue(이번 달 카드)와 G.pending(run 함수를 든 예약)은 함수를 품고 있어 버린다 —
   대신 저장 시점이 "결재 전"이라 카드는 불러올 때 다시 뽑으면 되고,
   pending은 turn만 남겨 두고 되살린다. */
function serializeGame() {
  if (!G || !G.s) return null;
  return {
    v: SAVE_VER,
    at: Date.now(),
    s: G.s,
    W: G.W,
    mode: G.mode, mpt: G.mpt,
    diffKey: (G.diff && G.diff.key) || 'normal',
    ui: G.ui,
    seen: G.seen, picks: G.picks,
    bigPlan: G.bigPlan,
    turnDiscount: G.turnDiscount, yieldPenalty: G.yieldPenalty, extraFixed: G.extraFixed,
    lastCust: G.lastCust,
    resultLines: G.resultLines || [],
    // 예약된 사건은 언제 터질지만 남긴다. 되살릴 때 같은 덱에서 다시 붙인다.
    pendingTurns: (G.pending || []).map(p => p.turn),
  };
}

function saveGame(quiet) {
  const snap = serializeGame();
  if (!snap) return false;
  const ok = writeJSON(SAVE_KEY, snap);
  if (!quiet) toast(ok ? '저장했습니다. 창을 닫아도 이어서 할 수 있습니다.'
                       : '저장에 실패했습니다. 브라우저가 저장소를 막아둔 것 같습니다.');
  return ok;
}

function loadedSave() { return readJSON(SAVE_KEY); }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

function resumeGame() {
  const d = loadedSave();
  if (!d || d.v !== SAVE_VER) { toast('저장 파일을 읽지 못했습니다.'); return; }
  G = {
    s: d.s, W: d.W,
    mode: d.mode, mpt: d.mpt || 1,
    diff: DIFF[d.diffKey] || DIFF.normal,
    ui: d.ui, seen: d.seen || {}, cards: {}, picks: d.picks || {},
    bigPlan: d.bigPlan || {},
    pending: (d.pendingTurns || []).map(t => ({ turn: t, run: () => null })),
    turnDiscount: d.turnDiscount || 0, yieldPenalty: d.yieldPenalty || 0,
    extraFixed: d.extraFixed || 0, lastCust: d.lastCust,
    resultLines: d.resultLines || [],
  };
  render();
  toast(`${periodNow()}부터 이어서 합니다.`);
}

/* 화면 아래에서 잠깐 떴다 사라지는 알림 */
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

/* 저장이 얼마나 지났는지 — "3분 전", "어제" */
function sinceLabel(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d === 1 ? '어제' : `${d}일 전`;
}

/* ============================================================
   명예의 전당 — 끝낸 판의 기록
   ============================================================ */
function hallRecords() {
  const r = readJSON(HALL_KEY);
  return Array.isArray(r) ? r : [];
}

function recordRun(s, W, D, grade, profile) {
  const rec = {
    at: Date.now(),
    company: s.companyName,
    diff: D.name, diffKey: D.key,
    mode: G.mpt > 1 ? '속성' : '노멀',
    months: s.history.length,
    ended: s.overReason,
    grade: grade && (grade.g || grade.grade || grade.label) || '—',
    hq: Math.round(s.hq.cumConsolidated),
    equity: Math.round(s.equity),
    paidIn: Math.round(s.paidIn),
    share: +(s.myShare * 100).toFixed(1),
    op: Math.round(s.history.reduce((a, x) => a + (x.op || 0), 0)),
    style: profile && profile.name || '',
    stats: { breakdowns: W.stats.breakdowns, claims: W.stats.claims,
             shortages: W.stats.shortages, concessions: W.stats.concessions },
  };
  const all = hallRecords();
  all.unshift(rec);
  writeJSON(HALL_KEY, all.slice(0, 50));   // 쉰 판까지만 남긴다
  return rec;
}

function clearHall() {
  if (!confirm('기록을 전부 지웁니다. 되돌릴 수 없습니다. 지울까요?')) return;
  try { localStorage.removeItem(HALL_KEY); } catch {}
  render();
}

/* 기록을 파일로 빼둔다 — 브라우저를 갈아타거나 남에게 보낼 때 */
function exportHall() {
  const all = hallRecords();
  if (!all.length) { toast('아직 기록이 없습니다.'); return; }
  const head = ['끝낸 날짜', '회사', '난이도', '주기', '개월', '등급', '모법이익($)', '자기자본($)',
                '누적영업이익($)', '점유율(%)', '경영 스타일', '고장', '클레임', '결품', '양보'];
  const rows = all.map(r => [
    new Date(r.at).toLocaleString('ko-KR'), r.company, r.diff, r.mode, r.months, r.grade,
    r.hq, r.equity, r.op, r.share, r.style,
    r.stats.breakdowns, r.stats.claims, r.stats.shortages, r.stats.concessions,
  ]);
  const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  // 엑셀이 한글을 깨뜨리지 않게 BOM을 붙인다
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `코일센터의_제왕_기록_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function hallPanel() {
  const all = hallRecords();
  if (!all.length) return '';
  const M1 = v => (v < 0 ? '−$' : '$') + (Math.abs(v) / 1e6).toFixed(1) + 'M';
  const best = all.reduce((a, b) => (b.hq > a.hq ? b : a), all[0]);
  return `<div class="card records">
    <h2>명예의 전당 <span class="muted">— 끝낸 판 ${all.length}회</span></h2>
    <p class="hint">최고 기록은 <b>${best.company}</b> · ${best.diff} · ${best.grade}등급 · 모법이익 ${M1(best.hq)}입니다.</p>
    <div class="rectbl"><table>
      <tr><th>끝낸 날</th><th>회사</th><th>난이도</th><th>개월</th><th>등급</th>
          <th>모법이익</th><th>자기자본</th><th>경영 스타일</th></tr>
      ${all.slice(0, 12).map(r => `<tr>
        <td>${new Date(r.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</td>
        <td class="hname">${r.company}</td>
        <td>${r.diff}${r.mode === '속성' ? ' · 속성' : ''}</td>
        <td>${r.months}</td>
        <td class="hgrade">${r.grade}</td>
        <td>${M1(r.hq)}</td>
        <td class="${r.equity < 0 ? 'dn' : ''}">${M1(r.equity)}</td>
        <td class="hstyle">${r.style || '—'}</td></tr>`).join('')}
    </table></div>
    <div class="hbtns">
      <button class="mini" id="hall-csv">기록 내려받기 (CSV)</button>
      <button class="mini" id="hall-clear">전부 지우기</button>
    </div>
  </div>`;
}

function wireHall() {
  const a = document.getElementById('hall-csv'); if (a) a.onclick = exportHall;
  const b = document.getElementById('hall-clear'); if (b) b.onclick = clearHall;
}

/* ============================================================
   앱 설치 — 휴대폰 홈 화면에 얹는다
   ============================================================ */
let installPrompt = null;
let installedFlag = false;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();          // 브라우저 기본 배너를 막고 우리 버튼으로 받는다
  installPrompt = e;
  const box = document.getElementById('install'); if (box) box.outerHTML = installPanel();
  wireInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null; installedFlag = true;
  const box = document.getElementById('install'); if (box) box.outerHTML = installPanel();
  toast('설치했습니다. 이제 홈 화면에서 바로 열 수 있습니다.');
});

/* 첫 화면 설치 안내.
   크롬·엣지·삼성인터넷은 버튼 한 번으로 깔린다.
   아이폰 사파리는 beforeinstallprompt를 안 주므로 손으로 하는 법을 적어준다. */
function installPanel() {
  if (isStandalone() || installedFlag)
    return `<div class="card install done" id="install">
      <h2>앱으로 실행 중입니다</h2>
      <p class="hint">홈 화면 아이콘으로 열렸습니다. 비행기 안에서도 돌아갑니다.</p></div>`;

  if (installPrompt)
    return `<div class="card install" id="install">
      <h2>휴대폰에 앱으로 설치하기</h2>
      <p class="hint">홈 화면에 아이콘이 생기고, 주소창 없이 전체 화면으로 열립니다.
        인터넷이 없어도 돌아갑니다.</p>
      <button class="primary" id="btn-install">지금 설치</button></div>`;

  if (isIOS())
    return `<div class="card install" id="install">
      <h2>아이폰에 앱으로 설치하기</h2>
      <ol class="steps">
        <li>사파리 아래쪽 <b>공유 버튼</b>(↑)을 누릅니다</li>
        <li>메뉴를 내려서 <b>「홈 화면에 추가」</b>를 누릅니다</li>
        <li>오른쪽 위 <b>「추가」</b>를 누르면 끝입니다</li>
      </ol>
      <p class="hint">크롬이 아니라 <b>사파리</b>로 열어야 이 메뉴가 나옵니다.</p></div>`;

  return `<div class="card install" id="install">
    <h2>휴대폰에 앱으로 설치하기</h2>
    <p class="hint">안드로이드는 크롬 오른쪽 위 <b>⋮ → 「앱 설치」</b>,
      PC는 주소창 오른쪽 <b>설치 아이콘</b>을 누르면 앱으로 깔립니다.
      깔아두면 인터넷이 없어도 돌아갑니다.</p></div>`;
}

function wireInstall() {
  const b = document.getElementById('btn-install');
  if (!b) return;
  b.onclick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome !== 'accepted') toast('설치를 취소했습니다. 나중에 다시 하셔도 됩니다.');
    installPrompt = null;
  };
}

/* 서비스 워커는 http(s)에서만 등록된다. file://로 열면 조용히 건너뛴다. */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* 실수로 탭을 닫는 경우를 대비해 나갈 때 한 번 더 저장해둔다.
   결재 도중이면 이번 달 결재는 버려지고 그달 처음으로 돌아간다. */
window.addEventListener('pagehide', () => { if (G && G.s && !G.s.over) saveGame(true); });

/* 첫 그리기. ui.js가 아니라 여기서 부른다 —
   첫 화면에 설치 안내와 이어하기 버튼이 같이 떠야 하니까. */
render();
