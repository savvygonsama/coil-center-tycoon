/* ============================================================
   코일센터 경영 시뮬레이터 · 경제 엔진
   설계 근거: _workspace/20260912_01/output/4-economy-engine.md (v3)
   1턴 = 1개월. 통화 USD, 물량 톤.
   ============================================================ */

/* ---------- 설정 ---------- */

const CFG = {
  // 판매 유형별 마진·수율 (v3 §1-2)
  COIL_MARGIN: 10,                                    // 전 유형 공통
  PROC_MARGIN: { C2C: 0, SLIT: 30, LEVEL: 30, TRAP: 45, DIE: 75 },
  YIELD:       { C2C: 1.00, SLIT: 0.98, LEVEL: 0.98, TRAP: 0.98, DIE: 0.85 },
  VAR_COST:    { C2C: 3, SLIT: 12, LEVEL: 12, TRAP: 25, DIE: 25 }, // 처리톤당

  // 라인 (v3 §2-1)
  LINE: {
    SLIT:  { cap: 8333, capex: 2_000_000, procs: ['SLIT'],          label: '슬리터' },
    LEVEL: { cap: 4167, capex: 2_000_000, procs: ['LEVEL'],         label: '레벨러' },
    BLANK: { cap: 2000, capex: 5_000_000, procs: ['TRAP', 'DIE'],   label: '블랭킹' },
  },
  MAX_LINES: 3,                    // 공장동 1개 수용 한도. 4라인째는 신규 인프라 $16M

  // 투자비 (v3 §0, 역산 확정)
  INFRA_TOTAL: 16_000_000,
  LAND: 4_000_000,                 // 비상각
  BUILDING: 12_000_000,            // 20년 = 240개월
  BUILDING_LIFE_M: 240,
  MACHINE_LIFE_M: 120,             // 10년 정액 (확정)

  // 소재·시장 [가정]
  P_M_BASE: 750,
  SCRAP_RATE: 0.275,
  /* 현물은 프리미엄이 아니라 디스카운트다 (실무자 확인).
     현물로 돌리는 물건은 대개 진짜 범용 일반재라 실수요 대비 마진을 못 붙인다.
     현물의 상방은 "마진을 더 받는 것"이 아니라 "시세가 오르면 재고 평가가 뜨는 것" 하나뿐이고,
     하방은 평가손·보관비·열화·정체·사이즈 미스매치 네 가지다. */
  SPOT_MARGIN_ADJ: -6,           // [가정·확인필요] 톤당. 실수요 대비 못 받는 마진
  PM_SIGMA: 0.025,               // 월 변동성. 시나리오 사이클이 주인공이고 잡음은 거들기만 한다
  PM_JUMP_PROB: 0.04,
  PM_JUMP_SIZE: 0.18,
  /* 리드타임 분해 (실무자 확인): 주문접수 후 제조 2개월 + 해송 1개월 = 3개월.
     3개월치 안전재고라는 업계 통설은 여기서 나온다. */
  LEAD_TURNS: 3,
  /* L/C 유산스 90일은 B/L(선적) 기준이다. 선적하고 한 달 배를 타고 오니
     도착 시점엔 이미 두 달이 지나 있다. 결제는 도착 한 달 뒤다.
     이걸 도착 기준 90일로 잡으면 본사가 두 달치를 공짜로 대주는 게 되어
     코일센터가 현금이 넘치는 이상한 회사가 된다. */
  DPO_TURNS: 1,
  DSO_TURNS: 3,                    // Net 60 + 실제 지연
  TARGET_DIO_DAYS: 52.5,

  /* ---- 강종 (실무자 확인) — 이 게임의 진짜 축 ----
     코일센터 물량의 70% 이상이 자동차강판이다. 곁가지가 아니라 본체다.
     자동차강판 밖의 강종은 가격 경쟁이 너무 심해서 모사(철강사)가 그 가격을 못 맞춘다.
     코일센터는 어디서 사 오든 중간 마진만 붙이면 그만이지만, 모사는 그걸 할 수가 없다.

     그래서 갈라진다:
       자동차강판 = 모사 소재 = 본사 연결기여 발생 = 제조공기 길다 = 자금 더 묶인다
       일반재     = 3자 소재  = 본사 연결기여 0    = 회전 빠르다  = 단독 손익엔 도움
     코일센터 사장이 자금 회전을 위해 일반재를 늘리면 본사 실적은 한 푼도 안 늘어난다.
     이게 "혼자만 이겼습니다" 등급이 나오는 자리다. */
  GRADE: {
    COMMON:  { pmMult: 1.00, marginAdd:  0, leadAdd: 0, hqSupplied: false, label: '일반재' },
    PREMIUM: { pmMult: 1.18, marginAdd:  0, leadAdd: 1, hqSupplied: true,  label: '자동차강판' },
  },
  /* 실무자 확인: 코일센터가 상시로 가진 물량은 실수요(자동차강판)뿐이다.
     유통향은 상시 개념이 아니다 — 본사 물량이 안 찰 때 특별히 가끔 푸는 것이고,
     그 상한이 대략 전체 판매의 15%다.
     그래서 "남는 캐파를 일반재로 채워 자금 회전을 돌린다"는 길은 애초에 없다.
     내시가 줄면 라인은 그냥 논다. 고정비는 그대로 나간다.
     증설이 무서운 결정인 이유가 이것이다 — 놀아도 메울 방법이 없다. */
  PREMIUM_DEMAND_SHARE: 1.0,
  COMMON_SALES_CAP: 0.15,          // 본사가 풀었을 때조차 이 선을 못 넘는다
  NASI_LEAD: 3,                    // 내시량을 몇 달 앞까지 미리 받는가
  NASI_CAP_MULT: 0.95,             // 내시는 캐파의 이 배수에서 멈춘다. 본사도 소화 못 할 양은 안 준다.
                                   // 수율을 감안하면 잘 돌린 공장은 내시를 100% 쳐낼 수 있다는 뜻이다.

  /* ---- 불황기 본사 지시 스팟 (실무자 확인) ----
     모사가 가동 물량을 못 채우는 불황기에는, 영업적자를 보더라도 한계이익만 확보되면
     가동률을 올리는 편이 낫다. 그래서 일반 유통향 물량을 코일센터에 스팟으로 지시한다.
     가격이 되게 싸다 — 그게 코일센터에게는 진짜 기회다.
     동시에 그 재고 리스크는 전부 코일센터가 진다. 본사는 가동률을 채우고,
     코일센터는 안 팔릴지도 모르는 일반재를 창고에 쌓는다.
     "본사는 이겼습니다" 등급이 만들어지는 자리가 여기다. */
  HQ_SPOT: {
    phases: ['BUST'],
    discount: 0.12,                // [가정] 시세 대비 할인
    capShareOfCap: 0.60,           // [가정] 월 캐파 대비 최대 지시 물량
    refuseTrustCost: 4,            // 거절하면 본사와의 관계가 상한다
  },

  /* ---- 현물 사이즈 미스매치 (실무자 확인) ----
     "아예 그 사이즈가 안 팔려서 반값 이하로 팔아야 하는 리스크".
     열화와는 다른 리스크다. 물건은 멀쩡한데 폭·두께가 아무에게도 안 맞는 경우. */
  DUMP_AGE_TURNS: 4,               // 현물이 4턴 넘게 안 나가면
  DUMP_PROB: 0.22,                 // [가정] 그 lot이 미스매치로 판명될 확률
  DUMP_PRICE_RATE: 0.45,           // 반값 이하로 떨군다

  // 비용 [가정]
  FC_BASE: 200_000,
  FC_PER_EXTRA_LINE: 30_000,       // 2라인 초과분
  OT_COST: 60_000,
  OT_CAP_MULT: 1.20,
  LC_FEE_RATE: 0.002,

  // 자금 [가정]
  DEBT_RATE_MONTHLY: 0.08 / 12,
  BORROW_BASE_RATE: 0.70,          // 재고+매출채권의 70%까지 운전자본 대출이 붙는다 [가정]

  // 시황 국면 (v3 §5 STEP 0)
  PHASE: {
    BUST:   { hqLo: 0.02, hqHi: 0.03, mkt: 0.7, drift: -0.010, label: '불황' },
    NORMAL: { hqLo: 0.05, hqHi: 0.08, mkt: 1.0, drift:  0.000, label: '통상' },
    BOOM:   { hqLo: 0.10, hqHi: 0.10, mkt: 1.3, drift: +0.015, label: '호황' },
  },
  /* ---- 고객군 ----
     "점유율" 하나로 뭉개면 어느 고객을 붙잡았는지가 사라진다.
     어떤 고객군을 갖추느냐가 물량·마진·변동성·부실을 한꺼번에 정한다.
       margin  톤당 판가 가감          vol   내시 변동폭
       bad     월 대손 확률            dso   대금 회수 개월
       blank   블랭킹 수주 비중        grow  물량 성장 배수
       crash   갑자기 물량이 빠질 확률 */
  CUSTOMERS: {
    JP:   { name: '일본계 자동차', emoji: '🇯🇵', margin: -5, vol: 0.04, bad: 0.000, dso: 3,
            blank: 0.08, grow: 0.55, crash: 0.00,
            good: '내시가 흔들리지 않습니다. 떼일 일이 없습니다.',
            bad_: '마진이 박합니다. 물량이 크게 늘지도 않습니다.' },
    EU:   { name: '미주·구주 자동차', emoji: '🌍', margin: 0, vol: 0.09, bad: 0.002, dso: 3,
            blank: 0.14, grow: 1.00, crash: 0.02,
            good: '물량이 크고 단가도 무난합니다.',
            bad_: '규격이 까다롭고 감사가 잦습니다.' },
    CN:   { name: '중국 전기차', emoji: '⚡', margin: +7, vol: 0.28, bad: 0.011, dso: 4,
            blank: 0.45, grow: 2.10, crash: 0.11,
            good: '물량이 폭발적으로 늘고 단가도 좋습니다. 신생사가 많아 블랭킹까지 맡깁니다.',
            bad_: '어느 달 갑자기 내시가 빠집니다. 그 물량이 그대로 장기재고가 되고, 채권도 위험합니다.' },
    PART: { name: '자동차 부품사', emoji: '🔩', margin: +8, vol: 0.13, bad: 0.004, dso: 3,
            blank: 0.32, grow: 0.95, crash: 0.03,
            good: '소량 다품종이라 가공 마진이 좋습니다.',
            bad_: '납기가 빡빡하고 규격이 잘게 쪼개집니다.' },
    HOME: { name: '가전·강건재', emoji: '🏠', margin: +2, vol: 0.20, bad: 0.003, dso: 2,
            blank: 0.18, grow: 1.15, crash: 0.05,
            good: '대금을 빨리 줍니다. 현금 회전에 도움이 됩니다.',
            bad_: '가격에 아주 민감하고 주문이 들쭉날쭉합니다.' },
  },
  CUST_GAIN: 0.055,                // 한 달 영업하면 그 고객군 비중이 이만큼 오른다 [가정]
  CUST_DECAY: 0.010,               // 손 놓은 고객군은 매달 조금씩 빠진다
  CRASH_DROP: 0.45,                // 물량이 빠질 때 그 고객군 비중이 이만큼 날아간다

  START_YEAR: 2026, START_MONTH: 1,

  /* ---- 4년 시나리오 ----
     시황을 매달 주사위로 굴리면 사람마다 다른 판을 받는다. 그러면 교육이 안 된다.
     "그때 그 선택이 갈랐다"는 이야기가 되려면 모두가 같은 사이클을 겪어야 한다.
     그래서 국면은 시나리오로 고정하고, 그 안의 가격·수요만 흔든다. */
  SCENARIO: [
    { phase: 'BOOM',   drift: +0.016, name: '호황',
      brief: '자동차 생산이 늘고 있습니다. 주문이 밀립니다. 지금 번 돈을 어디에 쓸지가 4년을 가릅니다.' },
    { phase: 'NORMAL', drift: -0.018, name: '공급과잉',
      brief: '중국산이 쏟아집니다. 가격이 빠지기 시작합니다. 재고를 많이 든 회사가 아파집니다.' },
    { phase: 'BUST',   drift: -0.010, name: '불황',
      brief: '자동차가 감산에 들어갔습니다. 내시가 줄고 라인이 놉니다. 본사도 물량을 못 채웁니다.' },
    { phase: 'NORMAL', drift: +0.013, name: '회복',
      brief: '수요가 돌아옵니다. 싸게 사둔 재고가 있는 회사가 웃습니다.' },
  ],

  PHASE_TRANS: {
    BUST:   { BUST: 0.75, NORMAL: 0.25, BOOM: 0.00 },
    NORMAL: { BUST: 0.15, NORMAL: 0.70, BOOM: 0.15 },
    BOOM:   { BUST: 0.05, NORMAL: 0.35, BOOM: 0.60 },
  },

  // 수요 모델 (v3 §2-7) — 게임의 생명선
  SALES_EFFORT_LAG: 3,             // 영업 투자 효과는 3턴 뒤
  SALES_EFFORT_GAIN: 0.008,        // $100,000 투자당 점유율 증분 [가정]
  TRUST_SHARE_COEF: 0.001,

  // 부실·연체 [가정]
  BAD_DEBT_RATE: 0.006 / 12,
  DELAY_RATE: 0.12,

  /* ---- 재고 보유의 대가 (실무자 확인 반영) ----
     현물 전략의 비용은 가격 폭락 하나가 아니다. 네 가지가 같이 붙는다.
       1) 가격 폭락       → STEP 13 저가법 평가
       2) 보유 금리·보관비 → CARRY_COST
       3) 열화            → DEGRADE_*
       4) 물류 정체        → WAREHOUSE_CAP
     이걸 다 빼면 현물이 프리미엄만 받는 무적 전략이 된다. */
  CARRY_COST_PER_TON: 1.5,         // 보관·보험·핸들링 월 [가정]. 금리 부담은 차입 이자가 따로 받는다
  DEGRADE_FREE_TURNS: 3,           // 3개월까지는 멀쩡하다
  DEGRADE_RATE: 0.015,             // 이후 월 1.5%가 녹·백청·스크래치로 상품성 상실
  DEGRADE_DEAD_TURNS: 7,           // 7개월 넘으면 전량 불용재고 처리
  WAREHOUSE_CAP_BASE: 45000,       // 야드 수용 한도(톤)
  WAREHOUSE_OVER_COST: 9,          // 초과분 외부창고 임차 톤당 월 [가정]
  WAREHOUSE_OVER_CAP_PENALTY: 0.12,// 초과 시 물류 정체로 가동 캐파 하락

  /* ---- 결품의 대가 ----
     실무자 확인: 결품을 내면 그 고객은 영영 거래를 못 한다고 봐야 한다.
     그래서 통상 3개월치 안전재고를 든다. */
  SAFETY_STOCK_TURNS: 3,
  SHORTAGE_SHARE_LOSS: 0.18,       // 결품 1회당 점유율 영구 손실 비율
  /* 수요 변동. 재고가 얇으면 이 진폭에서 결품이 난다.
     자동차강판은 월별 내시 물량이 사전에 나오므로 흔들림이 작다. 이게 3개월(미착 포함)
     이라는 얇은 재고로도 회사가 돌아가는 이유다. 일반재 유통 물량은 그런 게 없다. */
  DEMAND_NOISE_AUTO: 0.05,
  DEMAND_NOISE_COMMON: 0.22,

  INSTALL_TURNS: 4,               // 설비 발주에서 가동까지 (실무자 확인 필요)
  TOTAL_TURNS: 48,
};

