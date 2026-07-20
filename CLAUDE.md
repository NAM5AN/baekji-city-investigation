# 백지도시 조사용 홈페이지 — Claude Code 프로젝트 인수인계

## 0. 이 문서의 역할

## 현재 로컬 MVP 추가 계약 · v0.3.18

- 로그인은 캐릭터 선택 카드가 아니라 아이디·비밀번호 폼을 사용한다.
- 일반 대화는 행동 판정을 일으키지 않는다. 단, 명백한 길찾기·다음 행동 질문은 선택지를 여는 힌트 요청으로만 처리한다.
- 시스템 행동은 `/`로 시작한다.
- 관찰은 이동이나 위험 해결과 분리하며 육안 정보만 출력한다.
- 조사 채팅은 사용자가 실제로 들은 과거 대화를 계속 보여 주고, 장소가 바뀔 때 구분선을 표시한다.
- 사용자 노출 문장에 `현재 장면`, `시도`, `대상 지정`, `요청 거부`, `서버 스냅샷` 같은 개발·판정 메타어를 사용하지 않는다.
- 동일 현장은 단순 장소 ID가 아니라 `node`, `detail`, `route encounter` 범위로 판정한다. 같은 이동 경로에서 위험을 해결 중인 서로 다른 조사조도 서로를 보고 대화할 수 있어야 한다.
- 행동 선택지는 채팅 로그 레이아웃을 밀어내지 않고 장면 일러스트 위의 닫을 수 있는 오버레이로 표시한다.
- 위험 상태는 용도를 알 수 없는 아이콘으로 표시하지 않고 SYSTEM 문장으로 설명한다.
- 로그인 화면은 조사 화면과 동일한 흑백 게임보이 스타일을 유지한다.
- 로그인 직후 홈 화면도 흑백 게임보이 스타일을 유지한다.
- `본다`, `보다`, `봐`, `훑어본다` 같은 단순 시각 조사 표현도 등록 오브젝트 조사로 처리한다.
- 등록되지 않은 대상을 살피는 행동은 판정 실패로 만들지 않고 평범함·특이점 없음·추가 조사 요소 없음으로 자연스럽게 묘사한다.
- 실제 실패는 캐릭터가 무엇을 했는지 먼저 출력하고 장치·구조·위험에 맞는 원인을 설명하며, 같은 문장이 연속 반복되지 않도록 변주한다.
- 본문은 1번 Y콤퓨타체 원본 OTF, 타이틀은 2번을 사용한다. 3~6번은 조사 결과·메모·기록처럼 성격이 분명한 짧은 필기 영역에만 사용하며 SYSTEM 출력에서는 순환하지 않는다. 7번은 짧은 배지·상태 수치·창 라벨에만 제한한다.
- 폰트는 외부 CDN이 아니라 `assets/fonts/`의 로컬 자산으로 제공하며 기존 역할 변수 이름을 유지한다.
- 로그인·홈·조사조 구성·브리핑·조사·결과의 모든 화면은 흑백 게임보이 스타일과 로컬 폰트 역할을 유지한다.
- 정적 CSS·스크립트·폰트 URL에는 릴리스 버전 캐시 갱신 값을 붙여 이전 스타일이 남지 않게 한다.
- 장소·세부 구역·이동 경로·오브젝트 이미지는 `data/image-map.js`에서 연결하고, 누락 시 흑백 플레이스홀더를 표시한다.
- 오브젝트 조사 직후 이미지 영역이 포함된 상세 팝업을 열며, 실제 오브젝트 이미지는 별도 제공 전까지 생성하지 않는다.
- 새로고침·조사 복귀·페이지 복원 시 SYSTEM 로그와 조사 채팅은 최신 기록이 보이는 최하단에서 시작한다.
- 해오름역 구역 지도는 실제 노드·directed route 데이터와 일치하는 흑백 SVG로 제공하고, 조사 화면 버튼 또는 캐릭터의 지도 요청 표현으로 모달을 연다.
- 지도 모달에는 현재 위치 또는 이동 중 경로와 현재 위치에서 바로 연결된 목적지를 표시한다.
- 위험 상황에서도 지도 요청·길찾기 질문·관찰은 위험 대응 판정 전에 분리하고, 특히 `/지도 봄` 같은 축약 표현이 위험 해결 행동으로 소비되지 않게 한다.
- 구역 지도는 노드 상자형 구조도가 아니라 층별 방·복도·출입문·계단실을 읽을 수 있는 건물 평면 안내도로 제공하고 현재 노드에 붉은 점을 표시한다.
- 오브젝트 아이템 선점은 세션별이 아니라 동일 시간 변주 전체에서 공유한다. 한 캐릭터가 획득한 항목은 다른 캐릭터의 선택지에서 제거한다.
- 멀티탭 갱신 전 남은 선택지를 누른 경우 최신 선점 상태를 다시 확인하고 `이미 누군가 가져가버렸다···`를 포함한 획득 실패를 SYSTEM에 기록한다.
- 매핑된 획득 아이템이 없는 오브젝트 조사 결과에는 `아무것도 없다.`는 사실을 명시한다.
- 자유문장 행동은 명확한 표현을 로컬에서 우선 처리하고, 불확실한 `/행동`만 서버의 OpenAI Responses API로 보완한다.
- OpenAI API 키는 환경 변수에서 서버만 읽으며 브라우저 코드·응답·저장소·ZIP에 값을 포함하지 않는다.
- AI는 의도와 현재 허용된 후보 ID만 반환한다. 성공·실패·이동·위험·오염·아이템 상태는 기존 결정 규칙이 확정한다.
- API 미설정·타임아웃·오류 시 기존 조사 흐름을 막지 말고 로컬 행동 판정으로 자동 전환한다.
- Windows `run.bat`은 복잡한 PowerShell 중첩 구문을 사용하지 않으며, 서버 종료·Node.js 미설치·압축 미해제 시 창을 유지하고 진단 내용을 표시한다.
- `setx`로 저장된 Windows 사용자 환경 변수는 서버가 `reg.exe`를 직접 실행해 읽고 키 값은 출력하지 않는다.
- 카드·세션 정보·조사 상황처럼 읽어야 하는 텍스트 영역 뒤에는 점·격자·사선·줄무늬 패턴을 겹치지 않는다. 게임보이 질감은 테두리·그림자·이미지 영역에서만 표현한다.
- 구역 지도는 층별 허브와 분기 관계가 먼저 읽혀야 하며, 경로선을 텍스트 위로 통과시키지 않고 계단마다 연결 층과 목적지를 직접 표기한다.
- `/행동` 원문은 캐릭터 아이콘·이름과 함께 SYSTEM 로그에 먼저 보존한다.
- 행동에 물건 사용이 명시되면 실제 소지품·수량·상태·용도 적합성을 이동·위험 판정보다 먼저 확인한다. 물건이 없거나 사용할 수 없으면 후속 행동과 위험 진행을 실행하지 않는다.
- 활성 조사 세션의 SYSTEM·조사 채팅 기록은 개수로 잘라내지 않는다. 세션이 종료되기 전 재접속·새로고침에서도 전체 기록을 보존한다.
- 듣기·자기 상태 확인·기다리기·시각 관찰은 서로 다른 행동으로 유지한다. 사용자의 감각 방식과 행동 대상을 다른 행동으로 바꾸지 않는다.
- 위험 중 HAZARD_RESPONSE는 눈앞의 위험을 실제로 피하고 막고 건너는 행동에만 부여한다. 무관한 행동은 위험·위치·오염 상태를 진행시키지 않는다.
- AI 결과문은 기존 규칙이 확정한 사건의 문장 표현만 담당한다. 성공·실패·오염·도착·아이템·위험 진행 사실을 바꾸거나 새 단서를 만들지 않는다.
- SYSTEM 결과문에는 `입력`, `요청`, `판정`, `시도`, `현재 장면`, `주변 구조에는 변화가 없다`, `필요한 준비를 갖추지 못해` 같은 운영·판정투 표현을 사용하지 않는다.
- 데스크톱 조사 화면의 일러스트/SYSTEM 경계와 왼쪽 조사 영역/오른쪽 채팅 영역 경계는 드래그 가능한 분할선으로 제공하며 조절 비율을 별도 레이아웃 키에 저장한다. 기존 게임 상태 저장 키는 바꾸지 않는다.
- 채팅 탭 아래에는 탭 이름과 인원수를 반복하는 별도 요약 헤더를 두지 않는다.
- 캐릭터가 현재 위치를 다시 목적지로 지정하면 이동 선택지를 공개하지 않고 이미 그 장소에 있다는 SYSTEM 문장으로 끝낸다.
- 직접 연결되지 않은 목적지를 지정하면 무관한 선택지를 공개하지 않는다. directed route의 최단 경로를 계산해 첫 이동 방향과 이후 연결 순서를 SYSTEM으로 안내한다.


