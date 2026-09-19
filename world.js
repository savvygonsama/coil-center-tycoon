/* ============================================================
   world.js — 숨은 변수 · 인과 · 기억 · 정보 · 사건

   engine.js는 돈과 톤을 계산한다. 이 파일은 그 위에서 "회사가 어떤 상태인가"를
   계산한다. 설비가 얼마나 닳았는지, 고객이 우리를 어떻게 보는지, 현장이 얼마나
   지쳤는지. 플레이어는 이 숫자를 직접 보지 못하고 부장들의 말과 징후로만 안다.

   이 게임의 약속 하나 — 사건은 아무 데서나 떨어지지 않는다.
   고장은 정비를 미룬 만큼, 클레임은 무리한 만큼, 가격 재요구는 양보한 만큼 온다.
   그리고 터질 때는 무엇 때문에 터졌는지 짚어준다.
   ============================================================ */

const CUST = { JP: 'J사', EU: 'E사', CN: 'C사', PART: 'P사', HOME: 'H사' };
const cname = k => `${CUST[k]}(${CFG.CUSTOMERS[k].name})`;
const wClamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const wPick = a => a[Math.floor(Math.random() * a.length)];
const wChance = p => Math.random() < p;
const AGO = ['이번 달', '지난달', '두 달 전', '석 달 전', '넉 달 전', '다섯 달 전', '여섯 달 전'];
const ago = n => AGO[n] || `${n}개월 전`;

/* ---------- 겉으로 보이는 말 ---------- */
function relLabel(v) {
  return v >= 80 ? '매우 우호적' : v >= 65 ? '우호적' : v >= 50 ? '보통' : v >= 35 ? '불안' : '이탈 위험';
}
function relCls(v) { return v >= 65 ? 'up' : v >= 50 ? 'neu' : 'dn'; }
function equipLabel(v) { return v >= 75 ? '양호' : v >= 60 ? '보통' : v >= 45 ? '주의' : '위험'; }
function fatigueLabel(v) { return v < 20 ? '여유' : v < 40 ? '바쁨' : v < 60 ? '과부하' : '한계'; }
const qualityPct = q => 94 + q * 0.05;          // 품질 지수 74 → 양품률 97.7%

/* 연차별 흐름. 순서는 같지만 무슨 일이 벌어지는지는 플레이어가 정한다. */
const YEAR_THEME = [
  { name: '정상화', text: '전임자가 미뤄둔 정비와 묵은 재고부터 정리해야 합니다. 본사는 올해는 지켜보겠다고 합니다.' },
  { name: '성장', text: '본사가 소재 판매를 늘리라고 합니다. 물량 제안과 신규 고객이 들어오는 해입니다.' },
  { name: '성장의 부작용', text: '작년에 늘린 것들이 청구서를 보내는 해입니다. 설비·품질·재고·현금을 봐야 합니다.' },
  { name: '위기와 선택', text: '지금까지의 선택이 결과로 돌아옵니다. 마지막 해입니다.' },
];
const HQ_GROWTH = [1.00, 1.15, 1.10, 1.08];   // 본사가 매년 요구하는 소재 판매 증가

/* ============================================================
   시작 상태
   ============================================================ */
function initWorld(s, diff) {
  const hard = diff && diff.key === 'hard';
  const W = {
    equip: hard ? 55 : 62,        // 전임자가 정비를 한 번 미뤘다
    quality: hard ? 69 : 74,
    fatigue: 0,
    rel:     { JP: 68, EU: hard ? 50 : 62, CN: 55, PART: 58, HOME: 60 },
    cut:     { JP: 0, EU: 0, CN: 0, PART: 0, HOME: 0 },   // 고객별로 깎아준 단가 ($/t). 계약이 살아 있는 한 남는다
    concede: { JP: 0, EU: 0, CN: 0, PART: 0, HOME: 0 },   // 양보한 횟수. 한 번 깎아주면 또 온다
    relHigh: { JP: 0, EU: 0, CN: 0, PART: 0, HOME: 0 },
    threat: {},                   // 이번 달 경쟁사가 실제로 들어간 고객 (숨김)
    comp: 35,                     // 경쟁사 공격성 (숨김)
    deferMaint: 1, maintAge: 7,
    priceDir: 0, priceRumor: null, // 본사 가격 방향 (숨김) 과 그에 대한 소문
    policy: 'normal',
    hq: { target: 0, ytd: 0, commit: null, log: [] },
    mem: [], impacts: [], lastImpacts: [], fired: [], lastFired: [],
    snaps: [], utilHist: [], coverHist: [], shareHist: {},
    breakdown: null, claim: null, capHit: 1, qBoost: 0,
    stats: { breakdowns: 0, claims: 0, shortages: 0, concessions: 0, deferrals: 0, maint: 0,
             overloadMonths: 0, utilSum: 0, months: 0, churn: 0, hqHit: 0, hqMiss: 0,
             cashTight: 0, qualSum: 0, projects: 0, dropped: 0 },
    style: { grow: 0, cash: 0, cust: 0, craft: 0, hq: 0 },
  };
  for (const k in CUST) W.shareHist[k] = [];
  return W;
}