const PROC_LIST = ['C2C', 'SLIT', 'LEVEL', 'TRAP', 'DIE'];

/* ---------- 난수 (시드 고정 가능) ---------- */

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- 톤당 손익 (v3 §1) ---------- */

// 상정 실효소재원가 = P_m × [ 1/y_a − (1/y_a − 1) × r_a ]
function effectiveMaterialCost(pm, y, scrapRate) {
  const inv = 1 / y;
  return pm * (inv - (inv - 1) * scrapRate);
}

// 판가 = 상정 실효소재원가 + 코일마진 + 가공마진
function unitPrice(proc, pmRef, assumedYield, assumedScrapRate, opts = {}) {
  const base = proc === 'C2C'
    ? pmRef
    : effectiveMaterialCost(pmRef, assumedYield, assumedScrapRate);
  return base
    + CFG.COIL_MARGIN
    + CFG.PROC_MARGIN[proc]
    + (opts.gradeMargin || 0)
    - (opts.discount || 0)
    + (opts.spotAdj || 0);
}

// 수율 차익 = P_m × (1 − r) × ( 1/y_a − 1/y_r )   ← 플레이어 실력이 돈이 되는 유일한 레버
function yieldGainPerTon(pm, scrapRate, assumedYield, actualYield) {
  return pm * (1 - scrapRate) * (1 / assumedYield - 1 / actualYield);
}

/* ---------- 초기 상태 ---------- */

function createInitialState(opt = {}) {
  const lines = (opt.lines || ['SLIT', 'LEVEL']).map((t, i) => ({
    id: `L${i + 1}`, type: t, cap: CFG.LINE[t].cap, capex: CFG.LINE[t].capex,
  }));
  const machineCost = lines.reduce((a, l) => a + l.capex, 0);
  const equity = opt.equity ?? 25_000_000;

  // 판마다 다른 사이클. 시드가 같으면 같은 판이 나온다 (나중에 조별 대항전에서 같은 판을 돌릴 수 있게).
  const rng0 = makeRng((opt.seed ?? 12345) + 104729);
  const scenario = makeScenario(rng0);

  const st = {
    turn: 1,
    over: false, overReason: null,
    country: opt.country || 'MX',
    companyName: opt.companyName || '무제 코일센터',

    cash: equity - CFG.INFRA_TOTAL - machineCost,
    invRaw: [],          // {qty, unitCost, arrivalTurn, dt}  dt = 'FIRM'|'SPOT'
    invFg: [],           // {proc, qty, unitCost, dt, ya, ra, yActual}
    poOpen: [],          // {qty, unitPriceFixed, etaTurn, dt}
    ar: [],              // {amount, dueTurn}
    ap: [],              // {amount, dueTurn}

    lines,
    fa: { land: CFG.LAND, buildingNbv: CFG.BUILDING, machineCost, machineAccDep: 0 },
    debt: { principal: 0, limit: opt.debtLimit ?? 15_000_000 },
    equity,
    paidIn: equity,

    morale: 70, trust: opt.trust ?? 65, lossStreak: 0,
    myShare: opt.myShare ?? 0.10,
    effortQueue: [],     // 영업 투자 지연 큐

    market: { pm: CFG.P_M_BASE, phase: scenario[0].phase, hqRate: 0.065, scrapRate: CFG.SCRAP_RATE },
    scenario,
    hq: { cumMaterialTons: 0, cumHqMargin: 0, cumConsolidated: 0 },

    nasi: [],
    buildQueue: [],
    // 개업 시점의 고객 구성. 본사가 붙여준 일본계·구미계 자동차가 중심이다.
    custShare: { JP: 0.35, EU: 0.30, CN: 0.05, PART: 0.18, HOME: 0.12 },
    custQueue: [],
    cum: { sales: { C2C: 0, SLIT: 0, LEVEL: 0, BLANK: 0 }, revenue: 0, op: 0, np: 0 },
    hqSpotCredit: 0,
    buildings: 1,
    history: [],
    rng: opt.seed ?? 12345,
  };

  // 개업하기 전에 이미 몇 달치 내시를 받아둔다. 사장은 첫날부터 이 숫자를 보고 발주를 건다.
  for (let i = 0; i < CFG.NASI_LEAD; i++) st.nasi.push(makeNasi(st, st.turn + i, rng0));
  return st;
}