이 파일은 백지도시 조사용 홈페이지 저장소의 최상위 `CLAUDE.md`로 사용한다.

Claude는 작업을 시작할 때 이 문서와 아래 원본 파일을 먼저 읽고, 세계관 규칙·서버 판정·프론트 노출 범위를 임의로 바꾸지 않는다.

### 원본 파일

프로젝트 루트의 `docs/source/` 아래에 다음 파일을 둔다.

1. `백지도시_10일_통합운영기획서_v26.1_1001편일정정합화.docx`
2. `백지도시_조사시트_자동판정통합_v10_해오름역보완(1).xlsx`

파일명이 조금 다르면 동일한 최신 버전의 DOCX와 XLSX를 찾아 사용한다.

### 원본 우선순위

1. 기획서의 원본 장 우선순위를 따른다.
   - 조사·추첨·구역 붕괴: 2장, 12-3~12-4
   - 오염·붕괴 실종·숨은 구조: 4장
   - 모브·도플갱어·루프 실종: 4-6~4-8, 12-6
   - 공동 목표: 7장
   - 엔딩: 11장
   - 화면 라벨·운영 용어·개발 식별자: 15장
2. 조사 홈페이지의 실제 데이터 필드, RPC, 이동, 위험, 오염, AI 출력 계약은 XLSX v10을 구현 계약으로 삼는다.
3. DOCX와 XLSX가 충돌하면 즉시 임의 선택하지 말고 `docs/source-conflicts.md`에 기록한다.
4. 현재 확정된 캐논은 1001편이 3일차 21:59에 선행 도착하고, 원래 예정 시각은 22:01이라는 것이다.
5. 백색재·핵심 힌트·중요 문서·공동 목표·엔딩 트리거·백막 단서는 원본에 명시되지 않은 내용을 생성하지 않는다.

---

# 1. 제품 목표

백지도시 조사용 홈페이지는 여러 유저가 같은 현실 시각과 같은 도시 상태를 공유하며 조사하는 실시간 웹 애플리케이션이다.

이 홈페이지의 핵심은 화려한 자유 생성형 RPG가 아니라 다음 네 가지다.

