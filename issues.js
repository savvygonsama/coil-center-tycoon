/* ============================================================
   issues.js — 이번 달 안건

   고정된 카드 더미에서 뽑지 않는다. 지금 회사 상태와 지난 결정들이 안건을 만든다.
   정비를 미뤘으면 고장 안건이, 가격을 깎아줬으면 또 깎아달라는 안건이,
   재고를 쌓았으면 현금 안건이 올라온다. 조용한 달에는 기회가 올라온다.

   모든 선택지는 뭔가를 얻고 뭔가를 잃는다. 정답 선택지는 없다.
   ============================================================ */

/* 우선순위: force는 무조건 올라오는 것(사고·연간 협상), 나머지는 prio 순 */
function worldIssues(s, W, G) {
  const L = look(s);
  const cov = coverOf(s), run = runway(s);
  const u3 = W.utilHist.slice(-3);
  const hot = u3.filter(u => u > 0.9).length;
  const list = [];
  const add = (card, prio, force = false) => { if (card) list.push({ card, prio, force }); };
  const since = id => s.turn - (G.seen[id] ?? -99);
  const month = (s.turn - 1) % 12;          // 0 = 1월
  const shares = Object.keys(CUST).filter(k => (s.custShare[k] || 0) > 0.06);

  /* ---------- 반드시 올라오는 것 ---------- */
  if (W.breakdown && W.breakdown.turn <= s.turn) add(breakdownCard(s, W), 100, true);
  if (W.claim && W.claim.turn <= s.turn) add(claimCard(s, W, W.claim.cust), 96, true);
  if (month === 0) add(hqAnnualCard(s, W, L), 98, true);
  if (s.turn === 1) add(legacyCard(s, W), 94, true);

  /* ---------- 과거 결정이 만든 문제 ---------- */
  if (cov < 1.3 && since('w-short') > 1) add(shortCard(s, W, L, cov), 88);
  if (run < 1.3 && s.turn > 3 && since('w-cash') > 2) add(cashCard(s, W, run), 90);
  if ((cov > 3.6 || inventoryTons(s) > CFG.WAREHOUSE_CAP_BASE * 0.85) && since('w-over') > 3) add(overCard(s, W, cov), 72);
  if ((W.equip < 60 || W.maintAge >= 9) && since('w-maint') > 2)
    add(maintCard(s, W), 50 + Math.max(0, 60 - W.equip) * 2 + W.deferMaint * 8);
  if (hot >= 2 && W.fatigue > 22 && since('w-load') > 4) add(overloadCard(s, W, hot), 76);
  if ((W.quality < 70 || qualDrop(W) > 0.25) && since('w-qual') > 3) add(qualityCard(s, W), 50 + Math.max(0, 70 - W.quality) * 2);
  if ((W.fatigue > 50 || s.morale < 45) && since('w-people') > 4) add(peopleCard(s, W), 62);
  if (month === 6 && W.hq.target > 0 && W.hq.ytd < W.hq.target * 0.5 * 0.92) add(hqMidCard(s, W), 84);

  /* ---------- 고객 ---------- */
  for (const k of shares) {
    // 한 번 깎아준 고객은 다시 온다. 경쟁사가 붙은 고객도 온다.
    const pressure = W.concede[k] > 0 && since('w-price-' + k) >= 4
      || (W.comp > 45 && W.rel[k] < 62 && since('w-price-' + k) > 4);
    if (pressure && wChance(0.3 + W.concede[k] * 0.12)) add(priceCard(s, W, k), 58 + W.concede[k] * 10);
    if (W.rel[k] < 42 && since('w-churn-' + k) > 4) add(churnCard(s, W, k), 80);
    if (W.relHigh[k] >= 3 && since('w-proj') > 10) add(projectCard(s, W, k, L), 78);
  }
  const volK = shares.filter(k => W.rel[k] >= 60).sort(() => Math.random() - 0.5)[0];
  if (volK && s.market.phase !== 'BUST' && s.turn > 4 && since('w-vol') > 3 && (W.utilHist.slice(-1)[0] ?? 0) < 0.95 && wChance(0.5))
    add(volumeCard(s, W, volK, L), 46);

  /* ---------- 운영 ---------- */
  if (L.isBust && L.quota > 0 && since('op-hq') > 1) add(hqCard(L, s), 60);
  const ex = s.lines.length < CFG.MAX_LINES
    ? (L.gapSlit > 800 ? 'SLIT' : L.gapLevel > 500 ? 'LEVEL'
      : (s.turn > 10 && !s.lines.some(l => l.type === 'BLANK') ? 'BLANK' : null)) : null;
  if (ex && !(s.buildQueue || []).length && since('op-expand') > 6) add(expandCard(ex, L, s), 45);
  if (u3.length === 3 && u3.every(u => u < 0.55) && since('w-idle') > 4) add(idleCard(s, W), 52);
  if (G.trim && s.lines.some(l => l.type === 'SLIT') && since('op-trim') > 6) add(trimCard(), 28);

  /* ---------- 구매 방침과 소문 ---------- */
  if (W.priceRumor && W.priceRumor !== 0 && s.turn % 3 === 1 && since('w-rumor') > 2) add(rumorCard(s, W), 50);
  if (s.turn === 2 || since('w-policy') >= 8) add(policyCard(s, W, cov), 38);

  /* ---------- 자재 — 서 대리 ---------- */
  if (s.turn > 2 && since('m-pack') > 12 && wChance(0.12)) add(packCard(s, W), 44);
  if (W.spares === undefined && s.turn > 1 && since('m-mro') > 12 && (W.equip < 62 || wChance(0.15))) add(sparesCard(s, W), 48);
  if (W.spares === false && W.equip < 55 && since('m-mro') > 8) add(sparesCard(s, W), 55);
  if (s.turn > 8 && !G.seen['m-rebate'] && wChance(0.06)) add(rebateCard(s, W), 50);
  if (s.turn > 3 && since('m-safety') > 11 && wChance(0.2)) add(safetyCard(s, W), 42 + (W.safety || 0) * 8);

  /* ---------- 관리 — 한 부장 (인사·총무) ---------- */
  // 속성 모드는 분기 첫 달에만 결재하므로, 정해진 달이 속한 분기의 첫 달로 당긴다
  const at = mo => (G.mpt > 1 ? month === mo - (mo % 3) : month === mo);
  if (at(2)) add(wageCard(s, W), 86);                           // 매년 3월 임금협상
  if (at(11) && s.history.length) add(bonusCard(s, W), 82);     // 매년 12월 성과급
  const otRecent = W.mem.some(m => m.tag === 'overtime' && s.turn - m.turn <= 3);
  if ((otRecent || W.fatigue > 45) && since('h-labor') > 12 && wChance(0.35)) add(laborCard(s, W), 66);
  if (s.turn > 5 && since('h-house') > 14 && wChance(0.1)) add(housingCard(s, W), 36);
  if (at(5) && since('h-insure') > 10) add(insureCard(s, W), 46);
  if (s.turn > 14 && !G.seen['h-tax'] && wChance(0.05)) add(taxCard(s, W), 74);
  if ((W.mem.some(m => m.tag === 'quit' && s.turn - m.turn <= 2) || (s.morale < 50 && wChance(0.15)))
      && since('h-hire') > 10) add(vacancyCard(s, W), 60);

  /* ---------- 조용할 때 ---------- */
  if ((s.turn - (G.lastCust ?? -99)) >= (G.mpt > 1 ? 2 : 5)) add(custFocusCard(s, W), 34);
  if (s.turn > 8 && since('w-credit') > 9 && wChance(0.25)) add(creditCard(s, W), 30);

  return list;
}

function qualDrop(W) {
  const q = W.snaps.slice(-3).map(x => x.quality);
  return q.length === 3 ? q[0] - q[2] : 0;
}

/* ============================================================
   사고 — 정비를 미룬 만큼, 무리한 만큼 온다
   ============================================================ */
function breakdownCard(s, W) {
  const why = cause(W, s, ['defer', 'volume', 'project', 'overtime']);
  const hot = W.utilHist.slice(-4).filter(u => u > 0.9).length;
  const sev = W.breakdown.sev;
  const lineNo = wPick(['1호', '2호']);
  const ctx = [
    why ? `${why} 이후로 무리하게 돌렸습니다.` : '',
    hot >= 2 ? `최근 넉 달 중 ${hot}달을 가동률 90% 넘게 돌렸습니다.` : '',
    W.deferMaint >= 1 ? `정비는 ${W.maintAge}개월째 못 했습니다.` : '',
    W.spares === true ? "그나마 예비 베어링이 있어서 바로 갈아 끼울 수 있습니다." : W.spares === false ? "예비 부품이 없어서 해외에서 와야 합니다. 열흘은 걸립니다." : "",
    W.insLow ? "기계 보험을 뺐으니 수리비는 전부 우리 돈입니다." : "",
  ].filter(Boolean).join(' ');
  const done = (s, G, cap, cost, eq, msg, tag) => {
    // 예비품이 있으면 바로 갈아 끼우고, 없으면 부품이 올 때까지 선다. 기계보험을 뺐으면 수리비가 더 든다
    const c2 = W.spares ? Math.min(0.95, cap * 1.12) : W.spares === false ? cap * 0.88 : cap;
    const cost2 = W.insLow ? Math.round(cost * 1.5) : cost;
    W.capHit *= c2; s.cash -= cost2; W.equip = wClamp(W.equip + eq); cost = cost2;
    W.breakdown = null; W.stats.breakdowns++;
    for (const k of Object.keys(CUST).sort((a, b) => (s.custShare[b] || 0) - (s.custShare[a] || 0)).slice(0, 2))
      W.rel[k] = wClamp(W.rel[k] - (cap < 0.75 ? 6 : 3));
    remember(W, s, 'breakdown', `${lineNo} 라인 고장`);
    if (tag) remember(W, s, tag, msg);
    lever(G, `${lineNo} 라인 고장 수리`, { cash: -cost, equip: eq, risk: cap < 0.75 ? '이번 달 캐파 크게 감소' : '이번 달 캐파 감소' });
    return msg;
  };
  return {
    id: 'w-break', who: 'gu', topic: 'prod',
    title: `${lineNo} 라인이 섰습니다`,
    text: [`어젯밤 ${lineNo} 라인 감속기가 나갔습니다.`, sev > 1 ? '크게 나갔습니다.' : '', ctx, '어떻게 고칠지 정해주십시오.'].filter(Boolean).join(' '),
    opts: [
      { label: '제작사 기술자를 불러 급히 고친다', hint: '돈으로 시간을 산다',
        fx: [`−통장 $${sev > 1 ? 320 : 200},000`, '+이번 달 캐파 손실 최소', '+설비 상태 회복'],
        apply: (s, G) => done(s, G, 0.9, sev > 1 ? 320_000 : 200_000, 18,
          '제작사 기술자가 이틀 만에 고쳤습니다. 비쌌지만 라인은 거의 안 쉬었습니다.') },
      { label: '우리 인력으로 고친다', hint: '돈은 덜 드는데 오래 선다',
        fx: [`−통장 $${sev > 1 ? 140 : 90},000`, '−이번 달 캐파 30% 손실', '−납기 지연 → 고객 불만'],
        apply: (s, G) => done(s, G, 0.68, sev > 1 ? 140_000 : 90_000, 10,
          '열흘을 섰습니다. 그동안 큰 고객 두 곳 납기를 못 맞췄습니다.') },
      { label: '임시로 돌려놓고 나중에 제대로', hint: '당장은 싸다',
        fx: ['−통장 $30,000', '=이번 달 캐파 소폭 손실', '?다시 설 가능성 높음'],
        apply: (s, G) => { W.deferMaint++; W.stats.deferrals++;
          return done(s, G, 0.85, 30_000, 2, '용접으로 붙여놓고 돌립니다. 구 공장장은 "또 설 겁니다"라고 했습니다.', 'defer'); } },
    ],
  };
}