/* ---------- 파생값 ---------- */

/* ---------- 이번 달 슬리팅 배분 ----------
   코일센터에서만 나오는 결정이다. 원코일 폭은 정해져 있고, 고객이 달라는 폭은 제각각이다.
   몇 조각으로 어떻게 나누느냐에 따라 잔폭(트림)이 달라지고, 그게 그대로 수율이 된다.
   같은 판가, 같은 소재값인데 여기서 이익이 갈린다. */
const COIL_WIDTH = 1219;   // 열연 표준 폭 (mm)

function trimOptions(rng) {
  // 이번 달 고객이 달라는 폭 세 가지 [가정]
  const menu = [
    [340, 285, 190], [420, 300, 215], [365, 250, 160],
    [480, 320, 175], [395, 275, 230], [310, 265, 205],
  ];
  const w = menu[Math.floor(rng() * menu.length)];
  const combos = [];
  for (let a = 0; a <= 3; a++) for (let b = 0; b <= 4; b++) for (let c = 0; c <= 6; c++) {
    if (a + b + c === 0) continue;
    const used = a * w[0] + b * w[1] + c * w[2];
    if (used > COIL_WIDTH) continue;
    combos.push({ a, b, c, used, yield: used / COIL_WIDTH });
  }
  combos.sort((x, y) => y.yield - x.yield);
  // 제일 좋은 것, 중간, 나쁜 것 — 셋을 보여준다
  const best = combos[0];
  const mid = combos.find(c => c.yield < best.yield - 0.03) || combos[1];
  const bad = combos.find(c => c.yield < (mid ? mid.yield : 1) - 0.05) || combos[combos.length - 1];
  const pick = [best, mid, bad].filter(Boolean);
  return { widths: w, options: pick.map(o => ({
    cuts: [o.a, o.b, o.c], used: o.used, trim: COIL_WIDTH - o.used, yield: o.yield })) };
}

/* 사이클은 판마다 달라야 한다. 다만 네 국면은 반드시 한 번씩 온다 —
   호황만 네 번 오거나 불황만 네 번 오는 판은 교육이 안 되니까.
   순서와 길이만 섞는다. 그래서 "이번 판은 불황부터 시작했다"가 가능해진다. */
function makeScenario(rng) {
  const chapters = CFG.SCENARIO.slice();
  for (let i = chapters.length - 1; i > 0; i--) {           // 순서를 섞는다
    const j = Math.floor(rng() * (i + 1));
    [chapters[i], chapters[j]] = [chapters[j], chapters[i]];
  }
  const lens = chapters.map(() => 9 + Math.floor(rng() * 6));   // 한 국면 9~14개월
  const total = lens.reduce((a, b) => a + b, 0);
  const scale = CFG.TOTAL_TURNS / total;
  let acc = 0;
  return chapters.map((c, i) => {
    acc += Math.max(6, Math.round(lens[i] * scale));
    return { ...c, to: i === chapters.length - 1 ? CFG.TOTAL_TURNS : acc,
             label: `${i + 1}막 · ${c.name}` };
  });
}

// 지금이 어느 장면인가
function chapterOf(state, turn) {
  const sc = (state && state.scenario) || CFG.SCENARIO;
  for (const c of sc) if (turn <= c.to) return c;
  return sc[sc.length - 1];
}

// 몇 년 몇 월인가
function dateOf(turn) {
  const m0 = (CFG.START_YEAR * 12 + (CFG.START_MONTH - 1)) + (turn - 1);
  return { year: Math.floor(m0 / 12), month: (m0 % 12) + 1 };
}
function dateLabel(turn) {
  const d = dateOf(turn);
  return `${d.year}년 ${d.month}월`;
}

/* 재고를 나이별로 갈라 본다. 톤수만 보면 장기재고가 안 보인다.
   같은 18,000톤이라도 전부 한 달짜리인 것과 절반이 열 달짜리인 것은 다른 회사다. */
function inventoryAging(state) {
  const buckets = [
    { label: '1개월 이내', max: 1, qty: 0, cost: 0 },
    { label: '1~3개월',   max: 3, qty: 0, cost: 0 },
    { label: '3~6개월',   max: 6, qty: 0, cost: 0 },
    { label: '6개월 이상', max: 999, qty: 0, cost: 0 },
  ];
  for (const pool of [state.invRaw, state.invFg]) for (const l of pool) {
    const age = state.turn - (l.arrivalTurn ?? l.madeTurn ?? state.turn);
    const b = buckets.find(x => age <= x.max) || buckets[3];
    b.qty += l.qty; b.cost += l.qty * l.unitCost;
  }
  return buckets;
}

function capacityOf(state) {
  const cap = { SLIT: 0, LEVEL: 0, BLANK: 0 };
  for (const l of state.lines) cap[l.type] += l.cap;
  return cap;
}

// 기저 수요 [가정]: 초기 신뢰(65)·점유율(0.10)에서 2라인 캐파를 살짝 웃돌도록 잡는다.
// 이 값이 이 게임의 생명선이다. 너무 크면 증설이 무조건 정답이 되어 게임이 죽고(v3 §2-7),
// 너무 작으면 첫 판부터 재고가 쌓여 초보가 무조건 부도난다.
const DEMAND_BASE = { C2C: 3600, SLIT: 10600, LEVEL: 5300, TRAP: 1500, DIE: 1500 };

/* 설비가 없으면 그 수요는 애초에 우리 앞에 오지 않는다.
   블랭킹 라인이 없는 코일센터에 블랭킹 내시를 줄 리가 없다.
   이걸 구분하지 않으면 못 만드는 물량까지 "못 쳐낸 내시"로 잡혀 수행률이 눌린다.
   반대로 라인을 넣는 순간 없던 시장이 열린다 — 증설의 진짜 보상이 이것이다. */
function procAvailable(state, proc) {
  if (proc === 'C2C') return true;                       // 통코일 장사는 라인이 필요 없다
  if (proc === 'SLIT' || proc === 'LEVEL') return state.lines.some(l => l.type === proc);
  return state.lines.some(l => l.type === 'BLANK');      // TRAP / DIE
}

function marketDemand(state) {
  const p = CFG.PHASE[state.market.phase];
  const trustCoef = 0.5 + state.trust / 200;
  const out = {};
  for (const k of PROC_LIST) {
    out[k] = procAvailable(state, k)
      ? Math.round(DEMAND_BASE[k] * p.mkt * (state.myShare / 0.10) * trustCoef) : 0;
  }
  return out;
}

/* 내시(內示) — 자동차강판의 월별 확정 물량.
   실무자 확인: 자동차강판은 물량이 매번 안정적이고 내시량을 미리 받아서 예측이 쉽다.
   그래서 이 게임에서 자동차강판 수요는 몇 달 앞까지 플레이어에게 공개된다.
   3개월(미착 포함)이라는 얇은 재고로 회사가 돌아가는 진짜 이유가 이것이다 —
   물량의 70%가 예측이 아니라 확정이면 안전재고를 두껍게 들 필요가 없다.
   반대로 일반재 수요는 그 달이 되어야 알 수 있고, 남는 캐파는 그걸로 메워야 한다. */
/* 본사도 바보가 아니다. 코일센터가 못 소화할 물량을 내시로 주지 않는다.
   그래서 내시량은 그 시점의 캐파에 묶인다 — 이게 증설의 진짜 보상이다.
   라인을 늘리면 내시가 따라 늘고, 안 늘리면 시장이 아무리 커도 내시는 캐파에서 멈춘다.
   다만 이미 나간 내시는 그대로이므로, 증설 효과가 물량으로 돌아오는 데 몇 달이 걸린다. */
function nasiCeiling(state) {
  const c = capacityOf(state);
  const m = CFG.NASI_CAP_MULT;
  return {
    C2C:   Infinity,                                   // 통코일은 라인을 안 쓴다
    SLIT:  c.SLIT * m,
    LEVEL: c.LEVEL * m,
    TRAP:  (c.BLANK / 2) * m,
    DIE:   (c.BLANK / 2) * m,
  };
}

/* 고객 포트폴리오가 회사의 성격을 정한다.
   어느 고객군을 붙잡았느냐에 따라 물량도, 마진도, 흔들림도, 떼일 확률도 달라진다. */
function portfolio(state) {
  const sh = state.custShare || {};
  const out = { grow: 0, vol: 0, margin: 0, bad: 0, dso: 0, blank: 0 };
  let tot = 0;
  for (const k in CFG.CUSTOMERS) tot += sh[k] || 0;
  if (tot <= 0) return { grow: 1, vol: 0.08, margin: 0, bad: 0.003, dso: 3, blank: 0.15 };
  for (const k in CFG.CUSTOMERS) {
    const w = (sh[k] || 0) / tot, c = CFG.CUSTOMERS[k];
    out.grow += w * c.grow; out.vol += w * c.vol; out.margin += w * c.margin;
    out.bad += w * c.bad;   out.dso += w * c.dso; out.blank += w * c.blank;
  }
  return out;
}