1. 서버가 허용한 물리 경로만 따라 실제로 이동한다.
2. 여러 조사조가 같은 월드와 현장 상태를 실시간으로 공유한다.
3. 성공·실패·위험·오염·아이템·상태 변경은 서버가 확정한다.
4. AI는 서버가 확정한 사건을 자연어 장면으로 묘사할 뿐 판정을 만들지 않는다.

네이버 밴드는 자유 역할극·쉘터 교류·공개 서사 로그·공지에 사용한다. 홈페이지 채팅은 조사 세션의 행동 입력과 조원 협의에 한정한다. 밴드 댓글이나 텍스트 명령어를 자동 수집·파싱하지 않는다.

---

# 2. 권장 기술 구조

## 프론트엔드

- Next.js App Router
- TypeScript strict mode
- React
- Tailwind CSS
- 접근성 있는 Headless UI 또는 shadcn/ui 계열 컴포넌트
- Zod 기반 서버 응답 스키마 검증
- TanStack Query는 필요한 경우에만 사용
- 모바일 대응은 하되 조사 메인 화면은 데스크톱 우선

## 백엔드

- Supabase Postgres
- Supabase Auth
- Supabase Realtime
- Postgres RLS
- Postgres SQL 함수/RPC
- AI 호출은 브라우저에서 직접 하지 않고 서버 전용 Route Handler, Edge Function 또는 별도 워커에서 수행
- Service Role/Secret Key는 절대 브라우저 번들에 포함하지 않는다.

## 기본 원칙

- 클라이언트는 결과를 계산하지 않는다.
- 모든 상태 변경은 RPC를 통해 실행한다.
- 프론트에서 임의 `insert/update/delete`를 허용하지 않는다.
- Realtime은 서버 확정 상태를 전달하는 용도로 사용한다.
- 같은 버튼을 여러 번 눌러도 중복 처리되지 않도록 idempotency key를 사용한다.
- 시간 변주 코드 `a/b/c/d`, 내부 위험도, seed, hidden condition ID는 유저 화면에 표시하지 않는다.
- 개발 식별자는 `snake_case`, enum은 `UPPER_SNAKE_CASE`를 사용한다.

---

# 3. MVP 정의

## MVP 한 줄 정의

**해오름역 1일차를 대상으로, 유저가 로그인한 뒤 조사조를 만들고 전원이 준비 완료한 다음, 비공개 시간 변주가 배정된 동일 현장에서 실제 경로를 이동하고 오브젝트를 조사·획득하며 위험과 오염을 서버 판정으로 처리하는 플레이 가능한 수직 단면.**

## MVP에 반드시 포함

### 계정·캐릭터

- 운영진이 사전 생성한 계정으로 로그인
- 한 계정은 한 캐릭터에 연결
- 로그인 후 자신의 캐릭터명, 현재 오염도, 현재 위치, 보유 아이템을 확인
- 일반 유저가 다른 캐릭터를 임의로 선택하거나 계정을 생성하지 못하도록 폐쇄형 운영

### 조사조

- 1인 조사 가능
- 조사조 개설자는 편성 작업을 시작한 사람일 뿐, 세계관상 조장이나 직책이 아니다.
- 조사조 생성
- 캐릭터 검색 또는 초대 코드로 조원 초대
- 초대 수락·거절
- 전원 편성 확정
- 전원 접속 및 준비 완료
- 한 명이라도 준비되지 않으면 세션 시작 불가
- 세션 시작 시 참가 명단 잠금
- MVP에서는 세션 시작 후 합류·분리·재편은 구현하지 않고 후속 단계로 미룬다.

### 조사 시작

- `story_day=1`에서는 E 해오름역만 선택 가능
- A~D는 유저가 클릭할 수 있는 목적지로 노출하지 않는다.
- 서버가 조사조 단위로 시간 변주를 비공개 배정
- 유저 화면에는 변주 코드나 위험 단계 대신 빛·공간 상태·손상 묘사만 표시
- 같은 조사조는 같은 `field_instance_id`와 시작 위치를 공유

### 물리 이동

- `zone > floor/section > place > detail > object` 계층
- `teleport_allowed=false`
- 현재 위치에서 직접 연결된 directed route만 선택 가능
- 같은 층이어도 직접 연결되지 않은 장소로 이동 불가
- 디테일 안에 있으면 먼저 나간 뒤 이동
- 층 버튼을 눌렀다고 층 전체 장소를 즉시 공개하지 않음
- 이동 완료 후 현재 장소와 직접 연결된 인접 장소만 공개
- 정방향·역방향 route 모두 별도 edge로 판정

### 조사·획득

- 장소 도착
- 디테일 선택
- 오브젝트 목록 공개
- 오브젝트 조사
- 조사 결과와 발견 물품 표시
- `조사`와 `가져가기`를 별도 행동으로 처리
- 같은 loop에서 이미 획득한 아이템은 중복 획득 불가

### 위험·오염

- route baseline과 위험 발생을 분리
- 이동 유형·필수 노드 태그·제외 태그 교집합을 통과한 위험만 생성
- 복수 위험은 `hazard_queue`에 순서대로 저장
- 첫 장면에서 전체 징후는 보여 주되 현재 위험 하나만 해결 가능
- 한 채팅에는 한 행동만 허용
- AI는 행동 의도와 도구 적합도만 구조화
- 성공·부분 성공·실패와 오염 수치는 서버가 확정
- 오염 수치의 유일한 원본은 XLSX `26_오염계산`

### 실시간·재접속