function claimCard(s, W, k) {
  // 그 고객에게 물량을 몰아준 게 제일 직접적인 원인이다. 없으면 공장 쪽 원인을 찾는다.
  const why = cause(W, s, ['volume', 'project'], k) || cause(W, s, ['outsource', 'pack-cheap', 'overtime', 'defer', 'skipqual']);
  const amt = Math.round((80 + (s.custShare[k] || 0) * 400) / 10) * 10;   // $천
  const done = (s, G, cost, rel, trust, share, msg, tag) => {
    s.cash -= cost; W.rel[k] = wClamp(W.rel[k] + rel); s.trust = wClamp(s.trust + trust);
    if (share !== 1) growCust(s, k, share - 1);
    W.claim = null; W.stats.claims++;
    remember(W, s, 'claim', `${CUST[k]} 품질 클레임`, { cust: k });
    if (tag) remember(W, s, tag, `${CUST[k]} 클레임 부인`, { cust: k });
    lever(G, `${CUST[k]} 클레임 대응`, { cash: -cost, rel: [[k, rel]], trust: trust || undefined,
      vol: share !== 1 ? 1 + (s.custShare[k] || 0) * (share - 1) : undefined });
    return msg;
  };
  return {
    id: 'w-claim', who: 'oh', topic: 'quality',
    title: `${cname(k)}에서 클레임이 들어왔습니다`,
    text: `${CUST[k]} 프레스 라인에서 우리 코일 표면 결함이 나왔습니다. ${why ? `짚고 넘어가겠습니다. ${why} 이후 우리 품질 지표가 계속 내려왔습니다.` : '최근 품질 지표가 내려와 있던 건 사실입니다.'} 고객은 $${amt}k를 청구했습니다.`,
    opts: [
      { label: '전액 보상하고 원인 보고서까지 낸다', hint: '돈으로 신뢰를 산다',
        fx: [`−통장 $${amt},000`, `+${CUST[k]} 관계 회복`, '+본사 신뢰 3'],
        apply: (s, G) => { W.qBoost += 6; styleAdd(W, 'cust', 2);
          return done(s, G, amt * 1000, 8, 3, 1, `전액 보상하고 8D 보고서를 냈습니다. ${CUST[k]} 품질팀이 오히려 신뢰를 보였습니다.`); } },
      { label: '공동 조사 후 과실 비율대로 나눈다', hint: '원칙대로',
        fx: [`−통장 약 $${Math.round(amt * 0.5)},000`, '?결과에 따라 관계가 갈린다'],
        apply: (s, G) => wChance(0.55)
          ? done(s, G, amt * 400, 2, 0, 1, '공동 조사 결과 절반 이상은 고객 쪽 문제였습니다. 깔끔하게 정리됐습니다.')
          : done(s, G, amt * 700, -6, -2, 1, '조사 결과 우리 쪽 비중이 컸습니다. 돈은 돈대로 들고 시간도 끌었습니다.') },
      { label: '우리 책임이 아니라고 한다', hint: '당장은 공짜',
        fx: ['+비용 없음', `−${CUST[k]} 관계 크게 악화`, `−${CUST[k]} 물량 감소`],
        apply: (s, G) => (styleAdd(W, 'cash'), done(s, G, 0, -16, -3, 0.85,
          `책임을 부인했습니다. ${CUST[k]}가 다음 분기 물량을 다른 코일센터와 나누겠답니다.`, 'deny')) },
    ],
  };
}

/* ============================================================
   연간 — 본사와 코일센터의 이해관계가 정면으로 부딪히는 자리
   ============================================================ */
function hqAnnualCard(s, W, L) {
  const y = Math.min(3, Math.floor((s.turn - 1) / 12));
  const base = L.need * 12 * (s.turn === 1 ? 1.1 : 1);      // 1년차는 파이프라인을 채우는 첫 발주가 목표에 섞인다
  const ask = Math.round(base * HQ_GROWTH[y] / 1000) * 1000;
  const run = runway(s), cov = coverOf(s);
  const util = W.utilHist.length ? W.utilHist.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, W.utilHist.length) : 0.8;
  const finance = run < 2 ? '현금 여유가 없습니다. 공격적으로 늘리면 운전자금이 먼저 터집니다.'
                : cov > 3.2 ? '재고가 이미 무겁습니다. 더 사면 창고에 돈이 묶입니다.'
                : '재무적으로는 감당할 만합니다. 다만 마진이 얇아지면 이야기가 달라집니다.';
  const prod = util > 0.88 ? '지금 라인으로는 추가 물량을 감당하기 어렵습니다. 무리하면 설비가 먼저 탈 겁니다.'
             : util < 0.65 ? '라인은 놀고 있습니다. 물량만 있으면 돌릴 수 있습니다.'
             : '조금은 더 받을 수 있습니다. 많이는 안 됩니다.';
  const set = (commit, tgt, trust, msg, style) => (s, G) => {
    W.hq.target = tgt; W.hq.ytd = 0; W.hq.commit = commit;
    s.trust = wClamp(s.trust + trust); styleAdd(W, style, 2);
    remember(W, s, 'hq-' + commit, `본사 목표 ${commit === 'full' ? '전량 수용' : commit === 'mid' ? '절충' : '하향 협상'}`);
    lever(G, `${y + 1}년차 본사 소재 목표`, { trust: trust || undefined, risk: `연간 목표 ${fmt(tgt)}t` });
    return msg;
  };
  return {
    id: 'w-hq-annual', who: 'jung', topic: 'hq',
    title: `${y + 1}년차 — 본사가 올해 소재 판매 목표를 내려보냈습니다`,
    text: `본사 요구는 연 ${fmt(ask)}톤${y > 0 ? `, 작년보다 ${Math.round((HQ_GROWTH[y] - 1) * 100)}% 늘리라는 겁니다` : '입니다'}. `
        + `회의에서 의견이 갈렸습니다. 한 부장는 "${finance}" 구 공장장은 "${prod}" `
        + `저는 가격을 좀 내리면 물량은 잡을 수 있다고 봅니다. 올해 테마는 「${YEAR_THEME[y].name}」입니다.`,
    opts: [
      { label: '요구대로 받는다', hint: '본사가 제일 좋아하는 답',
        fx: ['+본사 신뢰 4', `=목표 ${fmt(ask)}t`, '?못 채우면 연말에 크게 깎인다'],
        apply: set('full', ask, 4, '본사 요구를 그대로 받았습니다. 이제 채워야 합니다.', 'hq') },
      { label: '절충안을 낸다', hint: '요구의 90%',
        fx: [`=목표 ${fmt(ask * 0.9)}t`, '=본사 신뢰 변화 없음'],
        apply: set('mid', Math.round(ask * 0.9), 0, '90% 선에서 합의했습니다.', null) },
      { label: '우리 사정을 설명하고 낮춘다', hint: '현실적인 숫자',
        fx: [`+목표 ${fmt(ask * 0.8)}t (달성 쉬움)`, '−본사 신뢰 5'],
        apply: set('low', Math.round(ask * 0.8), -5, '80%로 낮췄습니다. 본사 영업본부장 표정이 굳었습니다.', 'cash') },
    ],
  };
}

function hqMidCard(s, W) {
  const pace = W.hq.ytd / (W.hq.target * 0.5);
  const top2 = Object.keys(CUST).sort((a, b) => (s.custShare[b] || 0) - (s.custShare[a] || 0)).slice(0, 2);
  return {
    id: 'w-hq-mid', who: 'jung', topic: 'hq',
    title: '본사가 하반기 물량 확대를 요청했습니다',
    text: `상반기 소재 판매가 목표의 ${Math.round(pace * 100)}% 페이스입니다. 본사 영업본부에서 직접 전화가 왔습니다. `
        + `"하반기에 만회해 주십시오." 방법은 있습니다. 문제는 그 방법들이 전부 우리 돈을 쓴다는 겁니다.`,
    opts: [
      { label: `${CUST[top2[0]]}·${CUST[top2[1]]}에 단가를 낮춰 물량을 늘린다`, hint: '본사 실적 ↑, 우리 이익 ↓',
        fx: ['+판매량·본사 소재 판매 ↑', '−두 고객 단가 −$10/t', '?가동률·설비 부담'],
        apply: (s, G) => {
          let v = 1;
          for (const k of top2) { W.cut[k] += 10; W.concede[k]++; v *= growCust(s, k, 0.18); W.rel[k] = wClamp(W.rel[k] + 4); }
          W.stats.concessions += 2; styleAdd(W, 'hq', 2); styleAdd(W, 'grow');
          remember(W, s, 'volume', `하반기 본사 물량 만회용 단가 인하`, { cust: top2[0] });
          lever(G, '하반기 물량 만회 — 단가 인하', { vol: v, cut: [top2[0], 10], rel: [[top2[0], 4], [top2[1], 4]] });
          return '두 고객에 톤당 10불씩 내렸습니다. 물량은 늘어날 겁니다. 본사 소재 판매도요. 우리 이익은 얇아집니다.';
        } },
      { label: '소재를 미리 사서 재고로 쌓는다', hint: '본사 숫자만 맞춘다',
        fx: ['+본사 소재 판매 즉시 ↑', '−현금이 창고에 묶임', '?값이 내리면 손실'],
        apply: (s, G) => { G.mult *= 1.7; styleAdd(W, 'hq', 2);
          remember(W, s, 'overbuy', '본사 목표용 소재 선매입');
          lever(G, '본사 목표용 선매입', { order: 1.7, risk: '재고·현금 부담' });
          return '이번 달 발주를 크게 늘렸습니다. 본사 숫자는 좋아질 겁니다. 창고는 무거워집니다.'; } },
      { label: '본사에 사정을 설명한다', hint: '우리 살림이 먼저',
        fx: ['+현금·마진 지킴', '−본사 신뢰 6'],
        apply: (s, G) => { s.trust = wClamp(s.trust - 6); styleAdd(W, 'cash', 2);
          remember(W, s, 'hq-refuse', '본사 하반기 요청 거절');
          lever(G, '본사 하반기 요청 거절', { trust: -6 });
          return '무리하지 않겠다고 했습니다. 본사는 "알겠다"고만 했습니다. 연말 평가가 걱정입니다.'; } },
    ],
  };
}

