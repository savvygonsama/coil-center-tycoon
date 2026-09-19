/* ============================================================
   코일센터 경영 시뮬레이터 · 화면
   engine.js의 계산 위에 얹는 껍데기. 규칙은 여기서 만들지 않는다.
   ============================================================ */

const $ = s => document.querySelector(s);
const app = $('#app');
const fmt = n => Math.round(n).toLocaleString('en-US');
const money = n => (n < 0 ? '−$' : '$') + fmt(Math.abs(n));
const M = n => (n < 0 ? '−$' : '$') + (Math.abs(n) / 1e6).toFixed(1) + 'M';

const CAST = {
  seo:  { face: '📋', img: 'cast_seo',  name: '서 대리',   role: '구매 · 자재' },
  jung: { face: '📞', img: 'cast_jung', name: '정 부장',   role: '영업 · 소재 발주' },
  gu:   { face: '🔧', img: 'cast_gu',   name: '구 공장장', role: '생산' },
  han:  { face: '🧮', img: 'cast_han',  name: '한 부장',   role: '관리 · 재무·인사·총무' },
  oh:   { face: '🔍', img: 'cast_oh',   name: '오 과장',   role: '품질' },
  lin:  { face: '☕', img: 'cast_lin',  name: '린 매니저', role: '현지' },
};

/* 말풍선 얼굴. 초상 이미지가 있으면 그걸 쓰고, 없으면 이모지로 돌아간다. */
function face(p) {
  const m = typeof p === 'string' ? CAST[p] : p;
  if (!m) return '';
  return m.img ? `<img class="facepic" src="${A(m.img + `.png`)}" alt="">` : m.face;
}

/* 출발 조건은 모두 같다. 국가·설비·자본금이 다르면 성적 차이가 판단의 차이인지
   출발점의 차이인지 가릴 수 없다. 교육용이니 판단만 남긴다. */
const COUNTRIES = {
  NV: { name: '노바리아', emoji: '🏳️', desc: '자동차 산업이 막 커지기 시작한 가상의 신흥국입니다.' },
};
/* 난이도. 하드는 자본도 얇고 물려받은 판매 기반도 작다.
   같은 판단을 해도 실수 한 번의 값이 다르다. */
const DIFF = {
  normal: { key:'normal', name:'노멀', equity:78_000_000, share:0.10, debtRate:0.60,
    target:45_000_000, trust:65,
    desc:'자본금 $78M. 본사가 붙여준 판매 기반도 넉넉합니다. 판단을 배우기에 좋습니다.' },
  hard:   { key:'hard',   name:'하드', equity:66_000_000, share:0.082, debtRate:0.55,
    target:58_000_000, trust:55,
    desc:'자본금 $66M. 은행 한도도 좁고 물려받은 고객도 적습니다. 첫 1년을 버티는 것부터 일입니다.' },
};
const SETUP = { country: 'NV', lines: ['SLIT', 'LEVEL'], diff: 'normal' };

let G = null;

/* ============================================================
   돌발 이벤트 — 각 선택지는 상태를 직접 바꾼다.
   나중에 터지는 것은 G.pending에 넣어 몇 달 뒤에 청구된다.
   ============================================================ */

/* ---------- 시작 ---------- */
function newGame(opt) {
  const D = DIFF[opt.diff] || DIFF.normal;
  const s = createInitialState({
    seed: (Math.random() * 1e9) | 0,
    equity: D.equity, debtLimit: Math.round(D.equity * D.debtRate),
    myShare: D.share, trust: D.trust,
    lines: opt.lines, country: opt.country, companyName: opt.name,
  });
  /* 노멀은 매달, 속성은 분기마다 결재한다. 속성은 카드 한 벌로 석 달을 한 번에 돌린다.
     48개월 ÷ 3 = 16번이면 끝난다. */
  const mpt = opt.mode === 'quick' ? 3 : 1;
  G = { s, mode: opt.mode || 'normal', mpt, diff: D,
        ui: { cover: 1, hqTake: 0, expandPick: null, overtime: false, yieldSpend: 0, salesSpend: 0 },
        pending: [], seen: {}, cards: {}, picks: {},
        turnDiscount: 0, yieldPenalty: 0, extraFixed: 0 };

  /* 숨은 세계 — 설비·품질·고객 관계·본사 목표. 플레이어는 징후로만 본다. */
  G.W = initWorld(s, D);

  /* 이미 돌던 회사를 넘겨받는다 — 전임 사장의 1년을 실제로 돌려서 그 상태로 시작한다 */
  G.s = runPrelude(G.s);
  G.s.trust = D.trust; G.s.morale = 70;
  applyLegacy(G.s);
  G.W.snaps.push(snapshot(G.s, G.W, G.s.prelude[G.s.prelude.length - 1]));

  /* 대형 사건은 판마다 다른 달에, 다른 조합으로 온다.
     지금은 대부분의 사건이 플레이어의 선택에서 나오므로, 외부 충격은 세 건만 둔다. */
  G.bigPlan = {};
  const bigs = DECK.big.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  const used = [];
  for (const b of bigs) {
    for (let tries = 0; tries < 300; tries++) {
      let m = 6 + Math.floor(Math.random() * (CFG.TOTAL_TURNS - 8));
      // 속성 모드는 분기 첫 달에만 결재하므로, 사건도 그 달로 당겨 놓는다
      if (mpt > 1) m = m - ((m - 1) % mpt);
      if (used.every(u => Math.abs(u - m) >= 5)) { used.push(m); G.bigPlan[m] = b; break; }
    }
  }

  render();
}

/* 이번 달 안건을 짠다.
   고정 덱에서 뽑지 않는다. 회사 상태와 지난 결정이 안건을 올리고(issues.js),
   그중 급한 것부터 서너 건만 사장 책상에 올라온다. 같은 주제는 한 번만. */
function dealTurn() {
  G.trim = trimOptions(Math.random);
  G.trimPick = 0;
  G.cards = {}; G.picks = {};
  G.queue = []; G.qi = 0; G.mult = 1; G.done = [];

  const s = G.s, W = G.W, used = new Set();
  G.before = { rel: { ...W.rel }, equip: W.equip };
  G.ui.cover = { tight: 1.4, normal: 2.2, ample: 3.0 }[W.policy] ?? 2.2;

  const put = (card) => {
    if (!card) return false;
    const t = card.topic || 'etc';
    if (used.has(t)) return false;
    used.add(t);
    if (card.id) G.seen[card.id] = s.turn;
    if (card.id === 'cust') G.lastCust = s.turn;
    G.queue.push({ deck: t, card });
    return true;
  };

  // 1. 외부 충격 — 정해진 달에 온다
  const big = G.bigPlan && G.bigPlan[s.turn];
  if (big) put({ ...big, topic: 'big' });

  // 2. 회사가 만든 안건 — 반드시 올라올 것부터, 그다음 급한 순서
  const cand = worldIssues(s, W, G).sort((a, b) => (b.force - a.force) || (b.prio - a.prio));
  for (const c of cand) {
    if (G.queue.length >= 4) break;
    if (!c.force && G.queue.length >= 3 && c.prio < 70) break;
    put(c.card);
  }

  // 3. 사내 이야기 — 가끔. 숫자로 안 잡히는 일도 회사다.
  if (G.queue.length < 4 && wChance(0.28)) {
    const pool = DECK.life.filter(c => (!c.when || c.when(s, cardCtx(s))) && (s.turn - (G.seen[c.id] ?? -99)) > 12);
    if (pool.length) put(wPick(pool));
  }

  // 4. 너무 조용하면 기회를 하나 올린다
  if (G.queue.length < 2) put(custFocusCard(s, W));
  if (!G.queue.length) put(policyCard(s, W, coverOf(s)));
}

/* ---------- 결재 팝업: 카드 한 장씩, 고르면 바로 결과 ---------- */
function snap(s) {
  return { cash: s.cash, trust: s.trust, morale: s.morale, share: s.myShare };
}
function deltaChips(a, b) {
  const out = [];
  const push = (lab, d, f) => { if (Math.abs(d) > 1e-9) out.push(
    `<span class="chip ${d > 0 ? 'up' : 'down'}">${lab} ${d > 0 ? '+' : '−'}${f(Math.abs(d))}</span>`); };
  push('통장', b.cash - a.cash, v => money(v).replace('$', '$'));
  push('본사 신뢰', Math.round(b.trust - a.trust), v => v);
  push('직원 사기', Math.round(b.morale - a.morale), v => v);
  push('물량', (b.share / a.share - 1) * 100, v => v.toFixed(1) + '%');
  return out.join(' ');
}

/* 효과 칩 — 고르기 전에 뭘 얻고 뭘 잃는지 보인다.
   앞 글자로 색을 정한다. + 이득 / − 손해 / ? 도박 / = 중립 */
function fxChips(list) {
  if (!list || !list.length) return '';
  return `<div class="fx">${list.map(t => {
    const k = t[0];
    const cls = k === '+' ? 'up' : k === '−' || k === '-' ? 'dn' : k === '?' ? 'rsk' : 'neu';
    const body = '+−-?='.includes(k) ? t.slice(1) : t;
    const mark = k === '?' ? '⚠ ' : '';
    return `<span class="${cls}">${mark}${body}</span>`;
  }).join('')}</div>`;
}

/* 직원 얼굴 + 명패 + 말 */
function crewBlock(who) {
  const pic = who.img
    ? `<img src="${A(who.img + `.png`)}" alt="">`
    : `<div class="emoji">${who.face}</div>`;
  return `<div class="crew-pic">${pic}
    <div class="crew-plate"><b>${who.name}</b><i>${who.role}</i></div></div>`;
}