- 같은 조사조의 위치·장면·위험·획득·오염·세션 상태 실시간 동기화
- 접속 중인 조원 표시
- 연결이 끊긴 조원은 `AFK/DISCONNECTED`로 표시하되 세션 전체는 중단하지 않음
- 재접속하면 현재 단계부터 복귀
- 잠수 중 놓친 개인 선택·개별 획득 기회는 소급하지 않음
- 조 전체에 적용된 위치·이동·위험 결과는 동일하게 반영

### 최소 관리자 기능

- 계정과 캐릭터 연결
- 현재 `story_day`와 `loop_id` 확인
- 조사 가능 구역 일정 확인
- 조사조·세션 목록 확인
- 강제 판정이 아니라 세션 중단·재개·오류 상태 확인
- 테스트용 story day/loop seed 변경은 개발 환경에서만 제공
- 일반 운영 화면에서 숨은 구조·엔딩 스포일러를 노출하지 않음

## MVP에서 제외

다음 기능은 첫 MVP에 넣지 않는다.

- A~D 전체 4×4 조사
- 구역 경계 이동과 새 변주 재추첨
- 세션 시작 후 합류·분리·조원 재배치
- CCTV·전화·인터폰·방송·무전
- 게시판 슬롯·메모 인과 흔적·d 교대 애니메이션
- 해오름역 2~3일차 조건 장치
- 1001편 도착과 열차 내부
- 4일차 `ESCAPE_ONLY`
- 백색재 치료 타이머
- 물체 안정화
- 공동 목표
- 백막
- 모브 지속성·도플갱어
- 붕괴 후 숨은 구조
- 엔딩 투표·엔딩 판정

이 기능들을 MVP 코드에 가짜로 만들어 두지 않는다. 확장 가능한 인터페이스와 enum만 준비한다.

---

# 4. 단계별 개발 로드맵

## Phase 0 — 원본 분석과 데이터 정규화

### 목표

DOCX와 XLSX를 코드로 옮기기 전에 원본 구조를 정확히 매핑한다.

### 작업

- XLSX 모든 시트명과 헤더를 읽는 import script 작성
- 원본 XLSX를 런타임 DB처럼 직접 조회하지 않음
- XLSX를 versioned JSON과 SQL seed로 변환
- ID를 임의로 변경하지 않음
- `docs/source-map.md` 작성
- `docs/source-conflicts.md` 작성
- `docs/mvp-scope.md` 작성
- `docs/state-machines.md` 작성
- `docs/user-flow.md` 작성
- `docs/db-schema.md` 작성

### 산출물

- `scripts/import-investigation-workbook.*`
- `data/generated/`
- `supabase/seed.sql`
- 원본 행 수와 생성 데이터 행 수 비교 리포트
- XLSX `24_자동판정검증` 기준을 코드 테스트 목록으로 변환한 문서

### 완료 기준

- 해오름역 1일차 장소·route·detail·object·위험·오염 참조가 모두 연결됨
- 누락 ID와 중복 ID가 0건
- Claude가 만든 임의 세계관 콘텐츠가 0건

---

## Phase 1 — 클릭 가능한 UI 프로토타입

### 목표

서버 판정 전에 유저 흐름과 화면 구조를 검증한다.

### 구현 화면

- 로그인
- 홈
- 조사조 생성·초대·확정
- 전원 준비 로비
- 조사 시작 브리핑
- 조사 메인 화면
- 위치 이동
- 디테일·오브젝트
- 인벤토리·개인 상태
- 위험 오버레이
- 세션 종료 화면

### 방식

- `data/generated` fixture 사용
- 상태를 클라이언트에서 임시로 계산하지 말고 mock server adapter를 둔다.
- 이후 Supabase RPC로 adapter만 교체할 수 있게 한다.

### 완료 기준

- 로그인부터 오브젝트 조사까지 화면 흐름이 끊기지 않음
- 비공개 시간 변주 코드가 UI에 노출되지 않음
- 층 전체 장소를 한 번에 보여 주지 않음
- 한 화면에 행동 버튼을 과도하게 나열하지 않음

---

## Phase 2 — Auth·캐릭터·조사조·준비 완료

### 목표

실제 다중 유저가 같은 조사조를 구성하고 세션을 시작할 수 있게 한다.

### 핵심 테이블

- `profile`
- `character`
- `user_character`
- `party`
- `party_member`
- `party_invite`
- `party_ready_state`
- `world_loop`
- `zone_access_schedule`
- `field_instance`
- `investigation_session`
- `session_member`
- `character_state`

### 필수 RPC

- `rpc_create_party`
- `rpc_invite_party_member`
- `rpc_accept_party_invite`
- `rpc_decline_party_invite`
- `rpc_leave_party`
- `rpc_confirm_party_composition`
- `rpc_set_party_ready`
- `rpc_start_investigation_session`
- `rpc_get_story_day_zone_access`
- `rpc_enter_zone`

### 완료 기준

- 초대받지 않은 유저가 조사조 데이터를 읽지 못함
- 전원 준비 전에는 시간 변주·field instance·첫 장면이 생성되지 않음
- 중복 클릭으로 세션이 두 개 생성되지 않음
- 1인 조사도 동일한 흐름으로 시작 가능

---

## Phase 3 — 해오름역 1일차 플레이 가능한 수직 단면

### 목표

실제 서버 판정으로 해오름역 1일차 조사를 진행한다.

### 핵심 테이블

- `investigation_session`
- `route_state`
- `route_traversal_state`
- `object_state`
- `inventory_item`
- `risk_resolution_event`
- `notification_event`
- `ai_narration_job`

### 필수 RPC