function makeNasi(state, turn, rng) {
  const p = CFG.PHASE[state.market.phase];
  const trustCoef = 0.5 + state.trust / 200;
  const ceil = nasiCeiling(state);
  const pf = portfolio(state);
  const tons = {}, potential = {};
  // 블랭킹을 맡기는 고객이 많으면 블랭킹 수요가 커지고, 그만큼 슬리팅에서 빠진다
  const bshift = { SLIT: 1 - pf.blank * 0.5, LEVEL: 1 - pf.blank * 0.3,
                   C2C: 1, TRAP: 1 + pf.blank * 2.2, DIE: 1 + pf.blank * 2.2 };
  for (const k of PROC_LIST) {
    if (!procAvailable(state, k)) { tons[k] = 0; potential[k] = 0; continue; }
    const v = DEMAND_BASE[k] * CFG.PREMIUM_DEMAND_SHARE * p.mkt * pf.grow * bshift[k]
            * (state.myShare / 0.10) * trustCoef * (1 + pf.vol * gauss(rng));
    potential[k] = Math.max(0, Math.round(v));          // 본사가 주고 싶어 하는 양
    tons[k] = Math.max(0, Math.round(Math.min(v, ceil[k])));  // 우리 캐파가 받을 수 있는 양
  }
  // 둘의 차이가 곧 "지금 증설하면 더 받을 수 있는 물량"이다. 이게 증설 신호다.
  return { turn, tons, potential };
}

/* 유통향에는 "시장 수요"라는 게 따로 없다. 본사가 푼 물량이 곧 팔 수 있는 물량이고,
   그것도 전체 판매의 15%까지다. 그래서 여기서는 손에 쥔 일반재를 그대로 내놓고,
   실제 제동은 아래 commonBudget이 건다. */
function commonDemandNow(state) {
  const out = {};
  for (const k of PROC_LIST) {
    out[k] = state.invFg
      .filter(l => l.proc === k && l.gr !== 'PREMIUM')
      .reduce((a, l) => a + l.qty, 0);
  }
  return out;
}

function inventoryTons(state, dt) {
  const f = l => (dt ? l.dt === dt : true);
  return state.invRaw.filter(f).reduce((a, l) => a + l.qty, 0)
       + state.invFg.filter(f).reduce((a, l) => a + l.qty, 0);
}
function openPoTons(state, dt) {
  return state.poOpen.filter(p => !dt || p.dt === dt).reduce((a, p) => a + p.qty, 0);
}
// 현물 노출액: 소재가 하락 시 그대로 손실이 되는 금액 (v3 §3-2)
function spotExposure(state) {
  return (inventoryTons(state, 'SPOT') + openPoTons(state, 'SPOT')) * state.market.pm;
}

function effectiveYield(base, morale) {
  return base - Math.max(0, 70 - morale) * 0.0004;
}

/* ---------- FIFO 출고 ---------- */

// FIRM/SPOT × 일반재/고급강 조합별로 쪼개서 돌려준다.
// 태그가 여기서 끊기면 α 슬라이더가 죽고, 강종이 끊기면 고급강이 공짜가 된다.
const TAG_KEYS = ['FIRM|COMMON', 'FIRM|PREMIUM', 'SPOT|COMMON', 'SPOT|PREMIUM'];
function lotKey(lot) {
  const dt = lot.dt === 'SPOT' ? 'SPOT' : 'FIRM';
  const gr = lot.gr === 'PREMIUM' ? 'PREMIUM' : 'COMMON';
  return `${dt}|${gr}`;
}
function drawFifo(pool, qty, filter) {
  let need = qty, cost = 0, taken = 0;
  const byTag = {};
  for (const k of TAG_KEYS) byTag[k] = { qty: 0, cost: 0 };
  const lots = filter ? pool.filter(filter) : pool;
  for (const lot of lots) {
    if (need <= 1e-9) break;
    const t = Math.min(lot.qty, need);
    const c = t * lot.unitCost;
    cost += c; taken += t; lot.qty -= t; need -= t;
    const k = lotKey(lot);
    byTag[k].qty += t; byTag[k].cost += c;
  }
  for (let i = pool.length - 1; i >= 0; i--) if (pool[i].qty <= 1e-9) pool.splice(i, 1);
  return { taken, cost, byTag };
}

function mergeDraw(a, b) {
  const out = {};
  for (const k of TAG_KEYS) out[k] = { qty: a.byTag[k].qty + b.byTag[k].qty, cost: a.byTag[k].cost + b.byTag[k].cost };
  return out;
}

/* ============================================================
   턴 결산 (v3 §5-2, 19단계)
   decision = {
     buy:  { totalTon, alpha },
     run:  { SLIT, LEVEL, TRAP, DIE },       // 투입톤
     sell: { C2C, SLIT, LEVEL, TRAP, DIE },  // 판매 희망톤
     invest: { addLine, salesEffort, yieldProgram },
     options: { overtime, discount }
   }
   ============================================================ */