function openDecisions() {
  // 오늘 결재가 끝났으면 바로 한 달을 보낸다. 공장에 다시 들를 일이 없다.
  if (!G.queue || G.qi >= G.queue.length) { advance(); return; }

  const { deck, card } = G.queue[G.qi];
  const who = CAST[card.who] || CAST.han;
  const dlg = document.createElement('dialog');
  dlg.className = 'deck';

  const head = `<div class="deckhead">
    <span>${periodNow()} · ${DECK_LABEL[deck] || '결재'}</span>
    <span class="step">${G.qi + 1} / ${G.queue.length}</span></div>`;

  const ask = () => {
    dlg.innerHTML = `<div class="dlg">${head}
      <div class="crew">${crewBlock(who)}
        <div class="crew-body"><div class="line">${card.text}</div></div></div>
      <div class="deckq"><h2>${card.title}</h2></div>
      <div class="optlist">${card.opts.map((o, i) => `
        <button data-o="${i}"><b>${o.label}</b>${
          o.hint ? `<span class="why">${o.hint}</span>` : ''}${fxChips(o.fx)}</button>`).join('')}</div>
    </div>`;
    dlg.querySelectorAll('[data-o]').forEach(b => b.onclick = () => choose(+b.dataset.o));
  };

  const choose = (i) => {
    const o = card.opts[i];
    const before = snap(G.s);
    let msg = '';
    if (o.apply) msg = o.apply(G.s, G) || '';
    if (o.mult) G.mult *= o.mult;
    if (o.ot) G.ui.overtime = true;
    const chips = deltaChips(before, snap(G.s));
    G.done.push({ deck, title: card.title, choice: o.label, msg });
    if (msg) G.resultLines = (G.resultLines || []).concat(msg);

    const last = G.qi + 1 >= G.queue.length;
    const pic = who.img ? `<img src="${A(who.img + `.png`)}" alt="">`
                        : `<div class="em">${who.face}</div>`;
    dlg.innerHTML = `<div class="dlg">${head}
      <div class="verdict">
        <div class="vlabel">사장님의 결정</div>
        <div class="vchoice">${o.label}</div>
        ${msg ? `<div class="vwho">${pic}<span>${who.name}</span></div>
                 <p class="vmsg">${msg}</p>` : ''}
        ${chips ? `<div class="chips">${chips}</div>` : ''}
        ${o.mult && o.mult !== 1 ? `<div class="chips"><span class="chip ${o.mult >= 1 ? 'up' : 'down'}">
          이번 달 소재 발주 ×${o.mult}</span></div>` : ''}
      </div>
      <div class="vfoot"><button class="primary" id="nx">${
        last ? (G.mpt > 1 ? '석 달 보내기' : '한 달 보내기') : '다음 결재'}</button></div></div>`;
    dlg.querySelector('#nx').onclick = () => {
      dlg.close(); dlg.remove(); G.qi++; openDecisions();
    };
  };

  // ESC로 닫으면 결재 흐름이 끊긴다. 반드시 고르고 나가야 한다.
  dlg.addEventListener('cancel', e => e.preventDefault());
  document.body.appendChild(dlg);
  ask();
  dlg.showModal();
}

// 카드가 조건을 볼 때 쓰는 이번 달 상황
function cardCtx(s) {
  const c = capacityOf(s);
  const n = s.nasi[0] ? s.nasi[0].tons : {};
  const load = ((n.SLIT || 0) + (n.LEVEL || 0)) / Math.max(1, c.SLIT + c.LEVEL);
  const h = s.history;
  const pmTrend = h.length > 1 ? h[h.length - 1].pm - h[h.length - 2].pm : 0;
  return { load, tight: load > 0.97, idle: load < 0.55, pmTrend };
}

const DECK_LABEL = { mat: '자재', hr: '인사', ga: '총무', buy: '소재 발주', policy: '소재 발주 · 방침', cust: '영업 · 고객', price: '영업 · 가격', vol: '영업 · 수주', sales: '영업', prod: '생산', people: '조직', quality: '품질', cash: '재무', credit: '재무', hq: '본사', legacy: '정상화', op: '운영', life: '사내', big: '주요 사건' };

/* 매달 영업 인력을 어느 고객군에 붙일지. 결실은 석 달 뒤. */
function customerCard(s) {
  const when = dateLabel(s.turn + CFG.SALES_EFFORT_LAG);
  return {
    id: 'cust', who: 'jung', topic: 'cust',
    title: '어느 고객군에 붙을까요',
    text: `영업 인력이 몇 명이나 된다고요. 한 군데 골라서 제대로 붙는 게 낫습니다. `
        + `대신 손 놓은 쪽은 조금씩 빠져나갑니다. 그건 각오하셔야 해요. `
        + `결과는 ${when}쯤 나옵니다. 그때까지는 아무 일도 안 일어납니다.`,
    opts: Object.entries(CFG.CUSTOMERS).map(([k, c]) => ({
      label: `${c.emoji} ${c.name}`,
      hint: `지금 우리 거래의 ${((s.custShare[k] || 0) * 100).toFixed(0)}%`,
      fx: [`+${c.good}`, `−${c.bad_}`],
      apply: (st, g) => {
        g.ui.custFocus = k;
        return `${c.name} 쪽에 붙었습니다. ${when}쯤부터 거래 비중이 올라옵니다. `
             + `대신 다른 고객군은 그동안 조금씩 빠집니다.`;
      },
    })),
  };
}