- `rpc_list_floor_choices`
- `rpc_move_to_floor`
- `rpc_list_place_choices`
- `rpc_move_to_place`
- `rpc_list_detail_choices`
- `rpc_enter_detail`
- `rpc_exit_detail`
- `rpc_list_objects`
- `rpc_inspect_object`
- `rpc_take_item`
- `rpc_get_route_encounter`
- `rpc_resolve_current_hazard`
- `enqueue_ai_narration`

### 완료 기준

- day 1 유저가 B3·B4·TRAIN ID를 직접 요청해도 서버가 거부
- 환승광장에서 B1로 텔레포트 불가
- 동부 또는 서부 출입구를 실제 경유
- 직접 연결되지 않은 같은 층 장소 이동 거부
- 조사와 획득이 분리
- 위험 2개가 배정돼도 첫 행동으로 하나만 해결
- 오염 계산은 `26_오염계산` 규칙만 사용
- AI를 꺼도 fallback text로 플레이 가능

---

## Phase 4 — Realtime·재접속·운영 안정화

### 목표

여러 브라우저에서 같은 세션이 안정적으로 동기화된다.

### 작업

- private Realtime channel
- session·field·character 단위 구독
- optimistic UI 최소화
- 서버 sequence 번호로 사건 순서 보장
- 재접속 시 snapshot fetch 후 channel 재구독
- Presence는 온라인 표시용으로만 사용
- DB 상태가 Presence보다 우선
- action submit 중복 방지
- 오류 로그와 관리자 세션 모니터

### 완료 기준

- 두 유저가 서로 다른 브라우저에서 동일한 위치와 장면을 확인
- 한 유저의 이동 결과가 다른 조원에게 즉시 반영
- 연결 해제 후 복귀해도 세션이 분기되지 않음
- 다른 조사조·다른 세션의 비공개 데이터가 섞이지 않음

---

## Phase 5 — 해오름역 전체

### 범위

- 2일차 조건 장치
- 주전원·비상전원·셔터·배수·방송·내선
- E 내부 CCTV·방송·내선
- 해오름역 게시판
- 동쪽 A+C, 서쪽 B+D 정적 환경 조망
- 3일차 B4·0번 승강장
- 1001편 21:59 선행 도착
- 열차 내부
- 4일차 `ESCAPE_ONLY`
- 33 시트 기반 탈출

### 완료 기준

- MAIN_EVENT 전 열차 내부 생성 금지
- ESCAPE_ONLY에서 일반 조사·획득·게시판·통신·새 조망 차단
- 현재 장소의 주·대체 탈출 경로만 반환
- 모든 E 세션 결과 확정 전 A~D 개방 금지

---

## Phase 6 — A~D 4×4 도시 조사

- A~D 구역 선택
- 조 단위 비공개 변주 추첨
- 16개 field 상태
- 구역 경계 이동과 재추첨
- 동일 변주 교차 구역 소리·빛
- CCTV·전화·통신
- 필드 snapshot
- 누적 오브젝트 완료
- 영구 인과 흔적
- 구역 최종 붕괴

---

## Phase 7 — 후반 시스템

- 백색재 치료
- 물체 안정화
- 실종·숨은 구조
- 모브 지속성
- 루프 밖 지속체
- 도플갱어 충돌
- 공동 목표
- 백막
- 8~10일차
- 엔딩 게이트와 투표

---

# 5. 유저 접속 경로와 상태 전이

## 전체 경로

`로그인 → 캐릭터 확인 → 홈 → 조사조 구성 → 조원 전원 확정 → 조사 목적지 확인 → 전원 준비 완료 → 서버 세션 생성 → 비공개 변주 배정 → 조사 브리핑 → 구역 진입 → 인접 경로 이동 → 장소 → 디테일 → 오브젝트 → 조사/획득/조건 행동 → 세션 종료 또는 다음 행동`

## URL 제안

- `/login`
- `/auth/callback`
- `/onboarding`
- `/home`
- `/party`
- `/party/new`
- `/party/[party_id]`
- `/session/[session_id]/briefing`
- `/session/[session_id]/investigate`
- `/session/[session_id]/escape`
- `/session/[session_id]/result`
- `/me/status`
- `/me/inventory`
- `/admin`
- `/admin/sessions`
- `/admin/world`
- `/admin/users`

## 접근 가드

### `/login`

- 비로그인만 접근
- 공개 회원가입 버튼 없음
- 아이디/이메일, 비밀번호
- 비밀번호 재설정
- 운영 공지와 접속 장애 안내

### `/onboarding`

- 첫 로그인 시만 접근
- 연결된 캐릭터 확인
- 캐릭터명·프로필 이미지·기본 안내
- 다른 캐릭터 선택 기능 없음
- 확인 후 `/home`

### `/home`

표시:

- 현재 스토리 일차
- 현실 시각
- 오늘 열려 있는 조사
- 내 캐릭터 상태
- 오염도
- 치료 상태
- 인벤토리 요약
- 받은 조사조 초대
- 진행 중 세션 복귀 버튼
- 조사조 만들기 버튼

숨김:

- variant code
- 전체 공동 목표 수
- 미발견 목표
- 내부 위험 수치
- 다른 캐릭터의 비공개 단서와 인벤토리

### `/party/new`

- 조사 유형: 정규/보충/1인 중 현재 허용된 항목
- 목적지: 서버가 허용한 구역만 표시
- day 1~3 해오름역에서는 E만 표시
- 조원 초대
- 1인 시작 가능
- 개설자는 조장이 아니라 구성 편의를 위한 creator

### `/party/[party_id]`

단계:

1. `RECRUITING`
2. `COMPOSITION_CONFIRMED`
3. `READY_CHECK`
4. `LOCKED`
5. `SESSION_CREATED`

