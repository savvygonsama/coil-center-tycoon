# 코일센터 이미지 생성 프롬프트

스틸그레이드 가챠와 같은 **디자이너 비닐 피규어 / 미니어처 디오라마** 톤으로 뽑는다.
한 장짜리 전경이 아니라 **레이어 부품 세트**로 뽑아서 게임이 상태에 맞게 겹쳐 쌓는다.

---

## 0. 반드시 지켜야 할 세 가지

| | 값 | 이유 |
|---|---|---|
| **카메라** | 3/4 아이소메트릭, 부감 35°, 방위 45° — 전 부품 동일 | 각도가 틀어지면 겹쳤을 때 따로 논다 |
| **조명** | 좌상단 소프트박스 키라이트 + 약한 위쪽 필라이트 — 전 부품 동일 | 그림자 방향이 다르면 오려붙인 티가 난다 |
| **배경** | 부품은 **투명 배경**, 바닥판만 배경 있음 | 겹치기 위함 |

출력은 전부 **1024×1024 정사각**, 피사체가 프레임의 약 70%를 채우게. 부품끼리 크기 비율은
아래 "상대 크기" 표를 프롬프트 안에 그대로 적어 넣으면 대체로 맞는다.

**상대 크기 기준** — 슬리터 1대 = 가로 프레임의 55%. 공장동 1동 = 슬리터 3대가 들어가는 폭.
소재 코일 1개 = 슬리터 높이의 1/4.

---

## 1. 공통 스타일 블록 (모든 프롬프트 앞에 붙인다)

```
Collectible designer vinyl figure photograph of a miniature diorama model kit.
Matte brushed steel and weathered painted surfaces, visible rivets, panel lines and
seam lines, slightly toy-like chunky proportions, tactile material realism.
Soft diffused studio softbox key light from upper left, gentle fill from above,
soft contact shadow directly beneath the object.
Fixed 3/4 isometric camera, 35 degree elevation, 45 degree azimuth, orthographic-like
framing with minimal perspective distortion.
Muted industrial palette: steel gray, gunmetal, warm ochre, deep teal accents, cream.
High detail, shallow depth of field, product photography lighting.
No text, no logos, no letters, no signage, no humans.
Object centered, isolated on a fully transparent background.
Square 1024x1024.
```

> 배경 있는 컷(1-1 부지 베이스)만 마지막 두 줄을 이렇게 바꾼다:
> `Pale cool gray-blue seamless gradient background, soft studio floor.`

---

## 2. 부지 · 건물

### 2-1. 부지 베이스 (배경 있는 유일한 컷, 1장)
```
[공통 스타일 블록 — 단 배경은 pale cool gray-blue seamless gradient]
An empty industrial plant site for a steel coil service center, miniature diorama base.
Flat concrete yard with faint painted lane markings and expansion joints, a wide
asphalt access road entering from the lower right, a small quay with bollards along
the left edge meeting calm toy-like water, low perimeter fence, a few scale-model
trees at the back edge. The center of the yard is empty and ready for buildings.
Clean, orderly, slightly weathered concrete.
```

### 2-2. 공장동 1동 — 빈 건물
```
[공통 스타일 블록]
A single-span industrial factory building for a steel coil center, miniature model kit
piece. Corrugated metal wall panels in warm cream and pale ochre, teal steel roof trim,
a large open roll-up shutter door on the front long side showing an empty concrete
floor inside, clerestory windows along the upper wall, external downpipes and a small
ventilation fan. Roof is partially cut away as a doll-house style open diorama so the
interior floor is visible from above. Building width fits three machine lines side by side.
```

### 2-3. 공장동 2동 — 증축분
```
[공통 스타일 블록]
A second, newer industrial factory building for a steel coil center, same design family
as the first: corrugated metal walls but in a slightly brighter, cleaner cream with
fresh teal roof trim, no weathering, crisp edges. Open roll-up shutter door, roof partly
cut away showing an empty concrete floor. Slightly narrower footprint.
```

### 2-4. 천장 크레인 (공장동 위에 얹는 부품)
```
[공통 스타일 블록]
An overhead gantry crane for a factory bay, miniature model part: a yellow-ochre steel
bridge beam spanning two rails, a trolley with a hook block and a coil lifting C-hook
attachment hanging on cables, chunky toy-like proportions, worn paint on the beam edges.
Rendered as a standalone piece to sit above a factory floor.
```

---

## 3. 설비 — 가동 / 정지 두 컷씩

### 3-1. 슬리터 (가동)
```
[공통 스타일 블록]
A steel coil slitting line machine, miniature model kit piece, running.
Left to right layout: an uncoiler holding a wide steel coil, a slitter head housing with
circular knives, a looping pit section, and a recoiler winding several narrow slit coils
side by side on the mandrel. Ochre-yellow painted machine frames with gunmetal rollers,
a small teal control cabinet with glowing green indicator lamps, a thin steel strip
visibly threaded through the whole line with a soft motion blur on the moving strip.
Machine occupies 55 percent of the frame width.
```