function resolveTurn(state, decision) {
  const s = structuredClone(state);
  const rng = makeRng(s.rng + s.turn * 7919);
  s.rng = Math.floor(rng() * 1e9);

  const d = {
    buy:     { totalTon: 0, alpha: 0.7, beta: 0, hqSpotTon: 0, ...(decision.buy || {}) },
    run:     { SLIT: 0, LEVEL: 0, TRAP: 0, DIE: 0, ...(decision.run || {}) },
    sell:    { C2C: 0, SLIT: 0, LEVEL: 0, TRAP: 0, DIE: 0, ...(decision.sell || {}) },
    invest:  { addLine: null, newBuilding: false, salesEffort: 0, yieldProgram: 0, ...(decision.invest || {}) },
    options: { overtime: false, discount: 0, trimYield: 0, custFocus: null, ...(decision.options || {}) },
  };

  const log = [];
  const flags = [];

  /* STEP 0·1은 턴 끝으로 옮겼다 (아래 STEP 20).
     사장은 이번 달 시황과 시세를 보고 결정한다. 결정한 뒤에 시황이 바뀌면
     "불황이니 본사 지시를 받겠다"고 누른 결재가 통상 달에 떨어지는 일이 생긴다.
     그건 게임이 아니라 함정이다. */
  const pm = s.market.pm;
  const scrapPrice = pm * s.market.scrapRate;
  const hqPerTon = pm * s.market.hqRate;

  /* STEP 2. 수요 갱신 — 영업 투자는 3턴 뒤에 효과 */
  {
    s.effortQueue = s.effortQueue.filter(e => { e.turnsLeft--; return true; });
    let gain = 0;
    s.effortQueue = s.effortQueue.filter(e => {
      if (e.turnsLeft <= 0) { gain += e.amount / 100_000 * CFG.SALES_EFFORT_GAIN; return false; }
      return true;
    });
    // 신뢰 효과는 비례식으로 건다. 절대값에 더하면 한두 턴 만에 시장이 사라진다.
    s.myShare *= 1 + (s.trust - 60) * CFG.TRUST_SHARE_COEF;
    s.myShare += gain;
    s.myShare = Math.max(0.02, Math.min(0.60, s.myShare));
    if (gain > 0) log.push(`영업 투자 효과가 나타났습니다. 점유율 +${(gain * 100).toFixed(2)}%p`);
  }

  /* STEP 2b. 고객군 영업 — 매달 한 고객군을 골라 공을 들인다. 결실은 석 달 뒤.
     손 놓은 고객군은 조금씩 빠지고, 성질 급한 고객군은 어느 달 갑자기 빠진다. */
  const crashes = [];
  {
    s.custShare = s.custShare || {};
    s.custQueue = (s.custQueue || []).filter(q => {
      if (q.turn > s.turn) return true;
      s.custShare[q.key] = (s.custShare[q.key] || 0) + CFG.CUST_GAIN;
      log.push(`${CFG.CUSTOMERS[q.key].name} 영업이 결실을 봤습니다. 거래 비중이 늘었습니다.`);
      return false;
    });
    const focus = d.options.custFocus;
    if (focus && CFG.CUSTOMERS[focus]) s.custQueue.push({ key: focus, turn: s.turn + CFG.SALES_EFFORT_LAG });
    for (const k in CFG.CUSTOMERS) {
      const pending = s.custQueue.some(q => q.key === k);
      if (k !== focus && !pending) s.custShare[k] = Math.max(0.01, (s.custShare[k] || 0) * (1 - CFG.CUST_DECAY));
    }
    for (const k in CFG.CUSTOMERS) {
      const c = CFG.CUSTOMERS[k];
      if (c.crash > 0 && (s.custShare[k] || 0) > 0.05 && rng() < c.crash) {
        s.custShare[k] *= 1 - CFG.CRASH_DROP;
        crashes.push(k);
        flags.push(`${c.name} 내시가 갑자기 빠졌습니다. 그 물량 보고 들여온 소재가 창고에 남습니다.`);
      }
    }
    let tot = 0;
    for (const k in CFG.CUSTOMERS) tot += s.custShare[k] || 0;
    for (const k in CFG.CUSTOMERS) s.custShare[k] = (s.custShare[k] || 0) / tot;
  }
  const pfNow = portfolio(s);
  /* 이번 달 자동차강판 물량은 이미 몇 달 전에 내시로 받아둔 확정 물량이다.
     일반재 물량은 지금 처음 드러난다. 남는 캐파를 그걸로 메울지가 이 게임의 결정이다. */
  let nasiNow = s.nasi.find(n => n.turn === s.turn);
  if (!nasiNow) nasiNow = makeNasi(s, s.turn, rng);
  s.nasi = s.nasi.filter(n => n.turn > s.turn);
  while (s.nasi.length < CFG.NASI_LEAD) {
    const t = s.turn + s.nasi.length + 1;
    s.nasi.push(makeNasi(s, t, rng));
  }
  const demandAuto = nasiNow.tons;
  const demandCommon = commonDemandNow(s);
  const demand = {};
  for (const k of PROC_LIST) demand[k] = demandAuto[k] + demandCommon[k];

  /* STEP 3. 설비 증설 */
  if (d.invest.addLine) {
    const t = d.invest.addLine;
    if (s.lines.length >= CFG.MAX_LINES && !d.invest.newBuilding) {
      flags.push('공장동은 3라인까지만 수용합니다. 4라인째는 신규 인프라 $16M이 필요합니다.');
    } else {
      // 4라인째는 공장동을 하나 더 지어야 한다. 설비값보다 건물값이 훨씬 크다.
      if (s.lines.length >= CFG.MAX_LINES) {
        s.cash -= CFG.INFRA_TOTAL;
        s.fa.land += CFG.LAND;
        s.fa.buildingNbv += CFG.BUILDING;
        s.buildings = (s.buildings || 1) + 1;
        log.push(`공장동을 한 동 더 지었습니다. 인프라 $${(CFG.INFRA_TOTAL / 1e6).toFixed(0)}M — 설비값의 8배입니다.`);
      }
      /* 설비는 돈을 낸다고 그 달에 도는 게 아니다. 발주·제작·선적·설치·시운전에 넉 달.
         호황을 보고 지르면 도착했을 때 호황이 끝나 있다. 이게 증설 타이밍의 전부다. */
      const capex = CFG.LINE[t].capex;
      s.cash -= capex;
      s.buildQueue = s.buildQueue || [];
      s.buildQueue.push({ type: t, capex, readyTurn: s.turn + CFG.INSTALL_TURNS });
      log.push(`${CFG.LINE[t].label} 1기를 발주했습니다. $${(capex / 1e6).toFixed(1)}M · ` +
               `${CFG.INSTALL_TURNS}개월 뒤인 ${s.turn + CFG.INSTALL_TURNS}월부터 돕니다.`);
    }
  }
  if (d.invest.salesEffort > 0) {
    s.cash -= d.invest.salesEffort;
    s.effortQueue.push({ amount: d.invest.salesEffort, turnsLeft: CFG.SALES_EFFORT_LAG });
  }
  let yieldBonus = 0;
  if (d.invest.yieldProgram > 0) {
    s.cash -= d.invest.yieldProgram;
    yieldBonus = Math.min(0.02, d.invest.yieldProgram / 100_000 * 0.004);
  }
  // 품질·설비 상태가 수율을 밀고 당긴다 (world.js)
  yieldBonus += (s.mods && s.mods.yieldAdj) || 0;

  /* STEP 4. 발주 입고 (입고와 지급은 분리 — 90일 시차가 이 게임의 긴장감) */
  {
    const arrived = s.poOpen.filter(p => p.etaTurn <= s.turn);
    s.poOpen = s.poOpen.filter(p => p.etaTurn > s.turn);
    for (const p of arrived) {
      s.invRaw.push({ qty: p.qty, unitCost: p.unitPriceFixed, arrivalTurn: s.turn, dt: p.dt, gr: p.gr || 'COMMON' });
      s.ap.push({ amount: p.qty * p.unitPriceFixed, dueTurn: s.turn + CFG.DPO_TURNS });
    }
    if (arrived.length) log.push(`소재 ${Math.round(arrived.reduce((a, p) => a + p.qty, 0)).toLocaleString()}톤이 입고되었습니다.`);
  }

  /* STEP 5. 신규 발주 (가격은 발주 시점 확정 — 미착분도 가격 리스크 보유)
     고급강은 소재가가 비싸고 제조공기가 2개월 더 걸린다. 주문하는 순간 5개월을 기다려야 한다. */
  const cap0 = capacityOf(s);
  let lcFee = 0, hqSpotOffer = 0;
  if (d.buy.totalTon > 0) {
    const beta = Math.max(0, Math.min(1, d.buy.beta || 0));
    const alpha = Math.max(0, Math.min(1, d.buy.alpha));
    for (const gr of ['COMMON', 'PREMIUM']) {
      const g = CFG.GRADE[gr];
      const gTon = d.buy.totalTon * (gr === 'PREMIUM' ? beta : 1 - beta);
      if (gTon <= 0.01) continue;
      const price = pm * g.pmMult;
      // 자동차강판은 고객 전용 규격이라 현물로 쟁여둘 수가 없다. 전량 실수요다.
      // 그래서 α(실수요 비율)는 일반재 안에서만 의미를 갖는다.
      const aEff = gr === 'PREMIUM' ? 1 : alpha;
      for (const [qty, dt] of [[gTon * aEff, 'FIRM'], [gTon * (1 - aEff), 'SPOT']]) {
        if (qty <= 0.01) continue;
        s.poOpen.push({
          qty, unitPriceFixed: price, dt, gr,
          etaTurn: s.turn + CFG.LEAD_TURNS + g.leadAdd,
        });
      }
      lcFee += gTon * price * CFG.LC_FEE_RATE;
    }
  }

  /* STEP 5b. 불황기 본사 지시 스팟 — 싸게 주는 대신 재고 리스크는 전부 이쪽이 진다 */
  let hqSpotTon = 0;
  if (CFG.HQ_SPOT.phases.includes(s.market.phase)) {
    const capTon = (cap0.SLIT + cap0.LEVEL + cap0.BLANK) * CFG.HQ_SPOT.capShareOfCap;
    hqSpotOffer = capTon;
    hqSpotTon = Math.max(0, Math.min(d.buy.hqSpotTon || 0, capTon));
    if (hqSpotTon > 0.01) {
      const price = pm * (1 - CFG.HQ_SPOT.discount);
      s.poOpen.push({ qty: hqSpotTon, unitPriceFixed: price, dt: 'SPOT', gr: 'COMMON',
                      src: 'HQ', etaTurn: s.turn + CFG.LEAD_TURNS });
      lcFee += hqSpotTon * price * CFG.LC_FEE_RATE;
      s.trust += 1;
      s.hqSpotCredit = (s.hqSpotCredit || 0) + hqSpotTon;   // 본사가 민 물량은 팔 권한도 같이 준다
      log.push(`본사 지시 유통향 스팟 ${Math.round(hqSpotTon).toLocaleString()}톤을 시세보다 ${(CFG.HQ_SPOT.discount * 100).toFixed(0)}% 싸게 받았습니다.`);
    } else if (hqSpotOffer > 0) {
      s.trust -= CFG.HQ_SPOT.refuseTrustCost;
      flags.push('본사 가동 물량 지시를 받지 않았습니다. 본사와의 관계가 상합니다.');
    }
  }

  /* STEP 5b. 창고 정체 — 재고가 야드를 넘치면 동선이 막혀 가동이 떨어지고 외부창고비가 붙는다 */
  const stockNow = inventoryTons(s);
  const whCap = CFG.WAREHOUSE_CAP_BASE;
  const overTons = Math.max(0, stockNow - whCap);
  let congestionPenalty = 0;
  if (overTons > 0) {
    congestionPenalty = CFG.WAREHOUSE_OVER_CAP_PENALTY;
    flags.push(`재고가 야드 한도를 ${Math.round(overTons).toLocaleString()}톤 넘겼습니다. 동선이 막혀 가동이 떨어집니다.`);
  }

  /* STEP 6. 캐파 검증 */
  const cap = capacityOf(s);
  // s.mods는 world.js가 매달 채운다 — 설비 상태·고장이 캐파를, 품질이 수율을 깎는다
  const mods = s.mods || {};
  const mult = (d.options.overtime ? CFG.OT_CAP_MULT : 1) * (1 - congestionPenalty) * (mods.capMult ?? 1);
  const used = { SLIT: d.run.SLIT, LEVEL: d.run.LEVEL, BLANK: d.run.TRAP + d.run.DIE };
  for (const k of ['SLIT', 'LEVEL', 'BLANK']) {
    const limit = cap[k] * mult;
    if (used[k] > limit + 1e-6) {
      const ratio = limit / used[k];
      if (k === 'BLANK') { d.run.TRAP *= ratio; d.run.DIE *= ratio; }
      else d.run[k] *= ratio;
      flags.push(`${CFG.LINE[k].label} 캐파를 넘겨 가동을 ${Math.round((1 - ratio) * 100)}% 줄였습니다.`);
    }
  }
  if (d.options.overtime) s.morale -= 5;

  /* STEP 7. 소재 출고 (FIFO, FIRM/SPOT 태그 승계) */
  const needTon = d.run.SLIT + d.run.LEVEL + d.run.TRAP + d.run.DIE + d.sell.C2C;
  const rawAvail = s.invRaw.reduce((a, l) => a + l.qty, 0);
  let shortRatio = 1;
  if (needTon > rawAvail + 1e-6) {
    shortRatio = rawAvail / Math.max(needTon, 1e-9);
    for (const k of ['SLIT', 'LEVEL', 'TRAP', 'DIE']) d.run[k] *= shortRatio;
    d.sell.C2C *= shortRatio;
    flags.push(rawAvail < 1 && s.turn <= CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd
      ? '첫 배가 아직 도착하지 않았습니다. 라인은 아직 돌지 않습니다.'
      : '소재가 부족해 가동을 줄였습니다.');
  }

  /* STEP 8. 생산 */
  let scrapTon = 0;
  const produced = {};
  for (const proc of ['SLIT', 'LEVEL', 'TRAP', 'DIE']) {
    const input = d.run[proc];
    if (input <= 0.01) continue;
    /* 슬리팅은 이번 달 배분이 수율을 정한다. 상정 수율(고객과 약속한 98%)보다
       잘 자르면 그 차익이 우리 몫이고, 못 자르면 우리가 문다. */
    const yBase = (proc === 'SLIT' && d.options.trimYield)
      ? d.options.trimYield + yieldBonus
      : CFG.YIELD[proc] + yieldBonus;
    const yEff = Math.min(0.995, effectiveYield(yBase, s.morale));
    // 생산은 수주 잔고에 맞춰 짠다. 창고 앞줄에 있는 코일부터 무작정 태우면
    // 고급강이 2개월 늦게 들어오는 탓에 어떤 달은 고급강만, 어떤 달은 일반재만 나온다.
    // 생산 배분은 창고에 있는 소재의 강종 구성을 따른다
    const rawP = s.invRaw.filter(l => l.gr === 'PREMIUM').reduce((a, l) => a + l.qty, 0);
    const rawAll = s.invRaw.reduce((a, l) => a + l.qty, 0);
    const autoShare = rawAll > 0 ? rawP / rawAll : 1;
    const byTag = mergeDraw(
      drawFifo(s.invRaw, input * (1 - autoShare), l => l.gr !== 'PREMIUM'),
      drawFifo(s.invRaw, input * autoShare, l => l.gr === 'PREMIUM'));
    let taken = TAG_KEYS.reduce((a, k) => a + byTag[k].qty, 0);
    if (taken < input - 1e-6) {   // 한쪽 강종이 바닥나면 남은 강종으로 채운다
      const fill = drawFifo(s.invRaw, input - taken);
      for (const k of TAG_KEYS) { byTag[k].qty += fill.byTag[k].qty; byTag[k].cost += fill.byTag[k].cost; }
      taken = TAG_KEYS.reduce((a, k) => a + byTag[k].qty, 0);
    }
    if (taken <= 1e-9) continue;
    scrapTon += taken * (1 - yEff);
    // 태그·강종별로 제품 lot을 따로 만든다. 섞으면 가격 리스크와 강종 마진 귀속이 틀어진다.
    for (const k of TAG_KEYS) {
      const b = byTag[k];
      if (b.qty <= 1e-9) continue;
      const [tag, gr] = k.split('|');
      const out = b.qty * yEff;
      s.invFg.push({
        proc, qty: out, unitCost: b.cost / out, dt: tag, gr, madeTurn: s.turn,
        ya: CFG.YIELD[proc], ra: s.market.scrapRate, yActual: yEff,
      });
    }
    produced[proc] = (produced[proc] || 0) + taken * yEff;
  }
  /* STEP 8b. 코일 투 코일 (라인 미사용, 수율 100%) */
  if (d.sell.C2C > 0.01) {
    const { taken, byTag } = drawFifo(s.invRaw, d.sell.C2C);
    if (taken > 1e-9) {
      for (const k of TAG_KEYS) {
        const b = byTag[k];
        if (b.qty <= 1e-9) continue;
        const [tag, gr] = k.split('|');
        s.invFg.push({ proc: 'C2C', qty: b.qty, unitCost: b.cost / b.qty, dt: tag, gr, madeTurn: s.turn, ya: 1, ra: 0, yActual: 1 });
      }
      produced.C2C = taken;
    }
  }

  /* STEP 9~10. 판가 산출 및 판매 */
  let revenue = 0, cogs = 0, yieldGainTotal = 0, shippedTotal = 0;
  const shortageEvents = [];
  const shipped = {};
  // 본사가 코일센터를 볼 때 제일 먼저 보는 숫자: 내시 물량을 얼마나 쳐냈는가
  let autoShippedTurn = 0, commonShippedTurn = 0;
  const autoDemandTurn = PROC_LIST.reduce((a, k) => a + demandAuto[k], 0);

  /* 유통향 15% 상한을 걸려면 이번 달 실수요 출하량을 먼저 알아야 한다.
     그래서 한 번 훑어서 실수요분을 잡고, 거기에 비례해 유통 예산을 배분한다. */
  const plan = {};
  let autoPlan = 0;
  for (const proc of PROC_LIST) {
    const wantAll = Math.min(d.sell[proc] || 0, demand[proc] || 0);
    const prAvail = s.invFg.filter(l => l.proc === proc && l.gr === 'PREMIUM')
                           .reduce((a, l) => a + l.qty, 0);
    const wantP = Math.max(0, Math.min(demandAuto[proc], prAvail, wantAll));
    plan[proc] = { wantAll, prAvail, wantP };
    autoPlan += wantP;
  }
  const capShare = CFG.COMMON_SALES_CAP;
  // 본사가 푼 만큼만, 그것도 전체 판매의 15%까지만 유통으로 나간다
  const commonBudget = Math.min(s.hqSpotCredit || 0, autoPlan * capShare / (1 - capShare));
  const commonDemandTotal = PROC_LIST.reduce((a, k) => a + demandCommon[k], 0);

  for (const proc of PROC_LIST) {
    const wantAll = plan[proc].wantAll;
    if (wantAll <= 0.01) { shipped[proc] = 0; continue; }

    /* 고급강 수요는 따로 있고, 없는 물건은 팔 수 없다.
       고급강을 안 들이면 그 22%는 그냥 경쟁사로 간다 — 약속을 깬 게 아니니 결품이 아니다.
       대신 고급강을 수요 이상으로 사 오면 창고에 눕고, 5개월치 자금이 거기 묶인다.
       결품 페널티는 일반재 쪽에서만 문다. */
    /* 내시는 약속이다. 확정 물량을 먼저 채우고, 남는 것만 유통으로 돌린다.
       비례 배분을 하면 자동차 고객에게 갈 물건이 유통으로 새어 나가고,
       사장이 "본사 물량부터 채우겠다"는 당연한 선택을 할 수 없게 된다.
       그리고 유통으로 돌릴 수 있는 양은 본사 정책상 전체의 15%까지다. */
    const wantP = plan[proc].wantP;
    const share = commonDemandTotal > 0 ? demandCommon[proc] / commonDemandTotal : 0;
    const wantC = Math.min(demandCommon[proc], wantAll - wantP, commonBudget * share);
    const wantBy = { PREMIUM: wantP, COMMON: Math.max(0, wantC) };
    const want = wantBy.PREMIUM + wantBy.COMMON;
    if (want <= 0.01) { shipped[proc] = 0; continue; }

    let lineRevenue = 0, lineCogs = 0, ship = 0;
    for (const gr of ['PREMIUM', 'COMMON']) {
      const pool = s.invFg.filter(l => l.proc === proc && (l.gr || 'COMMON') === gr);
      const avail = pool.reduce((a, l) => a + l.qty, 0);
      let need = Math.min(wantBy[gr], avail);
      if (need <= 1e-9) continue;
      ship += need;

      // lot을 하나씩 출고하며 태그별로 판가를 따로 매긴다.
      // FIRM은 매입가 연동이라 스프레드가 고정된다. SPOT은 당월 시세로 팔되 마진 자체가 얇다.
      if (gr === 'PREMIUM') autoShippedTurn += need; else commonShippedTurn += need;
      for (const lot of pool) {
        if (need <= 1e-9) break;
        const t = Math.min(lot.qty, need);
        const isSpot = lot.dt === 'SPOT';
        const pmRef = isSpot ? pm * CFG.GRADE[gr].pmMult : lot.unitCost * CFG.YIELD[proc];
        const price = unitPrice(proc, pmRef, lot.ya, lot.ra, {
          discount: d.options.discount - pfNow.margin,   // 고객 구성이 판가를 올리고 내린다
          gradeMargin: CFG.GRADE[gr].marginAdd,
          spotAdj: isSpot ? CFG.SPOT_MARGIN_ADJ : 0,
        });
        lineRevenue += t * price;
        lineCogs += t * lot.unitCost;
        if (proc !== 'C2C') yieldGainTotal += yieldGainPerTon(pmRef, lot.ra, lot.ya, lot.yActual) * t;
        lot.qty -= t; need -= t;
      }
    }
    for (let i = s.invFg.length - 1; i >= 0; i--) if (s.invFg[i].qty <= 1e-9) s.invFg.splice(i, 1);
    if (ship <= 1e-9) { shipped[proc] = 0; continue; }

    revenue += lineRevenue;
    cogs += lineCogs;
    s.ar.push({ amount: lineRevenue, dueTurn: s.turn + Math.max(1, Math.round(pfNow.dso)) });
    shipped[proc] = ship;
    shippedTotal += ship;

    // 결품은 신뢰를 깎는 정도가 아니다. 실무자 확인: 결품을 내면 그 고객은 영영 끝이다.
    // 그래서 점유율을 영구히 깎는다. 이게 3개월 안전재고를 드는 이유다.
    const shortRate = (want - ship) / Math.max(want, 1);
    if (shortRate > 0.05 && s.turn > CFG.LEAD_TURNS) {
      const lost = CFG.SHORTAGE_SHARE_LOSS * Math.min(1, shortRate * 2);
      s.myShare *= 1 - lost;
      // 잃은 고객은 점유율에서 이미 영구히 뺐다. 평판 타격까지 영구로 두면 이중 계산이다.
      s.trust -= Math.min(3, shortRate * 8);
      shortageEvents.push(proc);
      flags.push(`${proc} 결품 ${Math.round(want - ship)}톤. 그 고객은 돌아오지 않습니다. 점유율 ${(lost * 100).toFixed(1)}% 영구 상실.`);
    }
  }

  // 판 만큼 크레딧에서 깎는다. 본사가 푼 물량을 다 소진하면 유통 판매도 끝난다
  s.hqSpotCredit = Math.max(0, (s.hqSpotCredit || 0) - commonShippedTurn);
  const commonShareOfSales = shippedTotal > 0 ? commonShippedTurn / shippedTotal : 0;

  /* STEP 12. 스크랩 매각 */
  const scrapRevenue = scrapTon * scrapPrice;
  if (scrapRevenue > 0) s.ar.push({ amount: scrapRevenue, dueTurn: s.turn + 1 });

  /* STEP 12b. 재고 열화 — 오래 안고 있으면 녹·백청·스크래치로 상품성을 잃는다.
     현물을 "가격 오를 때까지 들고 있자"는 전략의 진짜 대가가 여기 있다. */
  let degradeLoss = 0, degradeTon = 0;
  for (const pool of [s.invRaw, s.invFg]) {
    for (const lot of pool) {
      const age = s.turn - (lot.arrivalTurn ?? lot.madeTurn ?? s.turn);
      if (age <= CFG.DEGRADE_FREE_TURNS) continue;
      const lossRate = age >= CFG.DEGRADE_DEAD_TURNS
        ? 1.0                                   // 불용재고. 스크랩으로 처분
        : CFG.DEGRADE_RATE * (age - CFG.DEGRADE_FREE_TURNS);
      const lost = lot.qty * Math.min(1, lossRate);
      if (lost <= 1e-9) continue;
      degradeTon += lost;
      degradeLoss += lost * Math.max(0, lot.unitCost - scrapPrice); // 스크랩값은 건진다
      lot.qty -= lost;
    }
  }
  for (const pool of [s.invRaw, s.invFg])
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].qty <= 1e-9) pool.splice(i, 1);
  if (degradeTon > 1) {
    s.ar.push({ amount: degradeTon * scrapPrice, dueTurn: s.turn + 1 });
    log.push(`오래된 재고 ${Math.round(degradeTon).toLocaleString()}톤이 상품성을 잃어 스크랩 처분했습니다. 손실 $${Math.round(degradeLoss).toLocaleString()}`);
  }

  /* STEP 12c. 현물 사이즈 미스매치 — 물건은 멀쩡한데 그 폭·두께가 아무에게도 안 맞는 경우.
     실무자 확인: "아예 그 사이즈가 안 팔려서 반값 이하로 팔아야 하는 리스크".
     실수요(FIRM)는 고객이 정해져 있으니 이 리스크가 없다. 현물만 문다. */
  let dumpLoss = 0, dumpTon = 0;
  for (const pool of [s.invRaw, s.invFg]) {
    for (const lot of pool) {
      if (lot.dt !== 'SPOT' || lot.qty <= 1e-9) continue;
      const age = s.turn - (lot.arrivalTurn ?? lot.madeTurn ?? s.turn);
      if (age < CFG.DUMP_AGE_TURNS) continue;
      if (rng() >= CFG.DUMP_PROB) continue;
      const recover = lot.unitCost * CFG.DUMP_PRICE_RATE;
      dumpTon += lot.qty;
      dumpLoss += lot.qty * (lot.unitCost - recover);
      s.ar.push({ amount: lot.qty * recover, dueTurn: s.turn + 1 });
      lot.qty = 0;
    }
  }
  for (const pool of [s.invRaw, s.invFg])
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].qty <= 1e-9) pool.splice(i, 1);
  if (dumpTon > 1) {
    flags.push(`현물 ${Math.round(dumpTon).toLocaleString()}톤이 사이즈가 안 맞아 반값 이하로 넘겼습니다. 손실 $${Math.round(dumpLoss).toLocaleString()}`);
  }

  /* STEP 13. 재고 저가법 평가 — SPOT에만 적용. FIRM은 절대 인식하지 않음 */
  let valuationLoss = 0;
  for (const lot of s.invRaw) {
    if (lot.dt !== 'SPOT') continue;
    if (pm < lot.unitCost) { valuationLoss += lot.qty * (lot.unitCost - pm); lot.unitCost = pm; }
  }
  for (const lot of s.invFg) {
    if (lot.dt !== 'SPOT') continue;
    const mark = pm / CFG.YIELD[lot.proc];
    if (mark < lot.unitCost) { valuationLoss += lot.qty * (lot.unitCost - mark); lot.unitCost = mark; }
  }
  // 미착 발주도 노출된다. 발주 시점에 가격이 확정되므로(A-6), 배가 오기 전에 시세가 빠지면
  // 그 손실은 이미 우리 것이다. 이걸 빼면 현물이 프리미엄만 받는 무적 전략이 된다.
  for (const po of s.poOpen) {
    if (po.dt !== 'SPOT') continue;
    if (pm < po.unitPriceFixed) {
      valuationLoss += po.qty * (po.unitPriceFixed - pm);
      po.unitPriceFixed = pm;
    }
  }
  if (valuationLoss > 0) log.push(`현물 재고에서 평가손 $${Math.round(valuationLoss).toLocaleString()}이 발생했습니다.`);

  /* STEP 14. 비용 */
  const extraLines = Math.max(0, s.lines.length - 2);
  const fixedCost = CFG.FC_BASE + extraLines * CFG.FC_PER_EXTRA_LINE + (d.options.overtime ? CFG.OT_COST : 0);
  let varCost = 0;
  for (const proc of ['SLIT', 'LEVEL', 'TRAP', 'DIE']) varCost += d.run[proc] * CFG.VAR_COST[proc];
  varCost += (produced.C2C || 0) * CFG.VAR_COST.C2C;
  // 재고 보유 비용: 보관·보험·핸들링과 초과분 외부창고비만 여기서 받는다.
  // 묶인 자본의 금리 부담은 아래 interest(차입 이자)가 이미 받고 있다. 여기서 또 받으면 이중이다.
  const stockEnd = inventoryTons(s);
  const carryCost = stockEnd * CFG.CARRY_COST_PER_TON
                  + overTons * CFG.WAREHOUSE_OVER_COST;
  varCost += carryCost;
  const depreciation = (s.buildings || 1) * CFG.BUILDING / CFG.BUILDING_LIFE_M + s.fa.machineCost / CFG.MACHINE_LIFE_M;
  const interest = s.debt.principal * CFG.DEBT_RATE_MONTHLY;

  /* STEP 15. 채권 회수 */
  let cashIn = 0, badDebt = 0;
  const arKeep = [];
  for (const a of s.ar) {
    if (a.dueTurn > s.turn) { arKeep.push(a); continue; }
    const r = rng();
    // 떼일 확률은 어떤 고객을 갖췄느냐로 정해진다. 중국 전기차 비중이 크면 여기서 맞는다.
    if (r < pfNow.bad) { badDebt += a.amount; s.trust -= 2; }
    else if (r < pfNow.bad + CFG.DELAY_RATE) { a.dueTurn += 1; a.delayed = true; arKeep.push(a); }
    else cashIn += a.amount;
  }
  s.ar = arKeep;
  if (badDebt > 0) log.push(`대손이 발생했습니다. $${Math.round(badDebt).toLocaleString()}`);

  /* STEP 16. 채무 지급 */
  let cashOut = 0;
  const apKeep = [];
  for (const p of s.ap) { if (p.dueTurn <= s.turn) cashOut += p.amount; else apKeep.push(p); }
  s.ap = apKeep;

  /* STEP 16b. 차입 한도는 담보를 따라 움직인다.
     운전자본 대출은 자본금이 아니라 재고와 매출채권에 붙는다.
     그래서 장사가 커지면 한도도 같이 커지고, 재고를 털면 한도도 같이 줄어든다.
     불황에 재고가 빠지는 순간 은행 한도까지 같이 빠지는 게 진짜 무서운 지점이다. */
  {
    const base = inventoryTons(s) * pm + s.ar.reduce((a, x) => a + x.amount, 0);
    s.debt.limit = Math.max(s.paidIn * 0.4, base * CFG.BORROW_BASE_RATE);
  }

  /* STEP 17. 현금 정산 및 부도 판정 */
  s.cash += cashIn - cashOut - fixedCost - varCost - interest - lcFee;
  if (s.cash < 0) {
    const need = -s.cash;
    if (s.debt.principal + need <= s.debt.limit) {
      s.debt.principal += need; s.cash = 0;
      flags.push(`자금이 모자라 $${Math.round(need).toLocaleString()}을 차입했습니다.`);
    } else {
      s.over = true; s.overReason = 'INSOLVENT';
    }
  }

  /* STEP 18. 재무제표 */
  const gp = revenue + scrapRevenue - cogs - valuationLoss - degradeLoss - dumpLoss;
  const ebitda = gp - fixedCost - varCost;
  const op = ebitda - depreciation;
  const np = op - interest - badDebt;
  s.fa.buildingNbv = Math.max(0, s.fa.buildingNbv - (s.buildings || 1) * CFG.BUILDING / CFG.BUILDING_LIFE_M);
  s.fa.machineAccDep += s.fa.machineCost / CFG.MACHINE_LIFE_M;
  s.equity += np;

  /* STEP 19. 본사 연결 기여
     모사가 공급할 수 있는 건 자동차강판뿐이다. 일반재는 가격 경쟁이 심해 모사가 못 맞추고,
     코일센터는 3자 소재를 사서 마진만 붙이면 된다 — 그 톤수는 본사에 한 푼도 안 간다.
     코일센터 단독 손익과 본사 실적이 갈라지는 자리가 정확히 여기다. */
  const materialTons = d.buy.totalTon * Math.max(0, Math.min(1, d.buy.beta || 0)) + hqSpotTon;
  const hqMargin = hqPerTon * materialTons;
  const consolidated = op + hqMargin;
  s.hq.cumMaterialTons += materialTons;
  s.hq.cumHqMargin += hqMargin;
  s.hq.cumConsolidated += consolidated;
  // 램프업 구간은 분모에서 뺀다. 배가 아직 안 왔는데 못 쳤다고 탓할 수는 없다.
  if (s.turn > CFG.LEAD_TURNS + CFG.GRADE.PREMIUM.leadAdd) s.hq.cumAutoDemand = (s.hq.cumAutoDemand || 0) + autoDemandTurn;
  s.hq.cumAutoShipped = (s.hq.cumAutoShipped || 0) + autoShippedTurn;

  /* 비재무 갱신 — 설계서는 "3턴 연속 적자"일 때만 사기를 깎는다. 회복 경로도 둔다. */
  s.lossStreak = op < 0 ? (s.lossStreak || 0) + 1 : 0;
  if (s.lossStreak >= 3) s.morale -= 3;
  else if (op > 0) s.morale += 1;
  // 약속을 지킨 달은 평판이 회복된다. 바닥에 있을수록 빨리 올라온다 (평균 회귀).
  if (shippedTotal > 0 && shortageEvents.length === 0) s.trust += s.trust < 60 ? 2 : 1;
  s.morale = Math.max(0, Math.min(100, s.morale));
  s.trust = Math.max(0, Math.min(100, s.trust));
  if (s.morale < 30) { flags.push('직원들이 떠나고 있습니다.'); }

  // 경영지표 — 단월과 누계
  const sales = { C2C: shipped.C2C || 0, SLIT: shipped.SLIT || 0, LEVEL: shipped.LEVEL || 0,
                  BLANK: (shipped.TRAP || 0) + (shipped.DIE || 0) };
  s.cum = s.cum || { sales: { C2C: 0, SLIT: 0, LEVEL: 0, BLANK: 0 }, revenue: 0, op: 0, np: 0 };
  for (const k in sales) s.cum.sales[k] += sales[k];
  s.cum.revenue += revenue; s.cum.op += op; s.cum.np += np;
  const aging = inventoryAging(s);
  const invValue = aging.reduce((a, b) => a + b.cost, 0);
  const arTotal = s.ar.reduce((a, x) => a + x.amount, 0);
  const apTotal = s.ap.reduce((a, x) => a + x.amount, 0);
  const bs = {
    invTons: aging.reduce((a, b) => a + b.qty, 0), invValue,
    longTons: aging[2].qty + aging[3].qty, longValue: aging[2].cost + aging[3].cost,   // 석 달 넘은 재고
    ar: arTotal, arDelayed: s.ar.filter(a => a.delayed).reduce((a, x) => a + x.amount, 0),
    ap: apTotal, debt: s.debt.principal, cash: s.cash,
    nwc: arTotal + invValue - apTotal,
  };

  const report = {
    turn: s.turn, date: dateLabel(s.turn), phase: s.market.phase, pm, hqPerTon,
    sales, bs, cum: structuredClone(s.cum), custShare: { ...s.custShare }, crashes,
    revenue, gp, ebitda, op, np, hqMargin, consolidated,
    fixedCost, varCost, depreciation, interest, valuationLoss, badDebt,
    scrapTon, scrapRevenue, yieldGain: yieldGainTotal,
    degradeLoss, degradeTon, dumpLoss, dumpTon, carryCost, overTons, shortageEvents,
    hqSpotOffer, hqSpotTon,
    shipped, produced, demand, demandAuto, demandCommon, nasi: s.nasi.map(n => ({ turn: n.turn, tons: { ...n.tons }, potential: { ...(n.potential || n.tons) } })), nasiPotential: nasiNow.potential || nasiNow.tons, commonShareOfSales, hqSpotCredit: s.hqSpotCredit, cashIn, cashOut,
    spotExposure: spotExposure(s),
    // 실제로 돌린 양 ÷ 명목 캐파. world.js가 설비 마모와 과부하를 이걸로 계산한다
    util: (d.run.SLIT + d.run.LEVEL + d.run.TRAP + d.run.DIE) / Math.max(1, cap.SLIT + cap.LEVEL + cap.BLANK),
    shortRatio,
    materialTons,
    invTons: inventoryTons(s),
    log, flags,
  };
  s.history.push(report);

  /* STEP 20. 다음 달 시황과 시세를 정한다.
     이 상태로 화면이 그려지고, 사장은 그걸 보고 다음 결재를 한다. */
  {
    const nextTurn = s.turn + 1;
    const cur = chapterOf(s, s.turn), nxt = chapterOf(s, nextTurn);
    if (nxt.phase !== s.market.phase) {
      report.phaseChange = `${nxt.label}. ${nxt.brief}`;
    } else if (nxt.label !== cur.label) {
      report.phaseChange = `${nxt.label}. ${nxt.brief}`;
    }
    s.market.phase = nxt.phase;
    const ph = CFG.PHASE[nxt.phase];
    s.market.hqRate = ph.hqLo + rng() * (ph.hqHi - ph.hqLo);

    let np = s.market.pm * (1 + (nxt.drift ?? ph.drift) + CFG.PM_SIGMA * gauss(rng));
    if (rng() < CFG.PM_JUMP_PROB) np *= 1 + (rng() < 0.5 ? -CFG.PM_JUMP_SIZE : CFG.PM_JUMP_SIZE);
    s.market.pm = Math.max(400, Math.min(1400, np));   // 750 기준 로그 대칭
    s.market.scrapRate = CFG.SCRAP_RATE;
  }

  /* STEP 21. 설치 중인 설비가 다 됐는가.
     설비는 주문한다고 바로 돌지 않는다. 넉 달 걸린다.
     호황을 보고 지르면 도착했을 때 호황이 끝나 있다. */
  s.buildQueue = (s.buildQueue || []).filter(b => {
    if (b.readyTurn > s.turn + 1) return true;
    s.lines.push({ id: `L${s.lines.length + 1}`, type: b.type,
                   cap: CFG.LINE[b.type].cap, capex: b.capex });
    s.fa.machineCost += b.capex;
    report.lineReady = `${CFG.LINE[b.type].label} 설치가 끝났습니다. 다음 달부터 돕니다.`;
    return false;
  });

  s.turn += 1;
  if (s.turn > CFG.TOTAL_TURNS && !s.over) { s.over = true; s.overReason = 'COMPLETE'; }
  if (s.equity < 0 && !s.over) { s.over = true; s.overReason = 'CAPITAL_ERODED'; }

  return { state: s, report };
}

