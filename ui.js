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
  seo:  { face: '📋', name: '서 대리', role: '구매' },
  jung: { face: '📞', name: '정 과장', role: '영업' },
  gu:   { face: '🔧', name: '구 공장장', role: '생산' },
  han:  { face: '🧮', name: '한 대리', role: '경리' },
  oh:   { face: '🔍', name: '오 과장', role: '품질' },
  lin:  { face: '☕', name: '린 매니저', role: '현지' },
};

/* 출발 조건은 모두 같다. 국가·설비·자본금이 다르면 성적 차이가 판단의 차이인지
   출발점의 차이인지 가릴 수 없다. 교육용이니 판단만 남긴다. */
const COUNTRIES = {
  NV: { name: '노바리아', emoji: '🏳️', desc: '자동차 산업이 막 커지기 시작한 가상의 신흥국입니다.' },
};
const SETUP = { country: 'NV', lines: ['SLIT', 'LEVEL'], equity: 65_000_000 };

let G = null;

/* ============================================================
   돌발 이벤트 — 각 선택지는 상태를 직접 바꾼다.
   나중에 터지는 것은 G.pending에 넣어 몇 달 뒤에 청구된다.
   ============================================================ */

/* ---------- 시작 ---------- */
function newGame(opt) {
  const s = createInitialState({
    seed: (Math.random() * 1e9) | 0,
    equity: opt.equity, debtLimit: Math.round(opt.equity * 0.6),
    lines: opt.lines, country: opt.country, companyName: opt.name,
  });
  /* 노멀은 매달, 속성은 분기마다 결재한다. 속성은 카드 한 벌로 석 달을 한 번에 돌린다.
     48개월 ÷ 3 = 16번이면 끝난다. */
  const mpt = opt.mode === 'quick' ? 3 : 1;
  G = { s, mode: opt.mode || 'normal', mpt,
        ui: { cover: 1, hqTake: 0, expandPick: null, overtime: false, yieldSpend: 0, salesSpend: 0 },
        pending: [], seen: {}, cards: {}, picks: {},
        turnDiscount: 0, yieldPenalty: 0, extraFixed: 0 };

  /* 대형 사건은 판마다 다른 달에, 다른 조합으로 온다.
     다섯 건을 뽑아 서로 다섯 달 이상 떨어뜨려 배치한다. */
  G.bigPlan = {};
  const bigs = DECK.big.slice().sort(() => Math.random() - 0.5).slice(0, 5);
  const used = [];
  for (const b of bigs) {
    for (let tries = 0; tries < 300; tries++) {
      let m = 6 + Math.floor(Math.random() * (CFG.TOTAL_TURNS - 8));
      // 속성 모드는 분기 첫 달에만 결재하므로, 사건도 그 달로 당겨 놓는다
      if (mpt > 1) m = m - ((m - 1) % mpt);
      if (used.every(u => Math.abs(u - m) >= 5)) { used.push(m); G.bigPlan[m] = b; break; }
    }
  }

  dealTurn(); openDecisions();
}

/* 이번 달 결재판을 짠다. 구매·영업·생산에서 한 장씩, 그리고 정해진 달에는 대형 사건.
   카드는 한 장씩 팝업으로 올라오고, 고르는 즉시 결과가 나온다. */