표시:

- 참가 캐릭터
- 초대 상태
- 접속 상태
- 구성 확정 여부
- 준비 완료 여부
- 선택 목적지
- 세션 시작 조건

규칙:

- 조원 전원이 구성 확정
- 조원 전원이 접속
- 조원 전원이 준비 완료
- 조건 충족 시에만 시작 버튼 활성화
- 시간 변주는 여기서 표시하지 않음

### `/session/[session_id]/briefing`

- 목적지 명칭
- 조원 명단
- 유저에게 공개 가능한 환경 설명
- 조작법
- “한 메시지에는 한 행동”
- “조사와 가져가기는 별도”
- 연결 상태 확인
- 조사 시작

### `/session/[session_id]/investigate`

조사의 핵심 화면이다.

---

# 6. 조사 메인 화면 구성

## 데스크톱 레이아웃

### 상단 고정 바

- 백지도시 로고
- 현재 현실 시각
- 스토리 일차
- 현재 구역명
- 현재 위치 breadcrumb
- 연결 상태
- 세션 나가기/도움말

내부 코드와 변주 등급은 표시하지 않는다.

### 왼쪽: 조사조 패널

- 조원 캐릭터명과 프로필
- ONLINE / AFK / DISCONNECTED
- 현재 같은 장면에 있는지
- 행동 입력 중 여부
- 공개 가능한 상태 아이콘

다른 유저의 개인 인벤토리·개인 단서·내면 정보는 표시하지 않는다.

### 중앙: 장면 및 사건 로그

- 현재 장소 대표 이미지 또는 추상 배경
- 서버 확정 AI narration
- 이동·조사·위험·상태 변화 로그
- 최신 장면 강조
- 오래된 로그 접기
- 시스템 오류는 세계관 문장으로 숨기지 말고 별도 오류 UI 사용

### 오른쪽: 상황별 인터페이스

기본 탭:

1. 이동
2. 주변
3. 인벤토리
4. 내 상태
5. 조사 기록

#### 이동 탭

- 서버가 반환한 인접 층·구간
- 서버가 반환한 직접 인접 장소
- 현재 장소
- 뒤로가기 route
- 잠긴 경로는 원본이 공개를 허용할 때만 상태 묘사
- 존재 자체가 숨겨진 장소는 disabled 버튼조차 만들지 않음

#### 주변 탭

- 현재 place 하위 detail
- detail 진입 후 현재 detail의 object
- object 상태 아이콘
- `관찰`, `조사`, `가져가기`, `작동` 중 서버가 허용한 행동만

#### 인벤토리 탭

- 아이템명
- 수량
- 상태
- 사용할 수 있는 현재 행동
- 선택한 아이템
- 내부 tags는 직접 노출 금지

#### 내 상태 탭

- 오염도 수치
- 단계명
- 증상 부위
- 치료 중 여부
- 최근 변화
- 서버가 확정한 정보만 표시

#### 조사 기록 탭

- 내가 직접 확인한 조사 결과
- 조 전체 공개 단서
- 개인 단서는 소유자에게만
- 미확인 내용을 자동 요약하거나 추론해 채우지 않음

### 하단: 행동 입력기

- 자유 서술 입력
- 현재 선택 아이템
- 서버가 제공한 빠른 행동 label
- 전송 버튼
- “한 번에 한 가지 행동만 입력하세요.”
- 제출 중 중복 전송 차단
- 현재 위험이 있으면 위험 해결 외 입력 제한
- AI 응답 대기 중에도 서버 fallback과 현재 상태를 표시

## 모바일 레이아웃

- 상단 바 축소
- 중앙 장면 우선
- 이동/주변/인벤토리/상태를 하단 시트로 전환
- 조원 패널은 접이식
- 위험 장면에서는 입력기와 현재 위험이 가장 먼저 보이게 함

---

# 7. 상황별 UI 상태

## 이동 전

- 현재 위치
- 인접 이동지
- 이동 선택

## 이동 중 위험 없음

- 이동 로딩
- 서버 확정
- 도착 narration
- 위치 갱신

## 위험 발생

- 배경에 위험 경고 효과
- 전체 위험 징후를 한 장면으로 표시
- 현재 해결할 위험 하나만 강조
- 남은 위험 수만 표시 가능
- 두 위험의 이름과 해결책을 한꺼번에 나열하지 않음
- 입력기 잠금 범위를 current hazard로 제한

## 오브젝트 조사

- object panel
- 관찰문
- 조사 결과
- 발견 물품
- 가져가기 버튼
- 조건 정답이나 해결 장소 직접 안내 금지

## 접속 끊김

- 재연결 배너
- 로컬 입력 임시 보존
- 재접속 후 서버 snapshot으로 덮어쓰기
- 서버와 충돌한 로컬 상태 폐기
- 현재 위치와 current hazard 복원

## 세션 종료

- 조사 결과 요약
- 획득 아이템
- 오염 변화
- 확인한 단서
- 미완료 행동
- 홈으로 이동

---

# 8. UI 시각 방향

## 콘셉트

“재난 이후에도 작동 중인 도시 교통·방재 시스템”

## 권장 표현

- 백색·회백색·차가운 먹색 중심
- 초록·파랑·빨강은 시간 상태의 환경 단서로만 제한 사용
- 흰색 용해 흔적은 페인트가 번지는 듯한 마스킹
- 지도 앱·관제 패널·역사 안내 시스템을 섞은 인터페이스
- 카드 남발 대신 장면·경로·상태의 위계가 명확한 레이아웃
- 일반 판타지 RPG, 네온 사이버펑크, 흔한 게임 HUD 스타일 금지
- 변주를 색 하나로만 구분하지 말고 빛·소음·공간 손상·텍스트 묘사를 함께 사용
- 내부 코드와 debug 값은 개발 모드 외 노출 금지