/* ---------- 등급 판정 (v3 §8-7) ---------- */

/* 본사는 코일센터를 이 순서로 본다 (실무자 확인):
     1순위 — 본사 정책을 얼마나 따랐는가. 즉 본사가 최우선시하는 자동차강판 실수요 판매를
             얼마나 수행해서 본사 판매량과 이익에 기여했는가.
     2순위 — 그러고 나서 법인 자체의 이익과 건전성.
   그래서 이 등급은 가중합이 아니라 사전식(lexicographic)이다. 수행률이 먼저 읽히고,
   법인 손익은 같은 수행률 안에서만 등급을 가른다.
   "본사는 이겼습니다"가 "혼자만 이겼습니다"보다 위에 있는 이유가 이것이다. */
function grade(state, target = 45_000_000) {
  const soloOp = state.history.reduce((a, h) => a + h.op, 0);
  const consol = state.hq.cumConsolidated;
  const dem = state.hq.cumAutoDemand || 0;
  const fulfil = dem > 0 ? (state.hq.cumAutoShipped || 0) / dem : 0;   // 실수요 수행률
  const survived = state.overReason === 'COMPLETE';
  const capitalOk = state.equity > 0;
  const soloOk = soloOp >= 0;
  const base = { soloOp, consol, fulfil, consolTarget: target };

  if (!survived || !capitalOk) {
    return { ...base, grade: 'F', title: '버티지 못했습니다',
      desc: survived ? '자본이 잠식되었습니다. 수행률을 따지기 전에 회사가 남아 있어야 합니다.'
                     : '자금이 끊겼습니다. 본사도 법인도 남은 게 없습니다.' };
  }
  // 1순위: 본사 정책 수행
  if (fulfil >= 0.90 && consol >= target) {
    return { ...base, grade: soloOk ? 'S' : 'A',
      title: soloOk ? '둘 다 이겼습니다' : '본사는 이겼습니다',
      desc: soloOk
        ? '내시 물량을 거의 다 쳐냈고 법인도 흑자입니다. 드문 결말입니다.'
        : `내시 물량 ${(fulfil * 100).toFixed(0)}%를 쳐냈습니다. 본사 평가는 최상위입니다. 다만 법인은 적자입니다 — 주재원이 욕먹으며 본사 실적을 만든 케이스이고, 현실에서 가장 흔한 결말입니다.` };
  }
  if (fulfil >= 0.75) {
    return { ...base, grade: 'B', title: '무난했습니다',
      desc: `내시 물량 ${(fulfil * 100).toFixed(0)}%. 본사 기준으로 문제 삼을 정도는 아닙니다.` };
  }
  // 2순위: 수행률이 낮으면 법인이 아무리 좋아도 그 위로 못 올라간다
  if (soloOk) {
    return { ...base, grade: 'C', title: '혼자만 이겼습니다',
      desc: `법인 손익은 지켰습니다. 그런데 내시 물량은 ${(fulfil * 100).toFixed(0)}%만 쳐냈습니다. 본사가 이 법인을 왜 세웠는지를 생각하면, 이건 좋은 성적표가 아닙니다.` };
  }
  return { ...base, grade: 'D', title: '둘 다 놓쳤습니다',
    desc: `내시 물량 ${(fulfil * 100).toFixed(0)}%, 법인도 적자입니다.` };
}

if (typeof module !== 'undefined') {
  module.exports = { CFG, PROC_LIST, createInitialState, resolveTurn, grade,
    capacityOf, marketDemand, makeNasi, nasiCeiling, procAvailable, chapterOf, inventoryAging, trimOptions, COIL_WIDTH,
    portfolio, makeScenario, dateOf, dateLabel,
    spotExposure, inventoryTons, unitPrice,
    effectiveMaterialCost, yieldGainPerTon };
}