/* 전임 사장이 남긴 것 — 1년차 "정상화"가 무엇을 정상화하는지 */
function applyLegacy(s) {
  // 전임자가 따로 들여온 일반재. 값은 이미 치렀다 (작년 현금흐름에 들어 있다)
  const t = 2400, cost = CFG.P_M_BASE * 1.06;
  s.invRaw.push({ qty: t, unitCost: cost, arrivalTurn: -5, dt: 'SPOT', gr: 'COMMON' });
}

/* ============================================================
   기억 — 게임은 플레이어가 한 일을 잊지 않는다
   ============================================================ */
function remember(W, s, tag, label, extra = {}) {
  W.mem.push({ turn: s.turn, tag, label, ...extra });
}
function styleAdd(W, key, n = 1) { if (key) W.style[key] = (W.style[key] || 0) + n; }

/* 지금 터진 일의 원인이 될 만한 과거 결정을 찾는다 */
function cause(W, s, tags, cust) {
  const hit = [...W.mem].reverse().find(m =>
    s.turn - m.turn <= 8 && tags.some(t => m.tag === t) && (!cust || !m.cust || m.cust === cust));
  return hit ? `${ago(s.turn - hit.turn)} ${hit.label}` : null;
}

/* 이번 달 여파 — 결산 화면과 다음 달 브리핑에 뜬다 */
function fire(W, s, kind, text, why) {
  W.fired.push({ turn: s.turn, kind, text, why });
}

/* 결정이 무엇을 움직였는지 — 결산 뒤 "지난달 결정의 영향"으로 풀어서 보여준다 */
function lever(G, label, o) {
  G.W.impacts.push({ label, ...o });
}

/* 한 고객의 물량을 키운다. 회사 전체 물량은 그 고객 비중만큼만 늘어난다. */
function growCust(s, k, pct) {
  const sh = s.custShare[k] || 0;
  // 라인이 꽉 찼으면 더 받아도 못 만든다. 늘어나는 건 계약서 숫자뿐이다.
  if (pct > 0 && G && G.W) {
    const u = G.W.utilHist.slice(-1)[0] ?? 0.8;
    pct *= Math.max(0.2, Math.min(1, (0.98 - u) / 0.25));
    // 이미 시장을 많이 쥐고 있으면 더 늘리기가 어렵다. 남은 고객은 경쟁사 충성 고객이다
    if (s.myShare > 0.18) pct *= Math.pow(0.18 / s.myShare, 2);
  }
  s.myShare *= 1 + sh * pct;
  s.custShare[k] = sh * (1 + pct);
  normalizeShare(s);
  return 1 + sh * pct;
}
function normalizeShare(s) {
  let t = 0;
  for (const k in CUST) t += s.custShare[k] || 0;
  if (t > 0) for (const k in CUST) s.custShare[k] = (s.custShare[k] || 0) / t;
}
function topCust(s) {
  return Object.keys(CUST).sort((a, b) => (s.custShare[b] || 0) - (s.custShare[a] || 0))[0];
}
function standingCut(s, W) {
  let c = 0;
  // 한 고객에 톤당 $30 넘게 깎아주는 계약은 본사가 승인하지 않는다
  for (const k in CUST) { W.cut[k] = Math.min(30, W.cut[k] || 0); c += (s.custShare[k] || 0) * W.cut[k]; }
  return c;
}
/* 지금 시점의 재고·재원 (결재 직전 기준)
   이번 달에 도착하는 배는 지금 바다 위에 있다. 그 뒤로 오는 건 아직 본사 공장에 있다. */
function stockNow(s) {
  const sea = s.poOpen.filter(p => p.etaTurn <= s.turn).reduce((a, p) => a + p.qty, 0);
  const prod = s.poOpen.filter(p => p.etaTurn > s.turn).reduce((a, p) => a + p.qty, 0);
  const ns = s.nasi.slice(0, 3);
  const d = Math.max(1, ns.reduce((a, n) => a + Object.values(n.tons).reduce((x, y) => x + y, 0), 0) / Math.max(1, ns.length));
  const inv = inventoryTons(s) + sea, res = inv + prod;
  return { inv, res, invM: inv / d, resM: res / d, sea, prod };
}
/* 재고율 — (창고 현물 + 해상 미착) ÷ 향후 3개월 내시 평균 */
function coverOf(s) { return stockNow(s).invM; }
/* 통장과 은행 한도로 몇 달을 버티나 */
function runway(s) {
  const L = look(s);
  const burn = L.need * s.market.pm * 0.85 + CFG.FC_BASE;
  return (s.cash + Math.max(0, s.debt.limit - s.debt.principal)) / Math.max(1, burn);
}

/* ============================================================
   매달 결산 직전 — 숨은 상태가 엔진의 캐파와 수율을 움직인다
   ============================================================ */
function worldPre(s, W) {
  let cap = W.capHit * (1 + (W.capBonus || 0));        // 고장·정비·인력 공백, 충원한 인력
  if (W.equip < 60) cap *= 1 - (60 - W.equip) * 0.004;  // 잔고장
  s.mods = { capMult: cap, yieldAdj: (W.quality - 75) * 0.0005 };
}

/* ============================================================
   매달 결산 직후 — 인과가 한 칸씩 굴러간다
   ============================================================ */