---

# 9. 핵심 상태기계

## 조사조

`DRAFT → RECRUITING → COMPOSITION_CONFIRMED → READY_CHECK → LOCKED → SESSION_CREATED → CLOSED`

## 세션

`LOBBY → READY → STARTING → ACTIVE → COMPLETED`

오류:

`ACTIVE → PAUSED_ERROR → ACTIVE/CANCELLED`

후속 확장:

`ACTIVE → ESCAPE_ONLY → ESCAPED/TRAPPED_OR_MISSING`

## 이동

`IDLE → ROUTE_CHECK → NO_HAZARD/ENCOUNTER_OVERVIEW/BLOCKED`

위험 없음:

`NO_HAZARD → ARRIVAL → IDLE`

위험 있음:

`ENCOUNTER_OVERVIEW → HAZARD_PENDING → RESOLVING → NEXT_HAZARD/RETRY/ARRIVAL`

## 디테일

`PLACE → DETAIL_ENTERED → OBJECT_SELECTED → INSPECTED → ITEM_AVAILABLE → TAKEN`

`INSPECTED`와 `TAKEN`은 같은 상태가 아니다.

---

# 10. MVP DB 최소 모델

XLSX `22_Supabase모델`을 원본으로 삼되 첫 MVP에서는 다음 테이블을 우선 구현한다.

## 인증·인물

- `profiles`
- `characters`
- `user_characters`
- `character_state`

## 조사조·세션

- `parties`
- `party_members`
- `party_invites`
- `party_ready_states`
- `world_loop`
- `zone_access_schedule`
- `field_instance`
- `investigation_session`
- `session_members`

## 조사

- `route_state`
- `route_traversal_state`
- `object_state`
- `inventory_item`
- `risk_resolution_event`
- `notification_event`
- `ai_narration_job`

## 정적 마스터 데이터

정적 데이터는 DB 또는 versioned JSON으로 관리한다.

- zones
- floors
- places
- details
- objects
- routes
- variants
- risk profiles
- hazard definitions
- contamination rules
- item catalog
- object-item mappings
- story day access schedule

정적 master와 동적 state를 같은 테이블에 섞지 않는다.

---

# 11. RLS 계약

- 모든 exposed table은 RLS 활성화
- 유저는 자신에게 연결된 캐릭터만 읽음
- 유저는 자신이 참가한 party/session만 읽음
- 같은 session의 조원은 공개 세션 상태만 읽음
- 개인 인벤토리와 개인 단서는 소유자만 읽음
- 서버 판정 테이블은 직접 쓰기 금지
- 모든 mutation은 SECURITY DEFINER RPC 또는 신뢰 가능한 서버 경로로 수행
- 관리자 role은 별도 custom claim 또는 admin profile로 구분
- service key는 서버 환경에서만 사용
- Realtime channel은 private topic 사용
- topic 예:
  - `session:{session_id}`
  - `field:{field_instance_id}`
  - `character:{character_id}`
- channel 권한도 세션 참가 여부를 검사

---

# 12. AI 계약

AI는 두 용도로만 사용한다.

## A. 행동 해석

입력:

- 유저 원문
- current hazard
- 실제 보유 아이템과 공개 capability
- 현재 위치·환경
- 한 행동 제한

출력:

```json
{
  "action_intent_id": "string",
  "used_item_instance_ids": [],
  "capability_fit": 0,
  "rationale": "string",
  "risk_flags": [],
  "detected_action_count": 1
}
```

금지:

- 성공·실패 결정
- 난수 생성
- 오염 수치 결정
- 존재하지 않는 아이템 사용
- 두 위험 동시 해결
- DB 쓰기

## B. 사건 묘사

입력:

- 서버가 확정한 `resolved_event`
- 허용된 사실
- fallback text
- 출력 위치

출력:

```json
{
  "narration": "string",
  "action_labels": [],
  "used_facts": [],
  "introduced_state_changes": [],
  "safety_check": "PASS"
}
```

검증:

- `introduced_state_changes`는 항상 빈 배열
- 서버 수치·ID와 다른 내용이 있으면 폐기
- 금지 장소·지름길·미래 정보가 있으면 폐기
- 실패 시 즉시 fallback text 출력

---

# 13. 원본 XLSX import 규칙

## 읽기 우선 시트

### 전체 구조

- `00_사용안내`
- `05_Claude스키마`
- `06_코드표`
- `22_Supabase모델`
- `12_자동판정흐름`
- `23_AI출력계약`
- `24_자동판정검증`

### 공간·이동

- `01_장소계층`
- `03_이동경로`
- `11_층선택UI`
- `15_노드태그`
- `25_이동상태RPC`

### 조사·상태·아이템

- `02_오브젝트조사`
- `07_조건상태`
- `13_아이템카탈로그`
- `14_오브젝트아이템`
- `21_오브젝트상태`

### 위험·오염

- `19_변주경로위험`
- `20_오염위험이벤트`
- `26_오염계산`
- `27_AI행동판정`
- `29_위험진행`

### 실시간·후속

- `08_동시진행`
- `09_동시진행대상`
- `10_메모흔적`
- `16_게시판슬롯`
- `17_메모아이템`
- `18_단말상태`
- `28_필드스냅샷`

### 해오름역

- `31_해오름역일정`
- `32_해오름역시뮬레이션`
- `33_해오름역탈출`