### 3-2. 슬리터 (정지)
```
[위와 동일, 단 아래로 교체]
...idle and stopped. No strip threaded through the line, empty mandrel, control cabinet
lamps dark, no motion blur. Slightly dusty.
```

### 3-3. 레벨러 (가동)
```
[공통 스타일 블록]
A steel cut-to-length leveling line machine, miniature model kit piece, running.
Left to right: an uncoiler with a steel coil, a roller leveller housing with many small
work rolls visible through an open guard, a flying shear, and a stacker with a neat pile
of flat cut steel sheets on a pallet. Ochre-yellow frames, gunmetal rolls, teal control
desk with lit green lamps, a flat steel sheet mid-travel with soft motion blur.
Machine is shorter and lower than a slitting line.
```

### 3-4. 레벨러 (정지)
```
[위와 동일, 단 아래로 교체]
...idle and stopped. No sheet in the line, empty stacker pallet, dark lamps, no motion blur.
```

### 3-5. 블랭킹 프레스 (가동)
```
[공통 스타일 블록]
A blanking press line for steel sheets, miniature model kit piece, running.
A tall heavy C-frame mechanical press with a visible die set, a feeder conveyor entering
from the left carrying steel strip, and an exit conveyor on the right stacking irregular
trapezoid-shaped steel blanks into a wire-mesh pallet cage. A scrap skeleton web falling
into a chute below. Dark gunmetal press body with ochre guards, teal control panel with
lit lamps. Tallest and most massive of the machines.
```

### 3-6. 블랭킹 프레스 (정지)
```
[위와 동일, 단 아래로 교체]
...idle and stopped. Empty feeder, open die, empty pallet cage, dark lamps.
```

---

## 4. 재고 — 이게 경영 상태를 제일 크게 보여준다

### 4-1. 소재 코일 더미 · 소 (3~4개)
```
[공통 스타일 블록]
A small stack of hot rolled steel master coils on a concrete yard, miniature model pieces.
Three or four wide steel coils lying on their sides in a low pyramid stack, held by black
rubber coil chocks. Brushed blue-gray steel with a faint oily sheen on the wound edges,
banding straps around each coil, a small blank paper tag tied to one strap.
Clean and orderly, plenty of empty floor around the stack.
```

### 4-2. 소재 코일 더미 · 중 (8~10개)
```
[4-1과 동일, 단 아래로 교체]
...Eight to ten coils in two neat rows of stacked pyramids, still orderly with clear
walking aisles between rows.
```

### 4-3. 소재 코일 더미 · 대 (20개 이상)
```
[4-1과 동일, 단 아래로 교체]
...More than twenty coils packed into three tight rows of high pyramid stacks, aisles
narrow, a few coils stacked three high. Dense and heavy looking but still organized.
```

### 4-4. 야드 초과 — 통로까지 넘친 상태
```
[4-1과 동일, 단 아래로 교체]
...Coils overflowing chaotically: stacks crammed together with no aisles left, extra coils
dumped in irregular clusters on the access lane, a few tilted at slight angles, chocks
missing under some. Cluttered, congested, slightly alarming.
```

### 4-5. 장기재고 — 파란 방수포 덮인 코일 (게임의 핵심 상징)
```
[공통 스타일 블록]
A forgotten stack of steel coils covered by a faded blue tarpaulin in the corner of a
plant yard, miniature diorama piece. The tarp is dusty and sagging with rain pooling in
one fold, tied down with worn rope, one corner lifted showing rust bloom and orange-brown
staining on the coil edge underneath. A cracked, curled paper tag. Dead leaves and dust
collected around the base. Quietly neglected mood.
```

### 4-6. 제품 스택 · 슬리팅 코일
```
[공통 스타일 블록]
A stack of narrow slit steel coils on a plant floor, miniature model pieces. Six to eight
small-diameter narrow-width coils standing on their sides in a neat row on wooden skids,
bright clean cut edges catching the light, tight banding straps, crisp and freshly
processed looking. Noticeably smaller and narrower than master coils.
```

### 4-7. 제품 스택 · 블랭킹 시트 팔레트
```
[공통 스타일 블록]
Pallets of finished blanked steel sheets, miniature model pieces. Two or three wooden
pallets each carrying a neat squared-off stack of flat trapezoid steel blanks separated
by thin paper interleaves, secured with plastic strapping and corner protectors, ready
for shipping. Clean bright sheet surfaces.
```

### 4-8. 스크랩 박스
```
[공통 스타일 블록]
An open steel scrap skip box in a plant yard, miniature model piece. A heavy rusted-orange
steel container filled with tangled offcut strip edges and twisted skeleton scrap webs
from blanking, curled and springy. Worn paint, dented corners.
```

---

## 5. 물류