function worldPost(s, W, R, G) {
  const u = R.util || 0;
  W.utilHist.push(u);
  W.coverHist.push(coverOf(s));
  for (const k in CUST) W.shareHist[k].push(s.custShare[k] || 0);
  W.capHit = 1;

  // 1. 설비 — 돌릴수록 닳고, 무리할수록 빨리 닳는다
  W.equip = wClamp(W.equip - (1.1 + Math.max(0, u - 0.72) * 13 + W.fatigue * 0.02));
  W.maintAge++;

  // 2. 과부하 — 90%를 넘기면 쌓이고, 숨을 돌리면 빠진다
  if (u > 0.9) { W.fatigue = wClamp(W.fatigue + 5 + (u - 0.9) * 150); W.stats.overloadMonths++; }
  else W.fatigue = wClamp(W.fatigue - (u < 0.75 ? 12 : 6));
  if (W.fatigue > 40) s.morale = wClamp(s.morale - (W.fatigue - 40) * 0.07);
  else if (W.fatigue < 25) s.morale = wClamp(s.morale + (58 - s.morale) * 0.05);   // 숨을 돌리면 조금씩 돌아온다

  // 3. 품질 — 설비·사기·피로가 정하는 수준으로 천천히 끌려간다
  const qT = 48 + W.equip * 0.3 + s.morale * 0.15 - W.fatigue * 0.18 + W.qBoost;
  W.quality = wClamp(W.quality + (qT - W.quality) * 0.22);
  W.qBoost = Math.max(0, W.qBoost - 2);

  // 4. 납기 — 못 맞추면 큰 고객부터 관계를 잃는다
  const order = Object.keys(CUST).sort((a, b) => (s.custShare[b] || 0) - (s.custShare[a] || 0));
  const sr = R.shortRatio ?? 1;
  if (s.turn > 5 && sr < 0.9) {
    const hit = 3 + (1 - sr) * 20;
    W.rel[order[0]] = wClamp(W.rel[order[0]] - hit);
    W.rel[order[1]] = wClamp(W.rel[order[1]] - hit / 2);
    W.stats.shortages++;
    // 같은 결품이 매달 이어지면 청구서는 한 번만 — 관계 손상은 매달 쌓인다
    if (s.turn - (W.shortFired ?? -99) > 2) { W.shortFired = s.turn;
    fire(W, s, 'short', `납기를 못 맞췄습니다. ${cname(order[0])}와 ${cname(order[1])}가 불만을 표시했습니다.`,
      cause(W, s, ['underbuy', 'volume', 'project', 'breakdown', 'policy-tight'])); }
  }

  // 5. 관계 — 품질이 스며들고, 평소엔 보통으로 돌아가려 하고, 약한 고리는 경쟁사가 판다
  for (const k in CUST) {
    let r = W.rel[k];
    r += (W.quality - 70) * 0.04;
    r += (62 - r) * 0.05;
    if (r < 50) r -= Math.max(0, W.comp - 35) * 0.05;
    W.rel[k] = wClamp(r);
    W.relHigh[k] = W.rel[k] >= 78 ? W.relHigh[k] + 1 : 0;
  }

  // 6. 이탈과 우호
  for (const k in CUST) {
    const sh = s.custShare[k] || 0;
    W.churnAt = W.churnAt || {};
    if (W.rel[k] < 32 && sh > 0.04 && s.turn - (W.churnAt[k] ?? -99) >= 4) {
      W.churnAt[k] = s.turn;
      s.custShare[k] = sh * 0.92; s.myShare *= 0.99; W.stats.churn++;
      fire(W, s, 'churn', `${cname(k)} 물량 일부가 경쟁사로 넘어갔습니다.`,
        cause(W, s, ['hold', 'deny', 'claim', 'short'], k));
    } else if (W.rel[k] > 80) s.myShare *= 1.003;
  }
  normalizeShare(s);

  // 7. 경쟁사 — 불황에는 굶주려서 덤빈다
  const ct = { BUST: 62, NORMAL: 42, BOOM: 26 }[s.market.phase] || 40;
  W.comp = wClamp(W.comp + (ct - W.comp) * 0.2 + (Math.random() - 0.5) * 6);
  W.threat = {};
  for (const k in CUST) {
    const sh = s.custShare[k] || 0;
    const p = Math.max(0, W.comp - 25) / 100 * (0.6 + sh * 2) * (1 + W.concede[k] * 0.3);
    if (wChance(p)) W.threat[k] = true;
  }

  // 8. 본사 가격 방향 — 분기마다 정해지고 실제로 시세를 민다. 소문은 70%만 맞다
  if ((s.turn) % 3 === 0) {
    W.priceDir = wChance(0.32) ? 1 : wChance(0.45) ? -1 : 0;
    W.priceRumor = wChance(0.7) ? W.priceDir : wPick([1, -1, 0].filter(x => x !== W.priceDir));
  }
  s.market.pm = Math.max(400, Math.min(1400, s.market.pm * (1 + W.priceDir * 0.011)));

  // 9. 본사 연간 목표
  W.hq.ytd += R.materialTons || 0;
  if (s.turn % 12 === 0 && W.hq.target > 0) hqYearEnd(s, W);

  // 10. 한 번 깎아준 기억은 천천히 옅어진다
  if (s.turn % 8 === 0) for (const k in CUST) W.concede[k] = Math.max(0, W.concede[k] - 1);
  // 연간 단가 재협상 — 깎아준 단가는 해가 바뀌면 절반쯤 되돌릴 수 있다. 전부는 못 돌린다.
  if (s.turn % 12 === 0) {
    const back = Object.keys(CUST).filter(k => W.cut[k] > 0);
    if (back.length) {
      for (const k of back) { W.cut[k] = Math.round(W.cut[k] * 0.5); W.rel[k] = wClamp(W.rel[k] - 3); }
      fire(W, s, 'renego', `연간 단가 재협상 — ${back.map(k => CUST[k]).join('·')}에 깎아준 단가의 절반을 되돌렸습니다. 고객들은 불만입니다.`,
        '그동안 해준 가격 양보');
    }
  }

  // 11. 통계
  W.stats.months++; W.stats.utilSum += u; W.stats.qualSum += W.quality;
  if (runway(s) < 1.5) W.stats.cashTight++;

  // 12. 다음에 터질 일 — 확률은 지금까지의 선택이 만든다
  if ((G.mpt || 1) === 1 || s.turn % 3 === 0) rollIncidents(s, W, (G.mpt || 1) > 1 ? 1.8 : 1);
}