## import 산출물 예시

- `data/generated/zones.json`
- `data/generated/places.json`
- `data/generated/details.json`
- `data/generated/objects.json`
- `data/generated/routes.json`
- `data/generated/risk-profiles.json`
- `data/generated/contamination-rules.json`
- `data/generated/items.json`
- `data/generated/story-day-access.json`
- `data/generated/source-manifest.json`

`source-manifest.json`에는 다음을 기록한다.

- source workbook filename
- workbook version
- imported at
- sheet name
- row count
- checksum
- warnings

---

# 14. 필수 회귀 테스트

XLSX `24_자동판정검증`과 `30_회귀시뮬레이션`, `32_해오름역시뮬레이션`을 테스트 원본으로 사용한다.

MVP 최소 자동 테스트:

1. 모든 정방향 route에 역방향 route가 존재한다.
2. 현재 장소에서 직접 연결되지 않은 장소 이동을 거부한다.
3. 디테일 안에서 이동 요청 시 exit를 요구한다.
4. day 1 B3·B4·TRAIN 접근을 거부한다.
5. 환승광장에서 B1 직접 이동을 거부한다.
6. 이동 유형과 위험 context 불일치가 0건이다.
7. 위험 2개를 한 메시지로 해결하려 하면 `ONE_ACTION_ONLY`.
8. 첫 위험 해결 전 current hazard index가 증가하지 않는다.
9. 오염 참조가 `26_오염계산`에 없는 경우 seed/import를 실패시킨다.
10. object inspect가 item을 자동 획득하지 않는다.
11. 같은 loop의 같은 item 중복 획득을 막는다.
12. 다른 party/session 유저가 세션을 읽거나 입력할 수 없다.
13. 전원 준비 전 session start가 거부된다.
14. AI 응답의 `introduced_state_changes`가 비어 있지 않으면 폐기한다.
15. AI API 실패 시 fallback text가 즉시 표시된다.
16. 재접속 후 current place/current hazard가 서버 snapshot과 일치한다.
17. 중복 action idempotency key가 상태를 두 번 바꾸지 않는다.
18. 유저 화면에 `variant_code`, seed, internal hazard rank가 노출되지 않는다.

---

# 15. 코딩 규칙

- TypeScript `strict: true`
- `any` 최소화
- DB 응답은 Zod validation
- RPC 입력과 출력 타입 자동 생성 또는 단일 정의
- UI 컴포넌트 안에서 게임 규칙 계산 금지
- game rule은 SQL/RPC 또는 domain service에 둔다.
- magic string 금지
- enum과 error code는 중앙 관리
- DB migration은 순서가 있는 파일로 보관
- seed와 migration 분리
- 테스트 없는 핵심 RPC merge 금지
- 원본에서 가져온 텍스트와 개발용 fixture를 구분
- fixture에는 `TEST_ONLY` 표시
- 원본 파일을 코드가 수정하지 않음
- 생성 JSON은 수동 편집하지 않음
- source import를 다시 실행해 재생성
- 작업 후 lint, typecheck, unit test, integration test 실행
- 큰 기능을 한 번에 만들지 말고 작은 vertical slice마다 검증

---

# 16. Claude 작업 방식

## 작업 시작 시

1. 현재 저장소 구조 확인
2. 이 `CLAUDE.md` 읽기
3. DOCX와 XLSX의 파일명·버전 확인
4. XLSX 모든 시트명 출력
5. 원본 우선순위 요약
6. 충돌·누락 목록 작성
7. 구현 계획과 파일 변경 목록 작성
8. 그 후 코딩 시작

## 매 단계 후 보고

- 구현한 범위
- 변경 파일
- DB migration
- 실행한 테스트
- 통과/실패
- 원본과 다른 판단
- 다음 단계

## 금지

- 원본을 읽지 않고 일반적인 RPG 구조로 구현
- UI에서 결과 계산
- AI가 success/contamination/state를 결정
- 원본에 없는 단서·아이템·장소·정답 생성
- 전체 시스템을 한 프롬프트에서 한꺼번에 구현
- 테스트 실패를 무시하고 다음 단계 진행
- 기능이 없는 버튼을 완성된 기능처럼 표시
- 스포일러성 내부 코드를 프론트에 출력

---

# 17. 첫 배포의 Definition of Done

다음 시나리오를 실제 브라우저 2개로 완료해야 한다.

1. 유저 A와 B가 각각 로그인한다.
2. A가 해오름역 조사조를 만든다.
3. B를 초대한다.
4. B가 수락한다.
5. 두 명이 편성을 확정한다.
6. 두 명이 준비 완료한다.
7. 서버가 세션과 해오름역 field를 생성한다.
8. 두 화면에 같은 시작 장면이 표시된다.
9. A가 인접 route를 선택한다.
10. B 화면에도 동일한 이동/위험 장면이 표시된다.
11. 위험이 2개면 한 번에 첫 위험만 해결한다.
12. B가 둘째 위험 행동을 입력한다.
13. 서버가 도착과 오염을 확정한다.
14. 두 화면의 위치·오염·로그가 일치한다.
15. 디테일에 들어가 오브젝트를 조사한다.
16. 발견 아이템은 자동 획득되지 않는다.
17. 별도 가져가기 행동 후 인벤토리에 들어간다.
18. B 연결을 끊었다가 재접속한다.
19. 현재 위치와 장면이 복구된다.
20. 세션을 종료하고 결과 화면으로 돌아간다.

이 흐름이 안정적으로 작동하기 전에는 게시판·전화·A~D·1001편·탈출을 추가하지 않는다.