/* 1년차 첫 달 — 전임자가 남긴 묵은 재고 */
function legacyCard(s, W) {
  const lot = s.invRaw.find(l => l.arrivalTurn < 0);
  if (!lot) return null;
  const val = lot.qty * s.market.pm;
  const drop = (s, pct, msg, G, label, extra = {}) => {
    const i = s.invRaw.indexOf(lot); if (i >= 0) s.invRaw.splice(i, 1);
    const cash = val * pct; s.cash += cash;
    lever(G, label, { cash: Math.round(cash), ...extra });
    return msg;
  };
  return {
    id: 'w-legacy', who: 'han', topic: 'legacy',
    title: '전임 사장이 남긴 재고가 있습니다',
    text: `결론부터 말씀드리면, 창고 구석에 일반재 ${fmt(lot.qty)}톤이 다섯 달째 묵어 있습니다. 장부가로 $${fmt(val / 1000)}k입니다. `
        + `규격이 애매해서 사겠다는 데가 없었습니다. 더 두면 녹이 슬고, 결국 반값에 넘기게 됩니다.`,
    opts: [
      { label: '지금 싸게 넘긴다', hint: '손실을 확정하고 털어낸다',
        fx: [`+현금 $${fmt(val * 0.72 / 1000)}k 회수`, `−손실 $${fmt(val * 0.28 / 1000)}k 확정`, '+창고 정리'],
        apply: (s, G) => { styleAdd(W, 'cash', 2); remember(W, s, 'cleanup', '묵은 재고 정리');
          return drop(s, 0.72, '고철상 가격보다 조금 나은 값에 넘겼습니다. 아프지만 깨끗해졌습니다.', G, '묵은 재고 헐값 처분'); } },
      { label: '본사에 반품을 협의한다', hint: '본사에 빚을 진다',
        fx: [`+현금 $${fmt(val * 0.9 / 1000)}k 회수`, '−본사 신뢰 7'],
        apply: (s, G) => { s.trust = wClamp(s.trust - 7); styleAdd(W, 'cash');
          remember(W, s, 'hq-favor', '묵은 재고 본사 반품');
          return drop(s, 0.9, '본사가 받아줬습니다. 다만 "이번 한 번"이라고 했습니다.', G, '묵은 재고 본사 반품', { trust: -7 }); } },
      { label: '조금씩 섞어서 팔아본다', hint: '손실을 미룬다',
        fx: ['=당장 손실 없음', '?녹 슬면 반값 처분', '−창고 공간 차지'],
        apply: (s, G) => { remember(W, s, 'keep-legacy', '묵은 재고 보유');
          lever(G, '묵은 재고 보유', { risk: '매달 열화·반값 처분 위험' });
          return '일단 둡니다. 유통 물량 나올 때 섞어서 팔아보겠습니다.'; } },
    ],
  };
}

/* ============================================================
   구매 — 많이 사도 문제, 적게 사도 문제
   ============================================================ */
function shortCard(s, W, L, cov) {
  const why = cause(W, s, ['underbuy', 'policy-tight', 'volume', 'project']);
  const t = Math.round(L.need * 0.6 / 100) * 100;
  const prem = 0.09;
  return {
    id: 'w-short', who: 'jung', topic: 'buy',
    title: '소재가 모자랍니다',
    text: `사장님, 재고율이 ${cov.toFixed(1)}개월까지 내려왔습니다. 본사에서 생산 중인 것까지 쳐도 ${stockNow(s).resM.toFixed(1)}개월이에요. ${why ? `${why} 이후 쓰는 속도가 들어오는 속도보다 빨랐습니다. ` : ""}`
        + `이대로 가면 결품입니다. 결품 나면 큰 고객부터 등을 돌립니다. 제가 제일 무서워하는 게 그겁니다.`,
    opts: [
      { label: `현지 유통에서 ${fmt(t)}톤을 급히 산다`, hint: '비싸도 바로 온다',
        fx: [`−통장 $${fmt(t * s.market.pm * (1 + prem) / 1000)}k 즉시`, `−톤당 ${Math.round(prem * 100)}% 비쌈`, '+결품 방지'],
        apply: (s, G) => { const c = s.market.pm * (1 + prem);
          s.invRaw.push({ qty: t, unitCost: c, arrivalTurn: s.turn, dt: 'SPOT', gr: 'PREMIUM' });
          s.cash -= t * c; styleAdd(W, 'cust');
          lever(G, '현지 긴급 구매', { cash: -Math.round(t * c) });
          return `${fmt(t)}톤을 현지에서 구했습니다. 비쌌지만 이번 분기 라인은 안 섭니다.`; } },
      { label: '본사에 긴급 선적을 부탁한다', hint: '본사에 빚을 진다',
        fx: ['−본사 신뢰 4', '+다음 배 한 달 당김'],
        apply: (s, G) => { s.trust = wClamp(s.trust - 4);
          const p = s.poOpen.slice().sort((a, b) => a.etaTurn - b.etaTurn)[0];
          if (p) p.etaTurn = Math.max(s.turn + 1, p.etaTurn - 1);
          G.mult *= 1.3;
          lever(G, '본사 긴급 선적 요청', { trust: -4, order: 1.3 });
          return '본사가 다음 배를 당겨주기로 했습니다. "다음부터는 미리 좀 하라"는 말과 함께요.'; } },
      { label: '큰 고객 물량만 지키고 나머지는 미룬다', hint: '돈을 안 쓴다',
        fx: ['+현금 지킴', '−작은 고객 관계 악화', '?결품 위험 남음'],
        apply: (s, G) => { const small = Object.keys(CUST).sort((a, b) => (s.custShare[a] || 0) - (s.custShare[b] || 0)).slice(0, 2);
          for (const k of small) W.rel[k] = wClamp(W.rel[k] - 8);
          G.mult *= 1.2; styleAdd(W, 'cash');
          lever(G, '작은 고객 납기 후순위', { rel: small.map(k => [k, -8]) });
          return `${small.map(k => CUST[k]).join('·')} 납기를 뒤로 미뤘습니다. 두 곳 다 좋아하지 않습니다.`; } },
    ],
  };
}

function overCard(s, W, cov) {
  const why = cause(W, s, ['overbuy', 'policy-ample', 'hq-full', 'keep-legacy']);
  const old = s.invRaw.filter(l => s.turn - l.arrivalTurn >= 3);
  const oldT = old.reduce((a, l) => a + l.qty, 0);
  const sellT = Math.round(Math.min(oldT || inventoryTons(s) * 0.15, 6000) / 100) * 100;
  return {
    id: 'w-over', who: 'han', topic: 'buy',
    title: '창고에 돈이 묶여 있습니다',
    text: `결론부터 말씀드리면, 재고율 ${cov.toFixed(1)}개월, 재원율 ${stockNow(s).resM.toFixed(1)}개월입니다. 너무 많이 들고 있습니다. ${why ? `${why}의 영향이 큽니다. ` : ''}`
        + `소재값이 내리면 그만큼 손실이고, 그 사이 이자는 계속 나갑니다. 석 달 넘은 것만 ${fmt(oldT)}톤입니다.`,
    opts: [
      { label: `오래된 것 ${fmt(sellT)}톤을 할인해서 판다`, hint: '손실을 보고 현금을 뺀다',
        fx: [`+현금 약 $${fmt(sellT * s.market.pm * 0.86 / 1000)}k`, `−손실 약 $${fmt(sellT * s.market.pm * 0.14 / 1000)}k`],
        apply: (s, G) => { let left = sellT, got = 0;
          for (const l of s.invRaw.slice().sort((a, b) => a.arrivalTurn - b.arrivalTurn)) {
            if (left <= 0) break; const q = Math.min(l.qty, left); l.qty -= q; left -= q; got += q * s.market.pm * 0.86; }
          s.invRaw = s.invRaw.filter(l => l.qty > 0.5); s.cash += got; styleAdd(W, 'cash', 2);
          remember(W, s, 'dump', '재고 할인 처분');
          lever(G, '재고 할인 처분', { cash: Math.round(got) });
          return '묵은 것부터 할인해서 넘겼습니다. 장부는 아프고 통장은 숨을 쉽니다.'; } },
      { label: '앞으로 석 달 발주를 확 줄인다', hint: '천천히 뺀다',
        fx: ['+현금 부담 ↓', '−발주 ×0.4', '?수요가 붙으면 결품'],
        apply: (s, G) => { G.mult *= 0.4; W.policy = 'tight'; styleAdd(W, 'cash');
          remember(W, s, 'policy-tight', '발주 긴축');
          lever(G, '발주 긴축', { order: 0.4, risk: '석 달 뒤 결품 위험' });
          return '발주를 줄이고 재고 방침을 타이트로 바꿨습니다.'; } },
      { label: '그대로 들고 간다', hint: '값이 오르면 이득',
        fx: ['=당장 변화 없음', '?값이 내리면 평가손', '−이자·보관비 계속'],
        apply: (s, G) => { styleAdd(W, 'grow'); remember(W, s, 'hold-stock', '재고 보유 결정');
          return '들고 갑니다. 값이 오르길 바랍니다.'; } },
    ],
  };
}

function rumorCard(s, W) {
  const up = W.priceRumor === 1;
  const act = (m, tag, label, msg, style) => (s, G) => {
    G.mult *= m; styleAdd(W, style); remember(W, s, tag, label);
    lever(G, label, { order: m, risk: m > 1 ? (up ? '안 오르면 재고만 남음' : '더 내리면 평가손') : '반대로 가면 비싸게 산다' });
    return msg;
  };
  return {
    id: 'w-rumor', who: 'jung', topic: 'buy',
    title: up ? '본사가 소재값을 올린다는 소문이 있습니다' : '소재값이 내릴 거라는 얘기가 있습니다',
    text: up
      ? '사장님, 본사 영업팀 동기한테 들었는데요, 다음 분기에 소재값을 올린답니다. 확정은 아닙니다. 그 친구가 틀린 적도 있고요. 발주를 어떻게 걸지 정해주십시오.'
      : '본사 재고가 많이 쌓였답니다. 다음 분기엔 값이 내려갈 수도 있다는데, 반쯤은 소문입니다. 발주를 어떻게 걸지 정해주십시오.',
    opts: up ? [
      { label: '오르기 전에 넉넉히 산다', hint: '소문에 건다', fx: ['+맞으면 싸게 산 셈', '−발주 ×1.5 · 현금 묶임', '?소문이 틀리면 재고만 남음'],
        apply: act(1.5, 'overbuy', '인상 소문에 선매입', '넉넉히 걸었습니다. 소문이 맞길 바랍니다.', 'grow') },
      { label: '평소대로', hint: '소문은 소문', fx: ['=발주 그대로'], apply: act(1, 'normal-buy', '평소대로 발주', '평소대로 갑니다.', null) },
      { label: '오히려 줄이고 지켜본다', hint: '확인되면 움직인다', fx: ['+현금 여유', '−발주 ×0.7', '?오르면 비싸게 산다'],
        apply: act(0.7, 'underbuy', '인상 소문에도 발주 축소', '줄였습니다. 확인되면 그때 움직이겠습니다.', 'cash') },
    ] : [
      { label: '내릴 때까지 발주를 줄인다', hint: '소문에 건다', fx: ['+맞으면 싸게 산다', '−발주 ×0.6', '?소문이 틀리면 결품'],
        apply: act(0.6, 'underbuy', '하락 소문에 발주 축소', '줄였습니다. 값이 내리길 기다립니다.', 'cash') },
      { label: '평소대로', hint: '소문은 소문', fx: ['=발주 그대로'], apply: act(1, 'normal-buy', '평소대로 발주', '평소대로 갑니다.', null) },
      { label: '그래도 물량은 확보한다', hint: '결품이 더 무섭다', fx: ['+결품 걱정 없음', '−발주 ×1.2', '?내리면 평가손'],
        apply: act(1.2, 'overbuy', '하락 소문에도 물량 확보', '물량부터 잡았습니다.', 'cust') },
    ],
  };
}