/* ---------- 파생값 ---------- */
function look(s) {
  const c = capacityOf(s);
  const now = s.nasi[0] ? s.nasi[0].tons : {};
  const avg = {}, pot = {};
  for (const k of PROC_LIST) {
    const xs = s.nasi.map(n => n.tons[k]), ps = s.nasi.map(n => (n.potential || n.tons)[k]);
    avg[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    pot[k] = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
  }
  // 소재 기준 월 소요량 — 가공은 로스가 나니 제품 톤을 수율로 나눠야 원료 톤이 된다
  const need = Math.min(c.SLIT, avg.SLIT) / CFG.YIELD.SLIT + Math.min(c.LEVEL, avg.LEVEL) / CFG.YIELD.LEVEL
             + avg.C2C + Math.min(c.BLANK, (avg.TRAP || 0) + (avg.DIE || 0)) / CFG.YIELD.TRAP;
  const haveP = s.poOpen.concat(s.invRaw, s.invFg)
    .filter(l => (l.gr || 'COMMON') === 'PREMIUM').reduce((a, l) => a + l.qty, 0);
  const isBust = CFG.HQ_SPOT.phases.includes(s.market.phase);
  return { c, now, avg, pot, need, haveP, isBust,
    quota: isBust ? (c.SLIT + c.LEVEL + c.BLANK) * CFG.HQ_SPOT.capShareOfCap : 0,
    gapSlit: pot.SLIT - c.SLIT, gapLevel: pot.LEVEL - c.LEVEL };
}

// 고른 카드들이 이번 달 발주량에 거는 배수
function buildDecision(s, ui) {
  const L = look(s);
  const gap = L.need * (CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd + ui.cover) - L.haveP;
  const buy = Math.max(0, Math.min(gap, L.need * 1.6)) * (G ? (G.mult || 1) : 1);
  const n = L.now, hasCommon = (s.hqSpotCredit || 0) > 1;
  /* 가공 제품은 열흘치쯤 들고 있어야 한다. 고객 라인은 JIT로 도는데 우리 라인이 매일 그 순서대로
     돌 수는 없다. 그래서 이번 달 내시에 목표 제품재고와의 차이를 더해서 돌린다. */
  const FG_COVER = 0.35;
  const fgNow = k => s.invFg.filter(l => l.proc === k).reduce((a, l) => a + l.qty, 0);
  const want = k => Math.max(0, (n[k] || 0) * (1 + FG_COVER) - fgNow(k)) / CFG.YIELD[k];
  const idleS = Math.max(0, L.c.SLIT - want('SLIT')), idleL = Math.max(0, L.c.LEVEL - want('LEVEL'));
  const runS = Math.min(L.c.SLIT, want('SLIT') + (hasCommon ? idleS : 0));
  const runL = Math.min(L.c.LEVEL, want('LEVEL') + (hasCommon ? idleL : 0));
  const runT = Math.min(L.c.BLANK * 0.5, want('TRAP')), runD = Math.min(L.c.BLANK * 0.5, want('DIE'));
  return {
    buy: { totalTon: buy, alpha: 1, beta: 1, hqSpotTon: ui.hqTake },
    invest: { addLine: ui.expandPick, newBuilding: s.lines.length >= CFG.MAX_LINES,
              yieldProgram: ui.yieldSpend, salesEffort: ui.salesSpend },
    options: { overtime: ui.overtime, // 깎아준 단가는 그 고객 비중만큼 매달 판가에 남는다
               discount: G ? (G.turnDiscount || 0) + (G.W ? standingCut(s, G.W) : 0) : 0,
               trimYield: G && G.trim ? G.trim.options[G.trimPick].yield : 0,
               custFocus: ui.custFocus || null },
    run: { SLIT: runS, LEVEL: runL, TRAP: runT, DIE: runD },
    // 출하는 이번 달 수요만큼. 제품 창고에서 먼저 나가고, 남는 건 다음 달 안전재고가 된다.
    sell: { C2C: n.C2C || 0, SLIT: 1e9, LEVEL: 1e9, TRAP: 1e9, DIE: 1e9 },
    _buyTon: buy, _L: L,
  };
}

/* ============================================================
   공장 그림
   ============================================================ */
/* ============================================================
   공장 화면 — 셋으로 나눠 본다.
     위    부지 전경 (공장동이 몇 동인가)
     왼쪽  공장 내부 설비 현황 (뭐가 돌고 뭐가 섰나)
     오른쪽 야드 현황 (소재·제품·장기재고가 얼마나 쌓였나)
   전부 256px 픽셀 아트라 확대할 때 뭉개지지 않게 pixelated로 그린다.
   ============================================================ */
/* 그림 주소. build 때 assets.js가 있으면 index.html 안에 data URI로 박히고,
   없으면 art/ 폴더에서 읽는다. 어느 쪽이든 코드는 같다. */
const ART = 'art/';
const A = name => (typeof ART_DATA !== 'undefined' && ART_DATA[name]) ? ART_DATA[name] : ART + name;

function pl(file, x, y, w, z, title) {
  return `<img class="pl" src="${A(file)}" alt="" draggable="false"`
       + (title ? ` title="${title}"` : '')
       + ` style="left:${x}%;top:${y}%;width:${w}%;z-index:${z}">`;
}

/* 공장동 — 건물이 칸을 꽉 채운다. 증축하면 같은 동이 하나 더 선다. */
function hallView(s) {
  const n = s.buildings || 1;
  const halls = [];
  for (let i = 0; i < n; i++) halls.push(`<div class="hall">
      <img class="hallimg" src="${A('bldg1.png')}" alt="공장동">
      <img class="hallcrane" src="${A('crane.png')}" alt="">
      <span class="halltag">${i + 1}동</span>
    </div>`);
  return `<div class="halls">${halls.join('')}</div>
    <div class="hallfoot">공장동 ${n}동 · 라인 ${s.lines.length} / ${CFG.MAX_LINES}${
      (s.buildQueue || []).length ? ` · 설치 중 ${(s.buildQueue || []).length}건` : ''}</div>`;
}

/* 설비 — 위에서 아래로. 기계가 주인공이고, 가동률은 그 밑에 한 줄로만 붙는다. */
function lineList(s, L) {
  const c = L.c;
  const rows = s.lines.map(l => {
    const used = l.type === 'SLIT'  ? (L.now.SLIT  || 0)
               : l.type === 'LEVEL' ? (L.now.LEVEL || 0)
               : (L.now.TRAP || 0) + (L.now.DIE || 0);
    const room = (l.type === 'SLIT' ? c.SLIT : l.type === 'LEVEL' ? c.LEVEL : c.BLANK)
               || CFG.LINE[l.type].cap;
    const util = Math.max(0, Math.min(1, used / Math.max(1, room)));
    const on = used > 0, pct = Math.round(util * 100);
    const file = { SLIT: 'slit', LEVEL: 'level', BLANK: 'blank' }[l.type] + (on ? '_on' : '_off') + '.png';
    return `<div class="lrow ${on ? '' : 'idle'}">
      <div class="ltop"><b>${CFG.LINE[l.type].label}</b>
        <i class="${on ? (util > .92 ? 'hot' : 'on') : 'off'}">${on ? `주문 부하 ${pct}%` : '주문 없음'}</i></div>
      <img src="${A(file)}" alt="">
      <div class="lbot">
        <span class="track"><span class="fill ${util > .92 ? 'over' : ''}" style="width:${pct}%"></span></span>
        <span class="sub">${fmt(used)} / ${fmt(room)}톤</span></div></div>`;
  });

  (s.buildQueue || []).forEach(b => rows.push(`<div class="lrow slim">
    <div class="ltop"><b>${CFG.LINE[b.type].label}</b><i class="wip">설치 중</i></div>
    <div class="ph">${dateLabel(b.readyTurn)}부터 가동 · 그때까지는 돈만 나갑니다</div></div>`));

  const left = CFG.MAX_LINES - s.lines.length - (s.buildQueue || []).length;
  for (let i = 0; i < left; i++) rows.push(`<div class="lrow slim">
    <div class="ltop"><b>빈 자리</b><i class="off">—</i></div>
    <div class="ph">증설하면 여기 들어갑니다</div></div>`);

  return `<div class="lines">${rows.join('')}</div>`;
}

/* 야드 현황 — 재고가 그림 한 장으로 보인다 */
function yardRack(s) {
  const raw = s.invRaw.reduce((a, l) => a + l.qty, 0);
  const fg = s.invFg.reduce((a, l) => a + l.qty, 0);
  const cap = CFG.WAREHOUSE_CAP_BASE;
  const over = (raw + fg) > cap;
  const age = inventoryAging(s);
  const oldTon = age[2].qty + age[3].qty;
  const afloat = s.poOpen.reduce((a, p) => a + p.qty, 0);
  const nextEta = s.poOpen.length ? Math.min(...s.poOpen.map(p => p.etaTurn)) : null;
  const fgSlit = s.invFg.filter(l => l.proc !== 'TRAP' && l.proc !== 'DIE').reduce((a, l) => a + l.qty, 0);
  const fgBlank = s.invFg.filter(l => l.proc === 'TRAP' || l.proc === 'DIE').reduce((a, l) => a + l.qty, 0);

  const tier = raw <= 0 ? null
             : raw < cap * 0.25 ? 'coil_s'
             : raw < cap * 0.55 ? 'coil_m'
             : raw < cap        ? 'coil_l'
             :                    'coil_over';

  const cell = (img, label, val, cls, sub) => `<div class="cell ${cls || ''}">
    ${img ? `<img src="${A(img + '.png')}" alt="">` : `<div class="ph">없음</div>`}
    <b>${label}</b><i class="${cls === 'bad' ? 'off bad' : 'on'}">${val}</i>
    ${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;

  const cells = [
    cell(tier, '소재 야드', `${fmt(raw)}t`, over ? 'bad' : '',
      over ? '한도 초과 · 동선이 막혔습니다' : `창고 한도의 ${Math.round(raw / cap * 100)}%`),
    cell(afloat > 0 ? 'ship' : null, '미착 (바다 위)', afloat > 0 ? `${fmt(afloat)}t` : '없음', '',
      afloat > 0 ? `${dateLabel(nextEta)} 첫 배 도착` : '들어올 배가 없습니다'),
    cell(fgSlit > 0 ? 'fg_slit' : null, '가공 제품', `${fmt(fgSlit)}t`, '', '슬리팅 · 레벨링 · 통코일'),
    cell(fgBlank > 0 ? 'fg_blank' : null, '블랭크', `${fmt(fgBlank)}t`, '', '프레스 가공품'),
    cell(oldTon > 0 ? 'coil_tarp' : null, '장기재고', oldTon > 0 ? `${fmt(oldTon)}t` : '없음',
      oldTon > 0 ? 'bad' : '', '3개월 넘은 것'),
    cell('scrap', '스크랩', '상시', '', '수율에서 나오는 것'),
  ];

  return `<div class="card">
    <h2>야드 · 재고</h2>
    <div class="rack">${cells.join('')}</div></div>`;
}

function plantView(s, L) {
  return `<div class="grid g2">
      <div class="card"><h2>공장동</h2>${hallView(s)}</div>
      <div class="card"><h2>설비</h2>${lineList(s, L)}</div>
    </div>
    ${yardRack(s)}`;
}

/* ---------- 렌더 ---------- */
function render() {
  if (!G) return renderSetup();
  if (G.s.over) return renderEnd();
  renderPlay();
}

function renderSetup() {
  const machine = SETUP.lines.reduce((a, t) => a + CFG.LINE[t].capex, 0);
  const D = DIFF[SETUP.diff] || DIFF.normal;
  const rest = D.equity - CFG.INFRA_TOTAL - machine;
  const country = COUNTRIES[SETUP.country];
  const diffBtn = d => `<button data-diff="${d.key}" class="modecard ${SETUP.diff === d.key ? 'on' : ''}">
      <b>${SETUP.diff === d.key ? '✓ ' : ''}${d.name}</b>
      <span class="n">자본금 ${M(d.equity)} · 판매 기반 ${(d.share * 100).toFixed(1)}%</span>
      <span class="d">${d.desc}</span></button>`;

  app.innerHTML = `
    <h1>코일센터 경영 시뮬레이터</h1>
    <p class="sub">2026년 1월, 해외 코일센터 사장으로 부임합니다. 4년 동안 호황 · 공급과잉 · 불황 · 회복이
      한 번씩 오는데, 순서와 길이는 판마다 다릅니다.</p>

    <div class="card">
      <h2>난이도</h2>
      <div class="modes">${diffBtn(DIFF.normal)}${diffBtn(DIFF.hard)}</div>
      <p class="hint">하드는 통장도 얇고 은행 한도도 좁습니다. 본사가 요구하는 이익 목표는
        ${M(DIFF.normal.target)}에서 <b>${M(DIFF.hard.target)}</b>로 올라갑니다.
        S등급은 거의 안 나옵니다.</p>
    </div>

    <div class="card">
      <div class="say"><div class="face">${face('han')}</div><div class="bubble">
        <span class="who">${CAST.han.name} · ${CAST.han.role}</span>
        사장님, 법인은 이미 세워져 있습니다. 숫자는 여기 정리해뒀습니다. 이름만 정해주시면 됩니다.</div></div>
      <table>
        <tr><td>진출 국가</td><td>${country.emoji} ${country.name} <span class="muted">— ${country.desc}</span></td></tr>
        <tr><td>설비</td><td>슬리터 1기 (연 10만톤) + 레벨러 1기 (연 5만톤)</td></tr>
        <tr><td>자본금</td><td>${money(D.equity)}</td></tr>
        <tr><td>토지·공장동</td><td>−${fmt(CFG.INFRA_TOTAL)}</td></tr>
        <tr><td>설비 2라인</td><td>−${fmt(machine)}</td></tr>
        <tr class="tot"><td>개업 후 통장</td><td>${money(rest)}</td></tr>
        <tr><td>은행 한도</td><td>${money(Math.round(D.equity * D.debtRate))}</td></tr>
      </table>
      <p class="hint">한도는 재고와 매출채권의 70%까지 붙습니다. 공장동 하나에 3라인까지 들어갑니다.</p>
      <label class="row"><div class="lab"><span>회사 이름</span></div>
        <input id="nm" placeholder="예: 한빛 코일센터"
          style="width:100%;padding:11px 13px;border:2px solid var(--ink);font:inherit;background:var(--panel);color:var(--ink)"></label>
    </div>

    <div class="card">
      <h2>결재 주기</h2>
      <div class="modes">
        <button id="go-normal" class="modecard">
          <b>노멀</b>
          <span class="n">48개월 · 결재 48번</span>
          <span class="d">매달 결재합니다. 한 달 한 달이 보이고, 배가 언제 오는지 재고가 어떻게 쌓이는지
            직접 겪습니다. 처음이면 이쪽을 권합니다.</span>
        </button>
        <button id="go-quick" class="modecard">
          <b>속성</b>
          <span class="n">16분기 · 결재 16번</span>
          <span class="d">분기마다 한 번만 결재하고, 정한 방침대로 석 달이 한꺼번에 돌아갑니다.
            빠르게 한 판 끝내보고 싶을 때. 대신 중간에 손을 못 댑니다.</span>
        </button>
      </div>
    </div>`;

  app.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => {
    SETUP.diff = b.dataset.diff; renderSetup();
  });
  const start = mode => newGame({ ...SETUP, mode, name: $('#nm').value.trim() || '노바리아 코일센터' });
  $('#go-normal').onclick = () => start('normal');
  $('#go-quick').onclick = () => start('quick');
}

/* ============================================================
   경영 대시보드 — 이번 달 숫자, 왜 그렇게 됐는지, 앞으로 뭐가 올지
   ============================================================ */

/* 회사 상태 — 숫자로 안 잡히는 것들. 숨은 값은 말로만 보여준다. */
function statusPanel(s, W) {
  const a = W.snaps[W.snaps.length - 1], b = W.snaps[W.snaps.length - 2] || a;
  let relAvg = 0;
  for (const k in CUST) relAvg += (s.custShare[k] || 0) * W.rel[k];
  const m = ((s.turn - 1) % 12);
  const pace = W.hq.target > 0 && m > 0 ? W.hq.ytd / (W.hq.target * m / 12) : null;
  const arrow = (d, inv) => d == null || Math.abs(d) < 0.5 ? '<span class="neu">–</span>'
    : `<span class="${(d > 0) !== !!inv ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'}</span>`;
  const tile = (k, v, d, inv) => `<div class="dtile"><i>${k}</i><b>${v}</b>${arrow(d, inv)}</div>`;
  return `<div class="card">
    <h2>회사 상태</h2>
    <div class="dash">
      ${tile('설비', equipLabel(W.equip), b ? W.equip - b.equip : null)}
      ${tile('양품률', `${qualityPct(W.quality).toFixed(1)}%`, b ? (qualityPct(W.quality) - b.quality) * 5 : null)}
      ${tile('현장', fatigueLabel(W.fatigue), null)}
      ${tile('고객 관계', relLabel(relAvg), b ? relAvg - b.rel : null)}
      ${tile('본사 신뢰', Math.round(s.trust), b ? s.trust - b.trust : null)}
      ${tile('직원 사기', Math.round(s.morale), b ? s.morale - b.morale : null)}
      ${pace != null ? tile('본사 목표 페이스', `${Math.round(pace * 100)}%`, null) : ''}
    </div></div>`;
}

/* 지난달 결정의 영향 — 선택과 결과를 한 줄로 잇는다 */
function impactPanel(W) {
  if (!W.lastImpacts.length) return '';
  return `<div class="card">
    <h2>지난 결재의 영향</h2>
    <div class="imps">${W.lastImpacts.map(im => `<div class="imp"><b>${im.label}</b>
      <div class="fx">${im.rows.map(([k, t]) => {
        const cls = k === '+' ? 'up' : k === '−' ? 'dn' : k === '?' ? 'rsk' : 'neu';
        return `<span class="${cls}">${k === '?' ? '⚠ ' : ''}${t}</span>`; }).join('')}</div></div>`).join('')}</div>
    <p class="hint">판매량·이익 변화는 그 결정이 움직인 몫을 따로 떼어 추정한 값입니다.</p>
  </div>`;
}

/* 이번 달 여파 — 과거의 결정이 지금 돌아온 것 */
function firedPanel(W) {
  if (!W.lastFired.length) return '';
  return `<div class="card fired">
    <h2>돌아온 청구서</h2>
    ${W.lastFired.map(f => `<div class="fire">
      <b>${f.text}</b>${f.why ? `<span>원인 · ${f.why}</span>` : ''}</div>`).join('')}
  </div>`;
}

/* 조기 경보 */
function warnPanel(s, W) {
  const w = warnings(s, W);
  if (!w.length) return '';
  return `<div class="card warns">
    <h2>경고</h2>
    ${w.map(([k, t]) => `<div class="warn"><i>⚠ ${k}</i><span>${t}</span></div>`).join('')}
  </div>`;
}

/* 부서 보고 — 정보에는 확인·추정·소문이 섞여 있다 */
function briefPanel(s, W) {
  const b = briefing(s, W);
  return `<div class="card">
    <h2>부서 보고</h2>
    <div class="briefs">${b.map(x => {
      const who = CAST[x.who];
      return `<div class="brief">
        <div class="bface">${face(x.who)}</div>
        <div class="btext"><span class="bwho">${who.name} · ${who.role}
          <em class="k-${x.kind === '확인' ? 'ok' : x.kind === '추정' ? 'est' : 'rum'}">${x.kind}</em></span>
          ${x.text}</div></div>`; }).join('')}</div>
    <p class="hint">소문은 틀릴 수 있습니다. 누가 말했는지, 확인된 건지를 보고 판단하십시오.</p>
  </div>`;
}

/* 연차 배너 */
function yearBanner(s) {
  const y = Math.min(3, Math.floor((s.turn - 1) / 12));
  const t = YEAR_THEME[y];
  return `<div class="card yearban">
    <b>${y + 1}년차 · ${t.name}</b>
    <span>${t.text}</span>
    <span class="chap">${chapterOf(s, s.turn).label} — ${chapterOf(s, s.turn).brief}</span>
    ${(s.buildQueue || []).length ? `<div class="note">${(s.buildQueue || []).map(b =>
      `${CFG.LINE[b.type].label} 설치 중 — ${dateLabel(b.readyTurn)}부터 가동`).join(' · ')}</div>` : ''}
  </div>`;
}

/* ============================================================
   공장 화면 — 브리핑만 한다. 여기서는 아무것도 결정하지 않는다.
   상황을 보고, 준비가 되면 직원들을 부른다.
   ============================================================ */
function renderPlay() {
  const s = G.s, ui = G.ui;
  const d = buildDecision(s, ui), L = d._L;
  const ph = CFG.PHASE[s.market.phase];
  const stock = inventoryTons(s), transit = s.poOpen.reduce((a, p) => a + p.qty, 0);
  const coverNow = L.need > 0 ? (stock + transit) / L.need : 0;
  const canBorrow = s.debt.limit - s.debt.principal;
  const last = s.history[s.history.length - 1];

  app.innerHTML = `
    <div class="topbar">
      <b>${s.companyName}</b>
      <span>${periodNow()} <i>${periodIndex()} / ${periodTotal()}</i></span>
      <span class="phase ph-${s.market.phase}">${ph.label}</span>
    </div>

    ${yearBanner(s)}

    ${s.turn === 1 && !s.history.length ? takeoverBrief(s) : ''}

    ${firedPanel(G.W)}

    ${perfPanel(s)}

    ${statusPanel(s, G.W)}

    <div class="grid g2">${impactPanel(G.W) || ''}${warnPanel(s, G.W) || ''}</div>

    ${briefPanel(s, G.W)}

    <div class="center" style="margin:6px 0 26px">
      <button class="primary" id="go">결재 시작</button>
      <p class="hint" style="margin-top:10px">${periodNow()} 안건이 올라와 있습니다.
        보고를 읽고, 무엇이 급한지 판단하십시오.</p>
    </div>

    ${plantView(s, L)}


    ${custPanel(s)}

    <div class="grid g2">
      <div class="card">
        <h2>수주 현황 — 고객 내시</h2>
        <p class="hint" style="margin-top:-6px">고객이 석 달 앞까지 확정해 준 물량입니다. 영업이 이걸 보고 소재를 시킵니다.
          지금 본사 소재 시세 톤당 $${fmt(s.market.pm)}.</p>
        <h3 class="h3">이번 달 설비 부하</h3>
        ${bars(L.now, L.c)}
        ${(() => {
          const mon = t => dateLabel(t).replace(/^\d+년 /, '');
          const tot = x => Object.values(x.tons).reduce((a, b) => a + b, 0);
          const hasB = s.nasi.some(x => (x.tons.TRAP || 0) + (x.tons.DIE || 0) > 0);
          const pr = [['통코일', x => x.tons.C2C], ['슬리팅', x => x.tons.SLIT], ['레벨링', x => x.tons.LEVEL]]
            .concat(hasB ? [['블랭킹', x => (x.tons.TRAP || 0) + (x.tons.DIE || 0)]] : []);
          return `<h3 class="h3">공정별 내시 (톤)</h3>
          <table><tr><th></th>${s.nasi.map(x => `<th>${mon(x.turn)}</th>`).join('')}</tr>
            ${pr.map(([n, f]) => `<tr><td>${n}</td>${s.nasi.map(x => `<td>${fmt(f(x) || 0)}</td>`).join('')}</tr>`).join('')}
            <tr class="tot"><td>합계</td>${s.nasi.map(x => `<td>${fmt(tot(x))}</td>`).join('')}</tr></table>
          <h3 class="h3">고객군별 내시 (톤)</h3>
          <table><tr><th></th>${s.nasi.map(x => `<th>${mon(x.turn)}</th>`).join('')}<th>비중</th></tr>
            ${Object.keys(CUST).map(k => `<tr><td>${CUST[k]} · ${CFG.CUSTOMERS[k].name}</td>${s.nasi.map(x =>
              `<td>${fmt(tot(x) * (s.custShare[k] || 0))}</td>`).join('')}<td>${Math.round((s.custShare[k] || 0) * 100)}%</td></tr>`).join('')}
          </table>`;
        })()}
        ${(() => { const lr = last || (s.prelude || []).slice(-1)[0]; return lr ? `<div class="note ${lr.shortageEvents.length ? 'bad' : 'good'}">지난달 내시
          ${fmt(Object.values(lr.demandAuto).reduce((a, b) => a + b, 0))}톤 중
          <b>${fmt(Object.values(lr.shipped).reduce((a, b) => a + b, 0))}톤 납품</b>
          ${lr.shortageEvents.length ? '· 못 채운 고객이 있습니다' : '· 다 채웠습니다'}</div>` : ''; })()}
      </div>

      <div class="card">
        <h2>돈이 어디 있나</h2>
        <table>
          <tr><td>통장</td><td>${money(s.cash)}</td></tr>
          <tr><td>받을 돈</td><td>${money(s.ar.reduce((a, x) => a + x.amount, 0))}</td></tr>
          <tr><td>창고에 잠긴 돈</td><td>${money(stock * s.market.pm)}</td></tr>
          <tr><td>바다에 잠긴 돈</td><td>${money(s.poOpen.reduce((a, p) => a + p.qty * p.unitPriceFixed, 0))}</td></tr>
          <tr><td>줄 돈 (소재값)</td><td class="v neg">−${fmt(s.ap.reduce((a, x) => a + x.amount, 0))}</td></tr>
          <tr><td>은행 빚</td><td class="v neg">−${fmt(s.debt.principal)}</td></tr>
          <tr class="tot"><td>더 빌릴 수 있는 돈</td><td>${money(canBorrow)}</td></tr></table>
        <p class="hint">통장에 돈이 있어도 안심하면 안 됩니다. 대부분 아직 안 낸 소재값입니다.</p>
        <div class="sep"></div>
        <h2>재고가 얼마나 오래됐나</h2>
        ${agingPanel(s)}
        <div class="sep"></div>
        <table><tr><td>창고 + 바다</td><td>${fmt(stock + transit)} 톤</td></tr>
          <tr class="tot"><td>몇 달치인가</td>
            <td class="${coverNow < 2.5 ? 'v neg' : ''}">${coverNow.toFixed(1)}개월</td></tr></table>
        ${coverNow < 2.5 && s.turn > 5 ? `<div class="note bad">${CAST.jung.name}: 이대로면 다음 달 어느 고객 하나는 못 채웁니다.</div>` : ''}
      </div>
    </div>

    ${decisionsMade()}`;

  $('#go').onclick = () => { dealTurn(); openDecisions(); };
}

/* 재고 나이 — 같은 18,000톤이라도 전부 한 달짜리인 것과
   절반이 열 달짜리인 것은 완전히 다른 회사다. */
function agingPanel(s) {
  const b = inventoryAging(s);
  const tot = b.reduce((a, x) => a + x.qty, 0);
  if (tot < 1) return `<p class="hint">창고가 비어 있습니다.</p>`;
  const old = b[2].qty + b[3].qty;
  return `<div class="bars">${b.map((x, i) => `
    <div class="bar"><span>${x.label}</span>
      <span class="track"><span class="fill ${i >= 2 ? 'over' : ''}"
        style="width:${x.qty / tot * 100}%"></span></span>
      <span class="n">${fmt(x.qty)}t</span></div>`).join('')}</div>
    ${old > tot * 0.25
      ? `<div class="note bad">${CAST.oh.name}: 석 달 넘은 게 ${fmt(old)}톤입니다.
         여섯 달 넘으면 녹이 슬어 값을 못 받습니다.</div>`
      : `<p class="hint">석 달까지는 멀쩡합니다. 그 뒤부터 값이 떨어집니다.</p>`}`;
}

/* 이번 달 슬리팅 배분 — 코일센터에서만 나오는 결정 */
/* ============================================================
   운영 결정도 사람이 들고 들어온다.
   화면에 슬라이더로 박아두지 않고, 그 달에 필요할 때만 카드로 올린다.
   ============================================================ */

/* 슬리팅 배분 — 원코일을 어떻게 쪼갤 것인가 */
function trimCard() {
  const t = G.trim, base = CFG.YIELD.SLIT;
  return {
    id: 'op-trim', who: 'gu', topic: 'op',
    title: '원코일을 어떻게 쪼갤까요',
    text: `원코일 폭 ${COIL_WIDTH}mm입니다. 이번 달 고객이 달라는 폭은 `
        + `${t.widths.map(w => w + 'mm').join(', ')} 이렇게 셋입니다. `
        + `남는 폭은 그대로 버립니다. 고객하고는 수율 ${(base * 100).toFixed(0)}%로 값을 정해놨으니까, `
        + `그보다 잘 자르면 그 차액은 우리 겁니다.`,
    opts: t.options.map((o, i) => {
      const diff = (o.yield - base) * 100;
      const combo = t.widths.map((w, k) => o.cuts[k] ? `${w}×${o.cuts[k]}` : null).filter(Boolean).join(' + ');
      return {
        label: combo,
        hint: `수율 ${(o.yield * 100).toFixed(1)}% · 버리는 폭 ${o.trim}mm`,
        fx: [`${diff >= 0 ? '+' : '−'}약속 대비 ${Math.abs(diff).toFixed(1)}%p`,
             diff >= 0 ? '+차액은 우리 이익' : '−차액은 우리가 문다'],
        apply: (s, g) => { g.trimPick = i;
          return diff >= 0
            ? `${combo}로 잡았습니다. 약속한 ${(base * 100).toFixed(0)}%보다 잘 나옵니다. 그만큼 우리 이익입니다.`
            : `${combo}로 잡았습니다. 약속한 수율에 못 미칩니다. 차액은 우리가 뭅니다.`; },
      };
    }),
  };
}

/* 불황기 본사 지시 — 유통향 일반재를 얼마나 받을 것인가 */
function hqCard(L, s) {
  const q = Math.round(L.quota);
  const step = Math.max(500, Math.round(q / 4 / 500) * 500);
  const mk = (ton, label, hint, fx) => ({
    label, hint, fx,
    apply: (st, g) => { g.ui.hqTake = ton;
      if (ton === 0) { st.trust -= CFG.HQ_SPOT.refuseTrustCost;
        return '본사 지시를 거절했습니다. 본사 영업팀이 서운해합니다. 이런 건 평가 때 기억납니다.'; }
      return `${fmt(ton)}톤을 받기로 했습니다. 이제 이걸 우리가 알아서 팔아야 합니다. `
           + `못 팔면 창고에서 늙다가 반값에 나갑니다.`; },
  });
  return {
    id: 'op-hq', who: 'jung', topic: 'op',
    title: '본사 지시 물량을 얼마나 받을까요',
    text: `사장님, 본사 공장이 물량을 못 채웠답니다. 유통향 일반재를 시세보다 `
        + `${(CFG.HQ_SPOT.discount * 100).toFixed(0)}% 싸게 넘기겠다고요. 싼 건 맞습니다. `
        + `근데 이건 고객이 정해진 물건이 아니에요. 우리가 알아서 팔아야 합니다. `
        + `그리고 유통향은 본사 정책상 전체 판매의 15%까지밖에 못 팝니다.`,
    opts: [
      mk(q, '배정량 전부 받는다', `${fmt(q)}톤`,
        ['+본사 신뢰 ↑↑', '−현금이 크게 묶임', '?15% 넘는 건 안 팔린다']),
      mk(Math.round(q * 0.5), '절반만 받는다', `${fmt(Math.round(q * 0.5))}톤`,
        ['+본사 체면 세움', '=팔 수 있는 만큼']),
      mk(step, '생색만 낸다', `${fmt(step)}톤`,
        ['+위험 최소', '−본사가 아쉬워한다']),
      mk(0, '받지 않는다', '우리 살림부터',
        ['+현금 지킴', `−본사 신뢰 ${CFG.HQ_SPOT.refuseTrustCost}`]),
    ],
  };
}

/* 증설 — 설비값보다 소재값이 훨씬 크다는 게 이 카드의 교훈 */
function expandCard(type, L, s) {
  const capex = CFG.LINE[type].capex;
  const newBuild = s.lines.length >= CFG.MAX_LINES;
  const total = capex + (newBuild ? CFG.INFRA_TOTAL : 0);
  const feed = CFG.LINE[type].cap * 3 * s.market.pm;
  const why = type === 'BLANK'
    ? '블랭킹은 지금 우리한테 없는 시장입니다. 놓으면 고객이 새로 붙습니다.'
    : `본사가 주고 싶어 하는 물량이 우리 한계를 월 ${fmt(Math.round(type === 'SLIT' ? L.gapSlit : L.gapLevel))}톤 넘습니다.`;
  return {
    id: 'op-expand', who: 'gu', topic: 'op',
    title: `${CFG.LINE[type].label}를 한 대 더 놓을까요`,
    text: `${why} ${newBuild ? '근데 자리가 없습니다. 공장동을 한 동 더 지어야 합니다. ' : '자리는 있습니다. '}`
        + `말씀드릴 게 하나 있는데, 설비값보다 그걸 채울 소재값이 훨씬 큽니다. 석 달치만 해도 ${money(feed)}입니다.`,
    opts: [
      { label: '짓겠습니다', hint: `${CFG.INSTALL_TURNS}개월 뒤 가동`,
        fx: [`−설비 ${money(total)}`, `−소재 ${money(feed)} 추가로 묶임`,
             `+${CFG.INSTALL_TURNS}개월 뒤 캐파 ↑`],
        apply: (st, g) => { g.ui.expandPick = type;
          return `${CFG.LINE[type].label} 발주했습니다. ${CFG.INSTALL_TURNS}개월 뒤부터 돕니다. `
               + `그때까지는 돈만 나갑니다.`; } },
      { label: '이번엔 넘어갑니다', hint: '현금을 지킨다',
        fx: ['+현금 지킴', '−이 물량은 못 받는다'],
        apply: () => '증설은 미뤘습니다. 그 물량은 다른 데로 갑니다.' },
    ],
  };
}

/* ============================================================
   경영실적 — 사장이 제일 먼저 보는 표
   부임 첫 달은 넘겨받은 회사의 작년 연간·월평균·지난달을,
   그다음부터는 당월(분기)·누계·전월 대비를 보여준다.
   ============================================================ */
function perfPanel(s) {
  const n = (G && G.mpt) || 1, hist = s.history;
  const T = r => Object.values(r.shipped || {}).reduce((a, b) => a + b, 0);
  const K = v => (v < 0 ? '−$' : '$') + fmt(Math.abs(v) / 1000) + 'k';
  const tt = v => fmt(v) + 't';
  const pc = v => (v == null || !isFinite(v) ? '—' : Math.round(v * 100) + '%');
  const mo = v => (v == null || !isFinite(v) ? '—' : v.toFixed(1) + '개월');
  const dol = v => (v == null || !isFinite(v) ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(1) + '/t');

  // 줄 정의 — kind: flow(기간 합) · ratio(비율) · bal(월말 잔액)
  const rows = [];
  const sec = title => rows.push({ head: title });
  const row = (label, kind, fn, f, o = {}) => rows.push({ label, kind, fn, f, ...o });

  sec('판매 실적');
  row('판매량', 'flow', r => T(r), tt, { cls: 'tot' });
  row('통코일', 'flow', r => (r.shipped || {}).C2C || 0, tt, { cls: 'sub' });
  row('가공 · 슬리팅', 'flow', r => (r.shipped || {}).SLIT || 0, tt, { cls: 'sub' });
  row('가공 · 레벨링', 'flow', r => (r.shipped || {}).LEVEL || 0, tt, { cls: 'sub' });
  if (s.lines.some(l => l.type === 'BLANK') || hist.some(r => ((r.shipped || {}).TRAP || 0) + ((r.shipped || {}).DIE || 0) > 0))
    row('가공 · 블랭킹', 'flow', r => ((r.shipped || {}).TRAP || 0) + ((r.shipped || {}).DIE || 0), tt, { cls: 'sub' });
  row('가공 판매 비중', 'ratio', r => { const t = T(r); return t > 0 ? 1 - ((r.shipped || {}).C2C || 0) / t : null; }, pc);

  sec('고객군별 판매');
  for (const k of Object.keys(CUST)) {
    row(`${CUST[k]} · ${CFG.CUSTOMERS[k].name}`, 'flow', r => custTonsOf(r)[k] || 0,
      v => tt(v), { cls: 'sub', share: r => { const t = T(r); return t > 0 ? (custTonsOf(r)[k] || 0) / t : 0; } });
  }

  sec('손익 (천달러)');
  row('매출액', 'flow', r => r.revenue, K);
  row('영업이익', 'flow', r => r.op, K, { cls: 'tot' });
  row('순이익', 'flow', r => r.np, K);
  row('톤당 영업이익', 'ratio', r => { const t = T(r); return t > 0 ? r.op / t : null; }, dol);

  sec('설비 가동률');
  const types = [...new Set(s.lines.map(l => l.type))];
  for (const ty of types)
    row(CFG.LINE[ty].label, 'ratio', r => lineUtilOf(r)[ty], pc);

  sec('재고 · 재원 (월말)');
  row('창고 현물 (소재 + 제품)', 'bal', r => stockOf(r).onhand, tt);
  row('└ 가공 제품', 'bal', r => stockOf(r).fg, tt, { cls: 'sub' });
  row('해상 미착', 'bal', r => stockOf(r).sea, tt);
  row('본사 생산 중', 'bal', r => stockOf(r).prod, tt);
  row('재고량 (현물 + 미착)', 'bal', r => stockOf(r).inv, tt, { cls: 'tot' });
  row('재고율', 'bal', r => stockOf(r).invM, mo, { note: '재고량 ÷ 향후 3개월 내시 평균' });
  row('재원량 (재고 + 생산 중)', 'bal', r => stockOf(r).res, tt, { cls: 'tot' });
  row('재원율', 'bal', r => stockOf(r).resM, mo, { note: '재원량 ÷ 향후 3개월 내시 평균' });
  row('장기재고 (3개월 초과)', 'bal', r => (r.bs || {}).longTons || 0, tt, { inv: true });

  sec('자금 (월말 · 천달러)');
  row('현금', 'bal', r => (r.bs || {}).cash || 0, K);
  row('매출채권', 'bal', r => (r.bs || {}).ar || 0, K);
  row('지연채권', 'bal', r => (r.bs || {}).arDelayed || 0, K, { inv: true });
  row('차입금', 'bal', r => (r.bs || {}).debt || 0, K, { inv: true });
  row('순운전자본', 'bal', r => (r.bs || {}).nwc || 0, K);

  // 기준이 되는 기간들
  let title, heads, cell;
  if (!hist.length) {
    const P = s.prelude || [], last = P[P.length - 1], Y = mergeReports(P);
    const avgBal = fn => P.reduce((a, r) => a + (fn(r) || 0), 0) / Math.max(1, P.length);
    title = `인수 시점 경영실적 · ${(last.date || '').replace(/ \d+월$/, '')}`;
    heads = [`지난달 (${(last.date || '').replace(/^\d+년 /, '')})`, '작년 월평균', '작년 연간'];
    cell = r => {
      if (r.kind === 'flow') return [r.fn(last), r.fn(Y) / P.length, r.fn(Y)].map((v, i) =>
        r.f(v) + (r.share ? ` <span class="sh">${pc(i === 0 ? r.share(last) : r.share(Y))}</span>` : ''));
      if (r.kind === 'ratio') return [r.f(r.fn(last)), '', r.f(r.fn(Y))];
      return [r.f(r.fn(last)), r.f(avgBal(r.fn)), ''];
    };
  } else {
    const cur = mergeReports(hist.slice(-n)), prevL = hist.slice(-2 * n, -n), prev = prevL.length ? mergeReports(prevL) : null;
    const all = mergeReports(hist);
    title = `경영실적 · ${n > 1 ? periodLabel(cur.firstTurn || cur.turn, 3) : cur.date}`;
    heads = [n > 1 ? '이번 분기' : '당월', '부임 후 누계', n > 1 ? '전분기 대비' : '전월 대비'];
    const delta = (r, v, pv) => {
      if (pv == null || v == null || !isFinite(v) || !isFinite(pv)) return '<span class="neu">—</span>';
      const d = v - pv;
      if (Math.abs(d) < 1e-6) return '<span class="neu">–</span>';
      const good = (d > 0) !== !!r.inv;
      const body = r.f === pc ? Math.abs(d * 100).toFixed(1) + '%p' : r.f === mo ? Math.abs(d).toFixed(1) + '개월' : r.f(Math.abs(d));
      return `<span class="${r.f === mo ? 'neu' : good ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${body}</span>`;
    };
    cell = r => {
      const v = r.fn(cur), pv = prev ? r.fn(prev) : null;
      if (r.kind === 'flow') return [r.f(v) + (r.share ? ` <span class="sh">${pc(r.share(cur))}</span>` : ''), r.f(r.fn(all)), delta(r, v, pv)];
      if (r.kind === 'ratio') return [r.f(v), r.f(r.fn(all)), delta(r, v, pv)];
      return [r.f(v), '', delta(r, v, pv)];
    };
  }

  return `<div class="card metrics perf">
    <h2>${title}</h2>
    <table>
      <tr><th></th>${heads.map(h => `<th>${h}</th>`).join('')}</tr>
      ${rows.map(r => r.head
        ? `<tr class="head"><th colspan="4">${r.head}</th></tr>`
        : `<tr class="${r.cls || ''}"><td>${r.label}${r.note ? `<span class="rn">${r.note}</span>` : ''}</td>${cell(r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </table></div>`;
}

/* 부임 첫 달 — 관리부장이 작년 실적을 브리핑한다 */
function takeoverBrief(s) {
  const P = s.prelude || [];
  if (!P.length) return '';
  const Y = mergeReports(P), last = P[P.length - 1];
  const T = r => Object.values(r.shipped || {}).reduce((a, b) => a + b, 0);
  const tons = T(Y), proc = 1 - ((Y.shipped || {}).C2C || 0) / Math.max(1, tons);
  const ct = custTonsOf(Y), ks = Object.keys(CUST).sort((a, b) => (ct[b] || 0) - (ct[a] || 0));
  const u = lineUtilOf(Y), st = stockOf(last);
  const M1 = v => (v < 0 ? '−$' : '$') + (Math.abs(v) / 1e6).toFixed(1) + 'M';
  const K1 = v => (v < 0 ? '−$' : '$') + fmt(Math.abs(v) / 1000) + 'k';
  const lines = s.lines.map(l => `${CFG.LINE[l.type].label} ${Math.round((u[l.type] || 0) * 100)}%`).join(', ');
  return `<div class="card brief-take">
    <div class="say"><div class="face">${face('han')}</div><div class="bubble">
      <span class="who">${CAST.han.name} · ${CAST.han.role}</span>
      사장님, 부임을 환영합니다. 작년 실적부터 보고드리겠습니다.<br><br>
      작년 판매는 <b>${fmt(tons)}톤</b>, 매출 <b>${M1(Y.revenue)}</b>, 영업이익 <b>${K1(Y.op)}</b>,
      순이익 <b>${K1(Y.np)}</b>입니다. ${Y.np < 0 ? '영업으로는 겨우 남겼는데 이자 내고 나면 적자입니다.' : ''}
      가공 판매 비중은 ${Math.round(proc * 100)}%이고, 거래가 제일 큰 곳은
      ${cname(ks[0])} ${Math.round((ct[ks[0]] || 0) / tons * 100)}%, 그다음이 ${cname(ks[1])} ${Math.round((ct[ks[1]] || 0) / tons * 100)}%입니다.
      설비는 작년 평균 ${lines}로 돌았습니다.<br><br>
      지금 창고와 바다 위에 <b>${fmt(st.inv)}톤(${st.invM.toFixed(1)}개월치)</b>, 본사에서 생산 중인 것까지 합치면
      <b>${fmt(st.res)}톤(${st.resM.toFixed(1)}개월치)</b>입니다. 은행 빚은 ${M1(s.debt.principal)}입니다.<br><br>
      짚어드릴 게 두 가지 있습니다. 전임 사장님이 설비 정비를 한 번 미루셨고,
      창고 구석에 규격이 애매한 일반재 2,400톤이 다섯 달째 묵어 있습니다.</div></div>
  </div>`;
}

/* ---------- 고객 구성 ---------- */
function custPanel(s) {
  const sh = s.custShare || {};
  const pf = portfolio(s);
  return `<div class="card">
    <h2>우리 고객 구성</h2>
    ${Object.entries(CFG.CUSTOMERS).map(([k, c]) => {
      const pend = (s.custQueue || []).filter(q => q.key === k);
      const r = G && G.W ? G.W.rel[k] : 60, cut = G && G.W ? G.W.cut[k] : 0;
      return `<div class="custbar"><span>${CUST[k]} · ${c.name}</span>
        <span class="track"><span class="fill" style="width:${(sh[k] || 0) * 100}%"></span></span>
        <span>${((sh[k] || 0) * 100).toFixed(0)}%${pend.length
          ? `<span class="pend">▲${dateLabel(pend[0].turn).replace(/^\d+년 /, '')}</span>` : ''}</span>
        <span class="rel ${relCls(r)}">${relLabel(r)}${cut > 0 ? ` · −$${cut}/t` : ''}</span></div>`;
    }).join('')}
    <p class="hint">이 구성이 판가 톤당 ${pf.margin >= 0 ? '+' : '−'}$${Math.abs(pf.margin).toFixed(1)},
      물량 흔들림 ±${(pf.vol * 100).toFixed(0)}%, 대금 회수 ${pf.dso.toFixed(1)}개월,
      블랭킹 비중 ${(pf.blank * 100).toFixed(0)}%를 만듭니다.</p>
  </div>`;
}

function bars(n, c) {
  const rows = [['슬리팅', n.SLIT || 0, c.SLIT], ['레벨링', n.LEVEL || 0, c.LEVEL], ['통코일', n.C2C || 0, null]];
  if (c.BLANK > 0) rows.push(['블랭킹', (n.TRAP || 0) + (n.DIE || 0), c.BLANK]);
  return `<div class="bars">${rows.map(([lab, v, cap]) => {
    const max = Math.max(v, cap || 0) * 1.15 || 1, over = cap && v > cap;
    return `<div class="bar"><span>${lab}</span>
      <span class="track"><span class="fill ${over ? 'over' : ''}" style="width:${Math.min(100, v / max * 100)}%"></span>
      ${cap ? `<span class="cap" style="left:${cap / max * 100}%"></span>` : ''}</span>
      <span class="n">${fmt(v)}${cap ? ` / ${fmt(cap)}` : ''}</span></div>`;
  }).join('')}</div><p class="hint">검은 선이 우리가 만들 수 있는 한계입니다.</p>`;
}

/* 이번 달 결재 내역 — 결재가 끝나고 결산 화면에서 돌아봤을 때 쓴다 */
function decisionsMade() {
  if (!G.done || !G.done.length) return '';
  return `<div class="card">
    <h2>지난 결재</h2>
    <table>${G.done.map(d => `<tr><td><span class="tag">${DECK_LABEL[d.deck] || '결재'}</span> ${d.title}</td>
      <td><b>${d.choice}</b></td></tr>`).join('')}</table>
  </div>`;
}

/* ---------- 한 달 보내기 ---------- */
/* 지금이 몇 년 몇 월인가 / 몇 분기인가 */
function periodLabel(turn, mpt) {
  if ((mpt || 1) === 1) return dateLabel(turn);
  const d = dateOf(turn);
  return `${d.year}년 ${Math.floor((d.month - 1) / 3) + 1}분기`;
}
const periodNow = () => periodLabel(G.s.turn, G.mpt);
const periodIndex = () => (G.mpt > 1 ? Math.floor((G.s.turn - 1) / 3) + 1 : G.s.turn);
const periodTotal = () => (G.mpt > 1 ? Math.ceil(CFG.TOTAL_TURNS / 3) : CFG.TOTAL_TURNS);

/* 여러 달 결산을 하나로 합친다. 잔액(재고·채권·차입)은 마지막 달 것을 쓰고,
   손익과 물량은 기간 합계를 쓴다. */
/* 고객군별 판매량 — 그 달 출하량을 그 달 고객 구성대로 나눈다 */
function custTonsOf(R) {
  if (R.custTons) return R.custTons;
  const T = Object.values(R.shipped || {}).reduce((a, b) => a + b, 0), out = {};
  for (const k in CFG.CUSTOMERS) out[k] = T * ((R.custShare || {})[k] || 0);
  return out;
}

function mergeReports(list) {
  if (list.length === 1) return list[0];
  const last = list[list.length - 1];
  const sum = k => list.reduce((a, r) => a + (r[k] || 0), 0);
  const sumObj = k => list.reduce((a, r) => {
    for (const p in (r[k] || {})) a[p] = (a[p] || 0) + r[k][p];
    return a;
  }, {});
  return { ...last,
    revenue: sum('revenue'), gp: sum('gp'), op: sum('op'), np: sum('np'),
    hqMargin: sum('hqMargin'), consolidated: sum('consolidated'),
    fixedCost: sum('fixedCost'), varCost: sum('varCost'), depreciation: sum('depreciation'),
    interest: sum('interest'), valuationLoss: sum('valuationLoss'), badDebt: sum('badDebt'),
    degradeLoss: sum('degradeLoss'), dumpLoss: sum('dumpLoss'), scrapRevenue: sum('scrapRevenue'),
    shipped: sumObj('shipped'), demandAuto: sumObj('demandAuto'), sales: sumObj('sales'),
    run: sumObj('run'), capNow: sumObj('capNow'), materialTons: sum('materialTons'),
    // 고객 구성은 달마다 바뀌니, 고객군별 판매량은 달마다 계산해서 더한다
    custTons: list.reduce((a, r) => { const c = custTonsOf(r); for (const k in c) a[k] = (a[k] || 0) + c[k]; return a; }, {}),
    flags: list.flatMap(r => r.flags || []), log: list.flatMap(r => r.log || []),
    phaseChange: list.map(r => r.phaseChange).filter(Boolean).join(' '),
    lineReady: list.map(r => r.lineReady).filter(Boolean).join(' '),
    months: list.length, firstTurn: list[0].turn,
  };
}

function advance() {
  const months = G.mpt || 1;
  const reports = [];
  G.W.fired = [];

  for (let i = 0; i < months; i++) {
    const s = G.s, fired = [];
    G.pending = G.pending.filter(p => {
      if (p.turn <= s.turn) { const m = p.run(s); if (m) fired.push(m); return false; }
      return true;
    });

    const savedY = {};
    if (G.yieldPenalty > 0) {
      for (const k of ['SLIT', 'LEVEL', 'TRAP', 'DIE']) { savedY[k] = CFG.YIELD[k]; CFG.YIELD[k] -= 0.015; }
      G.yieldPenalty--;
    }
    const savedFC = CFG.FC_BASE;
    if (G.extraFixed) CFG.FC_BASE += G.extraFixed;

    /* 증설·본사 지시·고객 영업은 한 번 결정한 것이므로 분기 첫 달에만 집행한다.
       발주와 가동은 석 달 내내 그 방침대로 돈다. */
    const ui = i === 0 ? G.ui : { ...G.ui, expandPick: null, hqTake: 0, custFocus: null };
    worldPre(s, G.W);                       // 설비·품질이 이번 달 캐파와 수율을 정한다
    const res = resolveTurn(s, buildDecision(s, ui));
    worldPost(res.state, G.W, res.report, G); // 결과가 설비·관계·피로를 움직이고, 다음 사건을 부른다

    CFG.FC_BASE = savedFC;
    for (const k in savedY) CFG.YIELD[k] = savedY[k];

    G.s = res.state;
    if (i === 0) (G.resultLines || []).forEach(m => res.report.flags.unshift(m));
    fired.forEach(m => res.report.flags.unshift(m));
    reports.push(res.report);
    if (G.s.over) break;
  }

  // 지난 결재가 실제로 무엇을 움직였는지 정리하고, 이번 달 대시보드 스냅샷을 남긴다
  settleImpacts(G.s, G.W, mergeReports(reports), G.before || { rel: { ...G.W.rel }, equip: G.W.equip });
  G.W.snaps.push(snapshot(G.s, G.W, mergeReports(reports)));
  G.W.lastFired = G.W.fired;

  G.resultLines = [];
  G.turnDiscount = 0;
  Object.assign(G.ui, { hqTake: 0, expandPick: null, overtime: false, yieldSpend: 0, salesSpend: 0, custFocus: null });
  showReport(mergeReports(reports));
}

function showReport(R) {
  const dlg = document.createElement('dialog');
  const shipped = Object.values(R.shipped).reduce((a, b) => a + b, 0);
  const ordered = Object.values(R.demandAuto).reduce((a, b) => a + b, 0);
  const lines = [...(R.phaseChange ? [R.phaseChange] : []), ...R.flags, ...R.log];
  dlg.innerHTML = `<div class="dlg">
    <h2>${R.months > 1 ? periodLabel(R.firstTurn, 3) : R.date} 결산${R.months > 1 ? ` <span class="muted" style="font-size:13px">${R.months}개월 합계</span>` : ''}</h2>
    <table><tr><td>본사 주문</td><td>${fmt(ordered)} 톤</td></tr>
      <tr class="tot"><td>납품</td>
        <td class="${shipped < ordered * .95 ? 'v neg' : 'v pos'}">${fmt(shipped)} 톤</td></tr></table>
    <div class="sep"></div>
    <table>
      <tr><td>매출액</td><td>${money(R.revenue)}</td></tr>
      <tr><td>매출총이익</td><td>${money(R.gp)}</td></tr>
      ${R.valuationLoss > 1 ? `<tr><td class="muted">└ 현물 평가손</td><td class="muted">−${fmt(R.valuationLoss)}</td></tr>` : ''}
      ${R.dumpLoss > 1 ? `<tr><td class="muted">└ 안 팔려서 반값 처분</td><td class="muted">−${fmt(R.dumpLoss)}</td></tr>` : ''}
      ${R.degradeLoss > 1 ? `<tr><td class="muted">└ 오래 묵어 못 쓰게 된 것</td><td class="muted">−${fmt(R.degradeLoss)}</td></tr>` : ''}
      <tr><td>고정비 + 변동비</td><td>−${fmt(R.fixedCost + R.varCost)}</td></tr>
      <tr><td>감가상각</td><td>−${fmt(R.depreciation)}</td></tr>
      <tr class="tot"><td>우리 회사 영업이익</td>
        <td class="${R.op < 0 ? 'v neg' : 'v pos'}">${money(R.op)}</td></tr></table>
    <div class="sep"></div>
    <table><tr><td>본사가 우리에게 소재 팔아 번 돈</td><td>${money(R.hqMargin)}</td></tr>
      <tr class="tot"><td>본사 이익 (우리 + 본사)</td>
        <td class="${R.consolidated < 0 ? 'v neg' : 'v pos'}">${money(R.consolidated)}</td></tr></table>
    ${R.lineReady ? `<div class="note good">${R.lineReady}</div>` : ''}
    ${G.W && G.W.fired.length ? `<div class="sep"></div><h2>돌아온 청구서</h2>${G.W.fired.map(f =>
      `<div class="note bad"><b>${f.text}</b>${f.why ? `<br><span class="muted">원인 · ${f.why}</span>` : ''}</div>`).join('')}` : ''}
    ${lines.length ? `<div class="sep"></div>${lines.map(t =>
      `<div class="note ${/결품|넘겼|막혀|모자|대손|떠나|부도|클레임|넘어갔|나갔/.test(t) ? 'bad' : ''}">${t}</div>`).join('')}` : ''}
    <div class="ok"><button class="primary" id="close">확인</button></div></div>`;
  dlg.addEventListener('cancel', e => e.preventDefault());
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.querySelector("#close").onclick = () => {
    dlg.close(); dlg.remove();
    render();
  };
}

function renderEnd() {
  const g = grade(G.s, (G.diff || DIFF.normal).target), s = G.s, W = G.W;
  const P = companyProfile(s, W), m = P.m;
  const k = v => (v < 0 ? '−$' : '$') + fmt(Math.abs(v) / 1000) + 'k';
  const styleBars = Object.keys(STYLE_NAME).map(key => {
    const tot = Object.values(W.style).reduce((a, b) => a + b, 0) || 1;
    const p = (W.style[key] || 0) / tot;
    return `<div class="custbar"><span>${STYLE_NAME[key]}</span>
      <span class="track"><span class="fill ${key === P.main ? 'over' : ''}" style="width:${p * 100}%"></span></span>
      <span>${Math.round(p * 100)}%</span></div>`;
  }).join('');
  const custRows = Object.keys(CUST).map(c => `<div class="custbar"><span>${CUST[c]} · ${CFG.CUSTOMERS[c].name}</span>
      <span class="track"><span class="fill" style="width:${(s.custShare[c] || 0) * 100}%"></span></span>
      <span>${Math.round((s.custShare[c] || 0) * 100)}%</span>
      <span class="rel ${relCls(W.rel[c])}">${relLabel(W.rel[c])}</span></div>`).join('');
  const hqRows = W.hq.log.map(y => `<tr><td>${y.year}년차 본사 목표</td>
      <td class="${y.r >= 1 ? 'v pos' : y.r < 0.9 ? 'v neg' : ''}">${Math.round(y.r * 100)}%</td></tr>`).join('');

  app.innerHTML = `
    <div class="card center" style="padding:30px 22px 24px">
      <p class="muted">${s.companyName} · ${s.history.length}개월 · ${(G.diff || DIFF.normal).name}</p>
      <h1 style="margin:4px 0 2px">당신이 만든 회사</h1>
      <div class="big" style="color:var(--blue)">${P.name}</div>
      <div class="profile">${P.lines.map(t => `<p>${t}</p>`).join('')}</div>
      <p class="muted" style="font-size:13px;margin-top:14px">본사 평가 ${g.grade} · ${g.title} — ${g.desc}</p>
    </div>

    <div class="grid g2">
      <div class="card">
        <h2>4년의 숫자</h2>
        <table>
          <tr><td>누적 판매량</td><td>${fmt(m.tons)}t</td></tr>
          <tr><td>누적 영업이익</td><td class="${m.op < 0 ? 'v neg' : 'v pos'}">${k(m.op)}</td></tr>
          <tr><td>톤당 평균 영업이익</td><td>$${m.margin.toFixed(1)}/t</td></tr>
          <tr><td>본사 소재 판매량</td><td>${fmt(m.hqTons)}t</td></tr>
          <tr><td>본사 이익 (우리 + 본사)</td><td class="${g.consol < 0 ? 'v neg' : 'v pos'}">${k(g.consol)}</td></tr>
          <tr><td>본사 내시 수행률</td><td>${Math.round(g.fulfil * 100)}%</td></tr>
          ${hqRows}
          <tr><td>평균 가동률</td><td>${Math.round(m.util * 100)}%</td></tr>
          <tr><td>평균 양품률</td><td>${m.quality.toFixed(1)}%</td></tr>
          <tr><td>재고 회전 (미착 포함)</td><td>연 ${m.turnover.toFixed(1)}회</td></tr>
          <tr><td>마지막 현금</td><td>${k(m.cash)}</td></tr>
          <tr><td>본사 신뢰도</td><td>${Math.round(m.trust)}</td></tr>
          <tr><td>직원 사기</td><td>${Math.round(m.morale)}</td></tr>
          <tr class="tot"><td>핵심 고객 의존도</td><td>${CUST[m.topK]} ${Math.round(m.topShare * 100)}%</td></tr>
        </table>
      </div>
      <div class="card">
        <h2>사고와 선택</h2>
        <table>
          <tr><td>설비 고장</td><td>${W.stats.breakdowns}번</td></tr>
          <tr><td>정비를 미룬 횟수</td><td>${W.stats.deferrals}번</td></tr>
          <tr><td>품질 클레임</td><td>${W.stats.claims}건</td></tr>
          <tr><td>납기를 못 맞춘 달</td><td>${W.stats.shortages}번</td></tr>
          <tr><td>가격을 양보한 횟수</td><td>${W.stats.concessions}번</td></tr>
          <tr><td>경쟁사로 빠진 물량</td><td>${W.stats.churn}번</td></tr>
          <tr><td>가동률 90% 넘은 달</td><td>${W.stats.overloadMonths}개월</td></tr>
          <tr><td>현금이 빠듯했던 달</td><td>${W.stats.cashTight}개월</td></tr>
        </table>
        <div class="sep"></div>
        <h2>경영 스타일</h2>
        ${styleBars}
        <div class="sep"></div>
        <h2>고객 포트폴리오</h2>
        ${custRows}
      </div>
    </div>
    <div class="center" style="margin-top:18px"><button class="primary" id="again">다시 하기</button></div>`;
  $('#again').onclick = () => { G = null; render(); };
}

render();
