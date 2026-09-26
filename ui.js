/* ============================================================
   코일센터 경영 시뮬레이터 · 화면
   engine.js의 계산 위에 얹는 껍데기. 규칙은 여기서 만들지 않는다.
   ============================================================ */

const $ = s => document.querySelector(s);
const app = $('#app');
const fmt = n => Math.round(n).toLocaleString('en-US');
const money = n => (n < 0 ? '−$' : '$') + fmt(Math.abs(n));
// $17,610 → "18k". 천 단위가 안 되면 그냥 달러로 적는다.
const money1k = n => Math.abs(n) >= 1000 ? fmt(Math.round(n / 1000)) + 'k' : Math.round(n).toLocaleString();
const M = n => (n < 0 ? '−$' : '$') + (Math.abs(n) / 1e6).toFixed(1) + 'M';

/* ============================================================
   여섯 사람. 같은 사실을 보고해도 말이 다 다르게 나온다 —
   그게 이 회사에서 정보가 흐르는 방식이다. 누가 하는 말인지에 따라
   그대로 믿을지, 반쯤 깎아들을지 사장이 정해야 한다.

   카드 대사를 쓸 때 지키는 규칙 (issues.js / decks.js / ui.js 공통):

   정 부장 · 영업   남자답고 저돌적. 문장이 짧고 단정적이다. "잡습니다", "제가 책임집니다".
                    숫자를 크게 부르고 될 거라고 먼저 말한다. 낙관이 섞여 있어서
                    그 말만 믿으면 재고가 쌓인다. 감탄사를 자주 쓴다 — "사장님, 이거 큽니다."

   한 부장 · 관리   시니컬하고 건조하다. 블랙 유머를 계속 던진다. 위로는 절대 안 한다.
                    "결론부터 말씀드리면", "재미없는 얘기입니다", "축하드릴 일은 아닙니다".
                    농담 끝에 늘 숫자가 붙는다. 이 회사에서 제일 정확하고 제일 정 없다.

   구 공장장 · 생산 경상도 사투리. "사장님예", "~입니더", "~심더", "아입니꺼", "우짤지".
                    무뚝뚝하고 말이 짧다. 기계 이야기는 틀린 적이 없고 돈 이야기는 안 한다.
                    못 하겠으면 못 하겠다고 한다.

   서 대리 · 구매   소심하고 과하게 공손하다. 말끝을 흐리고("…") 결론을 늦게 말한다.
                    "저… 사장님", "죄송한데요", "괜찮으실까요?". 대신 거짓말은 안 하고,
                    나중에 문제가 될 것을 혼자 미리 알아차리고 있다.

   오 과장 · 품질   깐깐하고 감정이 없다. 수치와 로트 번호로만 말한다. 원칙에서 안 물러선다.
                    "수치로 말씀드리면", "기록은 남기겠습니다", "규격상 안 됩니다".
                    사장 기분을 맞춰주지 않는다.

   린 매니저 · 현지 밝고 사람 중심. 한국어가 조금 서툴러서 어순이 가끔 어색하다.
                    "사장님! 저 말씀드릴 거 있어요", "그거 여기 사람들 많이 싫어해요".
                    현장 분위기와 소문을 제일 먼저 안다.
   ============================================================ */
