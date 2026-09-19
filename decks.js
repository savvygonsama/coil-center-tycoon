/* ============================================================
   의사결정 카드 덱
   매달 구매 / 영업 / 생산에서 한 장씩 반드시 올라온다. 여기에 가끔 대형 사건.
   opt.mult  — 이번 달 소재 발주량 배수 (미리보기에 바로 반영)
   opt.apply — 결재를 누를 때 실행되는 부수효과. 문자열을 돌려주면 결산에 찍힌다.
   ============================================================ */

const DECK = {

  /* ---------------- 구매 ---------------- */
  buy: [
    { id: 'b-hike', who: 'seo',
      title: '본사가 다음 분기 가격 인상을 검토 중입니다',
      text: '아직 확정은 아니랍니다. 오르면 지금 시킨 게 싸게 산 게 되고, 안 오르면 재고만 안는 겁니다.',
      opts: [
        { label: '넉넉히 시킨다', hint: '계획의 1.6배', mult: 1.6 },
        { label: '계획대로', hint: '', mult: 1.0 },
        { label: '미룬다', hint: '계획의 절반', mult: 0.5 },
      ] },

    { id: 'b-fall', who: 'seo', when: (s, c) => c.pmTrend < 0,
      title: '소재 시세가 계속 빠지고 있습니다',
      text: `지난달보다 톤당 $${'{DROP}'} 내렸습니다. 더 빠질 것 같기도 하고, 여기가 바닥 같기도 하고요.`,
      opts: [
        { label: '싸니까 더 산다', hint: '계획의 1.5배 · 더 빠지면 평가손', mult: 1.5 },
        { label: '계획대로', hint: '', mult: 1.0 },
        { label: '바닥 볼 때까지 줄인다', hint: '계획의 0.6배 · 반등하면 비싸게 산다', mult: 0.6 },
      ] },

    { id: 'b-yard', who: 'gu', when: (s) => inventoryTons(s) > CFG.WAREHOUSE_CAP_BASE * 0.75,
      title: '야드가 거의 찼습니다',
      text: '코일 하나 빼려고 세 개를 옮기고 있습니다. 이대로 더 들어오면 동선이 막힙니다.',
      opts: [
        { label: '이번 달은 줄인다', hint: '계획의 0.5배', mult: 0.5 },
        { label: '외부창고를 빌린다', hint: '$55,000 · 계획대로',
          mult: 1.0, apply: s => { s.cash -= 55_000; return '외부창고를 한 달 빌렸습니다.'; } },
        { label: '그냥 밀어넣는다', hint: '가동률이 떨어집니다', mult: 1.0 },
      ] },

    { id: 'b-cash', who: 'han', when: (s) => s.cash < 6e6,
      title: '다음 달 결제가 빠듯합니다',
      text: '도착한 소재 대금이 다음 달에 나갑니다. 지금 더 시키면 그 다음 달이 더 큽니다.',
      opts: [
        { label: '발주를 줄인다', hint: '계획의 0.5배 · 석 달 뒤 결품 위험', mult: 0.5 },
        { label: '은행에서 당긴다', hint: '계획대로 · 이자가 붙습니다', mult: 1.0 },
        { label: '고객에게 조기 결제를 부탁한다', hint: '신뢰를 조금 씁니다',
          mult: 1.0, apply: s => { s.trust -= 3;
            for (const a of s.ar) a.dueTurn = Math.max(s.turn, a.dueTurn - 1);
            return '받을 돈이 한 달 당겨졌습니다. 고객이 좋아하진 않았습니다.'; } },
      ] },

    { id: 'b-early', who: 'jung',
      title: '본사가 조기 발주를 요청했습니다',
      text: '자기들 생산 계획을 짜야 한다고, 두 달치를 미리 걸어달랍니다.',
      opts: [
        { label: '받아준다', hint: '계획의 1.5배 · 본사 신뢰 ↑',
          mult: 1.5, apply: s => { s.trust += 4; return '본사가 고마워했습니다.'; } },
        { label: '한 달치만', hint: '', mult: 1.2 },
        { label: '거절한다', hint: '본사 신뢰 ↓',
          mult: 1.0, apply: s => { s.trust -= 5; return '본사 구매팀 목소리가 차가워졌습니다.'; } },
      ] },

    { id: 'b-ship', who: 'seo', when: (s) => s.poOpen.length > 2,
      title: '선복이 모자랍니다',
      text: '다음 배가 꽉 찼답니다. 우리 물량을 실으려면 웃돈을 줘야 합니다.',
      opts: [
        { label: '웃돈을 주고 싣는다', hint: '$140,000',
          mult: 1.0, apply: s => { s.cash -= 140_000; return '제때 실었습니다.'; } },
        { label: '다음 배로 미룬다', hint: '도착이 한 달 밀립니다',
          mult: 1.0, apply: s => { let n = 0;
            for (const p of s.poOpen) if (p.etaTurn <= s.turn + 2) { p.etaTurn += 1; n++; }
            return `${n}건이 한 달 밀렸습니다.`; } },
        { label: '이번 달 발주를 줄인다', hint: '계획의 0.6배', mult: 0.6 },
      ] },

    { id: 'b-quiet', who: 'seo',
      title: '이번 달은 특별한 일이 없습니다',
      text: '내시대로 시키면 됩니다. 다만 여유를 얼마나 둘지는 사장님 판단입니다.',
      opts: [
        { label: '여유를 둔다', hint: '계획의 1.3배', mult: 1.3 },
        { label: '계획대로', hint: '', mult: 1.0 },
        { label: '타이트하게', hint: '계획의 0.75배 · 현금이 남습니다', mult: 0.75 },
      ] },
  ],

  /* ---------------- 영업 ---------------- */
  sales: [
    { id: 's-volume', who: 'jung',
      title: 'A자동차가 추가 물량을 제안했습니다',
      text: '연간 기준으로 꽤 됩니다. 단 조건이 있습니다 — 기존 대비 톤당 $14를 깎아달랍니다.',
      opts: [
        { label: '전량 수락', hint: '물량 +9% · 톤당 −$14',
          apply: (s, g) => { s.myShare *= 1.09; g.turnDiscount = 14; s.trust += 3;
            return 'A자동차 물량을 받았습니다. 대신 마진이 얇아집니다.'; } },
        { label: '절반만 수락', hint: '물량 +4% · 톤당 −$7',
          apply: (s, g) => { s.myShare *= 1.04; g.turnDiscount = 7;
            return '절반만 받았습니다.'; } },
        { label: '거절', hint: '마진은 지키고 물량은 잃습니다',
          apply: s => { s.myShare *= 0.97; s.trust -= 2;
            return '단가를 지켰습니다. A자동차가 서운해합니다.'; } },
      ] },

    { id: 's-undercut', who: 'jung',
      title: '경쟁사가 우리 고객을 돌고 있습니다',
      text: '톤당 15불 싸게 주겠다고 한답니다. 그 가격이면 걔들도 남는 게 없을 텐데요.',
      opts: [
        { label: '가격을 맞춘다', hint: '이번 달 톤당 −$12',
          apply: (s, g) => { g.turnDiscount = 12; return '이번 달은 톤당 12불을 깎았습니다.'; } },
        { label: '버틴다', hint: '몇 곳은 넘어갑니다',
          apply: s => { s.myShare *= 0.93; return '두 곳이 넘어갔습니다. 나머지는 남았습니다.'; } },
        { label: '품질로 설득한다', hint: '$25,000 · 평소에 쌓아둔 게 있어야 통합니다',
          apply: s => { s.cash -= 25_000;
            if (s.trust > 60) { s.trust += 3; return '수율 데이터를 들고 갔습니다. 고객이 남았습니다.'; }
            s.myShare *= 0.96; return '설득이 안 됐습니다. 평소에 쌓아둔 게 없었습니다.'; } },
      ] },

    { id: 's-visit', who: 'jung',
      title: '이번 달에 만날 수 있는 고객이 하나뿐입니다',
      text: '셋 다 보고 싶은데 일정이 안 됩니다. 어디부터 가시겠습니까.',
      opts: [
        { label: '자동차 부품사', hint: '본사가 제일 좋아하는 물량',
          apply: s => { s.trust += 5; s.myShare *= 1.03; return '다음 내시가 조금 늘 것 같습니다.'; } },
        { label: '가전 업체', hint: '대금을 제때 줍니다',
          apply: s => { s.myShare *= 1.04;
            for (const a of s.ar) a.dueTurn = Math.max(s.turn, a.dueTurn - 1);
            return '받을 돈이 한 달 당겨졌습니다.'; } },
        { label: '건설 자재상', hint: '물량은 큰데 돈이 늦습니다',
          apply: (s, g) => { s.myShare *= 1.07;
            g.pending.push({ turn: s.turn + 5, run: s2 => {
              if (Math.random() < 0.5) { s2.cash -= 900_000; s2.trust -= 4;
                return '건설사 어음이 부도났습니다. $900,000을 털었습니다.'; }
              return '건설사 대금이 들어왔습니다. 늦었지만 들어왔습니다.'; } });
            return '물량을 받았습니다. 대금은 다섯 달 뒤에 봅니다.'; } },
      ] },

    { id: 's-claim', who: 'oh', when: (s) => s.turn > 6,
      title: '고객 라인에서 표면 결함이 나왔습니다',
      text: '두 건입니다. 우리 것인지 확실하진 않은데, 고객은 우리 것이라고 합니다.',
      opts: [
        { label: '전량 보상한다', hint: '$120,000 · 신뢰 ↑',
          apply: s => { s.cash -= 120_000; s.trust += 6;
            return '군말 없이 물어줬습니다. 고객 품질팀이 놀랐습니다.'; } },
        { label: '원인 규명부터', hint: '$40,000 · 시간이 걸립니다',
          apply: s => { s.cash -= 40_000;
            if (Math.random() < 0.5) { s.trust += 2; return '우리 것이 아니었습니다. 깔끔하게 정리됐습니다.'; }
            s.cash -= 90_000; s.trust -= 3; return '우리 것이었습니다. 결국 물어주고 시간도 잃었습니다.'; } },
        { label: '우리 책임이 아니라고 한다', hint: '싸게 끝나지만 관계가 상합니다',
          apply: s => { s.trust -= 10; s.myShare *= 0.97;
            return '고객이 차기 물량에서 우리 비중을 줄이겠답니다.'; } },
      ] },

    { id: 's-credit', who: 'han', when: (s) => s.turn > 8,
      title: '큰 고객이 여신을 올려달랍니다',
      text: '지금 한도로는 더 못 받겠답니다. 올려주면 물량이 늘고, 안 올려주면 줄겠죠.',
      opts: [
        { label: '올려준다', hint: '물량 +8% · 나중에 청구서가 올 수 있습니다',
          apply: (s, g) => { s.myShare *= 1.08;
            g.pending.push({ turn: s.turn + 6, run: s2 => {
              if (Math.random() < 0.4) { s2.cash -= 2_200_000; s2.trust -= 6;
                return '여신 올려준 그 고객이 넘어갔습니다. 못 받은 $2,200,000을 털었습니다.'; }
              return '여신 올려준 고객이 잘 갚고 있습니다.'; } });
            return '한도를 올렸습니다. 주문이 늘었습니다.'; } },
        { label: '보증을 받고 올려준다', hint: '$35,000 · 물량 +4%',
          apply: s => { s.cash -= 35_000; s.myShare *= 1.04; return '보증보험을 끼고 올렸습니다.'; } },
        { label: '거절한다', hint: '물량이 줄어듭니다',
          apply: s => { s.myShare *= 0.96; return '거래가 줄었습니다. 대신 떼일 일도 없습니다.'; } },
      ] },

    { id: 's-longterm', who: 'jung', when: (s) => s.turn > 10,
      title: '3년 장기계약 제안이 왔습니다',
      text: '물량은 보장하는데 단가를 고정하자고 합니다. 시세가 오르면 우리가 손해고, 내리면 이득입니다.',
      opts: [
        { label: '맺는다', hint: '물량 안정 · 시세 상승기엔 손해',
          apply: (s, g) => { s.myShare *= 1.06; s.trust += 4;
            g.pending.push({ turn: s.turn + 9, run: s2 =>
              s2.market.pm > 850
                ? '장기계약 단가가 시세보다 낮습니다. 그 물량에서 재미를 못 보고 있습니다.'
                : '장기계약 덕에 이 국면을 버티고 있습니다.' });
            return '3년을 걸었습니다.'; } },
        { label: '1년만', hint: '절충',
          apply: s => { s.myShare *= 1.03; return '1년으로 줄여 맺었습니다.'; } },
        { label: '거절', hint: '유연성을 지킵니다',
          apply: s => { s.trust -= 2; return '가격은 그때그때 보기로 했습니다.'; } },
      ] },

    { id: 's-newcust', who: 'jung',
      title: '신규 고객을 뚫을 기회가 있습니다',
      text: '옆 공단에 새로 들어온 부품사입니다. 지금 들어가면 초기 물량을 잡을 수 있습니다.',
      opts: [
        { label: '영업비를 써서 뚫는다', hint: '$45,000 · 석 달 뒤 효과',
          apply: (s, g) => { s.cash -= 45_000;
            s.effortQueue.push({ amount: 45_000, turnsLeft: CFG.SALES_EFFORT_LAG });
            return '접대와 샘플에 돈을 썼습니다. 결과는 석 달 뒤에 봅니다.'; } },
        { label: '가볍게만', hint: '$15,000',
          apply: s => { s.cash -= 15_000;
            s.effortQueue.push({ amount: 15_000, turnsLeft: CFG.SALES_EFFORT_LAG });
            return '명함만 돌리고 왔습니다.'; } },
        { label: '지금은 기존 고객에 집중', hint: '돈을 아낍니다',
          apply: s => { s.trust += 1; return '있는 고객부터 챙기기로 했습니다.'; } },
      ] },

    { id: 's-cut', who: 'jung', when: (s) => CFG.HQ_SPOT.phases.includes(s.market.phase),
      title: '주요 고객이 감산을 통보했습니다',
      text: '다음 분기 물량을 20% 줄이겠답니다. 우리만 그런 건 아니라는데, 위로가 안 됩니다.',
      opts: [
        { label: '받아들이고 비용을 줄인다', hint: '사기 ↓ · 고정비 −$30,000',
          apply: (s, g) => { g.extraFixed = (g.extraFixed || 0) - 30_000; s.morale -= 6;
            return '인력 운영을 조정했습니다. 분위기가 가라앉았습니다.'; } },
        { label: '다른 고객으로 메운다', hint: '$120,000 · 석 달 뒤 효과',
          apply: s => { s.cash -= 120_000;
            s.effortQueue.push({ amount: 120_000, turnsLeft: CFG.SALES_EFFORT_LAG });
            return '영업을 돌렸습니다. 당장은 아무 일도 안 일어납니다.'; } },
        { label: '단가를 낮춰서라도 물량을 지킨다', hint: '톤당 −$10',
          apply: (s, g) => { g.turnDiscount = 10; s.myShare *= 1.02;
            return '깎아주고 물량을 지켰습니다.'; } },
      ] },
  ],

  /* ---------------- 생산 ---------------- */
  prod: [
    { id: 'p-maint', who: 'gu',
      title: '정기점검 시기가 됐습니다',
      text: '지금 세우면 사흘입니다. 미루면 나중에 더 오래 세웁니다.',
      opts: [
        { label: '즉시 정비', hint: "$60,000 · 이번 달 캐파 조금 손해",
          apply: s => { s.cash -= 60_000; return "깔끔하게 손봤습니다."; } },
        { label: '다음 달로 연기', hint: '나중에 고장날 수 있습니다',
          apply: (s, g) => { g.pending.push({ turn: s.turn + 3, run: s2 => {
              if (Math.random() < 0.45) { s2.cash -= 260_000; s2.morale -= 4;
                return '미룬 정비 자리에서 설비가 섰습니다. 긴급 수리 $260,000.'; }
              return '미뤄둔 정비를 이번에 했습니다. 별일 없었습니다.'; } });
            return '이번 달은 그냥 돌립니다.'; } },
        { label: '최소한만', hint: "$25,000",
          apply: s => { s.cash -= 25_000; return "기름만 치고 넘어갑니다."; } },
      ] },

    { id: 'p-knife', who: 'gu',
      title: '나이프가 다 됐습니다',
      text: '슬리팅 단면에 버가 섭니다. 지금은 넘어가는데, 오래는 못 갑니다.',
      opts: [
        { label: '지금 교체', hint: "$45,000",
          apply: s => { s.cash -= 45_000; return "교체했습니다. 단면이 깨끗합니다."; } },
        { label: '한 달만 더', hint: '석 달간 수율 −1.5%p',
          apply: (s, g) => { g.yieldPenalty = 3; return '일단 돌립니다. 로스가 늘어날 겁니다.'; } },
        { label: '예비 나이프까지 같이 산다', hint: "$70,000 · 당분간 걱정 없음",
          apply: s => { s.cash -= 70_000; s.morale += 2;
            return '예비까지 사뒀습니다. 구 공장장 표정이 좋아졌습니다.'; } },
      ] },

    { id: 'p-ot', who: 'gu', when: (s, c) => c.tight,
      title: '이번 달 주문이 캐파를 넘습니다',
      text: '정규 시간으로는 못 맞춥니다. 잔업을 돌리거나, 외주를 주거나, 못 만든다고 해야 합니다.',
      opts: [
        { label: '잔업을 돌린다', hint: `캐파 +20% · ${'$60,000'} · 사기 −5`,
          ot: true },
        { label: '외주 가공을 준다', hint: '$160,000 · 품질은 남의 손에',
          apply: s => { s.cash -= 160_000;
            if (Math.random() < 0.25) { s.trust -= 5; return '외주 물량에서 치수 불량이 나왔습니다.'; }
            return '외주로 넘겼습니다. 이번엔 무사히 나갔습니다.'; } },
        { label: '못 만든다고 한다', hint: '결품입니다',
          apply: s => { s.trust -= 6; s.myShare *= 0.95;
            return '고객에게 못 맞춘다고 알렸습니다. 그 고객은 다른 데를 알아볼 겁니다.'; } },
      ] },

    { id: 'p-quit', who: 'lin',
      title: '크레인 기사 셋이 같이 그만두겠답니다',
      text: '옆 공단이 20% 더 준답니다. 세 명 다 나가면 야드가 멈춥니다.',
      opts: [
        { label: '임금을 올린다', hint: '고정비 매달 +$40,000',
          apply: (s, g) => { g.extraFixed = (g.extraFixed || 0) + 40_000; s.morale += 10;
            return '남기로 했습니다. 다른 조도 곧 알게 될 겁니다.'; } },
        { label: '린 매니저에게 맡긴다', hint: '$60,000 · 결과는 반반',
          apply: s => { s.cash -= 60_000;
            if (Math.random() < 0.6) { s.morale += 6; return '린 매니저가 밥을 샀습니다. 둘이 남았습니다.'; }
            s.morale -= 8; return '린 매니저도 못 잡았습니다.'; } },
        { label: '보내준다', hint: '사기 −14',
          apply: s => { s.morale -= 14; return '셋이 나갔습니다. 남은 사람들이 조용합니다.'; } },
      ] },

    { id: 'p-yield', who: 'oh',
      title: '수율이 조금씩 떨어지고 있습니다',
      text: '지난 석 달 평균이 계속 내려갑니다. 어디서 새는지 찾으려면 사람을 붙여야 합니다.',
      opts: [
        { label: '원인을 끝까지 판다', hint: '$90,000 · 수율이 올라갑니다',
          apply: (s, g) => { s.cash -= 90_000; g.yieldSpend = 90_000;
            return '데이터를 뒤졌습니다. 코일 배분 기준을 고쳤습니다.'; } },
        { label: '작업자 교육만', hint: "$25,000",
          apply: (s, g) => { s.cash -= 25_000; g.yieldSpend = 25_000; s.morale += 2;
            return '교육을 돌렸습니다.'; } },
        { label: '지금은 넘어간다', hint: '돈을 아낍니다',
          apply: s => { s.morale -= 2; return '오 과장이 아무 말 없이 나갔습니다.'; } },
      ] },

    { id: 'p-typhoon', who: 'gu', when: (s) => inventoryTons(s) > 6000,
      title: '밤새 비가 왔습니다',
      text: '야드 끝쪽 코일이 물에 잠겼습니다. 겉보기엔 멀쩡한데, 겉보기엔 늘 멀쩡합니다.',
      opts: [
        { label: '전량 재검사', hint: "$110,000",
          apply: s => { s.cash -= 110_000; return "검사반을 붙였습니다. 대부분 살렸습니다."; } },
        { label: '젖은 것만 스크랩', hint: '소재 재고 8%를 버립니다',
          apply: s => { let t = 0;
            for (const l of s.invRaw) { const c = l.qty * 0.08; l.qty -= c; t += c; }
            s.ar.push({ amount: t * s.market.pm * s.market.scrapRate, dueTurn: s.turn + 1 });
            return `${fmt(t)}톤을 스크랩으로 넘겼습니다.`; } },
        { label: '그냥 출하', hint: '고객이 먼저 발견하면 끝입니다',
          apply: s => {
            if (Math.random() < 0.45) { s.trust -= 14; s.myShare *= 0.94;
              return '고객 라인에서 녹이 나왔습니다. 클레임이 들어왔습니다.'; }
            return '아무 일도 없었습니다. 이번에는.'; } },
      ] },

    { id: 'p-safety', who: 'lin', when: (s) => s.morale < 60,
      title: '아차 사고가 두 건 있었습니다',
      text: '다치진 않았습니다. 다친 다음에 보고하면 늦습니다.',
      opts: [
        { label: '라인을 세우고 점검한다', hint: '$70,000 · 사기 ↑',
          apply: s => { s.cash -= 70_000; s.morale += 8;
            return '하루 세우고 전수 점검했습니다. 현장 분위기가 달라졌습니다.'; } },
        { label: '안전교육만', hint: "$20,000",
          apply: s => { s.cash -= 20_000; s.morale += 3; return '교육을 했습니다.'; } },
        { label: '주의만 준다', hint: '공짜지만 위험합니다',
          apply: (s, g) => { g.pending.push({ turn: s.turn + 4, run: s2 => {
              if (Math.random() < 0.35) { s2.cash -= 700_000; s2.morale -= 15;
                return '사고가 났습니다. 보상과 조업 중단으로 $700,000.'; }
              return '다행히 아무 일도 없었습니다.'; } });
            return '조회 때 한마디 했습니다.'; } },
      ] },

    { id: 'p-idle', who: 'gu', when: (s, c) => c.idle,
      title: '라인이 놉니다',
      text: '이번 달 내시가 캐파의 절반도 안 됩니다. 사람은 그대로 있고 고정비도 그대로 나갑니다.',
      opts: [
        { label: '이참에 대정비를 한다', hint: '$110,000 · 다음 석 달 수율 ↑',
          apply: (s, g) => { s.cash -= 110_000; g.yieldSpend = 110_000; s.morale += 3;
            return '놀 때 손봤습니다. 잘한 선택입니다.'; } },
        { label: '교대를 줄인다', hint: '고정비 −$50,000 · 사기 ↓',
          apply: (s, g) => { g.extraFixed = (g.extraFixed || 0) - 50_000; s.morale -= 7;
            return '한 개 반을 쉬게 했습니다. 사람들이 불안해합니다.'; } },
        { label: '그대로 둔다', hint: '아무것도 안 합니다',
          apply: () => '별일 없이 한 달이 지나갔습니다.' },
      ] },
  ],

  /* ---------------- 대형 사건 ----------------
     달을 고정한다. 모두가 같은 달에 같은 일을 겪어야 이야기가 된다. */
  big: [
    { at: 8, who: 'jung', title: '🚨 중국산 열연 반덤핑 관세 검토',
      text: '현지 정부가 조사에 들어갔습니다. 통과되면 중국산이 비싸집니다. 우리한테는 기회입니다.',
      opts: [
        { label: '지금 재고를 늘려둔다', hint: '계획의 1.7배', mult: 1.7 },
        { label: '관망한다', hint: '', mult: 1.0 },
        { label: '오히려 판다', hint: '계획의 0.4배 · 현금 확보', mult: 0.4 },
      ] },
    { at: 15, who: 'oh', title: '🚨 주요 고객 생산라인 화재',
      text: 'A자동차 도장라인이 탔습니다. 복구까지 두 달이랍니다. 그동안 우리 물량도 멈춥니다.',
      opts: [
        { label: '다른 고객으로 급히 돌린다', hint: '$130,000 · 석 달 뒤 효과',
          apply: s => { s.cash -= 130_000;
            s.effortQueue.push({ amount: 130_000, turnsLeft: CFG.SALES_EFFORT_LAG });
            return '영업을 전면에 돌렸습니다.'; } },
        { label: '복구를 돕는다', hint: '$80,000 · 신뢰 ↑↑',
          apply: s => { s.cash -= 80_000; s.trust += 12;
            return '우리 정비 인력을 보냈습니다. A자동차가 이걸 오래 기억할 겁니다.'; } },
        { label: '기다린다', hint: '두 달 물량이 빕니다',
          apply: s => { s.myShare *= 0.92; return '두 달을 그냥 보냈습니다.'; } },
      ] },
    { at: 22, who: 'han', title: '🚨 환율이 급변했습니다',
      text: '현지 통화가 한 달 만에 12% 빠졌습니다. 소재는 달러로 사고 판매는 현지 통화입니다.',
      opts: [
        { label: '판가에 즉시 반영한다', hint: '고객이 싫어합니다',
          apply: s => { s.trust -= 8; return '가격을 올렸습니다. 고객 구매팀과 싸웠습니다.'; } },
        { label: '절반만 반영', hint: '손실을 나눠 집니다',
          apply: (s, g) => { g.turnDiscount = 8; s.trust -= 2;
            return '절반씩 나눠 지기로 했습니다.'; } },
        { label: '우리가 다 떠안는다', hint: '이번 달 손익이 아픕니다 · 신뢰 ↑',
          apply: (s, g) => { g.turnDiscount = 18; s.trust += 8;
            return '이번엔 우리가 다 먹었습니다. 고객이 고마워합니다.'; } },
      ] },
    { at: 28, who: 'jung', title: '🚨 자동차 업계 대규모 감산',
      text: '완성차가 라인을 세웁니다. 내시가 앞으로 몇 달 확 줄어들 겁니다.',
      opts: [
        { label: '지금 발주를 확 줄인다', hint: '계획의 0.3배 · 나중에 결품 위험', mult: 0.3 },
        { label: '절반으로', hint: '', mult: 0.6 },
        { label: '유지한다', hint: '재고가 쌓입니다 · 회복기에 유리', mult: 1.0 },
      ] },
    { at: 33, who: 'han', title: '🚨 경쟁 코일센터가 부도났습니다',
      text: '길 건너 그 회사입니다. 고객이 갈 곳을 찾고 있습니다. 설비도 헐값에 나왔습니다.',
      opts: [
        { label: '고객을 흡수한다', hint: '$150,000 · 물량 +12%',
          apply: s => { s.cash -= 150_000; s.myShare *= 1.12;
            return '영업을 총동원했습니다. 고객 넷을 데려왔습니다.'; } },
        { label: '설비를 헐값에 산다', hint: '슬리터 1기를 $1.2M에 · 4개월 뒤 가동',
          apply: s => { s.cash -= 1_200_000;
            s.buildQueue = s.buildQueue || [];
            s.buildQueue.push({ type: 'SLIT', capex: 1_200_000, readyTurn: s.turn + CFG.INSTALL_TURNS });
            return '경매에서 슬리터를 반값에 잡았습니다.'; } },
        { label: '조용히 지켜본다', hint: '현금을 지킵니다',
          apply: () => '남의 일입니다. 다음이 우리가 아니길 바랄 뿐입니다.' },
      ] },
    { at: 40, who: 'jung', title: '🚨 본사가 가격 정책을 바꿨습니다',
      text: '앞으로 해외 법인에도 시장가를 그대로 적용하겠답니다. 우리 매입가가 올라갑니다.',
      opts: [
        { label: '본사와 협상한다', hint: '$0 · 신뢰를 씁니다',
          apply: s => { if (s.trust > 65) { s.trust -= 5;
              return '그동안 쌓은 게 있어 유예를 받았습니다.'; }
            s.trust -= 8; return '협상이 안 됐습니다. 평소에 쌓아둔 게 없었습니다.'; } },
        { label: '판가에 반영한다', hint: '고객이 떨어져 나갑니다',
          apply: s => { s.myShare *= 0.94; return '가격을 올렸습니다. 몇 곳이 이탈했습니다.'; } },
        { label: '우리가 흡수한다', hint: '이번 달 톤당 −$15',
          apply: (s, g) => { g.turnDiscount = 15; s.trust += 4;
            return '마진을 깎아 고객을 지켰습니다.'; } },
      ] },
  ],
};
