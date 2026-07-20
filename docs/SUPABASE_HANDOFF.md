# Supabase 전환 인수인계

## 현재 adapter

로컬 MVP는 현재 로그인 캐릭터를 탭별 `sessionStorage`에, 조사조·세션·위치·위험·오브젝트·인벤토리를 공용 `localStorage`에 저장하고 브라우저 `storage` 이벤트로 탭 간 상태를 동기화합니다.

UI의 상태 변경은 `mutate(reason, callback)`을 통과합니다. 실제 서비스에서는 이 계층을 Supabase RPC adapter로 교체합니다.

## 교체 순서

1. Supabase Auth 연결
2. `user_characters`에서 로그인 계정의 캐릭터 확인
3. 홈 snapshot RPC 작성
4. 조사조 RPC 작성
5. 세션 생성 RPC 작성
6. 이동 RPC 작성
7. 위험 해결 RPC 작성
8. 오브젝트 조사 및 아이템 획득 RPC 작성
9. private Realtime channel 연결
10. localStorage 상태 제거

## 필요한 RPC

- `rpc_create_party`
- `rpc_invite_party_member`
- `rpc_accept_party_invite`
- `rpc_confirm_party_composition`
- `rpc_set_party_ready`
- `rpc_start_investigation_session`
- `rpc_get_session_snapshot`
- `rpc_move_route`
- `rpc_resolve_current_hazard`
- `rpc_inspect_object`
- `rpc_take_item`
- `rpc_send_field_message`
- `rpc_transfer_inventory_item`
- `rpc_end_session`

## 서버 책임

- 현재 위치와 direct route 검증
- story day 접근 검증
- 비공개 variant 추첨
- hazard queue 생성
- 한 행동 제한
- success/partial/fail
- `26_오염계산` 수치
- item 중복 획득
- 같은 loop·variant·current_node의 현장 합류/이탈 판정
- 현장 대화 수신 대상 판정
- 소지품 전달 시 소유권·수량 원자적 변경
- 사건 순서와 idempotency

## 클라이언트 책임

- 서버 snapshot 표시
- 허용된 선택지 렌더링
- 행동 원문 전달
- 실시간 사건 구독
- 재접속 시 snapshot 재조회

클라이언트는 variant code, seed, hazard rank 또는 오염 계산식을 결정하지 않습니다.


## v0.2 현장 교류 이관 주의사항

로컬 MVP는 활성 세션들의 `variant + currentNode`를 비교해 현장 인물을 찾습니다. Supabase 전환 시에는 클라이언트가 다른 세션 전체를 조회해 직접 비교하면 안 됩니다.

서버가 다음 값을 원자적으로 판정해야 합니다.

- 현재 캐릭터가 속한 세션
- 현재 `world_loop_id`
- 비공개 `variant_code`
- `current_node`
- 이동 중 여부
- 수신 가능한 세션과 캐릭터 목록

현장 대화와 소지품 전달은 같은 필드로 판정된 대상에게만 허용하고, Realtime은 `field:{world_loop_id}:{zone_variant_instance_id}:{current_node}` 형태의 비공개 채널로 확장합니다. 프론트에는 `variant_code`를 직접 노출하지 않습니다.