function rollIncidents(s, W, k = 1) {
  if (s.turn < 4) return;
  const hot = W.utilHist.slice(-3).filter(u => u > 0.9).length;
  const pB = (Math.max(0, 58 - W.equip) / 100 * (1 + W.fatigue / 70)
            + (W.deferMaint >= 2 ? 0.04 : 0) + hot * 0.02) * k;
  if (!W.breakdown && wChance(pB)) W.breakdown = { turn: s.turn + 1, sev: W.equip < 40 ? 2 : 1 };

  const outs = W.mem.some(m => m.tag === 'outsource' && s.turn - m.turn <= 3);
  const pC = (Math.max(0, 72 - W.quality) / 100 * 1.4 + (outs ? 0.08 : 0) + (W.packCheap ? 0.04 : 0)) * k;   // 얇은 방청지는 운송 중에 녹을 부른다
  if (!W.claim && wChance(pC)) {
    // 최근에 물량을 몰아준 고객 라인에서 제일 먼저 문제가 드러난다
    const pushed = [...W.mem].reverse().find(m =>
      ['volume', 'project'].includes(m.tag) && m.cust && s.turn - m.turn <= 6);
    W.claim = { cust: pushed ? pushed.cust : topCust(s), turn: s.turn + 1 };
  }
}

function hqYearEnd(s, W) {
  const r = W.hq.ytd / W.hq.target;
  const yr = Math.floor((s.turn - 1) / 12) + 1;
  const promised = W.hq.commit === 'full' ? '약속한 목표' : W.hq.commit === 'low' ? '깎아서 받은 목표' : '목표';
  let text;
  if (r >= 1) { s.trust = wClamp(s.trust + 8); W.stats.hqHit++;
    text = `${yr}년차 본사 소재 판매 ${Math.round(r * 100)}% — ${promised}를 채웠습니다. 본사 평가가 좋습니다.`; }
  else if (r >= 0.9) { s.trust = wClamp(s.trust + 2);
    text = `${yr}년차 본사 소재 판매 ${Math.round(r * 100)}% — ${promised}에 조금 못 미쳤습니다.`; }
  else if (r >= 0.8) { s.trust = wClamp(s.trust - 5); W.stats.hqMiss++;
    text = `${yr}년차 본사 소재 판매 ${Math.round(r * 100)}% — ${promised}에 못 미쳤습니다. 본사가 아쉬워합니다.`; }
  else { s.trust = wClamp(s.trust - 10); s.myShare *= 0.97; W.stats.hqMiss++;
    text = `${yr}년차 본사 소재 판매 ${Math.round(r * 100)}% — ${promised}에 크게 못 미쳤습니다. 본사가 내년 내시를 줄이겠답니다.`; }
  W.hq.log.push({ year: yr, target: W.hq.target, ytd: W.hq.ytd, r, commit: W.hq.commit });
  fire(W, s, 'hq', text, W.hq.commit === 'full' ? '연초에 본사 요구를 그대로 받았습니다' : null);
  W.hq.ytd = 0; W.hq.target = 0;
}

/* ============================================================
   결정의 영향 — 지난달 결재가 실제로 무엇을 움직였나
   ============================================================ */