function policyCard(s, W, cov) {
  const set = (p, tag, label, msg, style) => (s, G) => {
    W.policy = p; styleAdd(W, style); remember(W, s, tag, label);
    lever(G, label, { risk: p === 'tight' ? '현금 ↑ · 결품 위험 ↑' : p === 'ample' ? '결품 위험 ↓ · 현금 묶임' : '표준' });
    return msg;
  };
  const cur = { tight: '타이트', normal: '표준', ample: '넉넉' }[W.policy];
  return {
    id: 'w-policy', who: 'jung', topic: 'policy',
    title: '재고를 얼마나 들고 갈지 정해주세요',
    text: `사장님, 소재 발주 방침을 정해두시죠. 지금은 「${cur}」이고 재고율 ${cov.toFixed(1)}개월, 재원율 ${stockNow(s).resM.toFixed(1)}개월입니다. `
        + `영업 입장에선 결품이 제일 무섭습니다. 배가 늦게 오는 달도 있고, 내시가 갑자기 느는 달도 있고요. 한 부장님은 재고에 돈 묶인다고 반대하십니다.`,
    opts: [
      { label: '넉넉하게', hint: '결품이 제일 무섭다', fx: ['+결품 위험 ↓', '−현금이 창고에 묶임', '?값이 내리면 손실'],
        apply: set('ample', 'policy-ample', '재고 방침 넉넉', '넉넉하게 들고 갑니다. 정 부장이 안심했습니다. 한 부장은 한숨을 쉬었습니다.', 'cust') },
      { label: '표준', hint: '리드타임만큼', fx: ['=표준'], apply: set('normal', 'policy-normal', '재고 방침 표준', '표준으로 갑니다.', null) },
      { label: '타이트하게', hint: '현금이 제일 중요하다', fx: ['+현금 여유', '−결품 위험 ↑', '?배가 늦으면 라인이 선다'],
        apply: set('tight', 'policy-tight', '재고 방침 타이트', '타이트하게 갑니다. 한 부장가 고개를 끄덕였습니다.', 'cash') },
    ],
  };
}

/* ============================================================
   현금 — 지난 결정들의 합계가 여기서 청구된다
   ============================================================ */
function cashCard(s, W, run) {
  const why = cause(W, s, ['overbuy', 'volume', 'project', 'expand', 'policy-ample', 'hold-stock']);
  const worst = Object.keys(CUST).filter(k => W.cut[k] > 0).sort((a, b) => W.cut[b] - W.cut[a])[0];
  const ar = s.ar.reduce((a, x) => a + x.amount, 0);
  const opts = [
    { label: '매출채권을 할인해서 당겨 받는다', hint: '수수료를 내고 현금을 산다',
      fx: [`+현금 약 $${fmt(ar * 0.35 / 1000)}k`, `−수수료 $${fmt(ar * 0.35 * 0.02 / 1000)}k`],
      apply: (s, G) => { let got = 0;
        for (const a of s.ar.slice().sort((x, y) => x.dueTurn - y.dueTurn)) { if (got > ar * 0.35) break; got += a.amount; a.amount = 0; }
        s.ar = s.ar.filter(a => a.amount > 0); s.cash += got * 0.98; styleAdd(W, 'cash');
        lever(G, '매출채권 할인', { cash: Math.round(got * 0.98) });
        return '채권을 은행에 넘기고 현금을 당겼습니다. 수수료만큼 이익이 줄었습니다.'; } },
    { label: '발주를 절반으로 줄인다', hint: '석 달 뒤를 담보로 지금을 산다',
      fx: ['+현금 유출 ↓', '−발주 ×0.5', '?석 달 뒤 결품'],
      apply: (s, G) => { G.mult *= 0.5; styleAdd(W, 'cash'); remember(W, s, 'underbuy', '현금난에 발주 절반');
        lever(G, '현금난 발주 축소', { order: 0.5, risk: '석 달 뒤 결품 위험' });
        return '발주를 절반으로 줄였습니다. 석 달 뒤가 걱정입니다.'; } },
  ];
  if (worst) opts.unshift({
    label: `${CUST[worst]}의 저수익 물량을 포기한다`, hint: `깎아준 $${W.cut[worst]}/t 물량`,
    fx: ['+마진 회복 · 운전자금 ↓', `−${CUST[worst]} 물량 대폭 감소`, `−${CUST[worst]} 관계 악화`],
    apply: (s, G) => { const v = growCust(s, worst, -0.4); W.cut[worst] = 0; W.rel[worst] = wClamp(W.rel[worst] - 14);
      G.mult *= 0.8; W.stats.dropped++; styleAdd(W, 'cash', 2);
      remember(W, s, 'drop', `${CUST[worst]} 저수익 물량 포기`, { cust: worst });
      lever(G, `${CUST[worst]} 저수익 물량 포기`, { vol: v, rel: [[worst, -14]], order: 0.8 });
      return `${CUST[worst]}에 깎아준 단가를 되돌리겠다고 했더니 물량을 빼겠답니다. 받아들였습니다.`; } });
  return {
    id: 'w-cash', who: 'han', topic: 'cash',
    title: '현금이 바닥을 보입니다',
    text: `결론부터 말씀드리면, 현금과 은행 한도를 다 합쳐 ${run.toFixed(1)}개월치입니다. ${why ? `${why} 결정의 청구서가 지금 돌아오고 있습니다. ` : ''}`
        + `당장 부도는 아니지만, 한 달만 삐끗하면 소재 대금을 못 막습니다. 뭔가를 포기해야 합니다.`,
    opts: opts.slice(0, 3),
  };
}

/* ============================================================
   생산 — 돌리면 닳고, 세우면 매출이 빈다
   ============================================================ */
function maintCard(s, W) {
  const why = W.deferMaint >= 1 ? `지난번에도 미뤘습니다. 이번이 ${W.deferMaint + 1}번째입니다.` : '';
  const hot = W.utilHist.slice(-4).filter(u => u > 0.9).length;
  return {
    id: 'w-maint', who: 'gu', topic: 'prod',
    title: '라인을 세우고 정비해야 합니다',
    text: `마지막 정비가 ${W.maintAge}개월 전입니다. ${hot >= 2 ? `그 사이 ${hot}달을 90% 넘게 돌렸습니다. ` : ''}${why} `
        + `세우면 이번 달 물량이 빕니다. 안 세우면, 언제 설지는 저도 모릅니다.`,
    opts: [
      { label: '전면 정비 — 일주일 세운다', hint: '장기 생산성',
        fx: ['−통장 $95,000', '−이번 달 캐파 12% 손실', '+설비 크게 회복', '+품질 개선'],
        apply: (s, G) => { s.cash -= 95_000; W.capHit *= 0.88; W.equip = wClamp(W.equip + 32); W.qBoost += 5;
          W.deferMaint = 0; W.maintAge = 0; W.stats.maint++; styleAdd(W, 'craft', 2);
          remember(W, s, 'maint', '전면 정비');
          lever(G, '전면 정비', { cash: -95_000, equip: 32, quality: 1, risk: '이번 달 매출 감소' });
          return '일주일 세우고 전부 뜯었습니다. 구 공장장이 처음으로 "됐습니다"라고 했습니다.'; } },
      { label: '주말에 부분 정비', hint: '급한 것만',
        fx: ['−통장 $38,000', '=캐파 손실 거의 없음', '+설비 조금 회복'],
        apply: (s, G) => { s.cash -= 38_000; W.equip = wClamp(W.equip + 12); W.maintAge = Math.max(0, W.maintAge - 4);
          W.fatigue = wClamp(W.fatigue + 4); styleAdd(W, 'craft');
          remember(W, s, 'maint-part', '부분 정비');
          lever(G, '주말 부분 정비', { cash: -38_000, equip: 12 });
          return '주말 특근으로 급한 것만 손봤습니다.'; } },
      { label: '다음 달로 미룬다', hint: '지금은 물량이 먼저',
        fx: ['+이번 달 캐파 그대로', '?고장 위험 누적', '?품질 저하'],
        apply: (s, G) => { W.deferMaint++; W.stats.deferrals++; styleAdd(W, 'grow');
          remember(W, s, 'defer', '정비 연기');
          lever(G, '정비 연기', { risk: '고장 확률 상승' });
          return '미뤘습니다. 구 공장장이 아무 말 없이 나갔습니다.'; } },
    ],
  };
}

function overloadCard(s, W, hot) {
  const why = cause(W, s, ['volume', 'project', 'hq-full']);
  const card = {
    id: 'w-load', who: 'gu', topic: 'people',
    title: '현장이 버티질 못합니다',
    text: `${hot}달째 90% 넘게 돌리고 있습니다. ${why ? `${why} 이후로 계속입니다. ` : ''}`
        + `반장들이 지쳤습니다. 이대로 더 가면 사람이 먼저 나가든 설비가 먼저 서든 둘 중 하나입니다.`,
    opts: [
      { label: '잔업·특근으로 버틴다', hint: '물량을 지킨다', fx: ['+캐파 20%', '−통장 $60,000', '−현장 피로 ↑↑', '−사기 ↓'],
        ot: true,
        apply: (s, G) => { W.fatigue = wClamp(W.fatigue + 14); styleAdd(W, 'grow');
          remember(W, s, 'overtime', '잔업으로 버티기');
          lever(G, '잔업·특근', { fatigue: 14, risk: '설비·품질 부담' });
          return '특근을 돌립니다. 이번 달은 버팁니다.'; } },
      { label: '외주 가공으로 넘긴다', hint: '남의 손을 빌린다', fx: ['−통장 $150,000', '+현장 숨 돌림', '?품질은 남의 손'],
        apply: (s, G) => { s.cash -= 150_000; W.fatigue = wClamp(W.fatigue - 10); W.quality = wClamp(W.quality - 5);
          styleAdd(W, 'grow'); remember(W, s, 'outsource', '외주 가공');
          lever(G, '외주 가공', { cash: -150_000, fatigue: -10, quality: -1 });
          return '일부를 외주로 넘겼습니다. 오 과장은 "책임은 우리가 집니다"라고 했습니다.'; } },
      { label: '한 조를 더 뽑는다', hint: '고정비가 늘고 캐파도 는다', fx: ['−고정비 월 $45,000', '+캐파 8% 영구 증가', '+피로 해소 · 사기 ↑'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) + 45_000; W.fatigue = wClamp(W.fatigue - 18);
          W.capBonus = (W.capBonus || 0) + 0.08; W.hires = (W.hires || 0) + 1;
          s.morale = wClamp(s.morale + 5); styleAdd(W, 'craft', 2);
          remember(W, s, 'hire', '인력 충원');
          lever(G, '인력 충원', { fatigue: -18, risk: '캐파 +8% · 고정비 월 $45k 영구 증가' });
          return '한 조를 더 뽑았습니다. 고정비는 계속 나갑니다.'; } },
      { label: '물량을 줄인다', hint: '고객을 실망시킨다', fx: ['+현장 회복', '−판매량 ↓', '−큰 고객 관계 악화'],
        apply: (s, G) => { const k = topCust(s); const v = growCust(s, k, -0.15); W.rel[k] = wClamp(W.rel[k] - 7);
          W.fatigue = wClamp(W.fatigue - 15); styleAdd(W, 'craft');
          remember(W, s, 'cutvol', `${CUST[k]} 물량 축소`, { cust: k });
          lever(G, '물량 축소', { vol: v, rel: [[k, -7]], fatigue: -15 });
          return `${CUST[k]}에 물량을 조금 줄여달라고 했습니다. 좋아하지 않았습니다.`; } },
    ],
  };
  // 한 조를 더 뽑는 건 두 번까지. 그 뒤로는 증설 말고 답이 없다.
  if ((W.hires || 0) >= 2) card.opts = card.opts.filter(o => !o.label.startsWith('한 조를'));
  return card;
}