### 5-1. 코일 운반 트럭
```
[공통 스타일 블록]
A flatbed coil transport truck, miniature toy vehicle. Chunky cab-over tractor unit in
warm ochre with a low flatbed trailer carrying two steel coils lying in a coil cradle,
secured with tensioned straps. Slightly stylized cute toy proportions, oversized wheels,
matte paint with light weathering.
```

### 5-2. 화물선 (미착 물량)
```
[공통 스타일 블록]
A small general cargo ship, miniature toy boat. Dark teal hull with a cream superstructure
at the stern, two open cargo holds showing steel coils stowed inside, a deck crane amidships.
Chunky rounded toy proportions, matte weathered paint, no text on the hull.
```

### 5-3. 지게차
```
[공통 스타일 블록]
A small industrial forklift truck, miniature toy vehicle. Ochre-yellow body, black mast
and forks, an overhead guard cage, carrying a wooden pallet of steel sheets. Chunky cute
toy proportions.
```

---

## 6. 캐릭터 6인 (선택 — 넣으면 화면이 확 산다)

전부 아래 공통 지시를 쓴다. 가챠 캐릭터와 같은 **둥근 헬멧 머리 + 단순한 점 눈 + 작은 입**.

```
[공통 스타일 블록]
Collectible chibi vinyl figure of a steel coil center employee, standing bust-up portrait.
Rounded helmet-like head in brushed matte metal with a simple minimal face: two small
black dot eyes and a tiny simple mouth line, no nose. Chunky toy body proportions.
Solid color work uniform with a small hexagonal badge on the chest.
```

| 인물 | 덧붙일 문장 |
|---|---|
| 서 대리 (구매) | `Navy blue work uniform, holding a clipboard against the chest, slightly worried expression with eyebrows angled inward.` |
| 정 과장 (영업) | `Charcoal suit jacket over the uniform, holding a phone to the ear, confident half-smile.` |
| 구 공장장 (생산) | `Ochre-yellow work coverall with reflective stripes, a wrench in one hand, an oil smudge on the cheek, gruff flat mouth.` |
| 한 대리 (경리) | `Cream blouse uniform, holding a small calculator, round spectacle lenses painted on the face plate, neutral careful expression.` |
| 오 과장 (품질) | `White lab coat over the uniform, holding a micrometer caliper, one eyebrow raised skeptically.` |
| 린 매니저 (현지) | `Teal uniform, holding a paper coffee cup, warm easy smile.` |

---

## 7. 게임이 이걸 어떻게 쌓는가

```
z-index 순서 (뒤 → 앞)

 1. 부지 베이스                     항상
 2. 화물선 × 미착 건수(최대 3)      s.poOpen
 3. 공장동 1동                      항상
 4. 공장동 2동                      s.buildings >= 2
 5. 설비                            s.lines 배열 순서대로 건물 슬롯에 배치
                                    가동/정지는 그 달 투입톤 > 0 으로 판정
 6. 천장 크레인                     공장동 위
 7. 소재 코일 더미                  invRaw 톤수 → 소/중/대/초과 중 하나
 8. 장기재고 (파란 커버)            3개월 초과 재고 > 0 이면 야드 구석에
 9. 제품 스택                       invFg → 슬리팅 코일 / 블랭킹 팔레트
10. 스크랩 박스                     scrapTon 누적
11. 트럭 · 지게차                   출하량에 따라 0~2대
```

파일명 규칙 — `base.png`, `bldg1.png`, `bldg2.png`, `slit_on.png`, `slit_off.png`,
`level_on.png`, `level_off.png`, `blank_on.png`, `blank_off.png`,
`coil_s.png`, `coil_m.png`, `coil_l.png`, `coil_over.png`, `coil_tarp.png`,
`fg_slit.png`, `fg_blank.png`, `scrap.png`, `truck.png`, `ship.png`, `forklift.png`,
`crane.png`, `cast_seo.png` … `cast_lin.png`

총 **21장 + 캐릭터 6장 = 27장**.

---

## 8. 생성 실무 팁

- **투명 배경**을 못 뽑는 모델이면 `flat pure magenta #FF00FF background`로 뽑고 나중에 빼는 게 제일 깔끔하다. 흰 배경은 금속 하이라이트까지 같이 날아간다.
- 설비 가동/정지는 **한 번에 뽑지 말고**, 가동 컷을 먼저 확정한 뒤 그 이미지를 레퍼런스로 넣고 정지 컷을 뽑아야 같은 기계로 보인다.
- 재고 4단계도 마찬가지로 **소 → 중 → 대 → 초과** 순서로 이어서 뽑는다.
- 글자가 자꾸 들어가면 `no text, no logos, no letters, no signage`를 프롬프트 맨 뒤에 한 번 더 반복한다.
- 뽑고 나서 공장동 1동 위에 슬리터를 얹어보고 **그림자 방향과 눈높이**가 맞는지부터 확인한다. 안 맞으면 그 부품만 다시.