function settleImpacts(s, W, R, before) {
  const T = Object.values(R.shipped || {}).reduce((a, b) => a + b, 0);
  const rows = W.impacts.map(im => {
    const out = [];
    if (im.vol && im.vol !== 1) {
      const dt = T * (1 - 1 / im.vol);
      out.push([dt >= 0 ? '+' : '−', `판매량 ${dt >= 0 ? '+' : '−'}${fmt(Math.abs(dt))}t`]);
      out.push([dt >= 0 ? '=' : '=', `가동률 ${dt >= 0 ? '+' : '−'}${(Math.abs(R.util * (1 - 1 / im.vol)) * 100).toFixed(1)}%p`]);
    }
    if (im.cut) {
      const [k, x] = im.cut, sh = s.custShare[k] || 0;
      out.push(['−', `${CUST[k]} 단가 −$${x}/t`]);
      out.push(['−', `월 이익 −$${fmt(x * T * sh / 1000)}k`]);
    }
    if (im.order && im.order !== 1) out.push([im.order > 1 ? '=' : '+', `소재 발주 ×${im.order}`]);
    if (im.cash) out.push([im.cash > 0 ? '+' : '−', `현금 ${im.cash > 0 ? '+' : '−'}$${fmt(Math.abs(im.cash) / 1000)}k`]);
    if (im.rel) for (const [k, d] of im.rel) {
      const was = before.rel[k], now = W.rel[k];
      out.push([d >= 0 ? '+' : '−', `${CUST[k]} 관계 ${relLabel(was)}${relLabel(was) !== relLabel(now) ? ' → ' + relLabel(now) : ''} (${d >= 0 ? '+' : ''}${d})`]);
    }
    if (im.trust) out.push([im.trust > 0 ? '+' : '−', `본사 신뢰 ${im.trust > 0 ? '+' : ''}${im.trust}`]);
    if (im.equip) out.push([im.equip > 0 ? '+' : '−', `설비 ${equipLabel(before.equip)} → ${equipLabel(W.equip)}`]);
    if (im.quality) out.push([im.quality > 0 ? '+' : '−', `품질 ${im.quality > 0 ? '개선 중' : '저하'}`]);
    if (im.fatigue) out.push([im.fatigue > 0 ? '−' : '+', `현장 ${fatigueLabel(W.fatigue)}`]);
    if (im.risk) out.push(['?', im.risk]);
    return { label: im.label, rows: out };
  }).filter(x => x.rows.length);
  W.lastImpacts = rows;
  W.impacts = [];
}

/* 매달 대시보드용 스냅샷 */
function snapshot(s, W, R) {
  const T = R ? Object.values(R.shipped || {}).reduce((a, b) => a + b, 0) : 0;
  let relAvg = 0;
  for (const k in CUST) relAvg += (s.custShare[k] || 0) * W.rel[k];
  return {
    turn: s.turn, sales: T, op: R ? R.op : 0, cash: s.cash,
    raw: s.invRaw.reduce((a, l) => a + l.qty, 0), util: R ? R.util : 0,
    quality: qualityPct(W.quality), equip: W.equip, rel: relAvg, trust: s.trust,
    morale: s.morale, hqPace: W.hq.target > 0 ? W.hq.ytd / (W.hq.target * (((s.turn - 1) % 12) + 1) / 12) : null,
  };
}

/* ============================================================
   부서 보고 — 같은 회사를 보는데 부서마다 보이는 게 다르다.
   확인된 것, 추정, 소문이 섞여 있다. 소문은 틀릴 수 있다.
   ============================================================ */