function idleCard(s, W) {
  return {
    id: 'w-idle', who: 'gu', topic: 'prod',
    title: '석 달째 라인이 놉니다',
    text: '가동률이 절반도 안 됩니다. 사람은 그대로 있고 고정비도 그대로 나갑니다. 놀리느니 뭐라도 하는 게 낫습니다.',
    opts: [
      { label: '이참에 대정비를 한다', hint: '놀 때 손본다', fx: ['−통장 $70,000', '+설비 크게 회복', '+품질'],
        apply: (s, G) => { s.cash -= 70_000; W.equip = wClamp(W.equip + 28); W.maintAge = 0; W.deferMaint = 0; W.qBoost += 4;
          styleAdd(W, 'craft', 2); remember(W, s, 'maint', '비수기 대정비');
          lever(G, '비수기 대정비', { cash: -70_000, equip: 28 });
          return '바쁠 때는 절대 못 하는 걸 했습니다.'; } },
      { label: '교대를 줄인다', hint: '고정비를 깎는다', fx: ['+고정비 월 $45,000 절감', '−사기 ↓', '?물량 오면 못 받음'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) - 45_000; s.morale = wClamp(s.morale - 8); styleAdd(W, 'cash', 2);
          remember(W, s, 'shift-cut', '교대 축소');
          lever(G, '교대 축소', { risk: '물량 회복 시 캐파 부족' });
          return '한 조를 쉬게 했습니다. 현장이 불안해합니다.'; } },
      { label: '영업을 몰아친다', hint: '물량을 찾아온다', fx: ['−통장 $90,000', '+석 달 뒤 물량 ↑'],
        apply: (s, G) => { s.cash -= 90_000; s.effortQueue.push({ amount: 90_000, turnsLeft: CFG.SALES_EFFORT_LAG });
          styleAdd(W, 'grow'); remember(W, s, 'push', '영업 강화');
          lever(G, '영업 강화', { cash: -90_000, risk: '효과는 석 달 뒤' });
          return '정 부장이 신이 났습니다. 결과는 석 달 뒤에 봅니다.'; } },
    ],
  };
}

/* ============================================================
   품질·사람
   ============================================================ */
function qualityCard(s, W) {
  const why = cause(W, s, ['outsource', 'overtime', 'defer', 'volume', 'project']);
  return {
    id: 'w-qual', who: 'oh', topic: 'quality',
    title: '품질 지표가 내려가고 있습니다',
    text: `양품률이 ${qualityPct(W.quality).toFixed(1)}%입니다. ${why ? `짚고 넘어가겠습니다. ${why} 이후로 내려왔습니다. ` : ''}`
        + `아직 고객은 모릅니다. 고객이 먼저 알면 그때는 클레임입니다.`,
    opts: [
      { label: '원인을 끝까지 판다', hint: '오 과장에게 맡긴다', fx: ['−통장 $85,000', '+품질 크게 개선 (두세 달)', '+클레임 위험 ↓'],
        apply: (s, G) => { s.cash -= 85_000; W.qBoost += 14; G.ui.yieldSpend = 85_000; styleAdd(W, 'craft', 2);
          remember(W, s, 'qual', '품질 원인 분석');
          lever(G, '품질 원인 분석', { cash: -85_000, quality: 1 });
          return '데이터를 전부 뒤졌습니다. 코일 배분과 나이프 교체 주기를 바꿨습니다.'; } },
      { label: '출하 검사만 강화한다', hint: '밖으로 안 나가게', fx: ['−통장 $30,000', '+클레임 위험 조금 ↓', '=근본 원인은 그대로'],
        apply: (s, G) => { s.cash -= 30_000; W.qBoost += 5; styleAdd(W, 'craft');
          remember(W, s, 'inspect', '출하 검사 강화');
          lever(G, '출하 검사 강화', { cash: -30_000 });
          return '검사원을 한 명 더 붙였습니다. 새는 곳은 그대로입니다.'; } },
      { label: '지금은 넘어간다', hint: '물량이 먼저', fx: ['+비용 없음', '?클레임 위험 ↑'],
        apply: (s, G) => { styleAdd(W, 'grow'); remember(W, s, 'skipqual', '품질 문제 보류');
          lever(G, '품질 문제 보류', { risk: '클레임 확률 상승' });
          return '오 과장이 "기록은 남겨두겠습니다"라고 했습니다.'; } },
    ],
  };
}

function peopleCard(s, W) {
  const why = cause(W, s, ['overtime', 'volume', 'shift-cut', 'project']);
  return {
    id: 'w-people', who: 'lin', topic: 'people',
    title: '현장 반장들이 면담을 요청했습니다',
    text: `사장님, 반장 셋이 같이 왔어요. ${why ? `${why} 이후로 쉬는 날이 없었대요. ` : ''}`
        + `옆 공단에서 사람 빼가는 얘기도 돌고요. 한 명이 나가면 줄줄이 나갈 수 있어요.`,
    opts: [
      { label: '특별휴가와 보너스', hint: '한 번 숨을 돌린다', fx: ['−통장 $65,000', '−다음 달 캐파 5%', '+피로 ↓↓ · 사기 ↑'],
        apply: (s, G) => { s.cash -= 65_000; W.capHit *= 0.95; W.fatigue = wClamp(W.fatigue - 25); s.morale = wClamp(s.morale + 10);
          styleAdd(W, 'craft', 2); remember(W, s, 'rest', '특별휴가');
          lever(G, '특별휴가·보너스', { cash: -65_000, fatigue: -25 });
          return '돌아가면서 사흘씩 쉬게 했습니다. 표정이 달라졌습니다.'; } },
      { label: '임금을 올린다', hint: '확실히 잡는다', fx: ['−고정비 월 $20,000', '+사기 ↑↑', '?다른 조도 요구'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) + 20_000; s.morale = wClamp(s.morale + 12); styleAdd(W, 'craft');
          remember(W, s, 'raise', '임금 인상');
          lever(G, '임금 인상', { risk: '고정비 월 $20k 영구 증가' });
          return '올려줬습니다. 남기로 했습니다.'; } },
      { label: '조금만 더 버텨달라고 한다', hint: '돈을 안 쓴다', fx: ['+비용 없음', '?핵심 인력 이탈 → 캐파 손실'],
        apply: (s, G) => { styleAdd(W, 'grow');
          if (wChance(0.45 + W.fatigue / 200)) { W.capHit *= 0.9; s.morale = wClamp(s.morale - 10);
            remember(W, s, 'quit', '핵심 인력 이탈');
            lever(G, '핵심 인력 이탈', { risk: '캐파 10% 손실' });
            return '반장 한 명이 옆 공단으로 갔습니다. 그 조가 흔들립니다.'; }
          s.morale = wClamp(s.morale - 3);
          return '버텨주기로 했습니다. 이번에는.'; } },
    ],
  };
}

/* ============================================================
   고객 — 양보는 기억되고, 무시도 기억된다
   ============================================================ */
function priceCard(s, W, k) {
  const again = W.concede[k] > 0;
  const why = cause(W, s, ['concede', 'volume'], k);
  const ask = Math.min(18, again ? 8 + W.concede[k] * 3 : 10);
  const dep = (s.custShare[k] || 0) > 0.4;
  const rumor = W.threat[k] ? '실제로 경쟁사 견적서를 들고 왔습니다.' : '경쟁사가 더 싸게 준다고 합니다. 진짜인지는 모르겠습니다.';
  return {
    id: 'w-price-' + k, who: 'jung', topic: 'price',
    title: again ? `${cname(k)}가 또 단가를 깎아달랍니다` : `${cname(k)}가 단가 인하를 요구합니다`,
    text: again
      ? `사장님, ${why || '지난번에'} 깎아줬더니 이번에도 톤당 $${ask}를 더 깎아달랍니다. ${rumor} ${dep ? '우리 물량의 절반 가까이가 거기라, 그쪽도 그걸 압니다.' : ''}`
      : `${cname(k)} 구매팀장이 톤당 $${ask} 인하를 요구합니다. ${rumor} ${dep ? '우리가 거기 없으면 안 된다는 걸 그쪽도 압니다.' : ''}`,
    opts: [
      { label: '요구를 받아준다', hint: '물량과 관계를 지킨다',
        fx: [`−${CUST[k]} 단가 −$${ask}/t (계속 유지)`, `+${CUST[k]} 관계 ↑`, '?다음에 또 요구할 가능성 ↑'],
        apply: (s, G) => { W.cut[k] += ask; W.concede[k]++; W.rel[k] = wClamp(W.rel[k] + 7); W.stats.concessions++;
          styleAdd(W, 'cust'); styleAdd(W, 'grow');
          remember(W, s, 'concede', `${CUST[k]}에 $${ask} 양보`, { cust: k });
          lever(G, `${CUST[k]} 단가 인하 수용`, { cut: [k, ask], rel: [[k, 7]] });
          return `받아줬습니다. ${CUST[k]} 구매팀장이 웃었습니다. 정 부장은 "다음엔 더 세게 올 겁니다"라고 했습니다.`; } },
      { label: '품질·납기 실적을 들고 설득한다', hint: '평소에 쌓은 게 있어야 통한다',
        fx: ['?품질·관계가 좋아야 먹힌다', '+통하면 단가 유지'],
        apply: (s, G) => { const ok = W.quality >= 72 && W.rel[k] >= 55 && wChance(0.75);
          if (ok) { W.rel[k] = wClamp(W.rel[k] + 2); styleAdd(W, 'craft');
            remember(W, s, 'persuade', `${CUST[k]} 품질로 설득`, { cust: k });
            lever(G, `${CUST[k]} 품질로 설득 — 성공`, { rel: [[k, 2]] });
            return `불량률과 납기 준수율 자료를 들고 갔습니다. ${CUST[k]}가 단가를 유지하기로 했습니다. 평소에 쌓은 덕입니다.`; }
          const v = growCust(s, k, -0.12); W.rel[k] = wClamp(W.rel[k] - 6);
          remember(W, s, 'hold', `${CUST[k]} 설득 실패`, { cust: k });
          lever(G, `${CUST[k]} 품질로 설득 — 실패`, { vol: v, rel: [[k, -6]] });
          return `자료를 들고 갔는데 ${W.quality < 72 ? '최근 우리 품질이 오히려 약점이 됐습니다' : '관계가 거기까지 받쳐주지 못했습니다'}. 물량 일부가 빠졌습니다.`; } },
      { label: '거절한다', hint: '마진을 지킨다',
        fx: ['+단가 유지', `?경쟁사가 진짜면 ${CUST[k]} 물량 이탈`],
        apply: (s, G) => { styleAdd(W, 'cash');
          if (W.threat[k]) { const v = growCust(s, k, -0.25); W.rel[k] = wClamp(W.rel[k] - 10);
            remember(W, s, 'hold', `${CUST[k]} 인하 요구 거절`, { cust: k });
            lever(G, `${CUST[k]} 인하 거절 — 이탈`, { vol: v, rel: [[k, -10]] });
            return `거절했습니다. 경쟁사 견적은 진짜였습니다. ${CUST[k]} 물량 4분의 1이 넘어갔습니다.`; }
          W.rel[k] = wClamp(W.rel[k] - 2);
          remember(W, s, 'hold-ok', `${CUST[k]} 인하 요구 거절`, { cust: k });
          lever(G, `${CUST[k]} 인하 거절 — 버팀`, { rel: [[k, -2]] });
          return `거절했습니다. 알고 보니 경쟁사 얘기는 떠본 거였습니다. ${CUST[k]}는 그대로 남았습니다.`; } },
    ],
  };
}