const CAST = {
  seo:  { face: '📋', img: 'cast_seo',  name: '서 대리',   role: '구매 · 자재',
          tone: '조심스럽고 공손함' },
  jung: { face: '📞', img: 'cast_jung', name: '정 부장',   role: '영업 · 소재 발주',
          tone: '자신만만함 · 낙관이 섞임' },
  gu:   { face: '🔧', img: 'cast_gu',   name: '구 공장장', role: '생산',
          tone: '사투리 · 기계 이야기는 정확함' },
  han:  { face: '🧮', img: 'cast_han',  name: '한 부장',   role: '관리 · 재무·인사·총무',
          tone: '건조하고 시니컬함' },
  oh:   { face: '🔍', img: 'cast_oh',   name: '오 과장',   role: '품질',
          tone: '깐깐함 · 수치로만 말함' },
  lin:  { face: '☕', img: 'cast_lin',  name: '린 매니저', role: '현지',
          tone: '밝음 · 현장 분위기에 밝음' },
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
  /* 자본금은 운전자본에서 역산했다. 순운전자본이 노멀 $32M, 하드 $23M이고
     토지·건물·설비가 $20M이니 굴리는 돈은 $43~52M이다. 그중 자본금이 대는 몫을
     절반 남짓으로 잡고 나머지를 은행에서 빌린다 — 실제 코일센터의 자본 구조다.
     가공마진이 톤당 $40인 장사라 이자가 곧바로 적자로 이어진다. 그게 이 게임의 압력이다. */
  normal: { key:'normal', name:'노멀', equity:35_000_000, share:0.10, rate:0.03,
    target:45_000_000, trust:65, legacy:2_400,
    desc:'자본금 $35M, 은행 이자 3%. 차입은 $22M쯤. 본사가 붙여준 판매 기반도 넉넉합니다.' },
  hard:   { key:'hard',   name:'하드', equity:25_000_000, share:0.075, rate:0.05,
    target:58_000_000, trust:55, legacy:10_000,
    desc:'자본금 $25M, 은행 이자 5%. 차입이 $30M인데 물려받은 고객은 적고, 창고엔 장기재고 1만 톤이 서 있습니다.' },
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
    equity: D.equity, debtRate: D.rate,
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
  // 본사 신뢰는 새 사장에게 새로 매긴다. 사기는 전임자가 남긴 그대로 물려받는다.
  G.s.trust = D.trust;
  applyLegacy(G.s, D);
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
  G.ui.cover = { tight: 2.0, normal: 2.9, ample: 3.6 }[W.policy] ?? 2.9;

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

  /* 2. 회사가 만든 안건 — 반드시 올라올 것부터, 그다음 급한 순서.
     속성은 한 번 결재로 석 달을 돌리니 그 석 달치 안건이 같이 올라와야 한다.
     매달 결재와 같은 수만 올리면 분기 모드는 결정 횟수가 3분의 1로 줄어든다.
     그건 빠른 게 아니라 게임을 덜 하는 것이다. */
  const cap = G.mpt > 1 ? 7 : 4;
  const soft = G.mpt > 1 ? 5 : 3;
  const cand = worldIssues(s, W, G).sort((a, b) => (b.force - a.force) || (b.prio - a.prio));
  for (const c of cand) {
    if (G.queue.length >= cap) break;
    if (!c.force && G.queue.length >= soft && c.prio < 70) break;
    put(c.card);
  }

  // 3. 사내 이야기 — 가끔. 숫자로 안 잡히는 일도 회사다. 분기 결재는 석 달치라 더 자주 온다.
  const lifeN = G.mpt > 1 ? 2 : 1;
  for (let i = 0; i < lifeN; i++) {
    if (G.queue.length >= cap) break;
    if (!wChance(G.mpt > 1 ? 0.5 : 0.28)) continue;
    const pool = DECK.life.filter(c => (!c.when || c.when(s, cardCtx(s))) && (s.turn - (G.seen[c.id] ?? -99)) > 12);
    if (pool.length) put(wPick(pool));
  }

  /* 4. 너무 조용하면 기회를 올린다.
     여기에 "영업 방침"이나 "구매 방침"을 채워 넣으면 안 된다 — 그건 이미 정한 것을
     또 묻는 것이고, 조용한 달마다 같은 카드가 돌아오는 원인이었다.
     빈 자리는 판을 흔드는 한 장으로 채운다. */
  if (G.queue.length < (G.mpt > 1 ? 4 : 2)) put(quietCard(s, W, look(s)));

  /* 5. 소재 발주는 매달 마지막에 올린다. 이 회사에서 사장이 매달 반드시 하는 유일한 일이다.
     다른 안건을 다 보고 나서 — 고장이 났는지, 고객이 물량을 더 준다는지 알고 나서 — 숫자를 적어야 하니까. */
  G.ui.orderTon = null; G.ui.orderBy = null;
  G.queue.push({ deck: 'order', card: orderCard(s, W, look(s)) });
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
    <span>${periodNow()} · ${deckLabel(deck)}</span>
    <span class="step">${G.qi + 1} / ${G.queue.length}</span></div>`;

  const ask = () => {
    if (card.form === 'order') return askOrder();
    if (card.form === 'sales') return askSales();
    dlg.innerHTML = `<div class="dlg">${head}
      <div class="crew">${crewBlock(who)}
        <div class="crew-body"><div class="line says">${card.text}</div></div></div>
      <div class="deckq"><h2>${card.title}</h2></div>
      <div class="optlist">${card.opts.map((o, i) => `
        <button data-o="${i}"><b>${o.label}</b>${
          o.hint ? `<span class="why">${o.hint}</span>` : ''}${fxChips(o.fx)}</button>`).join('')}</div>
    </div>`;
    dlg.querySelectorAll('[data-o]').forEach(b => b.onclick = () => choose(+b.dataset.o));
  };

  /* 고객군별 발주 — 선택지가 아니라 숫자를 직접 넣는 화면.
     한 줄에 그 고객군의 월 사용량 · 창고 · 해상 · 본사 생산 중 · 재고율 · 재원율이 다 있다.
     사장이 보고 톤수를 적는다. 합계와 합계 재원율이 아래에서 실시간으로 바뀐다. */
  const askOrder = () => {
    /* 발주는 언제나 결재의 맨 마지막이다. 앞에서 고른 카드들이 권장량을 이미 바꿨으니
       여기서 다시 계산해야 화면의 권장량과 실제로 나갈 양이 일치한다. */
    card.rows = orderRows(G.s, look(G.s));
    const rows = card.rows;
    const vals = {};
    for (const r of rows) vals[r.k] = r.rec;
    const lead = CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd;

    const paint = () => {
      const tot = rows.reduce((a, r) => a + (vals[r.k] || 0), 0);
      const totRec = rows.reduce((a, r) => a + r.rec, 0);
      const pct = totRec > 0 ? Math.round(tot / totRec * 100) : 100;
      const box = dlg.querySelector('#osum');
      if (box) box.innerHTML =
        `<b>합계 ${fmt(Math.round(tot))}톤</b>
         <span class="${pct > 125 ? 'dn' : pct < 75 ? 'dn' : 'up'}">권장 대비 ${pct}%</span>`;
    };

    dlg.innerHTML = `<div class="dlg">${head}
      <div class="crew">${crewBlock(who)}
        <div class="crew-body"><div class="line says">${card.text}</div></div></div>
      <div class="deckq"><h2>${card.title}</h2></div>
      <div class="ordwrap">
        <table class="ordt">
          <tr><th>고객군</th><th>${card.months > 1 ? '분기 사용<br><i>석 달치 · 소재' : '월 사용<br><i>소재'} 기준</i></th>
              <th>창고<br>현물</th><th>해상<br>미착</th>
              <th>본사<br>생산 중</th><th>재고율</th><th>재원율</th>
              <th>${card.months > 1 ? '분기 발주 (톤)' : '발주 (톤)'}</th></tr>
          ${rows.map(r => `<tr>
            <td class="oname">${CUST[r.k]} <i>${CFG.CUSTOMERS[r.k].name}</i></td>
            <td>${fmt(Math.round(r.use))}</td>
            <td>${fmt(Math.round(r.oh))}</td>
            <td>${fmt(Math.round(r.sea))}</td>
            <td>${fmt(Math.round(r.prod))}</td>
            <td class="${r.invM < COVER.warn ? 'dn' : ''}">${r.invM.toFixed(1)}</td>
            <td>${r.resM.toFixed(1)}</td>
            <td><input type="number" min="0" max="${r.max}" step="50" data-ok="${r.k}" value="${r.rec}"></td>
            </tr>`).join('')}
        </table>
        <div class="ordbar">
          <div id="osum" class="osum"></div>
          <div class="obtns">
            <button class="mini" data-set="rec">권장량</button>
            <button class="mini" data-set="0">전부 0</button>
            <button class="mini" data-set="0.8">권장 ×0.8</button>
            <button class="mini" data-set="1.2">권장 ×1.2</button>
          </div>
        </div>
        <p class="hint">고객군별 재고는 판매 비중으로 배분한 추정치입니다. 같은 규격을 여러 고객이 쓰니
          칼같이 갈리지는 않습니다. 지금 걸면 <b>${lead}개월 뒤</b> 야드에 내립니다.<br>
          본사 압연 스케줄 때문에 ${card.months > 1 ? '분기' : '한 달'} 소요량의 <b>1.6배</b>까지만 걸 수 있습니다 —
          한 번 바닥나면 금방은 못 메웁니다.
          ${card.months > 1 ? '<br>적어주신 톤수는 석 달에 나눠서 집행합니다.' : ''}</p>
        <button class="primary" id="osubmit">${card.months > 1 ? '이대로 분기 발주' : '이대로 발주한다'}</button>
      </div>
    </div>`;

    dlg.querySelectorAll('[data-ok]').forEach(inp => inp.oninput = () => {
      const r = rows.find(x => x.k === inp.dataset.ok);
      vals[inp.dataset.ok] = Math.min(r.max, Math.max(0, +inp.value || 0)); paint();
    });
    dlg.querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
      const m = b.dataset.set;
      rows.forEach(r => { vals[r.k] = m === 'rec' ? r.rec : m === '0' ? 0 : Math.min(r.max, Math.round(r.rec * +m / 50) * 50); });
      dlg.querySelectorAll('[data-ok]').forEach(i => i.value = vals[i.dataset.ok]);
      paint();
    });
    dlg.querySelector('#osubmit').onclick = () => submitOrder(vals);
    paint();
  };

  const submitOrder = (vals) => {
    const tot = fmt(Math.round(Object.values(vals).reduce((a, b) => a + b, 0)));
    submitForm(vals, `${tot}톤 발주`, `${tot}톤`);
  };

  /* 반기 영업 자원 배분 — 100점을 고객군에 나눈다.
     한 줄에 그 고객군의 최근 월평균 판매량·관계·성장 성향이 있다.
     0을 준 줄은 화면에서 바로 회색으로 죽는다. 손을 놓는다는 게 눈에 보여야 한다. */
  const askSales = () => {
    const rows = card.rows;
    const vals = {};
    for (const r of rows) vals[r.k] = r.cur;
    const GROWLAB = g => g >= 1.8 ? '급성장' : g >= 1.05 ? '성장' : g >= 0.9 ? '보합' : '정체';

    const paint = () => {
      const tot = rows.reduce((a, r) => a + (vals[r.k] || 0), 0);
      const box = dlg.querySelector('#ssum');
      if (box) box.innerHTML = `<b>합계 ${tot}점</b>`
        + `<span class="${tot === 100 ? 'up' : 'dn'}">${tot === 100 ? '딱 100' : `100으로 환산해서 배분합니다`}</span>`;
      rows.forEach(r => {
        const tr = dlg.querySelector(`tr[data-sk="${r.k}"]`);
        if (tr) tr.className = (vals[r.k] || 0) > 0 ? '' : 'off';
      });
    };

    dlg.innerHTML = `<div class="dlg">${head}
      <div class="crew">${crewBlock(who)}
        <div class="crew-body"><div class="line says">${card.text}</div></div></div>
      <div class="deckq"><h2>${card.title}</h2></div>
      <div class="ordwrap">
        <table class="ordt">
          <tr><th>고객군</th><th>최근 월평균<br>판매량</th><th>관계</th><th>물량 전망</th>
              <th>지금</th><th>이번 반기 배분</th></tr>
          ${rows.map(r => `<tr data-sk="${r.k}" class="${r.cur > 0 ? '' : 'off'}">
            <td class="oname">${CUST[r.k]} <i>${CFG.CUSTOMERS[r.k].name}</i></td>
            <td>${fmt(Math.round(r.avg))}t</td>
            <td class="${relCls(r.rel)}">${relLabel(r.rel)}</td>
            <td>${GROWLAB(r.grow)}</td>
            <td>${r.cur}</td>
            <td><input type="number" min="0" max="100" step="5" data-sk="${r.k}" value="${r.cur}"></td>
            </tr>`).join('')}
        </table>
        <div class="ordbar">
          <div id="ssum" class="osum"></div>
          <div class="obtns">
            <button class="mini" data-sset="keep">지금 그대로</button>
            <button class="mini" data-sset="even">고르게</button>
            <button class="mini" data-sset="share">판매량 비례</button>
          </div>
        </div>
        <p class="hint">0을 준 고객군은 관리가 끊깁니다 — 매달 조금씩 물량이 빠집니다.
          자원을 받은 고객군은 조금씩 늘어나되, 원래 잘 크는 곳이 더 빨리 큽니다.<br>
          바꾼 배분은 <b>${CFG.SALES_EFFORT_LAG}개월 뒤</b>부터 숫자에 나타납니다. 다음 배분은 반년 뒤입니다.</p>
        <button class="primary" id="ssubmit">이 배분으로 반기를 간다</button>
      </div>
    </div>`;

    dlg.querySelectorAll('input[data-sk]').forEach(inp => inp.oninput = () => {
      vals[inp.dataset.sk] = Math.min(100, Math.max(0, Math.round(+inp.value || 0))); paint();
    });
    dlg.querySelectorAll('[data-sset]').forEach(b => b.onclick = () => {
      const m = b.dataset.sset;
      const totA = rows.reduce((a, r) => a + r.avg, 0) || 1;
      rows.forEach(r => {
        vals[r.k] = m === 'keep' ? r.cur
                  : m === 'even' ? Math.round(100 / rows.length)
                  : Math.round(r.avg / totA * 100);
      });
      dlg.querySelectorAll('input[data-sk]').forEach(i => i.value = vals[i.dataset.sk]);
      paint();
    });
    dlg.querySelector('#ssubmit').onclick = () => {
      const tot = rows.reduce((a, r) => a + (vals[r.k] || 0), 0);
      if (tot <= 0) { dlg.querySelector('#ssum').innerHTML = '<b class="dn">한 군데에는 붙여야 합니다.</b>'; return; }
      const shown = rows.filter(r => vals[r.k] > 0).map(r => `${CUST[r.k]} ${Math.round(vals[r.k] / tot * 100)}`).join(' · ');
      submitForm(vals, `영업 자원 ${shown}`, shown);
    };
    paint();
  };

  const submitForm = (vals, verdictLabel, doneLabel) => {
    const before = snap(G.s);
    const msg = card.submit(vals, G.s, G) || '';
    const chips = deltaChips(before, snap(G.s));
    G.done.push({ deck, title: card.title, choice: doneLabel, msg });
    if (msg) G.resultLines = (G.resultLines || []).concat(msg);
    showVerdict(verdictLabel, msg, chips);
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

    showVerdict(o.label, msg, chips,
      o.mult && o.mult !== 1 ? `<div class="chips"><span class="chip ${o.mult >= 1 ? 'up' : 'down'}">
        소재 발주 권장량 ×${o.mult} — 마지막 발주 표에 반영됩니다</span></div>` : '');
  };

  const showVerdict = (choiceLabel, msg, chips, extra = '') => {
    const last = G.qi + 1 >= G.queue.length;
    const pic = who.img ? `<img src="${A(who.img + `.png`)}" alt="">`
                        : `<div class="em">${who.face}</div>`;
    dlg.innerHTML = `<div class="dlg">${head}
      <div class="verdict">
        <div class="vlabel">사장님의 결정</div>
        <div class="vchoice">${choiceLabel}</div>
        ${msg ? `<div class="vwho">${pic}<span>${who.name}</span></div>
                 <p class="vmsg says">${msg}</p>` : ''}
        ${chips ? `<div class="chips">${chips}</div>` : ''}
        ${extra}
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

const DECK_LABEL = { mat: '자재', hr: '인사', ga: '총무', buy: '소재 발주', cust: '영업 · 반기 계획', price: '영업 · 단가 협상', spot: '영업 · 유통 스팟', vol: '영업 · 수주', sales: '영업', prod: '생산', people: '조직', quality: '품질', cash: '재무', credit: '재무', hq: '본사', legacy: '정상화', solar: '설비 투자', order: '소재 발주', op: '운영', life: '사내', big: '주요 사건' };
/* 단가 협상은 고객군마다 다른 주제(price-JP …)라 접미사를 떼고 찾는다.
   같은 달에 여러 고객과 협상할 수 있어야 해서 주제를 나눠 놓은 결과다. */
function deckLabel(deck) {
  return DECK_LABEL[deck] || DECK_LABEL[String(deck).split('-')[0]] || '결재';
}

/* ============================================================
   영업 자원 배분 — 반기에 딱 한 번.

   영업 인력·출장비·접대비·기술지원을 합쳐 100점이라고 치고, 고객군에 나눠 준다.
   한 점도 안 준 고객군은 서서히 빠지고, 조금이라도 준 곳은 조금이라도 는다.
   이건 매달 물어볼 성질의 것이 아니다. 반기 영업 계획은 반기에 한 번 세운다.
   ============================================================ */
function salesPlanRows(s) {
  const mix = s.salesMix || {};
  const avg = custAvgTons(s);
  return Object.keys(CFG.CUSTOMERS).map(k => ({
    k, cur: Math.round(mix[k] || 0), avg: avg[k] || 0,
    rel: G && G.W ? G.W.rel[k] : 60,
    grow: CFG.CUSTOMERS[k].grow,
  }));
}

/* 최근 판매 실적으로 본 고객군별 월평균 판매량(제품 톤).
   비중(%)보다 이게 낫다 — 전체가 줄면 비중은 그대로인데 톤수는 빠지기 때문이다. */
function custAvgTons(s) {
  const hist = (s.history || []).slice(-3);
  const out = {};
  if (!hist.length) {
    const L = look(s);
    for (const k in CFG.CUSTOMERS) out[k] = L.need * (s.custShare[k] || 0);
    return out;
  }
  for (const r of hist) {
    const c = custTonsOf(r);
    for (const k in CFG.CUSTOMERS) out[k] = (out[k] || 0) + (c[k] || 0) / hist.length;
  }
  return out;
}

function salesPlanCard(s, W) {
  const when = dateLabel(s.turn + CFG.SALES_EFFORT_LAG);
  const rows = salesPlanRows(s);
  const first = !s.history || !s.history.length;
  return {
    id: 'sales-plan', who: 'jung', topic: 'cust', form: 'sales', rows,
    title: '이번 반기 영업 자원을 어떻게 나눌까요',
    text: `사장님, 반기 영업 계획입니다. 영업 인력에 출장비, 기술지원까지 다 합쳐서 `
        + `100이라고 칩시다. 이걸 고객군에 나눠 주시면 그대로 뜁니다. `
        + `${first ? '전임 사장님이 쓰던 배분을 그대로 적어뒀습니다. ' : '지금 배분을 적어뒀습니다. '}`
        + `분명히 말씀드립니다 — 0을 주신 데는 관리가 안 됩니다. 당장 끊기지는 않는데 매달 조금씩 빠집니다. `
        + `그리고 오늘 바꾸셔도 숫자로 보이는 건 ${when}부텁니다. 영업은 그날 가서 그날 되는 게 아닙니다.`,
    submit: (vals, st, g) => {
      const tot = Object.values(vals).reduce((a, b) => a + b, 0) || 1;
      const mix = {};
      for (const k in CFG.CUSTOMERS) mix[k] = Math.round((vals[k] || 0) / tot * 100);
      g.ui.salesMix = mix;
      const on = Object.keys(CFG.CUSTOMERS).filter(k => mix[k] > 0);
      const off = Object.keys(CFG.CUSTOMERS).filter(k => !mix[k]);
      remember(W, st, 'salesplan', `영업 자원 배분 ${on.map(k => `${CUST[k]} ${mix[k]}`).join(' · ')}`);
      lever(g, '반기 영업 자원 배분', {
        risk: off.length ? `${off.map(k => CUST[k]).join('·')}는 무관리 — 매달 물량이 조금씩 빠집니다` : null,
      });
      const top = on.sort((a, b) => mix[b] - mix[a])[0];
      return `${on.map(k => `${CFG.CUSTOMERS[k].name} ${mix[k]}`).join(', ')}으로 짰습니다. `
           + `${top ? `${CFG.CUSTOMERS[top].name}에 제일 세게 붙입니다. ` : ''}`
           + `${off.length ? `${off.map(k => CFG.CUSTOMERS[k].name).join('·')}는 사실상 손 놓는 겁니다. 나중에 딴말 없기입니다. ` : '다섯 군데 다 챙기는 건 다섯 군데 다 대충 하는 거랑 비슷합니다만, 사장님 뜻대로 하겠습니다. '}`
           + `숫자는 ${when}부터 움직입니다.`;
    },
  };
}

/* ============================================================
   이번 달 소재 발주 — 고객군별로 직접 정한다.

   이게 코일센터 사장이 매달 실제로 하는 일이다. 내시를 보고, 창고와 바다와
   본사 공장에 뭐가 얼마나 있는지 보고, 고객군마다 몇 톤을 걸지 정한다.
   너무 걸면 현금이 창고에 묶이고 묵어서 값이 떨어진다. 덜 걸면 석 달 뒤 결품이다.

   재고를 고객군별로 딱 갈라놓을 수는 없다 — 같은 규격을 여러 고객이 쓰니까.
   그래서 판매 비중으로 배분한 추정치를 보여준다. 실무에서도 그렇게 본다.
   ============================================================ */
/* 한 번 결재로 몇 달을 거는가.
   노멀은 매달 결재하니 한 달치, 속성은 분기마다 결재하니 석 달치를 한 번에 건다.
   분기 결재인데 한 달치만 걸면 나머지 두 달은 사장이 안 본 사이에 자동으로 나가버린다.
   그건 발주를 결정한 게 아니다. */
function orderMonths() { return (G && G.mpt) || 1; }

function orderRows(s, L) {
  const onhand = inventoryTons(s), sea = seaTons(s), prod = prodTons(s);
  const lead = CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd;
  const cover = (G && G.ui && G.ui.cover) || 2.9;
  const mo = orderMonths();
  return Object.keys(CUST).map(k => {
    const sh = s.custShare[k] || 0;
    const use = L.need * sh * mo;                  // 이번 결재가 덮는 기간의 소재 소요량
    const oh = onhand * sh, se = sea * sh, pr = prod * sh;
    const inv = oh + se, res = inv + pr;
    /* 본사 압연 스케줄에 밀어 넣을 수 있는 양은 한계가 있다.
       재고가 바닥나도 한 달에 소요량의 1.6배까지만 걸린다 — 그래서 결품은
       한 번 나면 한 달 만에 못 메운다. 그게 발주를 미루면 안 되는 이유다. */
    /* 본사 압연 스케줄에 한 번에 밀어 넣을 수 있는 양의 한계.
       "그 기간에 쓸 양 + 0.6개월치 따라잡기"로 잡는다. 매달 결재면 1.6개월치,
       분기 결재면 3.6개월치다. 분기라고 1.6배를 그대로 곱하면 한 번에 넉 달 반이
       들어와 재고가 톱니처럼 튄다. */
    const MAX = (use / mo) * (mo + 0.6);
    /* 권장량 = 이번 기간에 쓸 양 + (목표 재원 − 지금 재원).
       앞의 항이 소비를 메우고, 뒤의 항이 재원을 목표로 되돌린다.
       뒤의 항을 빼먹으면 재원이 한번 어긋난 채로 계속 간다.
       분기 결재는 use가 이미 석 달치라 앞의 항이 석 달치가 된다. */
    const useM = use / mo;
    /* 분기에 한 번 몰아서 걸면 재고가 톱니처럼 오르내린다. 발주 직후가 꼭대기고
       다음 결재 직전이 바닥이다. 목표를 꼭대기에 맞추면 평균 재고가 매달 결재할 때보다
       반 분기만큼 높아진다. 그래서 목표를 그만큼 내려 평균을 같은 자리에 둔다. */
    const aim = lead + cover - (mo - 1) / 2;
    /* 천장 — 이만큼 걸고 나면 재원이 여기를 넘는다. 넘기면 그때부터는 창고와 이자다.
       권장량이 천장을 넘지 않게 잘라둔다. 분기 결재에서 한 번 넘치면
       다음 분기 권장이 0이 되고 그다음에 또 몰리는 톱니가 생긴다. */
    const ceiling = useM * (lead + cover + mo);
    /* 이번 결재에서 고른 카드가 "재고를 늘려둔다 / 발주를 줄인다"를 골랐으면
       그건 권장량에 반영한다. 사장이 적어낸 숫자에 몰래 곱하면 안 된다 —
       5,000톤이라고 적었는데 8,500톤이 나가면 그건 결재가 아니다. */
    const cardMult = (G && G.mult) || 1;
    const rec = Math.min(MAX, Math.max(0, ceiling - res),
      Math.max(0, use + useM * aim - res) * cardMult);
    return { k, sh, use, oh, sea: se, prod: pr, inv, res, max: Math.round(MAX / 50) * 50,
      invM: useM > 0 ? inv / useM : 0, resM: useM > 0 ? res / useM : 0,
      rec: Math.round(rec / 50) * 50 };
  }).filter(r => r.sh > 0.01);
}

function orderCard(s, W, L) {
  const rows = orderRows(s, L);
  const sn = stockNow(s);
  const mo = orderMonths();
  /* 소재값 소문은 결재 안건이 아니라 정보다. 따로 카드로 물으면 같은 결정을 두 번 시키는 셈이라,
     여기 발주 표 위에 한 줄로 붙여두고 톤수는 사장이 정하게 한다. */
  const rumor = W.priceRumor === 1
      ? '아, 그리고 — 본사 영업팀 제 동기 얘긴데 다음 분기에 소재값 올린답니다. 확정은 아닙니다만, 그러면 지금 많이 걸어두는 게 남는 겁니다. '
    : W.priceRumor === -1
      ? '아, 그리고 — 본사 재고가 꽤 쌓였답니다. 다음 분기에 값이 빠질 수도 있습니다. 반은 소문입니다만, 맞으면 지금 적게 거는 게 낫습니다. '
      : '';
  return {
    id: 'op-order', who: 'jung', topic: 'order', form: 'order', rows, months: mo,
    title: mo > 1 ? '이번 분기 소재 발주를 정해주십시오' : '이번 달 소재 발주를 정해주십시오',
    text: `사장님, ${mo > 1 ? '이번 분기' : '이번 달'} 발주입니다. `
        + `지금 전체로 보면 재고율 ${sn.invM.toFixed(1)}개월, 재원율 ${sn.resM.toFixed(1)}개월이고요. `
        + `${mo > 1 ? `분기 결재니까 석 달치를 한 번에 겁니다. 적어주신 톤수를 세 달에 나눠서 집행합니다. ` : ''}`
        + `${rumor}`
        + `고객군별로 쓰는 속도가 다릅니다. 한 줄씩 보고 정하시죠. `
        + `제가 계산한 권장량을 넣어뒀는데, 이건 내시가 그대로 간다는 전제입니다. `
        + `걸면 ${CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd}개월 뒤에 들어옵니다. 그때 가서 바꾸자는 건 안 됩니다.`,
    submit: (vals, s, G) => {
      // 본사가 한 달에 받아주는 한도. 넘겨 적어도 여기서 잘린다.
      for (const r of rows) vals[r.k] = Math.min(vals[r.k] || 0, r.max);
      const tot = Object.values(vals).reduce((a, b) => a + b, 0);
      const rec = rows.reduce((a, r) => a + r.rec, 0);
      G.ui.orderBy = { ...vals };
      G.ui.orderTon = tot;
      const ratio = rec > 0 ? tot / rec : 1;
      const tag = ratio > 1.25 ? 'overbuy' : ratio < 0.75 ? 'underbuy' : 'normal-buy';
      remember(W, s, tag, `소재 발주 ${fmt(Math.round(tot))}톤 (권장의 ${Math.round(ratio * 100)}%)`);
      lever(G, `소재 발주 ${fmt(Math.round(tot))}톤`, {
        risk: ratio > 1.25 ? `${CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd}개월 뒤 재고 과다 · 현금 묶임`
            : ratio < 0.75 ? `${CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd}개월 뒤 결품 위험` : null,
      });
      if (ratio > 1.25) styleAdd(W, 'grow');
      if (ratio < 0.75) styleAdd(W, 'cash');
      const detail = rows.map(r => `${CUST[r.k]} ${fmt(Math.round(vals[r.k] || 0))}t`).join(' · ');
      const span = mo > 1 ? `석 달치 ` : '';
      return ratio > 1.25
        ? `${span}${fmt(Math.round(tot))}톤 걸었습니다. 권장보다 ${Math.round((ratio - 1) * 100)}% 많습니다. ${detail}. 창고는 각오하셔야 합니다.`
        : ratio < 0.75
        ? `${span}${fmt(Math.round(tot))}톤만 걸었습니다. 권장의 ${Math.round(ratio * 100)}%입니다. ${detail}. 석 달 뒤는 제 책임 아닙니다.`
        : `${span}${fmt(Math.round(tot))}톤 걸었습니다. ${detail}. 무난합니다.`;
    },
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
  /* 사장이 고객군별로 직접 정한 발주가 있으면 그걸 쓴다.
     없으면(전임 사장의 프렐류드, 속성 모드의 2·3번째 달) 방침대로 자동으로 건다. */
  const gap = L.need * (CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd + ui.cover) - L.haveP;
  const auto = Math.max(0, Math.min(gap, L.need * 1.6));
  /* 카드가 거는 발주 배수(G.mult)는 "한 달치를 얼마나 더/덜 살까"로 쓰인 값이다.
     분기 결재에서 석 달치에 그대로 곱하면 한 장의 카드가 한 분기를 통째로 흔든다.
     그래서 결재 주기만큼 나눠서 먹인다 — 1.7배 카드가 분기에선 1.23배가 된다. */
  const raw = G ? (G.mult || 1) : 1;
  const mo = G ? (G.mpt || 1) : 1;
  const mult = 1 + (raw - 1) / mo;
  /* 사장이 발주 표에 적은 숫자가 있으면 그게 전부다. 카드 배수는 발주 표의
     권장량(orderRows)에 이미 반영돼 있으니 여기서 또 곱하면 두 번 먹는다.
     적어낸 숫자가 없을 때(프렐류드, 속성 모드의 2·3번째 달)만 자동 계산에 배수를 건다. */
  const buy = ui.orderTon != null ? ui.orderTon : auto * mult;
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
               custFocus: null, salesMix: ui.salesMix || null },
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
        <i class="${on ? (util > .92 ? 'hot' : 'on') : 'off'}">${on ? `이번 달 주문 ${pct}%` : '주문 없음'}</i></div>
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
  // 상단 경영지표와 같은 정의를 쓴다 (world.js seaTons/prodTons)
  const afloat = seaTons(s), inProd = prodTons(s);
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
    cell(afloat > 0 ? 'ship' : null, '해상 미착', afloat > 0 ? `${fmt(afloat)}t` : '없음', '',
      afloat > 0 ? `${dateLabel(nextEta)} 첫 배 도착` : '들어올 배가 없습니다'),
    cell(inProd > 0 ? 'coil_m' : null, '본사 생산 중', inProd > 0 ? `${fmt(inProd)}t` : '없음', '',
      inProd > 0 ? '아직 본사 공장 안에 있습니다' : '걸어둔 발주가 없습니다'),
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
      <div class="card"><h2>설비 <span class="muted">— 이번 달 주문 기준</span></h2>${lineList(s, L)}</div>
    </div>
    ${yardRack(s)}`;
}

/* ---------- 렌더 ---------- */
function render() {
  /* 결재 팝업은 #app 바깥(body 바로 아래)에 붙는다. 화면을 갈아끼워도 혼자 살아남아서,
     예전 판의 카드나 결산 버튼이 새 화면 위에 떠 있게 된다. 그릴 때마다 걷어낸다. */
  document.querySelectorAll('dialog').forEach(d => { try { d.close(); } catch {} d.remove(); });
  if (!G) return renderSetup();
  if (G.s.over) return renderEnd();
  renderPlay();
}

function renderSetup() {
  const machine = SETUP.lines.reduce((a, t) => a + CFG.LINE[t].capex, 0);
  const D = DIFF[SETUP.diff] || DIFF.normal;
  const capex = CFG.INFRA_TOTAL + machine;
  const debt0 = Math.max(0, capex + CFG.OPEN_CASH - D.equity);   // 자본금으로 모자란 만큼은 처음부터 차입
  const rest = D.equity - capex + debt0;
  const country = COUNTRIES[SETUP.country];
  const diffBtn = d => `<button data-diff="${d.key}" class="modecard ${SETUP.diff === d.key ? 'on' : ''}">
      <b>${SETUP.diff === d.key ? '✓ ' : ''}${d.name}</b>
      <span class="n">자본금 ${M(d.equity)} · 이자 ${(d.rate * 100).toFixed(0)}% · 판매 기반 ${(d.share * 100).toFixed(1)}%</span>
      <span class="d">${d.desc}</span></button>`;

  // 이어하기 — 저장이 있으면 제일 위에 올린다. 새 판을 고르기 전에 보여야 한다.
  const sv = loadedSave();
  const resumeCard = sv ? `<div class="card resume">
      <h2>이어서 하기</h2>
      <p class="hint"><b>${sv.s.companyName}</b> · ${DIFF[sv.diffKey] ? DIFF[sv.diffKey].name : ''}
        · ${dateLabel(sv.s.turn)} · ${sinceLabel(sv.at)}에 저장</p>
      <div class="hbtns">
        <button class="primary" id="btn-resume">${dateLabel(sv.s.turn)}부터 이어서</button>
        <button class="mini" id="btn-drop">이 저장 버리고 새로 시작</button>
      </div>
    </div>` : '';

  app.innerHTML = `
    <h1>코일센터의 제왕</h1>
    <p class="byline">로드 오브 코일센터 &nbsp;·&nbsp; 기획과 구성 <b>by 곤사마</b></p>
    <p class="thanks">Special Thanks to &nbsp; 랴됴헷도 &nbsp;·&nbsp; 원찰스 &nbsp;·&nbsp; 규한화</p>
    <p class="sub">2026년 1월, 해외 코일센터 사장으로 부임합니다. 4년 동안 호황 · 공급과잉 · 불황 · 회복이
      한 번씩 오는데, 순서와 길이는 판마다 다릅니다.</p>
    ${resumeCard}

    <div class="card">
      <h2>난이도</h2>
      <div class="modes">${diffBtn(DIFF.normal)}${diffBtn(DIFF.hard)}</div>
      <p class="hint">하드는 자본금이 적은 만큼 빚이 많고 이자가 5%입니다. 물려받는 물량도 적은데
        창고에는 전임자가 남긴 장기재고 <b>1만 톤</b>이 서 있습니다.
        본사가 요구하는 모법이익 목표도 ${M(DIFF.normal.target)}에서 <b>${M(DIFF.hard.target)}</b>로 올라갑니다.
        S등급은 거의 안 나옵니다.</p>
    </div>

    <div class="card">
      <div class="say"><div class="face">${face('han')}</div><div class="bubble says">
        <span class="who">${CAST.han.name} · ${CAST.han.role}</span>
        사장님, 법인은 이미 세워져 있습니다. 숫자는 여기 정리해뒀습니다. 이름만 정해주시면 됩니다.</div></div>
      <table>
        <tr><td>진출 국가</td><td>${country.emoji} ${country.name} <span class="muted">— ${country.desc}</span></td></tr>
        <tr><td>설비</td><td>슬리터 1기 (연 10만톤) + 레벨러 1기 (연 5만톤)</td></tr>
        <tr><td>자본금</td><td>${money(D.equity)}</td></tr>
        <tr><td>토지·공장동</td><td>−${fmt(CFG.INFRA_TOTAL)}</td></tr>
        <tr><td>설비 2라인</td><td>−${fmt(machine)}</td></tr>
        ${debt0 > 0 ? `<tr><td>시설자금 차입</td><td>+${fmt(debt0)} <span class="muted">— 자본금으로 모자란 만큼</span></td></tr>` : ''}
        <tr class="tot"><td>개업 시 통장</td><td>${money(rest)}</td></tr>
        <tr><td>은행 이자</td><td>연 ${(D.rate * 100).toFixed(0)}%</td></tr>
      </table>
      <p class="hint">이건 법인을 세울 때의 자본 구조입니다. 사장님이 넘겨받는 건 이 회사가
        몇 해 굴러간 뒤의 모습이라, 실제 재고·채권·차입금은 부임 첫날 관리부장이 보고드립니다.<br>
        은행 한도는 재고·매출채권의 70%에 땅·건물 담보 60%와 본사 지급보증을 더해 붙습니다.
        회전한도라 현금이 남으면 자동으로 갚고, 모자라면 자동으로 끌어 씁니다.
        공장동 하나에 3라인까지 들어갑니다.</p>
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
    </div>

    ${installPanel()}
    ${hallPanel()}`;

  app.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => {
    SETUP.diff = b.dataset.diff; renderSetup();
  });
  const start = mode => {
    // 새 판을 시작하면 이전 저장은 덮인다. 실수로 날리지 않게 한 번 묻는다.
    if (loadedSave() && !confirm('저장해둔 판이 있습니다. 새로 시작하면 그 판은 지워집니다. 계속할까요?')) return;
    clearSave();
    newGame({ ...SETUP, mode, name: $('#nm').value.trim() || '노바리아 코일센터' });
  };
  $('#go-normal').onclick = () => start('normal');
  $('#go-quick').onclick = () => start('quick');
  const rb = $('#btn-resume'); if (rb) rb.onclick = resumeGame;
  const db = $('#btn-drop'); if (db) db.onclick = () => {
    if (confirm('저장해둔 판을 지웁니다. 되돌릴 수 없습니다.')) { clearSave(); renderSetup(); }
  };
  wireInstall();
  wireHall();
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
/* 돌아온 청구서 — 과거의 결정이 지금 돌아온 것.
   결과만 툭 던지지 않는다. 언제 무슨 결정을 했고, 몇 달 걸려서, 지금 무엇이 됐는지
   화살표로 이어 보여준다. 그 고리가 안 보이면 이 게임은 그냥 운이다. */
function firedPanel(W) {
  if (!W.lastFired.length) return '';
  return `<div class="card fired">
    <h2>돌아온 청구서 — 그때 그 결정이 지금</h2>
    ${W.lastFired.map(f => {
      const c = f.chain;
      return `<div class="fire">
        ${c ? `<div class="chain">
          <span class="c-then"><i>${c.date}</i>${c.label}</span>
          <span class="c-arrow">${c.gap > 0 ? `${c.gap}개월 뒤` : '곧바로'} →</span>
          <span class="c-now">지금</span></div>` : ''}
        <b>${f.text}</b>${!c && f.why ? `<span>원인 · ${f.why}</span>` : ''}</div>`;
    }).join('')}
  </div>`;
}

/* 아직 안 온 청구서 — 예고된 것들.
   결재할 때 "?2~4개월 뒤 설비·품질 부담"이라고 붙여줬던 것들을 모아둔다.
   언제 한 결정인지, 언제쯤 올지 같이 보여준다. */
function pendingPanel(W, s) {
  /* 이미 그달에 끝난 것("이번 달 캐파 감소")은 청구서가 아니라 영수증이다. 빼고 보여준다.
     같은 결정이 여러 번 올라오면 제일 최근 것만 남긴다. */
  const seen = new Set();
  const rows = (W.mem || [])
    .filter(m => m.risk && s.turn - m.turn >= 1 && s.turn - m.turn <= 6 && !/이번 달/.test(m.risk))
    .reverse()
    .filter(m => { const k = m.label + m.risk; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);
  if (!rows.length) return '';
  return `<div class="card warns">
    <h2>아직 안 온 청구서</h2>
    ${rows.map(m => `<div class="warn">
      <i>${dateLabel(m.turn)} · ${ago(s.turn - m.turn)}</i>
      <span><b>${m.label}</b> — ${m.risk}</span></div>`).join('')}
    <p class="hint">결재할 때 ⚠로 붙어 있던 것들입니다. 아직 청구서가 안 왔을 뿐입니다.</p>
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
          <span class="says">${x.text}</span></div></div>`; }).join('')}</div>
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
  const last = s.history[s.history.length - 1];

  app.innerHTML = `
    <div class="topbar">
      <b>${s.companyName}</b>
      <span>${periodNow()} <i>${periodIndex()} / ${periodTotal()}</i></span>
      <span class="phase ph-${s.market.phase}">${ph.label}</span>
      <button class="mini savebtn" id="btn-save">저장하고 나가기</button>
    </div>

    ${yearBanner(s)}

    ${s.turn === 1 && !s.history.length ? takeoverBrief(s) : ''}

    ${firedPanel(G.W)}

    ${perfPanel(s)}

    ${statusPanel(s, G.W)}

    <div class="grid g2">${impactPanel(G.W) || ''}${warnPanel(s, G.W) || ''}</div>
    ${pendingPanel(G.W, s)}

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
        <h2>재고가 얼마나 오래됐나</h2>
        ${agingPanel(s)}
        <div class="sep"></div>
        ${(() => { const n = stockNow(s); return `<table>
          <tr><td>창고 현물</td><td>${fmt(inventoryTons(s))} 톤</td></tr>
          <tr><td>해상 미착</td><td>${fmt(n.sea)} 톤</td></tr>
          <tr class="tot"><td>재고량 · 재고율</td>
            <td class="${n.invM < COVER.warn ? 'v neg' : ''}">${fmt(n.inv)} 톤 · ${n.invM.toFixed(1)}개월</td></tr>
          <tr><td>본사 생산 중</td><td>${fmt(n.prod)} 톤</td></tr>
          <tr class="tot"><td>재원량 · 재원율</td><td>${fmt(n.res)} 톤 · ${n.resM.toFixed(1)}개월</td></tr></table>
          ${n.invM < COVER.warn && s.turn > 5 ? `<div class="note bad">${CAST.jung.name}: 이대로면 다음 달 어느 고객 하나는 못 채웁니다.</div>` : ''}`; })()}
      </div>
    </div>

    ${decisionsMade()}`;

  $('#go').onclick = () => { dealTurn(); openDecisions(); };
  /* 저장은 이 화면(결재 전)에서만 받는다. 결재 팝업 한가운데를 되살리려면
     카드 함수까지 저장해야 하는데, 그건 저장 파일이 아니라 프로그램을 저장하는 일이다. */
  $('#btn-save').onclick = () => {
    if (saveGame()) setTimeout(() => { G = null; render(); }, 700);
  };
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
         넉 달부터는 은행이 담보로 안 쳐주고, ${CFG.DEGRADE_DEAD_TURNS}개월을 넘기면 전량 불용재고입니다.</div>`
      : `<p class="hint">석 달까지는 멀쩡합니다. 그 뒤부터 값이 떨어집니다.</p>`}`;
}

/* ============================================================
   운영 결정도 사람이 들고 들어온다.
   화면에 슬라이더로 박아두지 않고, 그 달에 필요할 때만 카드로 올린다.

   슬리팅 배분(원코일을 몇 조각으로 자를까)은 카드에서 뺐다.
   선택지마다 수율이 이미 적혀 있어서 제일 높은 걸 고르는 것 말고는 답이 없었다.
   정답을 보여주고 정답을 고르게 하는 건 결정이 아니다.
   폭 조합은 그 달 고객이 달라는 대로 정해지고, 구 공장장이 제일 잘 나오는 조합으로 잡는다.
   수율은 여전히 달마다 흔들리지만, 그건 사장이 고르는 게 아니라 주어지는 조건이다.
   ============================================================ */

/* 불황기 본사 지시 — 유통향 일반재를 얼마나 받을 것인가 */
function hqCard(L, s) {
  const q = Math.round(L.quota);
  const step = Math.max(500, Math.round(q / 4 / 500) * 500);
  const mk = (ton, label, hint, fx) => ({
    label, hint, fx,
    apply: (st, g) => { g.ui.hqTake = ton;
      if (ton === 0) { st.trust -= CFG.HQ_SPOT.refuseTrustCost;
        return '거절했습니다. 본사 영업팀 반응이 싸늘했습니다. 이런 건 연말 평가 때 꼭 나옵니다.'; }
      return `${fmt(ton)}톤 받기로 했습니다. 이제 이걸 우리가 알아서 팔아야 합니다. `
           + `못 팔면 창고에서 늙다가 반값에 나갑니다.`; },
  });
  return {
    id: 'op-hq', who: 'jung', topic: 'op',
    title: '본사 지시 물량을 얼마나 받을까요',
    text: `사장님, 본사 공장이 가동률을 못 채웠답니다. 유통향 일반재를 시세보다 `
        + `${(CFG.HQ_SPOT.discount * 100).toFixed(0)}% 싸게 넘기겠다는데 — 싼 건 진짜 쌉니다. `
        + `다만 솔직히 말씀드리면, 이건 받는 사람이 정해진 물건이 아닙니다. 우리가 알아서 팔아야 해요. `
        + `게다가 유통향은 본사 정책상 전체 판매의 15%까지밖에 못 팝니다. 그 위로는 창고에서 늙습니다.`,
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
    ? '사장님예, 블랭킹은 우리한테 아예 없는 물건 아입니꺼. 한 대 놓으면 고객이 새로 붙습니더.'
    : `사장님예, 본사가 밀어주고 싶어 하는 물량이 우리 한계를 월 ${fmt(Math.round(type === 'SLIT' ? L.gapSlit : L.gapLevel))}톤 넘깁니더.`;
  return {
    id: 'op-expand', who: 'gu', topic: 'op',
    title: `${CFG.LINE[type].label}를 한 대 더 놓을까요`,
    text: `${why} ${newBuild ? '근데 자리가 없심더. 공장동을 한 동 더 지어야 됩니더. ' : '자리는 있심더. '}`
        + `근데 하나만 말씀드리겠심더. 기계값보다 그 기계 먹일 소재값이 훨씬 큽니더. `
        + `석 달치만 쳐도 ${money(feed)}입니더. 기계는 한 번 사면 끝인데 소재는 매달 들어갑니더.`,
    opts: [
      { label: '짓겠습니다', hint: `${CFG.INSTALL_TURNS}개월 뒤 가동`,
        fx: [`−설비 ${money(total)}`, `−소재 ${money(feed)} 추가로 묶임`,
             `+${CFG.INSTALL_TURNS}개월 뒤 캐파 ↑`],
        apply: (st, g) => { g.ui.expandPick = type;
          return `${CFG.LINE[type].label} 발주 넣었심더. ${CFG.INSTALL_TURNS}개월 뒤부터 돕니더. `
               + `그때까지는 돈만 나갑니더.`; } },
      { label: '이번엔 넘어갑니다', hint: '현금을 지킨다',
        fx: ['+현금 지킴', '−이 물량은 못 받는다'],
        apply: () => '증설은 접었심더. 그 물량은 딴 데로 갈 겁니더.' },
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
  const sec = (title, cls) => rows.push({ head: title, cls: cls || 'c-sale' });
  const row = (label, kind, fn, f, o = {}) => rows.push({ label, kind, fn, f, ...o });

  sec('판매 실적', 'c-sale');
  row('판매량', 'flow', r => T(r), tt, { cls: 'tot' });
  row('통코일', 'flow', r => (r.shipped || {}).C2C || 0, tt, { cls: 'sub' });
  row('가공 · 슬리팅', 'flow', r => (r.shipped || {}).SLIT || 0, tt, { cls: 'sub' });
  row('가공 · 레벨링', 'flow', r => (r.shipped || {}).LEVEL || 0, tt, { cls: 'sub' });
  if (s.lines.some(l => l.type === 'BLANK') || hist.some(r => ((r.shipped || {}).TRAP || 0) + ((r.shipped || {}).DIE || 0) > 0))
    row('가공 · 블랭킹', 'flow', r => ((r.shipped || {}).TRAP || 0) + ((r.shipped || {}).DIE || 0), tt, { cls: 'sub' });
  row('가공 판매 비중', 'ratio', r => { const t = T(r); return t > 0 ? 1 - ((r.shipped || {}).C2C || 0) / t : null; }, pc);

  sec('고객군별 판매', 'c-sale');
  for (const k of Object.keys(CUST)) {
    row(`${CUST[k]} · ${CFG.CUSTOMERS[k].name}`, 'flow', r => custTonsOf(r)[k] || 0,
      v => tt(v), { cls: 'sub', share: r => { const t = T(r); return t > 0 ? (custTonsOf(r)[k] || 0) / t : 0; } });
  }

  sec('손익 (천달러)', 'c-pl');
  row('매출액', 'flow', r => r.revenue, K);
  row('영업이익', 'flow', r => r.op, K, { cls: 'tot' });
  row('순이익', 'flow', r => r.np, K);
  row('톤당 영업이익', 'ratio', r => { const t = T(r); return t > 0 ? r.op / t : null; }, dol);

  sec('설비 가동률', 'c-stock');
  const types = [...new Set(s.lines.map(l => l.type))];
  for (const ty of types)
    row(CFG.LINE[ty].label, 'ratio', r => lineUtilOf(r)[ty], pc);

  sec('재고 · 재원 (월말)', 'c-stock');
  row('창고 현물 (소재 + 제품)', 'bal', r => stockOf(r).onhand, tt);
  row('└ 가공 제품', 'bal', r => stockOf(r).fg, tt, { cls: 'sub' });
  row('해상 미착', 'bal', r => stockOf(r).sea, tt);
  row('본사 생산 중', 'bal', r => stockOf(r).prod, tt);
  row('재고량 (현물 + 미착)', 'bal', r => stockOf(r).inv, tt, { cls: 'tot' });
  row('재고율', 'bal', r => stockOf(r).invM, mo, { note: '재고량 ÷ 앞으로 3개월 월평균 소재 소요량' });
  row('재원량 (재고 + 생산 중)', 'bal', r => stockOf(r).res, tt, { cls: 'tot' });
  row('재원율', 'bal', r => stockOf(r).resM, mo, { note: '재원량 ÷ 앞으로 3개월 월평균 소재 소요량' });
  row('장기재고 (3개월 초과)', 'bal', r => (r.bs || {}).longTons || 0, tt, { inv: true });

  /* 순운전자본은 분해해서 보여준다. "돈이 어디 있나" 같은 말랑한 표현 대신
     회계 그대로 — 매출채권 + 재고자산 − 매입채무 = 순운전자본.
     이 숫자가 곧 은행에서 빌려야 하는 돈이다. */
  sec('순운전자본 (월말 · 천달러)', 'c-wc');
  row('매출채권', 'bal', r => (r.bs || {}).ar || 0, K, { note: '고객에게서 받을 소재·가공 대금' });
  row('└ 지연채권', 'bal', r => (r.bs || {}).arDelayed || 0, K, { inv: true, cls: 'sub' });
  row('재고자산 (창고 현물)', 'bal', r => (r.bs || {}).invValue || 0, K, { note: '소재와 가공제품의 장부가' });
  row('매입채무', 'bal', r => -((r.bs || {}).ap || 0), K, { note: '본사에 줄 소재값. 유산스 60일이라 아직 안 나간 돈' });
  row('순운전자본', 'bal', r => (r.bs || {}).nwc || 0, K,
      { cls: 'tot', note: '매출채권 + 재고자산 − 매입채무. 이 돈을 은행에서 빌려 댄다' });
  row('(참고) 해상 미착 금액', 'bal', r => (r.bs || {}).seaValue || 0, K,
      { cls: 'sub', note: '배 위에 있는 소재값. 도착해야 매입채무로 잡히므로 위 계산에는 안 들어간다' });

  sec('차입 (월말 · 천달러)', 'c-debt');
  row('현금', 'bal', r => (r.bs || {}).cash || 0, K);
  row('차입금', 'bal', r => (r.bs || {}).debt || 0, K, { inv: true });
  row('은행 한도', 'bal', r => (r.bs || {}).debtLimit || 0, K,
      { note: '재고·매출채권 70% + 토지·건물 60% + 본사 지급보증' });
  row('남은 여력', 'bal', r => (r.bs || {}).debtRoom || 0, K, { cls: 'tot' });
  row('한도 소진율', 'bal', r => (r.bs || {}).debtUse || 0, pc,
      { inv: true, note: '차입금 ÷ 은행 한도. 100%에서 더 필요해지면 부도다' });
  row('이자비용', 'flow', r => r.interest, K, { inv: true });
  row('자기자본', 'bal', r => (r.bs || {}).equity || 0, K);

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
        ? `<tr class="head ${r.cls || ''}"><th colspan="4">${r.head}</th></tr>`
        : `<tr class="${r.cls || ''}"><td>${r.label}${r.note ? `<span class="rn">${r.note}</span>` : ''}</td>${cell(r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </table></div>`;
}

/* 부임 첫 달 — 관리부장이 작년 실적을 브리핑한다 */
const legacyTons = s => Math.round(s.invRaw.filter(l => l.legacy).reduce((a, l) => a + l.qty, 0));

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
    <div class="say"><div class="face">${face('han')}</div><div class="bubble says">
      <span class="who">${CAST.han.name} · ${CAST.han.role}</span>
      사장님, 부임을 환영합니다. 작년 실적부터 보고드리겠습니다.<br><br>
      작년 판매는 <b>${fmt(tons)}톤</b>, 매출 <b>${M1(Y.revenue)}</b>, 영업이익 <b>${K1(Y.op)}</b>,
      순이익 <b>${K1(Y.np)}</b>입니다. ${Y.np < 0 ? '영업으로는 겨우 남겼는데 이자 내고 나면 적자입니다.' : ''}
      가공 판매 비중은 ${Math.round(proc * 100)}%이고, 거래가 제일 큰 곳은
      ${cname(ks[0])} ${Math.round((ct[ks[0]] || 0) / tons * 100)}%, 그다음이 ${cname(ks[1])} ${Math.round((ct[ks[1]] || 0) / tons * 100)}%입니다.
      설비는 작년 평균 ${lines}로 돌았습니다.<br><br>
      지금 창고와 바다 위에 <b>${fmt(st.inv)}톤(${st.invM.toFixed(1)}개월치)</b>, 본사에서 생산 중인 것까지 합치면
      <b>${fmt(st.res)}톤(${st.resM.toFixed(1)}개월치)</b>입니다.<br><br>
      자금 구조부터 말씀드리면, 자본금은 <b>${M1(s.paidIn)}</b>이고 나머지는 전부 은행 돈입니다.
      지금 차입금이 <b>${M1(s.debt.principal)}</b>, 한도가 ${M1(s.debt.limit)}이니 ${Math.round(100 * s.debt.principal / Math.max(1, s.debt.limit))}%를 쓰고 있습니다.
      금리는 연 ${((s.debt.rate ?? 0.03) * 100).toFixed(0)}%입니다.
      한도는 재고와 매출채권에 붙어 있어서, 장사가 줄면 한도도 같이 줍니다. 그게 제일 무섭습니다.<br><br>
      짚어드릴 게 세 가지 있습니다. 전임 사장님이 설비 정비를 한 번 미루셨고,
      창고 구석에 규격이 애매한 일반재 ${fmt(legacyTons(s))}톤이 묵어 있습니다.
      그리고 고객 단가가 해마다 조금씩 깎여서 지금 평균 톤당 <b>$${Math.round(G && G.W ? standingCut(s, G.W) : 0)}</b>가 나가 있습니다.
      영업이익이 안 남는 이유가 대부분 여기 있습니다.</div></div>
  </div>`;
}

/* ---------- 고객 구성 ---------- */
/* 고객 구성 — 결정에 쓰이는 것만 남긴다.
   예전에는 "판가 톤당 +$0.2, 물량 흔들림 ±10%, 블랭킹 비중 17%"를 밑에 달아뒀는데,
   그 숫자를 보고 사장이 할 수 있는 일이 없었다. 포트폴리오 가중평균은
   엔진이 알아서 쓰면 되는 값이지 화면에 띄울 값이 아니다.
   대신 깎아준 단가는 "얼마 깎였나"가 아니라 "그래서 한 달에 얼마가 새나"로 보여준다. */
/* 고객 현황.
   비중(%)이 아니라 월평균 판매량(톤)으로 본다 — 전체가 줄면 비중은 그대로인데
   톤수는 빠지기 때문이다. 비중만 보면 회사가 쪼그라드는 걸 못 본다.
   여기에 지금 영업 자원을 몇 점 붙여놨는지, 그 고객에 톤당 얼마를 깎아줬는지를 같이 둔다.
   그래야 반기 영업 계획과 단가 협상을 같은 화면에서 판단할 수 있다. */
function custPanel(s) {
  const avg = custAvgTons(s);
  const mix = s.salesMix || {};
  const pend = (s.custQueue || []).find(q => q.mix);
  const max = Math.max(1, ...Object.values(avg));
  return `<div class="card">
    <h2>고객군별 월평균 판매량</h2>
    ${Object.entries(CFG.CUSTOMERS).map(([k, c]) => {
      const W = G && G.W;
      const r = W ? W.rel[k] : 60;
      const con = W ? (W.cut[k] || 0) : 0;                       // 계약 단가 — 다음 협상까지
      const tmp = W && W.temp && W.temp[k] && W.temp[k].until > s.turn ? W.temp[k] : null;  // 한시 인하
      const pdg = W && W.pledge ? (W.pledge[k] || 0) : 0;        // 다음 협상에서 내주기로 한 것
      const cut = W ? cutNow(s, W, k) : 0;          // 본사 승인 한도($12/t)까지 잘린 실제 양보액
      // 지금 나가고 있는 양보액 × 그 고객 월 판매량 = 매달 사라지는 이익
      const leak = cut * (avg[k] || 0);
      const pts = Math.round(mix[k] || 0);
      return `<div class="custbar ${pts > 0 ? '' : 'off'}"><span>${CUST[k]} · ${c.name}</span>
        <span class="track"><span class="fill" style="width:${(avg[k] || 0) / max * 100}%"></span></span>
        <span>월 ${fmt(Math.round(avg[k] || 0))}t</span>
        <span class="rel ${relCls(r)}">${relLabel(r)}</span>
        <span class="eff">영업 ${pts}${pts > 0 ? '' : ' · 무관리'}</span>
        <span class="leak">${cut !== 0
          // 곱셈을 그대로 보여준다. "월 −$18k"만 있으면 어디서 나온 숫자인지 알 수가 없다.
          ? `<b>${cut > 0 ? '−' : '+'}$${Math.abs(cut)}</b>/t × ${fmt(Math.round(avg[k] || 0))}t
             = 월 이익 <b>${cut > 0 ? '−' : '+'}$${money1k(Math.abs(leak))}</b>`
             + (tmp ? `<i class="tmp">한시 $${tmp.amt} 포함 · ${dateLabel(tmp.until).replace(/^\d+년 /, '')} 원복</i>` : '')
             + (pdg ? `<i class="pdg">다음 협상 −$${pdg} 약속</i>` : '')
          : pdg ? `단가 양보 없음<i class="pdg">다음 협상 −$${pdg} 약속</i>` : '단가 양보 없음'}</span>
      </div>`;
    }).join('')}
    <p class="hint">「영업」은 반기 영업 계획에서 나눠 준 100점입니다. 0점인 고객군은 매달 조금씩 물량이 빠집니다.${
      pend ? ` 새 배분은 ${dateLabel(pend.turn).replace(/^\d+년 /, '')}부터 숫자에 나타납니다.` : ''}<br>
      단가 양보는 <b>계약 단가</b>(정기 협상에서만 바뀌고 다음 협상까지 간다)와
      <b>한시 인하</b>(기한이 되면 자동으로 원복된다) 둘로 나뉩니다.
      영구히 마진을 깎는 계약은 하지 않습니다 — 계약 단가를 되돌리려면 정기 협상에서 인상을 관철해야 합니다.</p>
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
    <table>${G.done.map(d => `<tr><td><span class="tag">${deckLabel(d.deck)}</span> ${d.title}</td>
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
    /* 속성 모드는 한 번 결재로 석 달을 돈다.
       증설·본사 지시·고객군 영업은 분기 첫 달에만 집행한다.
       소재 발주도 분기 첫 달에 석 달치를 한 장으로 건다 —
       사장이 적어낸 숫자가 곧 그 분기에 나가는 전부다.
       나머지 두 달은 0으로 둔다. 자동으로 더 나가면 그건 결재가 아니다. */
    const ui = i === 0 ? G.ui
             : { ...G.ui, expandPick: null, hqTake: 0, custFocus: null, salesMix: null, orderTon: 0 };
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
  Object.assign(G.ui, { hqTake: 0, expandPick: null, overtime: false, yieldSpend: 0, salesSpend: 0, custFocus: null, salesMix: null, orderTon: null, orderBy: null });
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
    <table>
      <tr><td>모사 이익 <span class="muted" style="font-weight:600">우리에게 소재 팔아 번 돈</span></td>
        <td>${money(R.hqMargin)}</td></tr>
      <tr><td>코일센터 이익 <span class="muted" style="font-weight:600">위 영업이익</span></td>
        <td class="${R.op < 0 ? 'v neg' : ''}">${money(R.op)}</td></tr>
      <tr class="tot"><td>모법이익 <span class="muted" style="font-weight:600">모사 이익 + 코일센터 이익</span></td>
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
  /* 판이 끝났으니 저장을 지우고 기록을 남긴다. 한 판을 두 번 적지 않게 표시를 달아둔다. */
  if (!G.recorded) { G.recorded = true; clearSave(); recordRun(s, W, G.diff || DIFF.normal, g, P); }
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
          <tr><td>모사 소재 판매량</td><td>${fmt(m.hqTons)}t</td></tr>
          <tr><td>모사 이익</td><td>${k(g.consol - m.op)}</td></tr>
          <tr><td>모법이익 <span class="muted">모사 이익 + 코일센터 이익</span></td><td class="${g.consol < 0 ? 'v neg' : 'v pos'}">${k(g.consol)}</td></tr>
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
    <div class="center" style="margin-top:18px">
      <button class="primary" id="again">다시 하기</button>
      <button class="mini" id="end-csv" style="margin-left:8px">기록 내려받기 (CSV)</button>
    </div>`;
  $('#again').onclick = () => { G = null; render(); };
  $('#end-csv').onclick = exportHall;
}

/* save.js가 뒤에 붙는다. 거기서 render()를 부른다 — 설치 안내와 저장 목록이 첫 화면에 필요하다. */