function briefing(s, W) {
  const L = look(s), cov = coverOf(s), run = runway(s);
  const out = [];
  const say = (who, kind, text, w) => out.push({ who, kind, text, w });

  // 생산 — 구 공장장. 숫자를 직접 본다. 대신 괜찮을 때는 말이 없다.
  if (W.equip < 48) say('gu', '확인', `2호 라인 진동 수치가 평소보다 높습니다. 베어링 쪽입니다. 마지막 정비가 ${W.maintAge}개월 전입니다.`, 9);
  else if (W.equip < 62) say('gu', wChance(0.8) ? '추정' : '소문', `라인 소리가 좀 달라졌습니다. 당장은 괜찮은데, 오래는 모르겠습니다.`, 6);
  else if (wChance(0.12)) say('gu', '추정', `슬리터 나이프 쪽이 좀 신경 쓰입니다. 큰일은 아닙니다.`, 3);   // 가끔은 헛걱정
  if (W.fatigue > 35) say('gu', '확인', `반장들이 지쳐 있습니다. 석 달째 특근입니다.`, 7);

  // 소재 발주 — 정 부장. 영업이 내시를 보고 소재를 건다. 본사 가격은 본사 영업팀 소문으로 듣는다.
  const sn = stockNow(s);
  if (W.priceRumor === 1) say('jung', '소문', `본사 영업팀 동기 얘기로는 다음 분기에 소재값을 올린답니다. 확정은 아니고요.`, 6);
  else if (W.priceRumor === -1) say('jung', '소문', `본사 재고가 많이 쌓였답니다. 다음 분기엔 값이 내려갈 수도 있다는데, 반쯤은 소문입니다.`, 6);
  if (cov < 1.5) say('jung', '확인', `재고율이 ${cov.toFixed(1)}개월밖에 안 됩니다. 본사에서 생산 중인 것까지 쳐도 ${sn.resM.toFixed(1)}개월이라, 결품 날까 봐 조마조마합니다.`, 9);
  else if (cov > 3.4) say('jung', '확인', `재고율 ${cov.toFixed(1)}개월, 재원율 ${sn.resM.toFixed(1)}개월입니다. 영업 입장에선 든든한데 한 부장님 표정이 안 좋습니다.`, 6);

  // 자재 — 서 대리. 비품·포장재·MRO. 현장이 잘 안 보는 것들을 본다.
  if (W.spares === false && W.equip < 60) say('seo', '확인', `베어링이랑 유압호스 예비품이 바닥이에요… 설비가 서면 부품 오는 데 열흘은 걸립니다.`, 7);
  if (W.packCheap) say('seo', '추정', `바꾼 포장재 업체 방청지가 좀 얇은 것 같아요. 우기에 괜찮을지 모르겠습니다.`, 5);

  // 영업 — 정 부장. 시장 소문을 제일 먼저 듣는데, 부풀린다.
  const ks = Object.keys(CUST).filter(k => (s.custShare[k] || 0) > 0.06);
  const rumK = ks.find(k => W.threat[k] ? wChance(0.75) : wChance(0.08));
  if (rumK) say('jung', '소문', `${cname(rumK)}에 경쟁사가 톤당 $${wPick([15, 18, 20, 25])} 낮게 들어갔다는 얘기가 있습니다.`, 8);
  const cold = ks.filter(k => W.rel[k] < 50).sort((a, b) => W.rel[a] - W.rel[b])[0];
  if (cold) say('jung', '추정', `${cname(cold)} 구매팀 분위기가 싸늘합니다. 전화를 잘 안 받습니다.`, 7);
  const warm = ks.find(k => W.relHigh[k] >= 2);
  if (warm && wChance(0.6)) say('jung', '추정', `${cname(warm)} 쪽은 요즘 우리한테 호의적입니다. 뭔가 더 맡길 눈치입니다.`, 5);

  // 재무 — 한 부장. 숫자만 말한다. 틀리지 않는다.
  if (run < 1.6) say('han', '확인', `결론부터 말씀드리면, 지금 현금과 한도로 버틸 수 있는 건 ${run.toFixed(1)}개월입니다. 큰 구매는 부담입니다.`, 9);
  const delayed = s.ar.filter(a => a.delayed).reduce((a, x) => a + x.amount, 0);
  if (delayed > 500_000) say('han', '확인', `대금이 늦어지는 곳이 있습니다. 밀린 게 $${fmt(delayed / 1000)}k입니다.`, 6);
  const topK = topCust(s);
  if ((s.custShare[topK] || 0) > 0.45) say('han', '확인', `${cname(topK)} 비중이 ${Math.round(s.custShare[topK] * 100)}%입니다. 한 곳이 흔들리면 회사가 흔들립니다.`, 6);

  // 품질 — 오 과장. 추세를 본다.
  const qs = W.snaps.slice(-3).map(x => x.quality);
  if (W.quality < 66) say('oh', '확인', `불량률이 올라가고 있습니다. 최근 ${CUST[topK]}향 제품에서 미세 표면 결함이 늘었습니다.`, 8);
  else if (qs.length === 3 && qs[2] < qs[0] - 0.25) say('oh', '추정', `석 달째 품질 지표가 조금씩 내려갑니다. 아직 고객은 모릅니다.`, 6);

  // 현지 — 린 매니저. 사람 얘기.
  if (s.morale < 50) say('lin', '추정', `사장님, 현장 분위기가 안 좋아요. 옆 공단 얘기를 하는 사람이 늘었어요.`, 7);

  // 본사 목표
  if (W.hq.target > 0) {
    const m = ((s.turn - 1) % 12);
    const pace = m > 0 ? W.hq.ytd / (W.hq.target * m / 12) : 1;
    if (m >= 4 && pace < 0.88) say('jung', '확인', `올해 본사 소재 목표 대비 ${Math.round(pace * 100)}% 페이스입니다. 본사가 눈치를 줍니다.`, 7);
  }

  out.sort((a, b) => b.w - a.w);
  const seen = new Set(), pickN = [];
  for (const x of out) { if (pickN.length >= 5) break; if (seen.has(x.who) && pickN.length >= 3) continue; seen.add(x.who); pickN.push(x); }
  if (!pickN.length) pickN.push({ who: 'han', kind: '확인', text: '이번 달은 특별히 보고드릴 게 없습니다. 조용한 달입니다.' });
  return pickN;
}

/* ============================================================
   조기 경보 — 숫자는 이미 알고 있다. 사장이 못 본 척할 뿐이다.
   ============================================================ */
function warnings(s, W) {
  const out = [];
  const u3 = W.utilHist.slice(-3);
  if (u3.length === 3 && u3.every(u => u > 0.9))
    out.push(['생산', '가동률이 3개월 연속 90%를 넘었습니다. 설비 고장과 품질 위험이 쌓이고 있습니다.']);
  if (W.equip < 50) out.push(['설비', `설비 상태 ${equipLabel(W.equip)}. 마지막 정비 후 ${W.maintAge}개월째입니다.`]);
  const c = W.coverHist.slice(-3);
  if (c.length === 3 && c[2] > c[0] + 0.5 && c[2] > 3.2) out.push(['재무', '소재 재고가 빠르게 늘고 있습니다. 현금이 창고에 묶이고 있습니다.']);
  if (coverOf(s) < 2.3 && s.turn > 3) out.push(['구매', '석 달 뒤 소재가 모자랄 수 있습니다. 결품이면 큰 고객부터 등을 돌립니다.']);
  for (const k in CUST) {
    const h = W.shareHist[k].slice(-4);
    if (h.length === 4 && h[3] < h[0] * 0.88 && (s.custShare[k] || 0) > 0.06)
      out.push(['고객', `${cname(k)} 주문이 줄고 있습니다. 경쟁사로 옮기는 중일 수 있습니다.`]);
  }
  if (W.quality < 66) out.push(['품질', '클레임이 날 수 있는 수준입니다.']);
  if (W.fatigue > 55) out.push(['조직', '현장이 한계입니다. 사람이 나가기 시작하면 캐파가 빠집니다.']);
  const r = runway(s);
  if (r < 1.3) out.push(['현금', `현금과 한도로 ${r.toFixed(1)}개월치입니다.`]);
  const tk = topCust(s);
  if ((s.custShare[tk] || 0) > 0.48) out.push(['고객', `${cname(tk)} 의존도 ${Math.round(s.custShare[tk] * 100)}%. 가격 협상력이 약해집니다.`]);
  if (W.hq.target > 0) {
    const m = ((s.turn - 1) % 12);
    const pace = m > 0 ? W.hq.ytd / (W.hq.target * m / 12) : 1;
    if (m >= 5 && pace < 0.85) out.push(['본사', `올해 소재 판매 목표 대비 ${Math.round(pace * 100)}% 페이스입니다.`]);
  }
  return out;
}