function volumeCard(s, W, k, L) {
  const pct = wPick([0.25, 0.3, 0.35]);
  const cut = wPick([8, 10, 12, 14]);
  const u = W.utilHist.slice(-1)[0] || 0.8;
  const gu = u > 0.85 ? ` 구 공장장은 "지금 라인으로는 벅찹니다"라고 합니다.` : '';
  return {
    id: 'w-vol', who: 'jung', topic: 'vol',
    title: `${cname(k)}가 물량을 더 주겠답니다`,
    text: `사장님, 이거 큽니다! ${CUST[k]}가 물량을 ${Math.round(pct * 100)}% 늘려주겠답니다. 조건은 톤당 $${cut} 인하입니다. `
        + `본사 소재 판매도 같이 늘어납니다.${gu}`,
    opts: [
      { label: '전량 받는다', hint: '성장',
        fx: ['+판매량 ↑ · 본사 소재 판매 ↑', `−${CUST[k]} 단가 −$${cut}/t`, '?가동률 ↑ → 설비·품질 부담'],
        apply: (s, G) => { const v = growCust(s, k, pct); W.cut[k] += cut; W.rel[k] = wClamp(W.rel[k] + 6);
          styleAdd(W, 'grow', 2); styleAdd(W, 'hq');
          remember(W, s, 'volume', `${CUST[k]} 대량 수주`, { cust: k });
          lever(G, `${CUST[k]} 대량 수주`, { vol: v, cut: [k, cut], rel: [[k, 6]], risk: '2~4개월 뒤 설비·품질 부담' });
          return `전량 받았습니다. 석 달쯤 뒤에 라인이 얼마나 버티는지 보게 될 겁니다.`; } },
      { label: '절반만 받는다', hint: '감당할 만큼',
        fx: ['+판매량 조금 ↑', `−${CUST[k]} 단가 −$${Math.round(cut / 2)}/t`],
        apply: (s, G) => { const v = growCust(s, k, pct / 2); W.cut[k] += Math.round(cut / 2); W.rel[k] = wClamp(W.rel[k] + 2);
          styleAdd(W, 'grow'); remember(W, s, 'volume-half', `${CUST[k]} 물량 절반 수주`, { cust: k });
          lever(G, `${CUST[k]} 물량 절반 수주`, { vol: v, cut: [k, Math.round(cut / 2)], rel: [[k, 2]] });
          return '절반만 받기로 했습니다.'; } },
      { label: '정중히 사양한다', hint: '마진과 라인을 지킨다',
        fx: ['+마진·설비 지킴', `−${CUST[k]} 서운함`],
        apply: (s, G) => { W.rel[k] = wClamp(W.rel[k] - 4); styleAdd(W, 'cash'); styleAdd(W, 'craft');
          remember(W, s, 'decline', `${CUST[k]} 추가 물량 사양`, { cust: k });
          lever(G, `${CUST[k]} 추가 물량 사양`, { rel: [[k, -4]] });
          return `사양했습니다. ${CUST[k]}가 다른 코일센터에 물어볼 겁니다.`; } },
    ],
  };
}

function projectCard(s, W, k, L) {
  const u = W.utilHist.slice(-1)[0] || 0.8;
  return {
    id: 'w-proj', who: 'jung', topic: 'vol',
    title: `${cname(k)}가 신차 프로젝트를 맡기고 싶어 합니다`,
    text: `사장님, 그동안 ${CUST[k]}에 잘해온 게 돌아왔습니다. 신차 프로젝트 2년 물량을 우리한테 주고 싶답니다. `
        + `${u > 0.85 ? '다만 지금 라인은 거의 꽉 찼습니다. 받으면 증설이든 특근이든 뭔가 해야 합니다.' : '라인에는 아직 여유가 있습니다.'}`,
    opts: [
      { label: '받는다', hint: '큰 성장', fx: ['+판매량 크게 ↑', '+본사 신뢰 3', '?캐파·현금 부담'],
        apply: (s, G) => { const v = growCust(s, k, 0.4); s.trust = wClamp(s.trust + 3); W.rel[k] = wClamp(W.rel[k] + 5);
          W.stats.projects++; styleAdd(W, 'grow', 2); styleAdd(W, 'cust', 2);
          remember(W, s, 'project', `${CUST[k]} 신차 프로젝트 수주`, { cust: k });
          lever(G, `${CUST[k]} 신차 프로젝트`, { vol: v, trust: 3, rel: [[k, 5]], risk: '캐파가 모자랄 수 있음' });
          return '받았습니다. 2년짜리 물량입니다. 이제 그걸 만들 라인과 소재가 있어야 합니다.'; } },
      { label: '단가를 확실히 받고 받는다', hint: '수익성 우선', fx: ['+판매량 ↑', '+마진 좋음', '?협상 중 일부 놓침'],
        apply: (s, G) => { const v = growCust(s, k, 0.22); W.cut[k] = Math.max(0, W.cut[k] - 8); W.stats.projects++;
          styleAdd(W, 'cash'); styleAdd(W, 'cust');
          remember(W, s, 'project', `${CUST[k]} 신차 프로젝트 조건부 수주`, { cust: k });
          lever(G, `${CUST[k]} 신차 프로젝트 (조건부)`, { vol: v });
          return '단가를 제대로 받는 조건으로 일부를 받았습니다. 예전에 깎아준 것도 일부 돌려받았습니다.'; } },
      { label: '지금은 사양한다', hint: '감당 못 할 약속은 안 한다', fx: ['+부담 없음', `−${CUST[k]} 관계 조금 ↓`],
        apply: (s, G) => { W.rel[k] = wClamp(W.rel[k] - 5); styleAdd(W, 'craft');
          remember(W, s, 'decline', `${CUST[k]} 프로젝트 사양`, { cust: k });
          lever(G, `${CUST[k]} 프로젝트 사양`, { rel: [[k, -5]] });
          return `사양했습니다. ${CUST[k]}는 아쉬워했고, 그 프로젝트는 경쟁사로 갔습니다.`; } },
    ],
  };
}

function churnCard(s, W, k) {
  const why = cause(W, s, ['hold', 'deny', 'claim', 'short', 'cutvol', 'drop'], k) || cause(W, s, ['breakdown', 'short']);
  return {
    id: 'w-churn-' + k, who: 'jung', topic: 'cust',
    title: `${cname(k)} 주문이 계속 줄고 있습니다`,
    text: `석 달째 주문이 줄었습니다. ${why ? `${why} 이후로 분위기가 달라졌습니다. ` : ''}경쟁사가 들어온 것 같습니다. 붙잡을지 놓을지 정해야 합니다.`,
    opts: [
      { label: '사장이 직접 찾아간다', hint: '사람으로 푼다', fx: ['−통장 $40,000', `+${CUST[k]} 관계 회복`],
        apply: (s, G) => { s.cash -= 40_000; W.rel[k] = wClamp(W.rel[k] + 10); styleAdd(W, 'cust', 2);
          remember(W, s, 'visit', `${CUST[k]} 사장 방문`, { cust: k });
          lever(G, `${CUST[k]} 사장 직접 방문`, { cash: -40_000, rel: [[k, 10]] });
          return `${CUST[k]} 구매 임원과 저녁을 했습니다. 서운했던 게 많았다고 합니다. 일단 붙잡았습니다.`; } },
      { label: '단가로 붙잡는다', hint: '확실하지만 비싸다', fx: [`−${CUST[k]} 단가 −$12/t`, `+${CUST[k]} 관계 크게 회복`, '?양보 기억'],
        apply: (s, G) => { W.cut[k] += 12; W.concede[k]++; W.rel[k] = wClamp(W.rel[k] + 18); W.stats.concessions++;
          styleAdd(W, 'cust'); remember(W, s, 'concede', `${CUST[k]} 이탈 방지 단가 인하`, { cust: k });
          lever(G, `${CUST[k]} 단가로 붙잡기`, { cut: [k, 12], rel: [[k, 18]] });
          return '깎아주고 붙잡았습니다.'; } },
      { label: '놓아주고 다른 고객에 집중한다', hint: '정리할 건 정리한다', fx: [`−${CUST[k]} 물량 크게 감소`, '+다른 고객에 영업력 집중'],
        apply: (s, G) => { const v = growCust(s, k, -0.45); W.stats.dropped++; styleAdd(W, 'cash');
          const other = Object.keys(CUST).filter(x => x !== k).sort((a, b) => W.rel[b] - W.rel[a])[0];
          G.ui.custFocus = other;
          remember(W, s, 'drop', `${CUST[k]} 정리`, { cust: k });
          lever(G, `${CUST[k]} 정리, ${CUST[other]} 집중`, { vol: v });
          return `${CUST[k]}는 놓아주고 ${CUST[other]}에 영업을 붙였습니다.`; } },
    ],
  };
}

function custFocusCard(s, W) {
  const card = customerCard(s);
  card.topic = 'cust';
  card.text += ` 참고로 지금 고객별 분위기는 ${Object.keys(CUST).map(k => `${CUST[k]} ${relLabel(W.rel[k])}`).join(', ')}입니다.`;
  card.opts.forEach((o, i) => {
    const k = Object.keys(CFG.CUSTOMERS)[i];
    o.hint = `지금 거래의 ${Math.round((s.custShare[k] || 0) * 100)}% · 관계 ${relLabel(W.rel[k])}`;
    const inner = o.apply;
    o.apply = (st, G) => { W.rel[k] = wClamp(W.rel[k] + 5); styleAdd(W, 'cust');
      remember(W, st, 'focus', `${CUST[k]} 집중 영업`, { cust: k });
      lever(G, `${CUST[k]} 집중 영업`, { rel: [[k, 5]], risk: '효과는 석 달 뒤' });
      return inner(st, G); };
  });
  return card;
}

function creditCard(s, W) {
  const cands = Object.keys(CUST).filter(k => (s.custShare[k] || 0) > 0.06);
  const k = wPick(cands);
  const risky = CFG.CUSTOMERS[k].bad > 0.005;
  return {
    id: 'w-credit', who: 'han', topic: 'credit',
    title: `${cname(k)}가 여신 한도를 올려달랍니다`,
    text: `지금 한도로는 더 못 받겠답니다. 숫자만 보고 말씀드리면, 올려주면 물량이 늘고 안 올려주면 줍니다. `
        + `${risky ? '이 고객군은 대금이 밀린 이력이 업계에 좀 있습니다.' : '이 고객군은 대금은 잘 줍니다.'}`,
    opts: [
      { label: '올려준다', hint: '믿고 간다', fx: ['+물량 ↑', `+${CUST[k]} 관계 ↑`, `?${risky ? '떼일 위험 높음' : '떼일 위험 낮음'}`],
        apply: (s, G) => { const v = growCust(s, k, 0.15); W.rel[k] = wClamp(W.rel[k] + 5); styleAdd(W, 'grow');
          const p = risky ? 0.4 : 0.1;
          G.pending.push({ turn: s.turn + 6, run: s2 => {
            if (Math.random() < p) { s2.cash -= 1_600_000; W.rel[k] = wClamp(W.rel[k] - 10);
              fire(W, s2, 'bad', `${CUST[k]}가 대금을 못 갚았습니다. $1,600k를 털었습니다.`, `여섯 달 전 ${CUST[k]} 여신 확대`);
              return `${CUST[k]} 대금 $1,600k를 떼였습니다.`; }
            return null; } });
          remember(W, s, 'credit', `${CUST[k]} 여신 확대`, { cust: k });
          lever(G, `${CUST[k]} 여신 확대`, { vol: v, rel: [[k, 5]], risk: '6개월 뒤 대손 가능성' });
          return '한도를 올렸습니다. 한 부장 표정이 굳었습니다.'; } },
      { label: '보증보험을 끼고 올려준다', hint: '안전하게', fx: ['−통장 $30,000', '+물량 조금 ↑'],
        apply: (s, G) => { s.cash -= 30_000; const v = growCust(s, k, 0.07); styleAdd(W, 'cash');
          lever(G, `${CUST[k]} 여신 (보증)`, { vol: v, cash: -30_000 });
          return '보증보험을 끼고 올렸습니다.'; } },
      { label: '거절한다', hint: '떼일 일은 없다', fx: ['+대손 없음', `−${CUST[k]} 물량 ↓`],
        apply: (s, G) => { const v = growCust(s, k, -0.08); W.rel[k] = wClamp(W.rel[k] - 4); styleAdd(W, 'cash');
          lever(G, `${CUST[k]} 여신 거절`, { vol: v, rel: [[k, -4]] });
          return '거절했습니다. 밤에 잠은 잘 옵니다.'; } },
    ],
  };
}

