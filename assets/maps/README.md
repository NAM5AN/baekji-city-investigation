# 해오름역 구역 지도

`haeoreum-day1-map.svg`는 생성형 이미지가 아니라 `data/day1-data.js`의 실제 조사 노드와 이동 경로를 기준으로 직접 구성한 층별 건물 평면형 벡터 안내도입니다.

- `data-node`: `E_ENTRY`와 `places`의 모든 노드 ID
- `data-route`: 정방향·역방향 route ID
- 두꺼운 선: 외벽·방 벽
- 흰 영역: 방·복도·출입구
- 검은 점선: 실제 왕복 이동 동선
- 계단 무늬: 층간 연결
- 붉은 점: 앱에서 현재 노드에 `is-current`를 적용했을 때 표시되는 캐릭터 위치

노드나 경로 데이터가 바뀌면 SVG의 `data-node`, `data-route`, 선 배치와 `tests/map-ui-check.mjs`를 함께 갱신해야 합니다.