/* ============================================================
   4년 뒤 — 점수 대신 "당신이 만든 회사"를 보여준다
   ============================================================ */
const STYLE_NAME = { grow: '공격적 성장형', cash: '안정적 수익형', cust: '고객관계형', craft: '생산효율형', hq: '본사 충성형' };
const STYLE_OPEN = {
  grow: '당신은 물량을 먼저 잡는 쪽을 택했습니다. 가격을 양보하고 제안을 받아들이며 판매량을 빠르게 키웠습니다.',
  cash: '당신은 현금과 마진을 먼저 지켰습니다. 무리한 물량은 사양하고 재고를 가볍게 들고 갔습니다.',
  cust: '당신은 고객과의 관계에 공을 들였습니다. 요구를 들어주고 직접 찾아가며 거래를 지켰습니다.',
  craft: '당신은 설비와 사람에 먼저 투자했습니다. 라인을 세우는 비용을 감수하며 공장을 건강하게 유지했습니다.',
  hq: '당신은 본사의 요구를 우선했습니다. 목표를 그대로 받고 본사 소재 판매를 늘리는 데 힘을 썼습니다.',
};
const STYLE_NEXT = {
  grow: '다음 판에는 물량 제안 몇 개를 사양하고, 라인을 쉬게 해보면 무엇이 달라지는지 보십시오.',
  cash: '다음 판에는 한두 번 크게 걸어보십시오. 안전하게만 가면 본사와 고객이 먼저 떠납니다.',
  cust: '다음 판에는 한 번쯤 가격 요구를 거절해 보십시오. 양보는 기억되고, 다시 옵니다.',
  craft: '다음 판에는 성장 기회를 더 잡아보십시오. 건강한 공장이 돈을 버는 공장과 같지는 않습니다.',
  hq: '다음 판에는 본사에 한 번 "안 됩니다"라고 해보십시오. 코일센터가 먼저 살아 있어야 합니다.',
};

function companyProfile(s, W) {
  const h = s.history, st = W.stats;
  const tons = h.reduce((a, r) => a + Object.values(r.shipped || {}).reduce((x, y) => x + y, 0), 0);
  const op = h.reduce((a, r) => a + r.op, 0);
  const invAvg = h.reduce((a, r) => a + (r.invTons || 0), 0) / Math.max(1, h.length);
  const years = Math.max(1, h.length / 12);
  const tk = topCust(s);
  const m = {
    tons, op, margin: tons > 0 ? op / tons : 0, hqTons: s.hq.cumMaterialTons,
    util: st.months ? st.utilSum / st.months : 0, quality: qualityPct(st.months ? st.qualSum / st.months : W.quality),
    // L/C는 선적 때 대금이 나가니 바다 위 물량도 우리 재고다. 미착 포함 개월수로 회전을 잰다
    turnover: W.coverHist.length ? 12 / (W.coverHist.reduce((a, b) => a + b, 0) / W.coverHist.length) : 0, cash: s.cash, trust: s.trust, morale: s.morale,
    topK: tk, topShare: s.custShare[tk] || 0,
  };
  const order = Object.keys(STYLE_NAME).sort((a, b) => (W.style[b] || 0) - (W.style[a] || 0));
  const main = order[0], sub = order[1];
  const lines = [STYLE_OPEN[main]];
  if (s.overReason && s.overReason !== "COMPLETE")
    lines.unshift(`회사는 ${h.length}개월 만에 자금이 끊겼습니다. 아래는 그때까지 당신이 만든 회사입니다.`);
  const but = [];
  if (st.overloadMonths >= 8) but.push(`가동률 90% 넘는 달이 ${st.overloadMonths}개월이었고, 그동안 설비와 품질에 부담이 쌓였습니다`);
  if (st.breakdowns >= 2) but.push(`설비가 ${st.breakdowns}번 섰습니다`);
  if (st.claims >= 2) but.push(`품질 클레임이 ${st.claims}건 들어왔습니다`);
  if (st.concessions >= 4) but.push(`가격을 ${st.concessions}번 양보했고, 양보한 고객은 다시 찾아왔습니다`);
  if (m.topShare > 0.45) but.push(`마지막 해에는 ${cname(tk)} 의존도가 ${Math.round(m.topShare * 100)}%까지 올라 협상력이 약해졌습니다`);
  if (st.cashTight >= 6) but.push(`현금이 빠듯한 달이 ${st.cashTight}개월이었습니다`);
  if (st.shortages >= 3) but.push(`납기를 ${st.shortages}번 못 맞췄습니다`);
  if (st.churn >= 3) but.push(`고객 물량이 ${st.churn}번 경쟁사로 빠졌습니다`);
  if (st.hqMiss >= 1) but.push(`본사 연간 목표를 ${st.hqMiss}번 크게 못 채웠습니다`);
  const good = [];
  if (st.breakdowns === 0) good.push('설비는 한 번도 서지 않았습니다');
  if (m.quality >= 97.8) good.push(`평균 양품률 ${m.quality.toFixed(1)}%로 품질은 끝까지 좋았습니다`);
  if (st.hqHit >= 2) good.push(`본사 연간 목표를 ${st.hqHit}번 채웠습니다`);
  if (m.margin > 12) good.push(`톤당 평균 영업이익 $${m.margin.toFixed(1)}로 마진이 두꺼웠습니다`);
  if (m.turnover > 3.2) good.push(`재고를 연 ${m.turnover.toFixed(1)}회 돌려 현금이 창고에 오래 머물지 않았습니다`);
  if (good.length) lines.push(`그 결과 ${good.slice(0, 2).join(". ")}.`);
  if (but.length) lines.push(`그러나 ${but.slice(0, 3).join('. ')}.`);
  if (sub && (W.style[sub] || 0) > (W.style[main] || 0) * 0.6)
    lines.push(`한편으로는 ${STYLE_NAME[sub]}의 모습도 강했습니다.`);
  lines.push(STYLE_NEXT[main]);
  return { main, sub, name: STYLE_NAME[main], lines, m, st };
}