/* ============================================================
   자재 — 서 대리. 비품·포장재·MRO.
   현장이 잘 안 보는 것들이다. 그런데 이게 떨어지면 라인이 서고, 이게 싸구려면 클레임이 온다.
   ============================================================ */
function packCard(s, W) {
  const up = wPick([12, 15, 18]);
  return {
    id: 'm-pack', who: 'seo', topic: 'mat',
    title: '포장재 단가 인상 통보가 왔습니다',
    text: `저… 스틸 밴드랑 목재 스키드, 방청지 공급사에서 다음 달부터 ${up}% 올리겠다고 합니다. 원자재가 올랐대요. `
        + `한 달에 $12k쯤 더 나가는 셈입니다. 다른 업체도 알아봤는데, 싼 데는 방청지가 좀 얇더라고요…`,
    opts: [
      { label: '인상을 받아들인다', hint: '품질은 그대로', fx: ['−고정비 월 $12,000', '=포장 품질 유지'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) + 12_000; W.packCheap = false; styleAdd(W, 'craft');
          lever(G, '포장재 인상 수용', { risk: '고정비 월 $12k 증가' });
          return '받아들였습니다. 포장은 그대로입니다.'; } },
      { label: '싼 업체로 바꾼다', hint: '비용을 줄인다', fx: ['+고정비 월 $4,000 절감', '?운송 중 녹·흠집 → 클레임 위험 ↑'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) - 4_000; W.packCheap = true; styleAdd(W, 'cash');
          remember(W, s, 'pack-cheap', '포장재 저가 업체로 교체');
          lever(G, '포장재 저가 교체', { risk: '클레임 위험 상승' });
          return '싼 업체로 바꿨습니다. 서 대리가 "우기가 걱정이에요"라고 했습니다.'; } },
      { label: '인상폭을 절반으로 협상한다', hint: '서 대리가 발로 뛴다', fx: ['−고정비 월 $6,000', '?협상이 안 될 수도'],
        apply: (s, G) => { if (wChance(0.6)) { G.extraFixed = (G.extraFixed || 0) + 6_000; styleAdd(W, 'cash');
            lever(G, '포장재 인상 협상 — 절반', { risk: '고정비 월 $6k 증가' });
            return '서 대리가 사흘을 붙어서 절반으로 깎았습니다. 조용히 일 잘하는 사람입니다.'; }
          G.extraFixed = (G.extraFixed || 0) + 12_000;
          lever(G, '포장재 인상 협상 — 실패', { risk: '고정비 월 $12k 증가' });
          return '협상이 안 됐습니다. 결국 원래대로 올랐습니다.'; } },
    ],
  };
}

function sparesCard(s, W) {
  return {
    id: 'm-mro', who: 'seo', topic: 'mat',
    title: 'MRO 예비품이 거의 없습니다',
    text: `베어링, 유압호스, 슬리터 나이프 예비품 재고를 봤는데요… 거의 바닥이에요. `
        + `${W.equip < 60 ? '구 공장장님 말로는 요즘 설비 소리가 안 좋대요. ' : ''}설비가 서면 부품이 해외에서 와야 해서 열흘은 걸립니다.`,
    opts: [
      { label: '넉넉히 비축한다', hint: '돈이 창고에 묶인다', fx: ['−통장 $65,000', '+고장 나면 바로 교체 (캐파 손실 ↓)'],
        apply: (s, G) => { s.cash -= 65_000; W.spares = true; styleAdd(W, 'craft', 2);
          remember(W, s, 'spares', 'MRO 예비품 비축');
          lever(G, 'MRO 예비품 비축', { cash: -65_000 });
          return '예비품을 채웠습니다. 구 공장장이 창고를 한 번 둘러보고 갔습니다.'; } },
      { label: '공급사 위탁재고 계약', hint: '쓴 만큼만 낸다', fx: ['−고정비 월 $7,000', '+고장 나면 바로 교체'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) + 7_000; W.spares = true; styleAdd(W, 'craft');
          remember(W, s, 'spares', 'MRO 위탁재고 계약');
          lever(G, 'MRO 위탁재고 계약', { risk: '고정비 월 $7k 증가' });
          return '공급사가 우리 창고에 부품을 두고, 쓴 만큼만 청구하기로 했습니다.'; } },
      { label: '필요할 때 주문한다', hint: '현금을 지킨다', fx: ['+비용 없음', '?고장 나면 부품 대기로 더 오래 선다'],
        apply: (s, G) => { W.spares = false; styleAdd(W, 'cash');
          remember(W, s, 'no-spares', 'MRO 예비품 미확보');
          lever(G, 'MRO 예비품 미확보', { risk: '고장 시 캐파 손실 확대' });
          return '그때그때 사기로 했습니다.'; } },
    ],
  };
}

function rebateCard(s, W) {
  return {
    id: 'm-rebate', who: 'seo', topic: 'mat',
    title: '공급업체가 따로 할 말이 있답니다',
    text: `저… 이걸 말씀드려야 할지 고민했는데요. 스키드 공급업체 사장님이 계약 연장해 주면 저한테 "따로 챙겨주겠다"고 하셨어요. `
        + `저는 당연히 안 받는다고 했습니다. 다만 그 업체 단가가 시세보다 10%쯤 비싼 건 사실입니다.`,
    opts: [
      { label: '보고 잘했다. 경쟁입찰로 바꾼다', hint: '원칙대로', fx: ['+고정비 월 $8,000 절감', '+직원 사기 ↑'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) - 8_000; s.morale = wClamp(s.morale + 3); styleAdd(W, 'cash');
          remember(W, s, 'clean', '공급업체 경쟁입찰 전환');
          lever(G, '공급업체 경쟁입찰', { risk: '고정비 월 $8k 절감' });
          return '경쟁입찰을 붙였습니다. 서 대리가 조금 떨면서도 뿌듯해했습니다.'; } },
      { label: '거래는 유지하되 조건을 문서로 남긴다', hint: '관계는 지킨다', fx: ['=비용 그대로', '+직원 사기 조금 ↑'],
        apply: (s, G) => { s.morale = wClamp(s.morale + 1);
          lever(G, '공급업체 거래 유지 · 기록', {});
          return '한 부장이 윤리 서약서를 받아뒀습니다. 거래는 그대로입니다.'; } },
      { label: '못 들은 걸로 한다', hint: '일을 키우지 않는다', fx: ['+당장 조용', '?나중에 감사에서 문제될 수 있다'],
        apply: (s, G) => { remember(W, s, 'hush', '공급업체 제안 묵인');
          G.pending.push({ turn: s.turn + 6 + Math.floor(Math.random() * 5), run: s2 => {
            if (Math.random() < 0.5) { s2.trust = wClamp(s2.trust - 10); s2.morale = wClamp(s2.morale - 6);
              fire(W, s2, 'audit', '본사 감사에서 스키드 공급업체 거래가 문제 됐습니다. 법인이 윤리 점검 대상에 올랐습니다.', '공급업체 제안을 묵인한 일');
              return '본사 감사에서 공급업체 거래가 적발됐습니다.'; }
            return null; } });
          lever(G, '공급업체 제안 묵인', { risk: '감사 적발 위험' });
          return '덮었습니다. 서 대리 표정이 어둡습니다.'; } },
    ],
  };
}

function safetyCard(s, W) {
  return {
    id: 'm-safety', who: 'seo', topic: 'mat',
    title: '크레인 와이어와 안전보호구 교체 시기입니다',
    text: `크레인 와이어가 교체 주기를 넘겼고, 안전화랑 방진 장갑도 다 해졌어요. `
        + `${W.fatigue > 35 ? '요즘 특근이 많아서 현장이 더 험하게 쓰고 있습니다. ' : ''}금액이 크진 않은데 매번 뒤로 밀리더라고요…`,
    opts: [
      { label: '전부 교체한다', hint: '사고를 막는다', fx: ['−통장 $45,000', '+사고 위험 ↓', '+직원 사기 ↑'],
        apply: (s, G) => { s.cash -= 45_000; W.safety = 0; s.morale = wClamp(s.morale + 3); styleAdd(W, 'craft');
          remember(W, s, 'safety', '안전 설비 교체');
          lever(G, '크레인 와이어·보호구 교체', { cash: -45_000 });
          return '전부 새것으로 바꿨습니다.'; } },
      { label: '와이어만 교체한다', hint: '큰 것만', fx: ['−통장 $25,000', '=사고 위험 조금 ↓'],
        apply: (s, G) => { s.cash -= 25_000; W.safety = Math.max(0, (W.safety || 0) - 1);
          lever(G, '크레인 와이어만 교체', { cash: -25_000 });
          return '와이어만 갈았습니다.'; } },
      { label: '다음 분기로 미룬다', hint: '돈을 아낀다', fx: ['+비용 없음', '?산업재해 위험 ↑'],
        apply: (s, G) => { W.safety = (W.safety || 0) + 2; styleAdd(W, 'cash');
          remember(W, s, 'safety-skip', '안전 설비 교체 연기');
          G.pending.push({ turn: s.turn + 2 + Math.floor(Math.random() * 4), run: s2 => {
            if (Math.random() < 0.3 + W.fatigue / 250) {
              s2.cash -= 260_000; s2.morale = wClamp(s2.morale - 12); W.capHit *= 0.9; W.stats.accidents = (W.stats.accidents || 0) + 1;
              fire(W, s2, 'accident', '야드에서 코일이 떨어져 작업자가 다쳤습니다. 노동청 조사로 라인이 며칠 섰습니다.', '안전 설비 교체를 미룬 일');
              return '산업재해가 났습니다. 보상과 조업 중단으로 $260k.'; }
            return null; } });
          lever(G, '안전 설비 교체 연기', { risk: '산재 위험 상승' });
          return '미뤘습니다. 서 대리가 "기록은 남겨둘게요"라고 했습니다.'; } },
    ],
  };
}

/* ============================================================
   관리 — 한 부장. 재무에 인사·총무까지.
   회사는 돈과 톤만으로 돌지 않는다. 사람과 규정과 서류가 있다.
   ============================================================ */
function wageCard(s, W) {
  const infl = wPick([6, 7, 8]);
  return {
    id: 'h-wage', who: 'han', topic: 'hr',
    title: '올해 임금협상입니다',
    text: `결론부터 말씀드리면, 직원대표가 ${infl + 4}% 인상을 요구했습니다. 작년 현지 물가가 ${infl}% 올랐습니다. `
        + `옆 공단 두 곳은 벌써 ${infl + 2}% 올려줬습니다. 인상분은 매달 고정비로 계속 나갑니다.`,
    opts: [
      { label: `${infl + 4}% 요구대로`, hint: '사람을 잡는다', fx: ['−고정비 월 $40,000', '+직원 사기 ↑↑', '+이직 위험 ↓'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) + 40_000; s.morale = wClamp(s.morale + 10); styleAdd(W, 'craft');
          remember(W, s, 'wage-high', '임금 요구 수용');
          lever(G, `임금 ${infl + 4}% 인상`, { risk: '고정비 월 $40k 증가' });
          return '요구대로 올렸습니다. 조회 분위기가 밝았습니다.'; } },
      { label: `물가만큼 ${infl}%`, hint: '절충', fx: ['−고정비 월 $26,000', '=직원 사기 조금 ↑'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) + 26_000; s.morale = wClamp(s.morale + 2);
          lever(G, `임금 ${infl}% 인상`, { risk: '고정비 월 $26k 증가' });
          return '물가만큼 올렸습니다. 직원대표가 아쉬워했지만 받아들였습니다.'; } },
      { label: '올해는 동결', hint: '고정비를 지킨다', fx: ['+고정비 그대로', '−직원 사기 ↓↓', '?반장급 이직 위험'],
        apply: (s, G) => { s.morale = wClamp(s.morale - 12); styleAdd(W, 'cash', 2);
          remember(W, s, 'wage-freeze', '임금 동결');
          lever(G, '임금 동결', { risk: '사기 하락 · 이직 위험' });
          return '동결했습니다. 그 주에 사직서가 두 장 들어왔습니다.'; } },
    ],
  };
}