function dealTurn() {
  G.trim = trimOptions(Math.random);
  G.trimPick = 0;
  G.cards = {}; G.picks = {};
  G.queue = []; G.qi = 0; G.mult = 1; G.done = [];
  const ctx = cardCtx(G.s);
  const big = G.bigPlan && G.bigPlan[G.s.turn];
  if (big) G.queue.push({ deck: 'big', card: big });
  const draw = (deck, skip = []) => {
    const pool = DECK[deck].filter(c => !skip.includes(c.id) && (!c.when || c.when(G.s, ctx)));
    const fresh = pool.filter(c => (G.s.turn - (G.seen[c.id] || -99)) > 5);
    const use = fresh.length ? fresh : pool;
    if (!use.length) return null;
    const card = use[Math.floor(Math.random() * use.length)];
    G.seen[card.id] = G.s.turn;
    return card;
  };
  G.queue.push({ deck: 'buy', card: draw('buy') });
  // 영업은 매달 반드시 고객군을 고른다. 여기에 가끔 영업 사건이 하나 더 붙는다.
  G.queue.push({ deck: 'cust', card: customerCard(G.s) });
  if (Math.random() < 0.45) {
    const c = draw('sales', ['s-visit', 's-newcust']);   // 고객 선택 카드와 겹치는 것은 뺀다
    if (c) G.queue.push({ deck: 'sales', card: c });
  }
  G.queue.push({ deck: 'prod', card: draw('prod') });
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

function openDecisions() {
  if (!G.queue || G.qi >= G.queue.length) { render(); return; }
  const { deck, card } = G.queue[G.qi];
  const who = CAST[card.who];
  const dlg = document.createElement('dialog');
  dlg.className = 'deck';
  const head = `<div class="dlgtop">
      <span class="tag">${periodNow()} · ${DECK_LABEL[deck]}</span>
      <span class="muted" style="font-size:12px">${G.qi + 1} / ${G.queue.length}</span></div>`;

  const ask = () => {
    dlg.innerHTML = `<div class="dlg">${head}
      <h2 style="font-size:19px;margin:10px 0 12px">${card.title}</h2>
      <div class="say"><div class="face">${who.face}</div><div class="bubble">
        <span class="who">${who.name} · ${who.role}</span>${card.text}</div></div>
      <div class="optlist">${card.opts.map((o, i) => `
        <button data-o="${i}"><b>${o.label}</b>${o.hint ? `<span>${o.hint}</span>` : ''}</button>`).join('')}</div>
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
    const after = snap(G.s);
    const chips = deltaChips(before, after);
    G.done.push({ deck, title: card.title, choice: o.label, msg });
    if (msg) G.resultLines = (G.resultLines || []).concat(msg);

    dlg.innerHTML = `<div class="dlg">${head}
      <div class="verdict">
        <div class="vlabel">사장님의 결정</div>
        <div class="vchoice">${o.label}</div>
        ${msg ? `<p class="vmsg">${msg}</p>` : ''}
        ${chips ? `<div class="chips">${chips}</div>` : ''}
        ${o.mult ? `<div class="chips"><span class="chip ${o.mult >= 1 ? 'up' : 'down'}">이번 달 발주 ×${o.mult}</span></div>` : ''}
      </div>
      <div class="ok"><button class="primary" id="nx">
        ${G.qi + 1 < G.queue.length ? '다음 결재' : '공장으로'}</button></div></div>`;
    dlg.querySelector('#nx').onclick = () => {
      dlg.close(); dlg.remove(); G.qi++; openDecisions();
    };
  };

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

const DECK_LABEL = { buy: '구매', cust: '영업 · 고객 개척', sales: '영업', prod: '생산', big: '주요 사건' };

/* 매달 영업 인력을 어느 고객군에 붙일지. 결실은 석 달 뒤. */
function customerCard(s) {
  const when = dateLabel(s.turn + CFG.SALES_EFFORT_LAG);
  return {
    id: 'cust', who: 'jung',
    title: '이번 달 어느 고객군에 공을 들이시겠습니까',
    text: `영업 인력은 한정돼 있습니다. 한 곳을 골라 붙겠습니다. 결실은 ${when}쯤 봅니다.
           손 놓은 고객군은 조금씩 빠져나갑니다.`,
    opts: Object.entries(CFG.CUSTOMERS).map(([k, c]) => ({
      label: `${c.emoji} ${c.name} — 지금 ${((s.custShare[k] || 0) * 100).toFixed(0)}%`,
      hint: `＋ ${c.good}  ／  － ${c.bad_}`,
      apply: (st, g) => {
        g.ui.custFocus = k;
        return `${c.name}에 영업을 붙였습니다. ${when}쯤 거래 비중이 늘어납니다.`;
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
  const need = Math.min(c.SLIT, avg.SLIT) + Math.min(c.LEVEL, avg.LEVEL)
             + avg.C2C + Math.min(c.BLANK, (avg.TRAP || 0) + (avg.DIE || 0));
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
  const idleS = Math.max(0, L.c.SLIT - (n.SLIT || 0)), idleL = Math.max(0, L.c.LEVEL - (n.LEVEL || 0));
  const runS = Math.min(L.c.SLIT, (n.SLIT || 0) + (hasCommon ? idleS : 0));
  const runL = Math.min(L.c.LEVEL, (n.LEVEL || 0) + (hasCommon ? idleL : 0));
  const runT = Math.min(L.c.BLANK * 0.5, n.TRAP || 0), runD = Math.min(L.c.BLANK * 0.5, n.DIE || 0);
  return {
    buy: { totalTon: buy, alpha: 1, beta: 1, hqSpotTon: ui.hqTake },
    invest: { addLine: ui.expandPick, newBuilding: s.lines.length >= CFG.MAX_LINES,
              yieldProgram: ui.yieldSpend, salesEffort: ui.salesSpend },
    options: { overtime: ui.overtime, discount: G ? G.turnDiscount : 0,
               trimYield: G && G.trim ? G.trim.options[G.trimPick].yield : 0,
               custFocus: ui.custFocus || null },
    run: { SLIT: runS, LEVEL: runL, TRAP: runT, DIE: runD },
    // 팔 수 있는 만큼만 만든다. 더 만들면 그대로 창고에 눕는다.
    sell: { C2C: n.C2C || 0, SLIT: runS * CFG.YIELD.SLIT, LEVEL: runL * CFG.YIELD.LEVEL,
            TRAP: runT * CFG.YIELD.TRAP, DIE: runD * CFG.YIELD.DIE },
    _buyTon: buy, _L: L,
  };
}

/* ============================================================
   공장 그림
   ============================================================ */
function coil(x, y, r, cls) {
  return `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>` +
         `<circle cx="${x}" cy="${y}" r="${r * .34}" fill="#fffdf8" opacity=".9"/>`;
}

function factorySVG(s, L) {
  const c = L.c;
  const raw = s.invRaw.reduce((a, l) => a + l.qty, 0);
  const fg = s.invFg.reduce((a, l) => a + l.qty, 0);
  const over = (raw + fg) > CFG.WAREHOUSE_CAP_BASE;
  const per = 2200;

  let yard = '';
  for (let i = 0; i < Math.min(28, Math.round(raw / per)); i++) {
    const col = i % 7, row = (i / 7) | 0;
    yard += coil(200 + col * 28, 218 - row * 26, 11, over ? 'coil bad' : 'coil');
  }
  let out = '';
  for (let i = 0; i < Math.min(12, Math.round(fg / per)); i++) {
    const col = i % 4, row = (i / 4) | 0;
    out += coil(790 + col * 27, 160 - row * 25, 10, 'coil fgc');
  }

  const ships = s.poOpen.reduce((acc, p) => {
    const k = acc.find(x => x.eta === p.etaTurn);
    if (k) k.qty += p.qty; else acc.push({ eta: p.etaTurn, qty: p.qty });
    return acc;
  }, []).sort((a, b) => a.eta - b.eta).slice(0, 3);
  let sea = ships.length
    ? ships.map((sh, i) => `<g transform="translate(14,${68 + i * 62})">
        <path d="M0 14 L56 14 L48 28 L8 28 Z" class="ship"/>
        <rect x="17" y="1" width="22" height="13" rx="2" class="ship"/>
        <text x="28" y="43" class="tiny mid">${sh.eta}월 ${fmt(sh.qty)}t</text></g>`).join('')
    : `<text x="44" y="150" class="tiny mid dim">바다에 배가 없습니다</text>`;

  const lines = s.lines.map((l, i) => {
    const u = l.type === 'SLIT' ? (L.now.SLIT || 0) / Math.max(1, c.SLIT)
            : l.type === 'LEVEL' ? (L.now.LEVEL || 0) / Math.max(1, c.LEVEL)
            : ((L.now.TRAP || 0) + (L.now.DIE || 0)) / Math.max(1, c.BLANK);
    const util = Math.max(0, Math.min(1, u)), w = 190;
    return `<g transform="translate(440,${78 + i * 58})">
      <rect width="${w}" height="42" rx="8" class="line"/>
      <rect x="8" y="25" width="${w - 16}" height="10" rx="5" class="utilbg"/>
      <rect x="8" y="25" width="${(w - 16) * util}" height="10" rx="5" class="util ${util > .92 ? 'hot' : ''}"/>
      <text x="12" y="19" class="lbl">${CFG.LINE[l.type].label}</text>
      <text x="${w - 12}" y="19" class="lbl end">${Math.round(util * 100)}%</text></g>`;
  }).join('');

  let slots = '';
  for (let i = 0; i < CFG.MAX_LINES - s.lines.length; i++)
    slots += `<g transform="translate(440,${78 + (s.lines.length + i) * 58})">
      <rect width="190" height="42" rx="8" class="slot"/>
      <text x="95" y="26" class="tiny mid dim">빈 자리</text></g>`;

  return `<svg viewBox="0 0 960 296" class="plant">
    <rect width="90" height="296" class="sea"/>
    <rect x="90" width="870" height="296" class="ground"/>
    ${sea}
    <rect x="112" y="46" width="298" height="204" rx="10" class="zone"/>
    <text x="124" y="67" class="lbl">소재 야드</text>
    <text x="398" y="67" class="lbl end ${over ? 'warn' : 'dim'}">${fmt(raw)}t</text>
    ${yard}
    ${over ? `<text x="261" y="240" class="tiny mid warn">야드가 넘쳤습니다 · 동선이 막힙니다</text>` : ''}
    <rect x="426" y="46" width="220" height="204" rx="10" class="zone"/>
    <text x="438" y="67" class="lbl">공장동</text>
    ${lines}${slots}
    <rect x="662" y="46" width="286" height="204" rx="10" class="zone"/>
    <text x="674" y="67" class="lbl">제품 창고 · 출하</text>
    <text x="936" y="67" class="lbl end dim">${fmt(fg)}t</text>
    ${out}
    <g transform="translate(700,198)">
      <rect width="48" height="27" rx="3" class="truck"/>
      <rect x="48" y="9" width="23" height="18" rx="3" class="truck"/>
      <circle cx="14" cy="29" r="5" class="wheel"/><circle cx="58" cy="29" r="5" class="wheel"/></g>
    <text x="804" y="238" class="tiny mid dim">출하</text>
  </svg>`;
}

/* ---------- 렌더 ---------- */
function render() {
  if (!G) return renderSetup();
  if (G.s.over) return renderEnd();
  renderPlay();
}

function renderSetup() {
  const machine = SETUP.lines.reduce((a, t) => a + CFG.LINE[t].capex, 0);
  const rest = SETUP.equity - CFG.INFRA_TOTAL - machine;
  const country = COUNTRIES[SETUP.country];
  app.innerHTML = `
    <h1>코일센터 경영 시뮬레이터</h1>
    <p class="sub">2026년 1월, 해외 코일센터 사장으로 부임합니다. 4년 동안 호황 · 공급과잉 · 불황 · 회복이
      한 번씩 오는데, 순서와 길이는 판마다 다릅니다.</p>
    <div class="card">
      <div class="say"><div class="face">${CAST.han.face}</div><div class="bubble">
        <span class="who">${CAST.han.name} · ${CAST.han.role}</span>
        사장님, 법인은 이미 세워져 있습니다. 모두 같은 조건에서 출발합니다. 이름만 정해주시면 됩니다.</div></div>
      <table>
        <tr><td>진출 국가</td><td>${country.emoji} ${country.name} <span class="muted">— ${country.desc}</span></td></tr>
        <tr><td>설비</td><td>슬리터 1기 (연 10만톤) + 레벨러 1기 (연 5만톤)</td></tr>
        <tr><td>자본금</td><td>${money(SETUP.equity)}</td></tr>
        <tr><td>토지·공장동</td><td>−${fmt(CFG.INFRA_TOTAL)}</td></tr>
        <tr><td>설비 2라인</td><td>−${fmt(machine)}</td></tr>
        <tr class="tot"><td>개업 후 통장</td><td>${money(rest)}</td></tr>
      </table>
      <p class="hint">은행 운전자본 한도는 재고와 매출채권의 70%까지 붙습니다. 공장동 하나에 3라인까지 들어갑니다.</p>
      <label class="row"><div class="lab"><span>회사 이름</span></div>
        <input id="nm" placeholder="예: 한빛 코일센터"
          style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--panel);color:var(--ink)"></label>
      <div class="sep"></div>
      <h2>어느 쪽으로 하시겠습니까</h2>
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
  const start = mode => newGame({ ...SETUP, mode, name: $('#nm').value.trim() || '노바리아 코일센터' });
  $('#go-normal').onclick = () => start('normal');
  $('#go-quick').onclick = () => start('quick');
}

function renderPlay() {
  const s = G.s, ui = G.ui;
  const d = buildDecision(s, ui), L = d._L;
  const ph = CFG.PHASE[s.market.phase];
  const stock = inventoryTons(s), transit = s.poOpen.reduce((a, p) => a + p.qty, 0);
  const coverNow = L.need > 0 ? (stock + transit) / L.need : 0;
  const canBorrow = s.debt.limit - s.debt.principal;
  const last = s.history[s.history.length - 1];
  const expandable = s.lines.length < CFG.MAX_LINES
    ? (L.gapSlit > 800 ? 'SLIT' : L.gapLevel > 500 ? 'LEVEL' : (s.lines.some(l => l.type === 'BLANK') ? null : 'BLANK')) : null;
  const spendNow = (ui.overtime ? CFG.OT_COST : 0);

  app.innerHTML = `
    <div class="hud">
      <div class="stat"><div class="k">${s.companyName}</div>
        <div class="v" style="font-size:15px">${periodNow()}
          <span class="muted" style="font-size:11px">${periodIndex()}/${periodTotal()}</span></div></div>
      <div class="stat"><div class="k">시황</div><div class="v" style="font-size:15px">
        <span class="phase ph-${s.market.phase}">${ph.label}</span></div></div>
      <div class="stat"><div class="k">소재 시세</div><div class="v">$${fmt(s.market.pm)}</div></div>
      <div class="stat"><div class="k">통장</div><div class="v ${s.cash < 3e6 ? 'neg' : ''}">${M(s.cash)}</div></div>
      <div class="stat"><div class="k">은행 빚</div>
        <div class="v ${s.debt.principal > s.debt.limit * .8 ? 'neg' : ''}">${M(s.debt.principal)}</div></div>
      <div class="stat"><div class="k">본사 이익 누계</div>
        <div class="v ${s.hq.cumConsolidated < 0 ? 'neg' : 'pos'}">${M(s.hq.cumConsolidated)}</div></div>
      <div class="stat"><div class="k">직원 사기</div><div class="v">${Math.round(s.morale)}</div></div>
    </div>

    <div class="card" style="padding:12px 16px;border-color:#ddd3c2;background:#fbf7ee">
      <b>${chapterOf(s, s.turn).label}</b>
      <span class="muted" style="font-size:13px"> · ${chapterOf(s, s.turn).brief}</span>
      ${(s.buildQueue || []).length ? `<div class="note">${(s.buildQueue || []).map(b =>
        `${CFG.LINE[b.type].label} 설치 중 — ${b.readyTurn}월부터 가동`).join(' · ')}</div>` : ''}
    </div>

    ${metricsPanel(s)}

    <div class="card" style="padding:10px 10px 4px">${factorySVG(s, L)}</div>

    ${custPanel(s)}

    <div class="grid g2">
      <div class="card">
        <h2>이번 달 본사 주문</h2>
        ${bars(L.now, L.c)}
        <table style="margin-top:12px"><tr><th>받아둔 주문</th>${s.nasi.map(x => `<th>${x.turn}월</th>`).join('')}</tr>
          <tr><td>슬리팅</td>${s.nasi.map(x => `<td>${fmt(x.tons.SLIT)}</td>`).join('')}</tr>
          <tr><td>레벨링</td>${s.nasi.map(x => `<td>${fmt(x.tons.LEVEL)}</td>`).join('')}</tr>
          <tr><td>통코일</td>${s.nasi.map(x => `<td>${fmt(x.tons.C2C)}</td>`).join('')}</tr></table>
        <p class="hint">자동차강판은 석 달 앞까지 물량이 확정됩니다(내시). 이걸 보고 소재를 시킵니다.</p>
        ${last ? `<div class="note ${last.shortageEvents.length ? 'bad' : 'good'}">지난달 주문
          ${fmt(Object.values(last.demandAuto).reduce((a, b) => a + b, 0))}톤 중
          <b>${fmt(Object.values(last.shipped).reduce((a, b) => a + b, 0))}톤 납품</b>
          ${last.shortageEvents.length ? '· 못 채운 고객이 있습니다' : '· 다 채웠습니다'}</div>` : ''}
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

    ${decisionsMade()}
    ${trimCard()}
    ${L.isBust ? hqOfferCard(L, ui) : ''}
    ${expandable ? expandCard(expandable, L, s, ui) : ''}

    <div class="card">
      <h2>${G.mpt > 1 ? '이번 분기 지시' : '이번 달 지시'}</h2>
      <div class="say"><div class="face">${CAST.seo.face}</div><div class="bubble">
        <span class="who">${CAST.seo.name} · ${CAST.seo.role}</span>
        넉 달 뒤에 쓸 소재를 지금 시킵니다. 얼마나 여유를 두시겠습니까.${
          G.mpt > 1 ? ' 이 방침대로 석 달을 갑니다.' : ''}</div></div>
      <label class="row"><div class="lab"><span>소재 발주</span>
          <b>${fmt(d._buyTon)}톤 · ${money(d._buyTon * s.market.pm)}</b></div>
        <input type="range" id="cov" min="0" max="2" step="0.25" value="${ui.cover}">
        <p class="hint">리드타임 위에 ${ui.cover.toFixed(2)}개월치를 더 얹습니다. 대금은 도착 다음 달에 나갑니다.</p></label>

      <table style="margin-top:14px">
        <tr><td>이번 달 바로 나갈 돈</td><td>${money(spendNow)}</td></tr>
        <tr class="tot"><td>통장 + 은행 한도</td>
          <td class="${spendNow > s.cash + canBorrow ? 'v neg' : ''}">${money(s.cash + canBorrow)}</td></tr></table>
    </div>

    <div class="center" style="margin-top:20px">
      <button class="primary" id="go">결재하고 ${G.mpt > 1 ? '석 달' : '한 달'} 보내기</button></div>`;

  $('#cov').oninput = e => { G.ui.cover = +e.target.value; renderPlay(); };
  const hq = $('#hq'); if (hq) hq.oninput = e => { G.ui.hqTake = +e.target.value; renderPlay(); };
  app.querySelectorAll('[data-trim]').forEach(b => b.onclick = () => { G.trimPick = +b.dataset.trim; renderPlay(); });
  app.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { G.ui.expandPick = b.dataset.ex || null; renderPlay(); });
  $('#go').onclick = advance;
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
function trimCard() {
  const t = G.trim;
  if (!t) return '';
  const base = CFG.YIELD.SLIT;
  return `<div class="card">
    <h2>이번 달 슬리팅 배분</h2>
    <div class="say"><div class="face">${CAST.gu.face}</div><div class="bubble">
      <span class="who">${CAST.gu.name} · ${CAST.gu.role}</span>
      원코일 폭 ${COIL_WIDTH}mm입니다. 이번 달 고객이 달라는 폭은
      ${t.widths.map(w => w + 'mm').join(' / ')} 이렇게 셋입니다.
      어떻게 쪼개시겠습니까. 남는 폭은 그대로 버립니다.</div></div>
    <div class="choice">${t.options.map((o, i) => {
      const diff = (o.yield - base) * 100;
      return `<button data-trim="${i}" class="${G.trimPick === i ? 'on' : ''}"
        style="text-align:left;min-width:190px">
        <b>${t.widths.map((w, k) => o.cuts[k] ? `${w}×${o.cuts[k]}` : null)
             .filter(Boolean).join(' + ')}</b><br>
        <span style="font-size:12px">수율 ${(o.yield * 100).toFixed(1)}%
          · 트림 ${o.trim}mm</span><br>
        <span style="font-size:12px" class="${diff >= 0 ? '' : 'muted'}">
          약속한 98% 대비 ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%p</span></button>`;
    }).join('')}</div>
    <p class="hint">고객과는 수율 ${(base * 100).toFixed(0)}%로 값을 정해뒀습니다.
      그보다 잘 자르면 차액이 우리 이익이고, 못 자르면 우리가 뭅니다.</p>
  </div>`;
}

/* ---------- 경영지표: 당월 / 누계 / 전월 대비 ---------- */
function metricsPanel(s) {
  const h = s.history;
  // 속성 모드는 석 달을 한 칸으로 묶어 보여준다
  const n = (G && G.mpt) || 1;
  const seg = end => { const a = h.slice(Math.max(0, end - n), end); return a.length ? mergeReports(a) : null; };
  const R = seg(h.length), P = seg(h.length - n);
  const CUR = n > 1 ? '이번 분기' : '당월', PRV = n > 1 ? '전분기 대비' : '전월 대비';
  if (!R) return `<div class="card metrics"><h2>경영지표</h2>
    <p class="hint">${periodNow()} 결산이 끝나면 여기에 실적이 쌓입니다.</p></div>`;
  const t = v => fmt(v) + 't';
  const K = v => (v < 0 ? '−$' : '$') + fmt(Math.abs(v) / 1000) + 'k';
  const Mm = v => M(v);
  // inv: 늘어나면 나쁜 지표 (장기재고·지연채권·차입금)
  const row = (label, cur, cum, prev, f, cls = '', inv = false) => {
    const d = prev == null ? null : cur - prev;
    const dc = d == null || Math.abs(d) < 1e-6 ? '' : (d > 0 ? 'up' : 'dn') + (inv ? ' inv' : '');
    return `<tr class="${cls}"><td>${label}</td><td>${f(cur)}</td>
      <td>${cum == null ? '' : f(cum)}</td>
      <td class="${dc}">${d == null ? '—' : Math.abs(d) < 1e-6 ? '–' : (d > 0 ? '▲ ' : '▼ ') + f(Math.abs(d))}</td></tr>`;
  };
  const tot = x => x.C2C + x.SLIT + x.LEVEL + x.BLANK;
  const sp = P ? P.sales : null, bp = P ? P.bs : null;
  return `<div class="card metrics">
    <h2>경영지표 · ${n > 1 ? periodLabel(R.firstTurn || R.turn, 3) : R.date}</h2>
    <table>
      <tr><th></th><th>${CUR}</th><th>누계</th><th>${PRV}</th></tr>
      ${row('판매량', tot(R.sales), tot(R.cum.sales), sp && tot(sp), t, 'tot')}
      ${row('통코일', R.sales.C2C, R.cum.sales.C2C, sp && sp.C2C, t, 'sub')}
      ${row('가공 · 슬리팅', R.sales.SLIT, R.cum.sales.SLIT, sp && sp.SLIT, t, 'sub')}
      ${row('가공 · 레벨러', R.sales.LEVEL, R.cum.sales.LEVEL, sp && sp.LEVEL, t, 'sub')}
      ${row('가공 · 블랭킹', R.sales.BLANK, R.cum.sales.BLANK, sp && sp.BLANK, t, 'sub')}
      ${row('매출액', R.revenue, R.cum.revenue, P && P.revenue, Mm, 'tot')}
      ${row('영업이익', R.op, R.cum.op, P && P.op, K, 'tot')}
      ${row('순이익', R.np, R.cum.np, P && P.np, K)}
      <tr class="head"><th colspan="4">월말 잔액</th></tr>
      ${row('재고량', R.bs.invTons, null, bp && bp.invTons, t)}
      ${row('장기재고 (3개월 초과)', R.bs.longTons, null, bp && bp.longTons, t, '', true)}
      ${row('매출채권', R.bs.ar, null, bp && bp.ar, Mm)}
      ${row('지연채권', R.bs.arDelayed, null, bp && bp.arDelayed, Mm, '', true)}
      ${row('차입금', R.bs.debt, null, bp && bp.debt, Mm, '', true)}
      ${row('순운전자본', R.bs.nwc, null, bp && bp.nwc, Mm, 'tot')}
    </table></div>`;
}

/* ---------- 고객 구성 ---------- */
function custPanel(s) {
  const sh = s.custShare || {};
  const pf = portfolio(s);
  return `<div class="card">
    <h2>우리 고객 구성</h2>
    ${Object.entries(CFG.CUSTOMERS).map(([k, c]) => {
      const pend = (s.custQueue || []).filter(q => q.key === k);
      return `<div class="custbar"><span>${c.emoji} ${c.name}</span>
        <span class="track"><span class="fill" style="width:${(sh[k] || 0) * 100}%"></span></span>
        <span>${((sh[k] || 0) * 100).toFixed(0)}%${pend.length
          ? `<span class="pend">▲${dateLabel(pend[0].turn).replace(/^\d+년 /, '')}</span>` : ''}</span></div>`;
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

function decisionsMade() {
  if (!G.done || !G.done.length) return '';
  return `<div class="card" style="background:#fbf8f1">
    <h2>이번 달 결재한 것</h2>
    <table>${G.done.map(d => `<tr><td><span class="tag">${DECK_LABEL[d.deck]}</span> ${d.title}</td>
      <td><b>${d.choice}</b></td></tr>`).join('')}</table>
  </div>`;
}

function hqOfferCard(L, ui) {
  const pct = L.quota > 0 ? (ui.hqTake / L.quota * 100).toFixed(0) : 0;
  return `<div class="card" style="border-color:#e0c9a8;background:#fffaf0">
    <h2>본사에서 연락이 왔습니다</h2>
    <div class="say"><div class="face">${CAST.jung.face}</div><div class="bubble">
      <span class="who">${CAST.jung.name} · ${CAST.jung.role}</span>
      본사 공장이 물량을 못 채웠답니다. 유통향 일반재를 시세보다 <b>${(CFG.HQ_SPOT.discount * 100).toFixed(0)}% 싸게</b>
      넘기겠다고요. 싼 건 맞는데, 이건 고객이 정해진 물건이 아닙니다. 우리가 알아서 팔아야 합니다.</div></div>
    <label class="row"><div class="lab"><span>얼마나 받으시겠습니까</span>
        <b>${fmt(ui.hqTake)}톤 <span class="muted" style="font-size:12px">(배정량의 ${pct}%)</span></b></div>
      <input type="range" id="hq" min="0" max="${Math.round(L.quota)}" step="100" value="${ui.hqTake}"></label>
    <div class="note">유통향은 본사 정책상 <b>전체 판매의 15%</b>까지만 팔 수 있습니다.
      받은 만큼 다 팔리는 게 아닙니다. 남으면 창고에서 늙다가 반값에 나갑니다.</div>
    ${ui.hqTake === 0 ? `<div class="note bad">안 받으면 본사와의 관계가 상합니다.</div>` : ''}</div>`;
}

function expandCard(type, L, s, ui) {
  const on = ui.expandPick === type, capex = CFG.LINE[type].capex;
  const newBuild = s.lines.length >= CFG.MAX_LINES;
  const extra = type === 'BLANK' ? '지금은 없는 시장이 열립니다. 블랭킹 고객이 새로 붙습니다.'
    : `본사가 주고 싶어 하는 물량이 우리 한계를 <b>월 ${fmt(type === 'SLIT' ? L.gapSlit : L.gapLevel)}톤</b> 넘습니다.`;
  return `<div class="card" style="border-color:#c9d8cd;background:#f7fbf8">
    <h2>${CFG.LINE[type].label}를 한 대 더 놓겠습니까</h2>
    <div class="say"><div class="face">${CAST.gu.face}</div><div class="bubble">
      <span class="who">${CAST.gu.name} · ${CAST.gu.role}</span>
      ${extra} ${newBuild ? '그런데 자리가 없습니다. 공장동을 한 동 더 지어야 합니다.' : '자리는 있습니다.'}</div></div>
    <table><tr><td>설비</td><td>${money(capex)}</td></tr>
      ${newBuild ? `<tr><td>공장동 신축</td><td>${money(CFG.INFRA_TOTAL)}</td></tr>` : ''}
      <tr><td>이 설비를 채울 소재 (석 달치)</td><td>${money(CFG.LINE[type].cap * 3 * s.market.pm)}</td></tr></table>
    <div class="note">설비값보다 <b>소재값이 훨씬 큽니다.</b> 라인을 늘리면 그만큼 창고와 바다에 돈이 더 잠깁니다.</div>
    <div class="choice" style="margin-top:12px">
      <button data-ex="${type}" class="${on ? 'on' : ''}">${on ? '✓ ' : ''}짓겠습니다</button>
      <button data-ex="" class="${!on ? 'on' : ''}">${!on ? '✓ ' : ''}이번엔 넘어갑니다</button></div></div>`;
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
    flags: list.flatMap(r => r.flags || []), log: list.flatMap(r => r.log || []),
    phaseChange: list.map(r => r.phaseChange).filter(Boolean).join(' '),
    lineReady: list.map(r => r.lineReady).filter(Boolean).join(' '),
    months: list.length, firstTurn: list[0].turn,
  };
}

function advance() {
  const months = G.mpt || 1;
  const reports = [];

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
    const res = resolveTurn(s, buildDecision(s, ui));

    CFG.FC_BASE = savedFC;
    for (const k in savedY) CFG.YIELD[k] = savedY[k];

    G.s = res.state;
    if (i === 0) (G.resultLines || []).forEach(m => res.report.flags.unshift(m));
    fired.forEach(m => res.report.flags.unshift(m));
    reports.push(res.report);
    if (G.s.over) break;
  }

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
    ${lines.length ? `<div class="sep"></div>${lines.map(t =>
      `<div class="note ${/결품|넘겼|막혀|모자|대손|떠나|부도|클레임|넘어갔|나갔/.test(t) ? 'bad' : ''}">${t}</div>`).join('')}` : ''}
    <div class="ok"><button class="primary" id="close">확인</button></div></div>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.querySelector("#close").onclick = () => {
    dlg.close(); dlg.remove();
    if (G.s.over) return render();
    dealTurn(); openDecisions();
  };
}

function renderEnd() {
  const g = grade(G.s), s = G.s, hist = s.history;
  const best = hist.reduce((a, h) => h.op > a.op ? h : a, hist[0] || { op: 0, turn: 0 });
  const worst = hist.reduce((a, h) => h.op < a.op ? h : a, hist[0] || { op: 0, turn: 0 });
  app.innerHTML = `
    <div class="card center" style="padding:34px 24px">
      <p class="muted">${s.companyName} · ${COUNTRIES[s.country] ? COUNTRIES[s.country].name : ''} · ${hist.length}개월</p>
      <div class="big">${g.grade}</div>
      <h1 style="margin:6px 0 14px">${g.title}</h1>
      <p class="sub" style="max-width:520px;margin:0 auto 22px">${g.desc}</p>
      <table style="max-width:460px;margin:0 auto;text-align:left">
        <tr><td>본사 주문을 얼마나 채웠나</td><td>${(g.fulfil * 100).toFixed(0)}%</td></tr>
        <tr><td>우리 회사 누적 영업이익</td>
          <td class="${g.soloOp < 0 ? 'v neg' : 'v pos'}">${M(g.soloOp)}</td></tr>
        <tr class="tot"><td>본사 이익 (우리 + 본사)</td>
          <td class="${g.consol < 0 ? 'v neg' : 'v pos'}">${M(g.consol)}</td></tr></table>
      <div class="sep" style="max-width:460px;margin:18px auto"></div>
      <table style="max-width:460px;margin:0 auto;text-align:left">
        <tr><td>제일 좋았던 달</td><td>${best.turn}월 · ${money(best.op)}</td></tr>
        <tr><td>제일 나빴던 달</td><td>${worst.turn}월 · ${money(worst.op)}</td></tr>
        <tr><td>본사에서 사온 소재</td><td>${fmt(s.hq.cumMaterialTons)} 톤</td></tr></table>
      <div style="margin-top:26px"><button class="primary" id="again">다시 하기</button></div>
    </div>`;
  $('#again').onclick = () => { G = null; render(); };
}

render();