/* ============================================================
   인수인계 — 이 회사는 이미 돌고 있었다.
   전임 사장이 무난하게 굴린 16개월을 실제로 돌리고, 마지막 12개월을 "작년 실적"으로 넘겨받는다.
   그래서 첫 달부터 창고에 소재와 제품이 있고, 바다 위와 본사 공장에 물량이 있고,
   받을 돈과 줄 돈이 있다. 숫자는 전부 엔진이 실제로 계산한 것이다.
   ============================================================ */
function runPrelude(s, months = 16) {
  const gameScenario = s.scenario, gamePhase = s.market.phase;
  s.scenario = [{ phase: 'NORMAL', drift: 0, to: 9999, name: '통상', label: '전임 사장 시절', brief: '' }];
  s.market.phase = 'NORMAL';
  const ui = { cover: 2.2, hqTake: 0, expandPick: null, overtime: false, yieldSpend: 0, salesSpend: 0, custFocus: null };
  const reps = [];
  for (let i = 0; i < months && !s.over; i++) {
    const r = resolveTurn(s, buildDecision(s, ui));
    s = r.state; reps.push(r.report);
  }
  // 날짜를 다시 맞춘다 — 넘겨받는 달이 1턴(2026년 1월)이 되도록
  const off = s.turn - 1, sh = t => t - off;
  for (const l of s.invRaw) if (l.arrivalTurn != null) l.arrivalTurn = sh(l.arrivalTurn);
  for (const l of s.invFg) { if (l.madeTurn != null) l.madeTurn = sh(l.madeTurn); if (l.arrivalTurn != null) l.arrivalTurn = sh(l.arrivalTurn); }
  for (const p of s.poOpen) p.etaTurn = sh(p.etaTurn);
  for (const a of s.ar) a.dueTurn = sh(a.dueTurn);
  for (const a of s.ap) a.dueTurn = sh(a.dueTurn);
  for (const n of s.nasi) n.turn = sh(n.turn);
  for (const b of (s.buildQueue || [])) b.readyTurn = sh(b.readyTurn);
  for (const q of (s.custQueue || [])) q.turn = sh(q.turn);
  s.prelude = reps.slice(-12).map(r => ({ ...r, turn: sh(r.turn), date: dateLabel(sh(r.turn)) }));
  // 성적표는 부임한 날부터 센다
  s.turn = 1; s.over = false; s.overReason = null; s.running = true;
  s.scenario = gameScenario; s.market.phase = gamePhase;
  s.history = [];
  s.cum = { sales: { C2C: 0, SLIT: 0, LEVEL: 0, BLANK: 0 }, revenue: 0, op: 0, np: 0 };
  s.hq = { cumMaterialTons: 0, cumHqMargin: 0, cumConsolidated: 0 };
  s.lossStreak = 0;
  return s;
}

/* 재고·재원 — 톤과 개월
   재고량 = 창고 현물(소재+제품) + 해상 미착
   재원량 = 재고량 + 본사에서 생산 중인 물량
   둘 다 향후 3개월 내시 평균으로 나눠 몇 개월치인지 본다 */
function stockOf(R) {
  const st = (R && R.stock) || {};
  const d = Math.max(1, st.nasi3 || 1);
  const inv = (st.onhand || 0) + (st.sea || 0), res = inv + (st.prod || 0);
  return { onhand: st.onhand || 0, fg: st.fg || 0, sea: st.sea || 0, prod: st.prod || 0,
           inv, res, invM: inv / d, resM: res / d, nasi3: st.nasi3 || 0 };
}
/* 설비별 가동률 — 실제로 넣은 소재 ÷ 명목 캐파 */
function lineUtilOf(R) {
  const r = (R && R.run) || {}, c = (R && R.capNow) || {};
  const u = (x, y) => (y > 0 ? x / y : null);
  return { SLIT: u(r.SLIT || 0, c.SLIT), LEVEL: u(r.LEVEL || 0, c.LEVEL), BLANK: u((r.TRAP || 0) + (r.DIE || 0), c.BLANK) };
}