function bonusCard(s, W) {
  const ytd = s.history.slice(-(((s.turn - 1) % 12) + 1)).reduce((a, r) => a + r.op, 0);
  const pool = Math.max(60_000, Math.round(Math.max(0, ytd) * 0.08 / 1000) * 1000);
  return {
    id: 'h-bonus', who: 'han', topic: 'hr',
    title: '연말 성과급을 정해야 합니다',
    text: `올해 영업이익이 ${ytd < 0 ? '−' : ''}$${fmt(Math.abs(ytd) / 1000)}k입니다. `
        + `${ytd > 0 ? '직원들은 기대하고 있습니다. ' : '직원들도 올해 어려웠던 걸 압니다. '}`
        + `작년에는 기본급 한 달치를 줬습니다.`,
    opts: [
      { label: ytd > 0 ? `이익의 8%를 나눈다` : '어려워도 한 달치는 준다', hint: '사람에게 돌려준다', fx: [`−통장 $${fmt(pool)}`, '+직원 사기 ↑↑'],
        apply: (s, G) => { s.cash -= pool; s.morale = wClamp(s.morale + 10); styleAdd(W, 'craft');
          lever(G, '연말 성과급', { cash: -pool });
          return '성과급을 나눴습니다. 린 매니저가 현장 반응을 전해줬습니다. 좋았다고 합니다.'; } },
      { label: '기본만', hint: '작년 수준', fx: ['−통장 $60,000', '=사기 그대로'],
        apply: (s, G) => { s.cash -= 60_000;
          lever(G, '연말 성과급 기본', { cash: -60_000 });
          return '작년만큼 줬습니다.'; } },
      { label: '올해는 없다', hint: '현금을 지킨다', fx: ['+현금 지킴', '−직원 사기 ↓↓'],
        apply: (s, G) => { s.morale = wClamp(s.morale - 10); styleAdd(W, 'cash', 2);
          remember(W, s, 'no-bonus', '성과급 미지급');
          lever(G, '성과급 없음', { risk: '사기 하락' });
          return '올해는 없다고 공지했습니다. 식당이 조용했습니다.'; } },
    ],
  };
}

function laborCard(s, W) {
  const why = cause(W, s, ['overtime', 'volume', 'project']);
  return {
    id: 'h-labor', who: 'han', topic: 'hr',
    title: '노동청이 근로시간 점검을 나온답니다',
    text: `다음 달에 노동청 근로감독이 나옵니다. ${why ? `${why} 이후로 ` : ''}특근 기록을 보면 주 52시간을 넘긴 주가 꽤 있습니다. `
        + `적발되면 과태료에 시정명령입니다.`,
    opts: [
      { label: '지금 교대를 조정한다', hint: '선제 대응', fx: ['−이번 달 캐파 5%', '−통장 $20,000', '+피로 ↓'],
        apply: (s, G) => { W.capHit *= 0.95; s.cash -= 20_000; W.fatigue = wClamp(W.fatigue - 15); styleAdd(W, 'craft');
          lever(G, '근로시간 선제 조정', { cash: -20_000, fatigue: -15 });
          return '교대를 바꾸고 특근을 줄였습니다. 감독관이 "잘 정리돼 있다"고 했습니다.'; } },
      { label: '서류만 정비한다', hint: '최소한만', fx: ['−통장 $15,000', '?현장이 지쳐 있으면 적발'],
        apply: (s, G) => { s.cash -= 15_000;
          if (W.fatigue > 40 && wChance(0.55)) { s.cash -= 150_000; s.trust = wClamp(s.trust - 3);
            lever(G, '근로감독 — 적발', { cash: -165_000, trust: -3 });
            return '출퇴근 기록과 서류가 안 맞았습니다. 과태료 $150k에 시정명령이 나왔습니다.'; }
          lever(G, '근로감독 — 통과', { cash: -15_000 });
          return '서류로 넘어갔습니다.'; } },
      { label: '그대로 받는다', hint: '돈을 안 쓴다', fx: ['?적발 가능성 높음'],
        apply: (s, G) => { if (wChance(0.65)) { s.cash -= 220_000; s.morale = wClamp(s.morale - 5); s.trust = wClamp(s.trust - 4);
            lever(G, '근로감독 — 적발', { cash: -220_000, trust: -4 });
            return '적발됐습니다. 과태료 $220k. 본사 인사팀에서도 연락이 왔습니다.'; }
          lever(G, '근로감독 — 통과', {});
          return '운이 좋았습니다. 이번에는.'; } },
    ],
  };
}

function housingCard(s, W) {
  return {
    id: 'h-house', who: 'han', topic: 'ga',
    title: '주재원 사택 월세가 오릅니다',
    text: `주재원 사택 세 채 계약 갱신인데, 집주인이 월세를 30% 올리겠답니다. 이 동네 외국인 주거 수요가 늘었답니다. `
        + `사장님 사택도 포함입니다.`,
    opts: [
      { label: '갱신한다', hint: '주재원 가족이 편하다', fx: ['−고정비 월 $6,000'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) + 6_000;
          lever(G, '사택 갱신', { risk: '고정비 월 $6k 증가' });
          return '갱신했습니다.'; } },
      { label: '공단 근처 싼 곳으로 옮긴다', hint: '비용을 줄인다', fx: ['−이사비 $25,000', '−주재원 불만'],
        apply: (s, G) => { s.cash -= 25_000; s.morale = wClamp(s.morale - 3); styleAdd(W, 'cash');
          lever(G, '사택 이전', { cash: -25_000 });
          return '공단 근처로 옮겼습니다. 주재원 가족들이 학교가 멀다고 합니다.'; } },
      { label: '주거수당으로 바꾼다', hint: '각자 알아서', fx: ['−고정비 월 $3,000', '=주재원 선택권'],
        apply: (s, G) => { G.extraFixed = (G.extraFixed || 0) + 3_000;
          lever(G, '주거수당 전환', { risk: '고정비 월 $3k 증가' });
          return '수당으로 바꿨습니다. 반응은 반반입니다.'; } },
    ],
  };
}

function insureCard(s, W) {
  return {
    id: 'h-insure', who: 'han', topic: 'ga',
    title: '공장·재고 보험 갱신입니다',
    text: `화재·재고·기계 보험 갱신인데 보험료가 20% 올랐습니다. 작년에 이 지역 공장 화재가 몇 건 있었답니다. `
        + `보장을 줄이면 싸지는데, 사고 나면 우리가 떠안습니다.`,
    opts: [
      { label: '보장 그대로 갱신', hint: '안전', fx: ['−통장 $85,000'],
        apply: (s, G) => { s.cash -= 85_000; W.insLow = false;
          lever(G, '보험 갱신', { cash: -85_000 });
          return '그대로 갱신했습니다.'; } },
      { label: '기계 보험을 뺀다', hint: '재고·화재만', fx: ['−통장 $50,000', '?설비 고장 수리비 전액 부담'],
        apply: (s, G) => { s.cash -= 50_000; W.insLow = true; styleAdd(W, 'cash');
          remember(W, s, 'ins-low', '기계 보험 제외');
          lever(G, '기계 보험 제외', { cash: -50_000, risk: '고장 수리비 증가' });
          return '기계 보험을 뺐습니다. 고장 나면 전액 우리 돈입니다.'; } },
      { label: '자기부담금을 올린다', hint: '큰 사고만 대비', fx: ['−통장 $62,000', '=작은 사고는 우리 부담'],
        apply: (s, G) => { s.cash -= 62_000;
          lever(G, '보험 자기부담 상향', { cash: -62_000 });
          return '자기부담금을 올리고 보험료를 낮췄습니다.'; } },
    ],
  };
}

function taxCard(s, W) {
  return {
    id: 'h-tax', who: 'han', topic: 'ga',
    title: '세무조사 통지가 왔습니다',
    text: `현지 국세청에서 세무조사를 나옵니다. 쟁점은 본사와의 거래 가격, 이전가격입니다. `
        + `우리가 본사에서 소재를 너무 비싸게 사서 현지 이익을 줄였다고 보는 겁니다. 대응 방식에 따라 결과가 크게 다릅니다.`,
    opts: [
      { label: '외부 세무법인을 쓴다', hint: '돈으로 막는다', fx: ['−세무법인 $120,000', '+추징 약 $50,000로 최소화'],
        apply: (s, G) => { s.cash -= 170_000;
          lever(G, '세무조사 — 외부 대응', { cash: -170_000 });
          return '세무법인이 이전가격 보고서를 냈습니다. 추징은 $50k로 끝났습니다.'; } },
      { label: '우리끼리 대응한다', hint: '한 부장이 밤을 샌다', fx: ['?추징이 클 수 있다'],
        apply: (s, G) => { if (wChance(0.5)) { s.cash -= 600_000;
            lever(G, '세무조사 — 자체 대응 실패', { cash: -600_000 });
            return '논리가 부족했습니다. 추징 $600k.'; }
          s.cash -= 40_000; lever(G, '세무조사 — 자체 대응 성공', { cash: -40_000 });
          return '한 부장이 자료를 다 맞춰냈습니다. 추징 $40k로 끝났습니다.'; } },
      { label: '본사 세무팀 지원을 요청한다', hint: '본사에 빚을 진다', fx: ['−본사 신뢰 3', '+추징 적음'],
        apply: (s, G) => { s.trust = wClamp(s.trust - 3); s.cash -= 150_000;
          lever(G, '세무조사 — 본사 지원', { cash: -150_000, trust: -3 });
          return '본사 세무팀이 붙었습니다. 추징 $150k. 본사에서 "법인이 준비가 안 돼 있다"는 말이 나왔습니다.'; } },
    ],
  };
}

function vacancyCard(s, W) {
  const why = cause(W, s, ['quit', 'wage-freeze', 'no-bonus']);
  return {
    id: 'h-hire', who: 'han', topic: 'hr',
    title: '생산 반장 자리가 비었습니다',
    text: `${why ? `${why} 이후 ` : ''}생산 2조 반장이 그만뒀습니다. 그 조가 흔들리고 있습니다. 어떻게 채울지 정해야 합니다.`,
    opts: [
      { label: '헤드헌터로 경력자를 뽑는다', hint: '빨리, 제대로', fx: ['−통장 $40,000', '+품질 회복', '+조 안정'],
        apply: (s, G) => { s.cash -= 40_000; W.qBoost += 5; W.fatigue = wClamp(W.fatigue - 6); styleAdd(W, 'craft');
          lever(G, '반장 경력 채용', { cash: -40_000, quality: 1 });
          return '경쟁사 출신 반장을 데려왔습니다.'; } },
      { label: '내부에서 승진시킨다', hint: '사람을 키운다', fx: ['+직원 사기 ↑', '=품질 잠시 흔들림'],
        apply: (s, G) => { s.morale = wClamp(s.morale + 5); W.quality = wClamp(W.quality - 2); styleAdd(W, 'craft');
          lever(G, '반장 내부 승진', {});
          return '조원 중 가장 오래된 사람을 올렸습니다. 다들 좋아합니다.'; } },
      { label: '당분간 비워둔다', hint: '인건비를 아낀다', fx: ['+비용 없음', '−현장 피로 ↑'],
        apply: (s, G) => { W.fatigue = wClamp(W.fatigue + 8); styleAdd(W, 'cash');
          lever(G, '반장 공석 유지', { fatigue: 8 });
          return '비워뒀습니다. 구 공장장이 그 조를 직접 봅니다.'; } },
    ],
  };
}
