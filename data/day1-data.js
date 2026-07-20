window.DAY1_DATA = {
  "meta": {
    "sourceWorkbook": "백지도시_조사시트_자동판정통합_v10_해오름역보완(1).xlsx",
    "scope": "해오름역 1일차 MVP",
    "generatedAt": "2026-07-19T09:57:49.798402+00:00",
    "storyDay": 1,
    "zone": {
      "id": "E",
      "name": "해오름역"
    },
    "startNode": "E_ENTRY",
    "allowedPlaceIds": [
      "E_G_PLAZA",
      "E_G_EAST",
      "E_G_WEST",
      "E_B1_CONCOURSE",
      "E_B1_TICKET",
      "E_B1_GATE",
      "E_B1_SHELTER",
      "E_B2_TRANSFER",
      "E_B2_P12",
      "E_B2_SHELTER_STAIR"
    ],
    "counts": {
      "places": 10,
      "details": 30,
      "objects": 35,
      "routes": 22,
      "itemMappings": 22
    },
    "checksumSha256": "1bd8ddc10167100f1f9b0fad8a29de016de358df8a357624a34f6d51706374f1"
  },
  "variants": {
    "a": {
      "light": "초록빛",
      "situation": "대합실과 승강장은 대부분 온전하지만 시계·안내방송·도착 표시가 미세하게 어긋난다.",
      "space": "일반 통로와 설비가 유지되고 일부 폐쇄구역만 접근 제한 상태다.",
      "contamination": "젖은 흰 자국이 배수로·선로 틈에 국소적으로 나타난다.",
      "mob": "대피 흔적과 버려진 소지품이 남고 사람의 잔상은 드물다.",
      "movement": "기본 경로는 대부분 OPEN, 조건부 셔터·하부 시설문만 별도 해제",
      "exposure": "직접 접촉 실패가 아니면 ambient 오염 없음"
    },
    "b": {
      "light": "파란빛",
      "situation": "대합실 방송이 다른 시각의 문장과 겹치고 일부 개찰기·스크린도어가 서로 다른 상태로 보인다.",
      "space": "에스컬레이터·폐쇄 승강장·시설 통로에 파손과 침수가 늘어난다.",
      "contamination": "흰 침윤선이 승강장 가장자리와 배수관을 따라 넓어진다.",
      "mob": "플랫폼과 대합실에 다른 시간의 승객 잔상이 간헐적으로 지나간다.",
      "movement": "실내 복도·계단 위험 증가, 배수 펌프 가동 시 일반 물길 위험 완화",
      "exposure": "ambient 오염 없음, 접촉·물 확산 사건만 수치 적용"
    },
    "c": {
      "light": "붉은빛",
      "situation": "승강장 번호·도착 시각·문 위치가 반복해서 어긋나며 현재와 다음 시간층의 열차 소리가 겹친다.",
      "space": "천장·계단·스크린도어 손상이 커지고 폐쇄 시설층의 통로가 불안정해진다.",
      "contamination": "백색 침윤과 용해 웅덩이 가장자리가 선로·시설층에 나타난다.",
      "mob": "잔상과 실체의 구분이 어려워지고 빈 객실·대기 공간에서 반복 행동이 보인다.",
      "movement": "대부분 경로에서 복수 위험 2개가 순차 발생할 수 있음",
      "exposure": "경로 완료 ambient 0~1% + 각 접촉 결과"
    },
    "d": {
      "light": "백색 중첩",
      "situation": "해오름역의 여러 시각이 동시에 겹쳐 대합실·승강장·열차 내부가 생겼다 사라지는 상태다.",
      "space": "승강장 가장자리와 하부 시설층 일부가 흰 여백으로 끊기며 붕괴 전조가 지속된다.",
      "contamination": "젖은 백색 잔류물과 용해 구간이 넓고 선로 바람·진동과 함께 위치가 바뀐다.",
      "mob": "승객 잔상과 열차 내부 장면이 실시간으로 교차하지만 직접 상호작용 대상은 아니다.",
      "movement": "모든 이동은 교집합 위험 2개를 순차 해결, 붕괴 상태에서는 탈출 경로 우선",
      "exposure": "경로 완료 ambient 1~2% + 직접 접촉·붕괴 지연 노출"
    }
  },
  "places": {
    "E_G_PLAZA": {
      "id": "E_G_PLAZA",
      "floorId": "E_G",
      "floor": "지상 환승광장",
      "name": "환승광장",
      "order": 1,
      "details": [
        {
          "id": "E_G_INFO",
          "name": "환승 안내대",
          "order": 1,
          "environment": "도시 외곽 노선과 버스 환승 정보가 남은 원형 안내대가 서 있다.",
          "prompt": "안내대와 주변 비품을 조사할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 환승광장 > 환승 안내대",
          "tags": [
            "OUTDOOR",
            "CCTV_CAMERA"
          ]
        },
        {
          "id": "E_G_BENCH",
          "name": "대기 벤치 구역",
          "order": 2,
          "environment": "낮은 금속 벤치와 비가림 지붕 아래에 버려진 소지품이 흩어져 있다.",
          "prompt": "벤치와 주변 바닥을 조사할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 환승광장 > 대기 벤치 구역",
          "tags": [
            "OUTDOOR"
          ]
        },
        {
          "id": "E_G_VIEW",
          "name": "동쪽 도시 조망선",
          "order": 3,
          "environment": "역 동쪽 끝의 낮은 난간 너머로 도시의 옥상선과 신호탑이 멀리 보인다.",
          "prompt": "같은 시간층의 도시 외곽을 육안으로 관찰할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 환승광장 > 동쪽 도시 조망선",
          "tags": [
            "OUTDOOR",
            "LINE_OF_SIGHT",
            "OBSERVATION_NODE",
            "SAME_VARIANT_CITY_VIEW"
          ]
        }
      ]
    },
    "E_G_EAST": {
      "id": "E_G_EAST",
      "floorId": "E_G",
      "floor": "지상 환승광장",
      "name": "동부 출입구",
      "order": 2,
      "details": [
        {
          "id": "E_G_EAST_DOOR",
          "name": "방풍문",
          "order": 1,
          "environment": "넓은 유리 방풍문이 지하 계단 입구를 둘러싸고 있다.",
          "prompt": "방풍문과 출입구 상태를 조사할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 동부 출입구 > 방풍문",
          "tags": [
            "OUTDOOR",
            "TRANSIT_NODE"
          ]
        },
        {
          "id": "E_G_EAST_STAIR",
          "name": "지하 진입 계단",
          "order": 2,
          "environment": "대합실로 내려가는 계단이 길게 이어지고 비상 유도등이 벽 아래에 붙어 있다.",
          "prompt": "계단과 유도등을 조사할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 동부 출입구 > 지하 진입 계단",
          "tags": [
            "OUTDOOR",
            "TRANSIT_NODE"
          ]
        },
        {
          "id": "E_G_EAST_DRAIN",
          "name": "출입구 배수로",
          "order": 3,
          "environment": "계단 가장자리 배수로에 빗물과 낙엽이 고여 있다.",
          "prompt": "배수로와 덮개를 조사할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 동부 출입구 > 출입구 배수로",
          "tags": [
            "OUTDOOR",
            "UTILITY",
            "WATER_NEARBY"
          ]
        }
      ]
    },
    "E_G_WEST": {
      "id": "E_G_WEST",
      "floorId": "E_G",
      "floor": "지상 환승광장",
      "name": "서부 출입구",
      "order": 3,
      "details": [
        {
          "id": "E_G_WEST_CANOPY",
          "name": "계단 캐노피",
          "order": 1,
          "environment": "철제 캐노피 아래로 서부 계단과 버스 승강장이 이어진다.",
          "prompt": "캐노피와 계단 입구를 조사할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 서부 출입구 > 계단 캐노피",
          "tags": [
            "OUTDOOR",
            "TRANSIT_NODE"
          ]
        },
        {
          "id": "E_G_WEST_BUS",
          "name": "버스 안내 구역",
          "order": 2,
          "environment": "정차 노선표와 전광판이 멈춘 버스 정류 구역이다.",
          "prompt": "노선표와 정류장 설비를 조사할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 서부 출입구 > 버스 안내 구역",
          "tags": [
            "OUTDOOR"
          ]
        },
        {
          "id": "E_G_WEST_VIEW",
          "name": "서쪽 도시 조망선",
          "order": 3,
          "environment": "아파트 옥상과 공원 수목선이 낮은 건물 사이로 보인다.",
          "prompt": "같은 시간층의 서쪽 도시를 육안으로 관찰할 수 있다.",
          "path": "해오름역 > 지상 환승광장 > 서부 출입구 > 서쪽 도시 조망선",
          "tags": [
            "OUTDOOR",
            "LINE_OF_SIGHT",
            "OBSERVATION_NODE",
            "SAME_VARIANT_CITY_VIEW"
          ]
        }
      ]
    },
    "E_B1_CONCOURSE": {
      "id": "E_B1_CONCOURSE",
      "floorId": "E_B1",
      "floor": "지하 1층 대합실·개찰층",
      "name": "중앙 대합실",
      "order": 1,
      "details": [
        {
          "id": "E_B1_GUIDE",
          "name": "종합 안내소",
          "order": 1,
          "environment": "반원형 안내 창구와 낮은 안내 표지들이 대합실 중앙에 놓여 있다.",
          "prompt": "안내소와 창구 안쪽을 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 중앙 대합실 > 종합 안내소",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "CCTV_CAMERA"
          ]
        },
        {
          "id": "E_B1_WAIT",
          "name": "대기 공간",
          "order": 2,
          "environment": "긴 벤치가 개찰구를 향해 나란히 놓여 있고 바닥에는 이동 동선선이 남아 있다.",
          "prompt": "벤치와 대기 공간을 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 중앙 대합실 > 대기 공간",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "CCTV_CAMERA"
          ]
        },
        {
          "id": "E_B1_BOARD",
          "name": "역내 공지 게시판",
          "order": 3,
          "environment": "운행 안내와 대피 수칙이 붙은 코르크 게시판이다.",
          "prompt": "공지문을 읽거나 메모를 남길 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 중앙 대합실 > 역내 공지 게시판",
          "tags": [
            "INDOOR",
            "UNDERGROUND"
          ]
        }
      ]
    },
    "E_B1_TICKET": {
      "id": "E_B1_TICKET",
      "floorId": "E_B1",
      "floor": "지하 1층 대합실·개찰층",
      "name": "발매 구역",
      "order": 2,
      "details": [
        {
          "id": "E_B1_MACHINE",
          "name": "자동발매기 열",
          "order": 1,
          "environment": "벽을 따라 자동발매기와 교통카드 충전기가 늘어서 있다.",
          "prompt": "발매기와 충전기를 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 발매 구역 > 자동발매기 열",
          "tags": [
            "INDOOR",
            "UNDERGROUND"
          ]
        },
        {
          "id": "E_B1_ROUTE_MAP",
          "name": "노선도 벽면",
          "order": 2,
          "environment": "공식 1~4번 승강장과 세 개 노선이 표시된 대형 노선도가 붙어 있다.",
          "prompt": "노선도와 주변 표식을 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 발매 구역 > 노선도 벽면",
          "tags": [
            "INDOOR",
            "UNDERGROUND"
          ]
        }
      ]
    },
    "E_B1_GATE": {
      "id": "E_B1_GATE",
      "floorId": "E_B1",
      "floor": "지하 1층 대합실·개찰층",
      "name": "개찰구",
      "order": 3,
      "details": [
        {
          "id": "E_B1_GATES",
          "name": "개찰기 열",
          "order": 1,
          "environment": "여러 개의 개찰기가 대합실과 승강장 통로를 가로막고 있다.",
          "prompt": "개찰기와 카드 인식부를 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 개찰구 > 개찰기 열",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "TRANSIT_NODE",
            "CCTV_CAMERA"
          ]
        },
        {
          "id": "E_B1_BOOTH",
          "name": "역무원 부스",
          "order": 2,
          "environment": "유리 부스 안에 작은 조작대와 서류 수납함이 보인다.",
          "prompt": "부스와 조작대를 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 개찰구 > 역무원 부스",
          "tags": [
            "INDOOR",
            "UNDERGROUND"
          ]
        },
        {
          "id": "E_B1_EMERGENCY_GATE",
          "name": "비상 개방문",
          "order": 3,
          "environment": "개찰기 옆 넓은 비상문이 수동 잠금쇠로 고정되어 있다.",
          "prompt": "비상문과 잠금쇠를 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 개찰구 > 비상 개방문",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "TRANSIT_NODE"
          ]
        }
      ]
    },
    "E_B1_SHELTER": {
      "id": "E_B1_SHELTER",
      "floorId": "E_B1",
      "floor": "지하 1층 대합실·개찰층",
      "name": "제4쉘터 입구",
      "order": 6,
      "details": [
        {
          "id": "E_B1_SHELTER_DOOR",
          "name": "방폭문",
          "order": 1,
          "environment": "두꺼운 방폭문이 대합실 끝 벽면에 묻혀 있고 바닥에 폐쇄선이 표시돼 있다.",
          "prompt": "방폭문과 주변 구조를 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 제4쉘터 입구 > 방폭문",
          "tags": [
            "INDOOR",
            "UNDERGROUND"
          ]
        },
        {
          "id": "E_B1_SHELTER_PANEL",
          "name": "호출·상태 패널",
          "order": 2,
          "environment": "문 옆 패널에 호출 버튼과 세 개의 상태등이 달려 있다.",
          "prompt": "패널과 표시등을 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 제4쉘터 입구 > 호출·상태 패널",
          "tags": [
            "INDOOR",
            "UNDERGROUND"
          ]
        },
        {
          "id": "E_B1_SHELTER_WAIT",
          "name": "대피 대기선",
          "order": 3,
          "environment": "문 앞 바닥에 인원 대기선과 접이식 의자가 놓여 있다.",
          "prompt": "대기선과 남은 대피 비품을 조사할 수 있다.",
          "path": "해오름역 > 지하 1층 대합실·개찰층 > 제4쉘터 입구 > 대피 대기선",
          "tags": [
            "INDOOR",
            "UNDERGROUND"
          ]
        }
      ]
    },
    "E_B2_TRANSFER": {
      "id": "E_B2_TRANSFER",
      "floorId": "E_B2",
      "floor": "지하 2층 승강장층",
      "name": "환승 통로",
      "order": 1,
      "details": [
        {
          "id": "E_B2_ESC",
          "name": "에스컬레이터",
          "order": 1,
          "environment": "대합실과 승강장을 잇는 긴 에스컬레이터가 멈춰 서 있다.",
          "prompt": "계단판과 비상 정지 장치를 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 환승 통로 > 에스컬레이터",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "TRANSIT_NODE",
            "CCTV_CAMERA"
          ]
        },
        {
          "id": "E_B2_STAIRS",
          "name": "중앙 계단",
          "order": 2,
          "environment": "승강장 방향 표지가 붙은 넓은 계단이 두 갈래로 나뉜다.",
          "prompt": "계단과 표지판을 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 환승 통로 > 중앙 계단",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "TRANSIT_NODE"
          ]
        },
        {
          "id": "E_B2_ELEVATOR",
          "name": "승강기 전실",
          "order": 3,
          "environment": "닫힌 승강기 문과 층 표시기가 작은 전실을 마주 보고 있다.",
          "prompt": "승강기와 호출 버튼을 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 환승 통로 > 승강기 전실",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "TRANSIT_NODE"
          ]
        },
        {
          "id": "E_B2_SIGN",
          "name": "승강장 방향 표지",
          "order": 4,
          "environment": "1·2번과 3·4번 승강장 방향이 색 띠로 나뉘어 있다.",
          "prompt": "표지판과 부착 상태를 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 환승 통로 > 승강장 방향 표지",
          "tags": [
            "INDOOR",
            "UNDERGROUND"
          ]
        }
      ]
    },
    "E_B2_P12": {
      "id": "E_B2_P12",
      "floorId": "E_B2",
      "floor": "지하 2층 승강장층",
      "name": "1·2번 승강장",
      "order": 2,
      "details": [
        {
          "id": "E_B2_P12_WAIT",
          "name": "대기 구역",
          "order": 1,
          "environment": "안전선 안쪽에 벤치와 기둥형 도착 안내기가 놓여 있다.",
          "prompt": "대기 구역과 안내기를 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 대기 구역",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "PLATFORM",
            "RAIL_NEARBY",
            "HIGH_NOISE",
            "CCTV_CAMERA"
          ]
        },
        {
          "id": "E_B2_P12_DOORS",
          "name": "스크린도어 열",
          "order": 2,
          "environment": "선로를 따라 스크린도어가 이어지고 일부 창에는 습기가 맺혀 있다.",
          "prompt": "스크린도어와 비상 개방부를 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 스크린도어 열",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "TRANSIT_NODE",
            "PLATFORM",
            "RAIL_NEARBY",
            "HIGH_NOISE",
            "CCTV_CA..."
          ]
        },
        {
          "id": "E_B2_P12_EMERGENCY",
          "name": "비상 설비함",
          "order": 3,
          "environment": "소화기와 비상 통화기가 든 붉은 설비함이 기둥 옆에 붙어 있다.",
          "prompt": "비상 설비와 통화기를 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 비상 설비함",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "PLATFORM",
            "RAIL_NEARBY",
            "HIGH_NOISE"
          ]
        },
        {
          "id": "E_B2_P12_SIGN",
          "name": "역명판",
          "order": 4,
          "environment": "해오름역 이름과 양방향 노선명이 적힌 역명판이다.",
          "prompt": "역명판과 주변 벽면을 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 역명판",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "PLATFORM",
            "RAIL_NEARBY",
            "HIGH_NOISE"
          ]
        }
      ]
    },
    "E_B2_SHELTER_STAIR": {
      "id": "E_B2_SHELTER_STAIR",
      "floorId": "E_B2",
      "floor": "지하 2층 승강장층",
      "name": "쉘터 비상계단 중간참",
      "order": 5,
      "details": [
        {
          "id": "E_B2_SHELTER_LANDING",
          "name": "중간 계단참",
          "order": 1,
          "environment": "지하 1층 쉘터 입구에서 내려온 비상계단이 지하 2층 높이에서 잠시 꺾인다.",
          "prompt": "중간 계단참과 층간 구조를 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 쉘터 비상계단 중간참 > 중간 계단참",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "TRANSIT_NODE"
          ]
        },
        {
          "id": "E_B2_SHELTER_DOOR",
          "name": "하부 기밀 방화문",
          "order": 2,
          "environment": "아래층 방향 계단 앞에 기밀 고무가 둘린 방화문이 닫혀 있다.",
          "prompt": "방화문과 층간 표시를 조사할 수 있다.",
          "path": "해오름역 > 지하 2층 승강장층 > 쉘터 비상계단 중간참 > 하부 기밀 방화문",
          "tags": [
            "INDOOR",
            "UNDERGROUND",
            "TRANSIT_NODE"
          ]
        }
      ]
    }
  },
  "objectsByDetail": {
    "E_G_INFO": [
      {
        "id": "E_OBJ_001",
        "detailId": "E_G_INFO",
        "name": "환승 안내 지도",
        "order": 1,
        "observation": "도시 외곽 환승 노선과 정류장이 표시된 금속 지도판이다.",
        "result": "지도판은 현재 역 주변의 일반 도로와 버스 정류장 위치만 확인할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "살핀다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "환승 안내대에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 환승광장 > 환승 안내대 > 환승 안내 지도"
      },
      {
        "id": "E_OBJ_002",
        "detailId": "E_G_INFO",
        "name": "안내대 서랍",
        "order": 2,
        "observation": "잠기지 않은 얕은 서랍이 안내대 아래에 있다.",
        "result": "서랍 안에는 일반 승차권과 볼펜, 경고 테이프가 섞여 있다.",
        "generalItems": [
          "승차권",
          "볼펜",
          "경고 테이프"
        ],
        "takeable": true,
        "actions": [
          "연다",
          "필요한 것을 챙긴다"
        ],
        "afterState": "일부 비워짐",
        "regenerates": true,
        "context": "환승 안내대에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 환승광장 > 환승 안내대 > 안내대 서랍"
      }
    ],
    "E_G_BENCH": [
      {
        "id": "E_OBJ_003",
        "detailId": "E_G_BENCH",
        "name": "금속 벤치",
        "order": 1,
        "observation": "빗물이 마른 자국과 긁힌 흔적이 남은 벤치다.",
        "result": "벤치 아래에는 접이식 우산과 작은 봉투가 떨어져 있다.",
        "generalItems": [
          "접이식 우산",
          "작은 봉투"
        ],
        "takeable": true,
        "actions": [
          "벤치 아래를 확인한다",
          "필요한 것을 챙긴다"
        ],
        "afterState": "일부 비워짐",
        "regenerates": true,
        "context": "대기 벤치 구역에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 환승광장 > 대기 벤치 구역 > 금속 벤치"
      }
    ],
    "E_G_VIEW": [
      {
        "id": "E_OBJ_004",
        "detailId": "E_G_VIEW",
        "name": "동쪽 난간",
        "order": 1,
        "observation": "도시 동쪽을 향해 낮은 난간이 이어진다.",
        "result": "같은 변주의 백색병원 옥상선과 시각신호탑 상부를 멀리 육안으로 볼 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "도시를 관찰한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "동쪽 도시 조망선에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 환승광장 > 동쪽 도시 조망선 > 동쪽 난간"
      }
    ],
    "E_G_EAST_DOOR": [
      {
        "id": "E_OBJ_005",
        "detailId": "E_G_EAST_DOOR",
        "name": "유리 방풍문",
        "order": 1,
        "observation": "넓은 유리문 두 장이 수동으로 밀리는 구조다.",
        "result": "문틀과 손잡이는 온전하며 지하로 내려가는 통로를 가리지 않는다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "문을 연다",
          "손잡이를 살핀다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "방풍문에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 동부 출입구 > 방풍문 > 유리 방풍문"
      }
    ],
    "E_G_EAST_STAIR": [
      {
        "id": "E_OBJ_006",
        "detailId": "E_G_EAST_STAIR",
        "name": "비상 유도등",
        "order": 1,
        "observation": "계단 벽 아래의 유도등이 일정한 간격으로 붙어 있다.",
        "result": "일부 유도등은 켜져 있고 일부는 전력이 약해 희미하다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "표시 방향을 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "지하 진입 계단에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 동부 출입구 > 지하 진입 계단 > 비상 유도등"
      }
    ],
    "E_G_EAST_DRAIN": [
      {
        "id": "E_OBJ_007",
        "detailId": "E_G_EAST_DRAIN",
        "name": "배수로 덮개",
        "order": 1,
        "observation": "철제 덮개 사이에 낙엽과 종이 조각이 끼어 있다.",
        "result": "덮개를 들어 올리면 일반 빗물이 천천히 내려가며 막힘을 치울 수 있다.",
        "generalItems": [
          "청소용 밀대",
          "작업용 장갑"
        ],
        "takeable": true,
        "actions": [
          "막힘을 치운다",
          "필요한 도구를 챙긴다"
        ],
        "afterState": "주변 정리됨",
        "regenerates": true,
        "context": "출입구 배수로에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 동부 출입구 > 출입구 배수로 > 배수로 덮개"
      }
    ],
    "E_G_WEST_CANOPY": [
      {
        "id": "E_OBJ_008",
        "detailId": "E_G_WEST_CANOPY",
        "name": "철제 캐노피",
        "order": 1,
        "observation": "계단 위를 덮은 캐노피에 바람과 빗물 자국이 남아 있다.",
        "result": "고정 볼트 일부가 느슨하지만 통과에는 문제가 없다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "고정 상태를 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "계단 캐노피에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 서부 출입구 > 계단 캐노피 > 철제 캐노피"
      }
    ],
    "E_G_WEST_BUS": [
      {
        "id": "E_OBJ_009",
        "detailId": "E_G_WEST_BUS",
        "name": "버스 노선 전광판",
        "order": 1,
        "observation": "도착 정보를 표시하던 전광판이 꺼져 있다.",
        "result": "케이블은 연결돼 있으나 지상 정류 설비에 전력이 들어오지 않는다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "전원 상태를 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "버스 안내 구역에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 서부 출입구 > 버스 안내 구역 > 버스 노선 전광판"
      },
      {
        "id": "E_OBJ_010",
        "detailId": "E_G_WEST_BUS",
        "name": "정류장 비품함",
        "order": 2,
        "observation": "투명문이 열린 작은 비품함이다.",
        "result": "반사 유도봉과 반사 조끼, 호루라기가 들어 있다.",
        "generalItems": [
          "반사 유도봉",
          "반사 조끼",
          "호루라기"
        ],
        "takeable": true,
        "actions": [
          "비품을 확인한다",
          "필요한 것을 챙긴다"
        ],
        "afterState": "일부 비워짐",
        "regenerates": true,
        "context": "버스 안내 구역에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 서부 출입구 > 버스 안내 구역 > 정류장 비품함"
      }
    ],
    "E_G_WEST_VIEW": [
      {
        "id": "E_OBJ_011",
        "detailId": "E_G_WEST_VIEW",
        "name": "서쪽 난간",
        "order": 1,
        "observation": "낮은 건물 사이로 아파트 옥상과 공원 수목선이 보인다.",
        "result": "같은 변주의 묵동 주거구역 옥상과 백양공원 시계탑 방향을 육안으로 관찰할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "도시를 관찰한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "서쪽 도시 조망선에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지상 환승광장 > 서부 출입구 > 서쪽 도시 조망선 > 서쪽 난간"
      }
    ],
    "E_B1_GUIDE": [
      {
        "id": "E_OBJ_012",
        "detailId": "E_B1_GUIDE",
        "name": "안내 창구",
        "order": 1,
        "observation": "낮은 창구와 마이크 구멍, 번호표 통이 남아 있다.",
        "result": "창구 안쪽에는 교통카드와 메모지, 볼펜이 놓여 있다.",
        "generalItems": [
          "교통카드",
          "메모지",
          "볼펜"
        ],
        "takeable": true,
        "actions": [
          "창구 안을 살핀다",
          "필요한 것을 챙긴다"
        ],
        "afterState": "일부 비워짐",
        "regenerates": true,
        "context": "종합 안내소에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 중앙 대합실 > 종합 안내소 > 안내 창구"
      }
    ],
    "E_B1_WAIT": [
      {
        "id": "E_OBJ_013",
        "detailId": "E_B1_WAIT",
        "name": "대기 벤치",
        "order": 1,
        "observation": "금속 프레임 벤치가 개찰구를 향해 놓여 있다.",
        "result": "좌석 아래에 작은 손전등과 물티슈가 떨어져 있다.",
        "generalItems": [
          "작은 손전등",
          "물티슈"
        ],
        "takeable": true,
        "actions": [
          "좌석 아래를 확인한다",
          "필요한 것을 챙긴다"
        ],
        "afterState": "일부 비워짐",
        "regenerates": true,
        "context": "대기 공간에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 중앙 대합실 > 대기 공간 > 대기 벤치"
      }
    ],
    "E_B1_BOARD": [
      {
        "id": "E_OBJ_014",
        "detailId": "E_B1_BOARD",
        "name": "역내 공지 게시판",
        "order": 1,
        "observation": "운행 안내와 시설 점검 공지가 붙은 코르크 게시판이다.",
        "result": "기존 공지를 읽거나 빈 슬롯에 메모를 남길 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "읽는다",
          "메모를 붙인다",
          "기존 종이를 제거한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "역내 공지 게시판에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 중앙 대합실 > 역내 공지 게시판 > 역내 공지 게시판"
      }
    ],
    "E_B1_MACHINE": [
      {
        "id": "E_OBJ_015",
        "detailId": "E_B1_MACHINE",
        "name": "자동발매기",
        "order": 1,
        "observation": "화면과 카드 투입구가 있는 발매기다.",
        "result": "전원 버튼과 내부 차단기는 온전하지만 화면이 켜지지 않는다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "전원 상태를 확인한다",
          "화면을 조작한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "자동발매기 열에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 발매 구역 > 자동발매기 열 > 자동발매기"
      },
      {
        "id": "E_OBJ_016",
        "detailId": "E_B1_MACHINE",
        "name": "교통카드 충전기",
        "order": 2,
        "observation": "작은 화면과 카드 거치대가 달린 충전기다.",
        "result": "전원 공급 후 카드 인식 시험은 가능하지만 결제망은 연결되지 않는다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "카드를 올린다",
          "화면을 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "자동발매기 열에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 발매 구역 > 자동발매기 열 > 교통카드 충전기"
      }
    ],
    "E_B1_ROUTE_MAP": [
      {
        "id": "E_OBJ_017",
        "detailId": "E_B1_ROUTE_MAP",
        "name": "대형 노선도",
        "order": 1,
        "observation": "1~4번 승강장과 세 개 노선이 표시된 공식 노선도다.",
        "result": "노선도에는 현재 공개된 승강장과 환승 방향만 확인할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "노선을 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "노선도 벽면에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 발매 구역 > 노선도 벽면 > 대형 노선도"
      }
    ],
    "E_B1_GATES": [
      {
        "id": "E_OBJ_018",
        "detailId": "E_B1_GATES",
        "name": "개찰기",
        "order": 1,
        "observation": "카드 인식부와 회전문이 있는 개찰기다.",
        "result": "전원 없이 잠겨 있지만 측면 수동 해제구는 온전하다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "카드를 대본다",
          "수동 해제구를 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "개찰기 열에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 개찰구 > 개찰기 열 > 개찰기"
      }
    ],
    "E_B1_BOOTH": [
      {
        "id": "E_OBJ_019",
        "detailId": "E_B1_BOOTH",
        "name": "개찰 제어대",
        "order": 1,
        "observation": "역무원 부스 안에 개찰기 개방 버튼과 상태등이 있다.",
        "result": "상태등은 꺼져 있으나 비상문 수동 잠금은 별도로 조작할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "제어 버튼을 확인한다",
          "수동 잠금을 살핀다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "역무원 부스에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 개찰구 > 역무원 부스 > 개찰 제어대"
      }
    ],
    "E_B1_EMERGENCY_GATE": [
      {
        "id": "E_OBJ_020",
        "detailId": "E_B1_EMERGENCY_GATE",
        "name": "비상문 잠금쇠",
        "order": 1,
        "observation": "넓은 비상문을 고정하는 수동 잠금쇠다.",
        "result": "손으로 잠금쇠를 풀 수 있으며 전원과 무관하게 개방 가능하다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "잠금쇠를 푼다",
          "문을 연다"
        ],
        "afterState": "비상문 개방",
        "regenerates": true,
        "context": "비상 개방문에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 개찰구 > 비상 개방문 > 비상문 잠금쇠"
      }
    ],
    "E_B1_SHELTER_DOOR": [
      {
        "id": "E_OBJ_031",
        "detailId": "E_B1_SHELTER_DOOR",
        "name": "제4쉘터 방폭문",
        "order": 1,
        "observation": "두꺼운 금속문과 바닥 밀폐 레일이 대합실 끝에 설치돼 있다.",
        "result": "문 상태는 메인 사건에 따라 결정되며 일반 조사 행동으로 강제 개방할 수 없다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "문 상태를 확인한다",
          "두드린다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "방폭문에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 제4쉘터 입구 > 방폭문 > 제4쉘터 방폭문"
      }
    ],
    "E_B1_SHELTER_PANEL": [
      {
        "id": "E_OBJ_032",
        "detailId": "E_B1_SHELTER_PANEL",
        "name": "상태 패널",
        "order": 1,
        "observation": "호출 버튼과 압력·폐쇄 준비 상태등이 달린 패널이다.",
        "result": "비상 회로가 활성화되면 문 안쪽 상태와 호출 가능 여부를 확인할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "호출 버튼을 누른다",
          "상태등을 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "호출·상태 패널에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 제4쉘터 입구 > 호출·상태 패널 > 상태 패널"
      }
    ],
    "E_B1_SHELTER_WAIT": [
      {
        "id": "E_OBJ_033",
        "detailId": "E_B1_SHELTER_WAIT",
        "name": "대피 비품 상자",
        "order": 1,
        "observation": "접이식 의자 옆에 밀봉된 대피 비품 상자가 있다.",
        "result": "마스크와 얇은 담요, 생수가 들어 있다.",
        "generalItems": [
          "마스크",
          "얇은 담요",
          "생수"
        ],
        "takeable": true,
        "actions": [
          "상자를 연다",
          "필요한 것을 챙긴다"
        ],
        "afterState": "일부 비워짐",
        "regenerates": true,
        "context": "대피 대기선에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 1층 대합실·개찰층 > 제4쉘터 입구 > 대피 대기선 > 대피 비품 상자"
      }
    ],
    "E_B2_ESC": [
      {
        "id": "E_OBJ_034",
        "detailId": "E_B2_ESC",
        "name": "에스컬레이터 구동부",
        "order": 1,
        "observation": "멈춘 계단판과 비상 정지 버튼이 보인다.",
        "result": "주전원 복구 후 저속 운전이 가능하지만 손상 변주에서는 계단처럼 이용해야 할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "비상 정지를 해제한다",
          "운전을 시도한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "에스컬레이터에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 환승 통로 > 에스컬레이터 > 에스컬레이터 구동부"
      }
    ],
    "E_B2_STAIRS": [
      {
        "id": "E_OBJ_035",
        "detailId": "E_B2_STAIRS",
        "name": "중앙 계단 난간",
        "order": 1,
        "observation": "두 갈래 계단을 나누는 금속 난간이다.",
        "result": "난간 고정 상태와 바닥의 일반 파손을 확인할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "흔들림을 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "중앙 계단에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 환승 통로 > 중앙 계단 > 중앙 계단 난간"
      }
    ],
    "E_B2_ELEVATOR": [
      {
        "id": "E_OBJ_036",
        "detailId": "E_B2_ELEVATOR",
        "name": "승강기 호출판",
        "order": 1,
        "observation": "층 표시기와 호출 버튼이 달려 있다.",
        "result": "전원 복구 후 호출은 가능하지만 변주별 구조 손상에 따라 운행이 제한될 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "호출 버튼을 누른다",
          "표시기를 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "승강기 전실에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 환승 통로 > 승강기 전실 > 승강기 호출판"
      }
    ],
    "E_B2_SIGN": [
      {
        "id": "E_OBJ_037",
        "detailId": "E_B2_SIGN",
        "name": "방향 표지판",
        "order": 1,
        "observation": "승강장 방향을 색 띠와 화살표로 표시한다.",
        "result": "표지판은 1·2번과 3·4번 승강장 방향을 구분한다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "표시 방향을 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "승강장 방향 표지에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 환승 통로 > 승강장 방향 표지 > 방향 표지판"
      }
    ],
    "E_B2_P12_WAIT": [
      {
        "id": "E_OBJ_038",
        "detailId": "E_B2_P12_WAIT",
        "name": "도착 안내기",
        "order": 1,
        "observation": "열차 도착과 운행 상태를 표시하는 기둥형 안내기다.",
        "result": "전원 복구 후 일반 운행 대기 화면과 현재 시각을 표시한다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "화면을 확인한다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "대기 구역에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 대기 구역 > 도착 안내기"
      },
      {
        "id": "E_OBJ_039",
        "detailId": "E_B2_P12_WAIT",
        "name": "승강장 벤치",
        "order": 2,
        "observation": "금속 벤치와 작은 쓰레기통이 안전선 안쪽에 놓여 있다.",
        "result": "벤치 아래에 비닐우산과 휴지가 남아 있다.",
        "generalItems": [
          "비닐우산",
          "휴지"
        ],
        "takeable": true,
        "actions": [
          "벤치 아래를 확인한다",
          "필요한 것을 챙긴다"
        ],
        "afterState": "일부 비워짐",
        "regenerates": true,
        "context": "대기 구역에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 대기 구역 > 승강장 벤치"
      }
    ],
    "E_B2_P12_DOORS": [
      {
        "id": "E_OBJ_040",
        "detailId": "E_B2_P12_DOORS",
        "name": "스크린도어 비상 손잡이",
        "order": 1,
        "observation": "스크린도어 한 칸에 붉은 비상 손잡이가 달려 있다.",
        "result": "평상시 잠금 상태이며 비상 개방은 현재 선로 상태와 문 정렬을 확인한 뒤 가능하다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "손잡이를 확인한다",
          "문 정렬을 살핀다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "스크린도어 열에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 스크린도어 열 > 스크린도어 비상 손잡이"
      }
    ],
    "E_B2_P12_EMERGENCY": [
      {
        "id": "E_OBJ_041",
        "detailId": "E_B2_P12_EMERGENCY",
        "name": "승강장 비상통화기",
        "order": 1,
        "observation": "통화 버튼과 작은 스피커가 달린 장치다.",
        "result": "비상통화 회선이 활성화되면 역무실이나 다른 승강장 수신 단말과 연결할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "통화 버튼을 누른다",
          "응답을 기다린다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "비상 설비함에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 비상 설비함 > 승강장 비상통화기"
      },
      {
        "id": "E_OBJ_042",
        "detailId": "E_B2_P12_EMERGENCY",
        "name": "비상 설비함",
        "order": 2,
        "observation": "투명문 안에 소화기와 반사 유도봉이 들어 있다.",
        "result": "일반 비상 장비를 꺼낼 수 있다.",
        "generalItems": [
          "소화기",
          "반사 유도봉"
        ],
        "takeable": true,
        "actions": [
          "문을 연다",
          "필요한 것을 챙긴다"
        ],
        "afterState": "일부 비워짐",
        "regenerates": true,
        "context": "비상 설비함에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 비상 설비함 > 비상 설비함"
      }
    ],
    "E_B2_P12_SIGN": [
      {
        "id": "E_OBJ_043",
        "detailId": "E_B2_P12_SIGN",
        "name": "역명판",
        "order": 1,
        "observation": "해오름역과 인접역 방향이 적힌 역명판이다.",
        "result": "공식 승강장 번호와 노선 방향을 확인할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "읽는다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "역명판에서 확인할 수 있는 일반 환경·설비 오브젝트",
        "path": "해오름역 > 지하 2층 승강장층 > 1·2번 승강장 > 역명판 > 역명판"
      }
    ],
    "E_B2_SHELTER_LANDING": [
      {
        "id": "E_OBJ_089",
        "detailId": "E_B2_SHELTER_LANDING",
        "name": "층간 위치 표지",
        "order": 1,
        "observation": "벽면에 B1·B2·B3 높이를 표시하는 작은 방재 표지가 붙어 있다.",
        "result": "현재 계단참이 지하 2층 높이에 있다는 것과 위·아래 계단 방향만 확인할 수 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "표지를 읽는다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "중간 계단참에서 확인할 수 있는 일반 방재 표지",
        "path": "해오름역 > 지하 2층 승강장층 > 쉘터 비상계단 중간참 > 중간 계단참 > 층간 위치 표지"
      }
    ],
    "E_B2_SHELTER_DOOR": [
      {
        "id": "E_OBJ_090",
        "detailId": "E_B2_SHELTER_DOOR",
        "name": "기밀 방화문",
        "order": 1,
        "observation": "아래층 방향 계단 앞을 막는 방화문이다.",
        "result": "손잡이는 움직이지만 아래쪽 계단은 어둡고, 문 너머의 방향 표지는 접힌 덮개에 가려져 있다.",
        "generalItems": [],
        "takeable": false,
        "actions": [
          "손잡이를 확인한다",
          "문 너머 소리를 듣는다"
        ],
        "afterState": "변화 없음",
        "regenerates": true,
        "context": "하부 기밀 방화문에서 확인할 수 있는 일반 구조물",
        "path": "해오름역 > 지하 2층 승강장층 > 쉘터 비상계단 중간참 > 하부 기밀 방화문 > 기밀 방화문"
      }
    ]
  },
  "itemCatalog": {
    "ITEM_019": {
      "id": "ITEM_019",
      "name": "마스크",
      "category": "생활용품",
      "tags": [
        "RESPIRATORY_PROTECTION"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "RESPIRATORY_PROTECTION",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_022": {
      "id": "ITEM_022",
      "name": "메모지",
      "category": "기록·문구",
      "tags": [
        "NOTE_MATERIAL",
        "PAPER_SHEET"
      ],
      "stackable": true,
      "consumable": true,
      "maxStack": 20,
      "primary": "PAPER_SHEET",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_027": {
      "id": "ITEM_027",
      "name": "물티슈",
      "category": "생활용품",
      "tags": [
        "WET_WIPE"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "WET_WIPE",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_030": {
      "id": "ITEM_030",
      "name": "반사 조끼",
      "category": "안전",
      "tags": [
        "VISIBILITY_GEAR"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "VISIBILITY_GEAR",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "하중 지지·손 보호 불가"
    },
    "ITEM_039": {
      "id": "ITEM_039",
      "name": "볼펜",
      "category": "기록·문구",
      "tags": [
        "MARKING_TOOL",
        "WRITING_TOOL"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "WRITING_TOOL",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_043": {
      "id": "ITEM_043",
      "name": "비닐우산",
      "category": "생활용품",
      "tags": [
        "LONG_REACH_TOOL",
        "WATERPROOF_COVER"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "WATERPROOF_COVER",
      "secondary": "젖은 표면을 가리거나 밀 수 있으나 하중 지지에는 부적합",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_048": {
      "id": "ITEM_048",
      "name": "생수",
      "category": "식음료",
      "tags": [
        "CONSUMABLE",
        "WATER_SOURCE"
      ],
      "stackable": true,
      "consumable": true,
      "maxStack": 20,
      "primary": "CONSUMABLE",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_051": {
      "id": "ITEM_051",
      "name": "소화기",
      "category": "생활용품",
      "tags": [
        "HEAVY_OBJECT",
        "PRESSURIZED_TOOL"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "PRESSURIZED_TOOL",
      "secondary": "무거운 추나 문 고정물로 쓸 수 있으나 정밀 작업에는 감점",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_060": {
      "id": "ITEM_060",
      "name": "얇은 담요",
      "category": "기록·문구",
      "tags": [
        "INSULATION_CLOTH",
        "LARGE_CLOTH"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "LARGE_CLOTH",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_075": {
      "id": "ITEM_075",
      "name": "작업용 장갑",
      "category": "의료",
      "tags": [
        "HAND_PROTECTION"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "HAND_PROTECTION",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_078": {
      "id": "ITEM_078",
      "name": "작은 봉투",
      "category": "기록·문구",
      "tags": [
        "NOTE_MATERIAL",
        "PAPER_CONTAINER"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "PAPER_CONTAINER",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_079": {
      "id": "ITEM_079",
      "name": "작은 손전등",
      "category": "조명·전원",
      "tags": [
        "PORTABLE_LIGHT",
        "SIGNAL_LIGHT"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "PORTABLE_LIGHT",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_089": {
      "id": "ITEM_089",
      "name": "접이식 우산",
      "category": "생활용품",
      "tags": [
        "LONG_REACH_TOOL",
        "WATERPROOF_COVER"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "WATERPROOF_COVER",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_111": {
      "id": "ITEM_111",
      "name": "호루라기",
      "category": "생활용품",
      "tags": [
        "SIGNAL_DEVICE"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "SIGNAL_DEVICE",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_114": {
      "id": "ITEM_114",
      "name": "휴지",
      "category": "생활용품",
      "tags": [
        "ABSORBENT_MATERIAL",
        "PAPER_TISSUE"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "ABSORBENT_MATERIAL",
      "secondary": "태그와 사용 서술을 함께 보고 물리적으로 타당한 임기응변만 허용",
      "baseFit": 90,
      "misusePenalty": "기능과 크기·재질이 맞지 않으면 적합도 감점"
    },
    "ITEM_117": {
      "id": "ITEM_117",
      "name": "승차권",
      "category": "표식·소지품",
      "tags": [
        "TICKET_TOKEN",
        "PAPER_TOKEN"
      ],
      "stackable": true,
      "consumable": false,
      "maxStack": 20,
      "primary": "TICKET_TOKEN",
      "secondary": "자유 행동 서술과 재질·길이·하중을 함께 보고 물리적으로 타당한 범위에서 보조 기능 인정",
      "baseFit": 90,
      "misusePenalty": "용도·크기·강도가 맞지 않으면 적합도 감점"
    },
    "ITEM_118": {
      "id": "ITEM_118",
      "name": "교통카드",
      "category": "표식·소지품",
      "tags": [
        "TRANSIT_CARD",
        "MARKER_TOKEN"
      ],
      "stackable": true,
      "consumable": false,
      "maxStack": 5,
      "primary": "TRANSIT_CARD",
      "secondary": "자유 행동 서술과 재질·길이·하중을 함께 보고 물리적으로 타당한 범위에서 보조 기능 인정",
      "baseFit": 90,
      "misusePenalty": "용도·크기·강도가 맞지 않으면 적합도 감점"
    },
    "ITEM_119": {
      "id": "ITEM_119",
      "name": "반사 유도봉",
      "category": "안전·신호",
      "tags": [
        "SIGNAL_LIGHT",
        "VISIBILITY_GEAR"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "SIGNAL_LIGHT",
      "secondary": "자유 행동 서술과 재질·길이·하중을 함께 보고 물리적으로 타당한 범위에서 보조 기능 인정",
      "baseFit": 90,
      "misusePenalty": "용도·크기·강도가 맞지 않으면 적합도 감점"
    },
    "ITEM_120": {
      "id": "ITEM_120",
      "name": "청소용 밀대",
      "category": "공구",
      "tags": [
        "LONG_REACH_TOOL",
        "CLEANING_TOOL",
        "PUSH_TOOL"
      ],
      "stackable": false,
      "consumable": false,
      "maxStack": 1,
      "primary": "LONG_REACH_TOOL",
      "secondary": "자유 행동 서술과 재질·길이·하중을 함께 보고 물리적으로 타당한 범위에서 보조 기능 인정",
      "baseFit": 90,
      "misusePenalty": "용도·크기·강도가 맞지 않으면 적합도 감점"
    },
    "ITEM_123": {
      "id": "ITEM_123",
      "name": "경고 테이프",
      "category": "기록·표시",
      "tags": [
        "MARKING_TOOL",
        "BOARD_TAPE",
        "BARRIER_TAPE"
      ],
      "stackable": true,
      "consumable": true,
      "maxStack": 5,
      "primary": "MARKING_TOOL",
      "secondary": "자유 행동 서술과 재질·길이·하중을 함께 보고 물리적으로 타당한 범위에서 보조 기능 인정",
      "baseFit": 90,
      "misusePenalty": "용도·크기·강도가 맞지 않으면 적합도 감점"
    }
  },
  "objectItems": {
    "E_OBJ_002": [
      {
        "itemId": "ITEM_117",
        "name": "승차권",
        "min": 1,
        "max": 2,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_039",
        "name": "볼펜",
        "min": 1,
        "max": 2,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_123",
        "name": "경고 테이프",
        "min": 1,
        "max": 2,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ],
    "E_OBJ_003": [
      {
        "itemId": "ITEM_089",
        "name": "접이식 우산",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_078",
        "name": "작은 봉투",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ],
    "E_OBJ_007": [
      {
        "itemId": "ITEM_120",
        "name": "청소용 밀대",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "주변 정리됨",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_075",
        "name": "작업용 장갑",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "주변 정리됨",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ],
    "E_OBJ_010": [
      {
        "itemId": "ITEM_119",
        "name": "반사 유도봉",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_030",
        "name": "반사 조끼",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_111",
        "name": "호루라기",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ],
    "E_OBJ_012": [
      {
        "itemId": "ITEM_118",
        "name": "교통카드",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_022",
        "name": "메모지",
        "min": 1,
        "max": 2,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_039",
        "name": "볼펜",
        "min": 1,
        "max": 2,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ],
    "E_OBJ_013": [
      {
        "itemId": "ITEM_079",
        "name": "작은 손전등",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_027",
        "name": "물티슈",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ],
    "E_OBJ_033": [
      {
        "itemId": "ITEM_019",
        "name": "마스크",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_060",
        "name": "얇은 담요",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_048",
        "name": "생수",
        "min": 1,
        "max": 2,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ],
    "E_OBJ_039": [
      {
        "itemId": "ITEM_043",
        "name": "비닐우산",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_114",
        "name": "휴지",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ],
    "E_OBJ_042": [
      {
        "itemId": "ITEM_051",
        "name": "소화기",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      },
      {
        "itemId": "ITEM_119",
        "name": "반사 유도봉",
        "min": 1,
        "max": 1,
        "default": 1,
        "revealedOnInspect": true,
        "autoTake": false,
        "action": "TAKE_ITEM",
        "afterState": "일부 비워짐",
        "duplicateSameLoop": false,
        "regenerates": true
      }
    ]
  },
  "routes": [
    {
      "id": "E_R001",
      "from": "E_ENTRY",
      "fromName": "해오름역 구역 입구",
      "to": "E_G_PLAZA",
      "toName": "지상 환승광장",
      "moveType": "도보",
      "choice": "지상 환승광장(으)로 이동",
      "narration": "해오름역 구역 입구에서 지상 환승광장 방향으로 물리 경로를 따라 이동한다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_ENTRY",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "ENTRY",
      "toFloor": "E_G",
      "step": "FLOOR_MOVE"
    },
    {
      "id": "E_R002",
      "from": "E_G_PLAZA",
      "fromName": "환승광장",
      "to": "E_G_EAST",
      "toName": "동부 출입구",
      "moveType": "도보",
      "choice": "동부 출입구(으)로 이동",
      "narration": "환승광장에서 동부 출입구 방향으로 물리 경로를 따라 이동한다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_G_PLAZA",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_G",
      "toFloor": "EXIT",
      "step": "FLOOR_MOVE"
    },
    {
      "id": "E_R003",
      "from": "E_G_PLAZA",
      "fromName": "환승광장",
      "to": "E_G_WEST",
      "toName": "서부 출입구",
      "moveType": "도보",
      "choice": "서부 출입구(으)로 이동",
      "narration": "환승광장에서 서부 출입구 방향으로 물리 경로를 따라 이동한다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_G_PLAZA",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_G",
      "toFloor": "E_G",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R004",
      "from": "E_G_EAST",
      "fromName": "동부 출입구",
      "to": "E_B1_CONCOURSE",
      "toName": "지하 1층 중앙 대합실",
      "moveType": "계단",
      "choice": "지하 1층 중앙 대합실(으)로 이동",
      "narration": "동부 출입구의 지하 계단을 따라 지하 1층 중앙 대합실로 내려간다.",
      "blockedAlternative": "서부 출입구 또는 현재 위치의 다른 경로를 확인",
      "condition": "current_node == E_G_EAST && story_day >= 1",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_G",
      "toFloor": "E_G",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R005",
      "from": "E_B1_CONCOURSE",
      "fromName": "중앙 대합실",
      "to": "E_B1_TICKET",
      "toName": "발매 구역",
      "moveType": "복도",
      "choice": "발매 구역(으)로 이동",
      "narration": "중앙 대합실에서 발매 구역 방향으로 물리 경로를 따라 이동한다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B1_CONCOURSE",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_G",
      "toFloor": "E_G",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R006",
      "from": "E_B1_CONCOURSE",
      "fromName": "중앙 대합실",
      "to": "E_B1_GATE",
      "toName": "개찰구",
      "moveType": "복도",
      "choice": "개찰구(으)로 이동",
      "narration": "중앙 대합실에서 개찰구 방향으로 물리 경로를 따라 이동한다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B1_CONCOURSE",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_G",
      "toFloor": "E_G",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R009",
      "from": "E_B1_CONCOURSE",
      "fromName": "중앙 대합실",
      "to": "E_B1_SHELTER",
      "toName": "제4쉘터 입구",
      "moveType": "복도",
      "choice": "제4쉘터 입구(으)로 이동",
      "narration": "중앙 대합실에서 제4쉘터 입구 방향으로 물리 경로를 따라 이동한다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B1_CONCOURSE",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_B1",
      "toFloor": "E_B1",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R010",
      "from": "E_B1_GATE",
      "fromName": "개찰구",
      "to": "E_B2_TRANSFER",
      "toName": "지하 2층 환승 통로",
      "moveType": "에스컬레이터",
      "choice": "지하 2층 환승 통로(으)로 이동",
      "narration": "개찰구에서 지하 2층 환승 통로 방향으로 물리 경로를 따라 이동한다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B1_GATE",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_B1",
      "toFloor": "E_B1",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R011",
      "from": "E_B2_TRANSFER",
      "fromName": "환승 통로",
      "to": "E_B2_P12",
      "toName": "1·2번 승강장",
      "moveType": "승강장",
      "choice": "1·2번 승강장(으)로 이동",
      "narration": "환승 통로에서 1·2번 승강장 방향으로 물리 경로를 따라 이동한다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B2_TRANSFER",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_B1",
      "toFloor": "E_B1",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R020",
      "from": "E_B1_SHELTER",
      "fromName": "제4쉘터 입구",
      "to": "E_B2_SHELTER_STAIR",
      "toName": "쉘터 비상계단 중간참",
      "moveType": "비상계단",
      "choice": "쉘터 비상계단 중간참(으)로 이동",
      "narration": "제4쉘터 입구에서 비상계단을 따라 지하 2층 중간참으로 내려간다.",
      "blockedAlternative": "중앙 대합실로 돌아가거나 현재 위치의 다른 경로를 확인",
      "condition": "current_node == E_B1_SHELTER && story_day >= 1",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_B1",
      "toFloor": "E_B2",
      "step": "FLOOR_MOVE"
    },
    {
      "id": "E_R001_REV",
      "from": "E_G_PLAZA",
      "fromName": "지상 환승광장",
      "to": "E_ENTRY",
      "toName": "해오름역 구역 입구",
      "moveType": "도보",
      "choice": "해오름역 구역 입구(으)로 돌아가기",
      "narration": "지상 환승광장에서 지나온 경로를 따라 해오름역 구역 입구 방향으로 되돌아간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_G_PLAZA",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_B3",
      "toFloor": "E_B2",
      "step": "FLOOR_MOVE"
    },
    {
      "id": "E_R002_REV",
      "from": "E_G_EAST",
      "fromName": "동부 출입구",
      "to": "E_G_PLAZA",
      "toName": "환승광장",
      "moveType": "도보",
      "choice": "환승광장(으)로 돌아가기",
      "narration": "동부 출입구에서 지나온 경로를 따라 환승광장 방향으로 되돌아간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_G_EAST",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_B3",
      "toFloor": "E_B3",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R003_REV",
      "from": "E_G_WEST",
      "fromName": "서부 출입구",
      "to": "E_G_PLAZA",
      "toName": "환승광장",
      "moveType": "도보",
      "choice": "환승광장(으)로 돌아가기",
      "narration": "서부 출입구에서 지나온 경로를 따라 환승광장 방향으로 되돌아간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_G_WEST",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_B3",
      "toFloor": "E_B3",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R004_REV",
      "from": "E_B1_CONCOURSE",
      "fromName": "지하 1층 중앙 대합실",
      "to": "E_G_EAST",
      "toName": "동부 출입구",
      "moveType": "계단",
      "choice": "동부 출입구(으)로 돌아가기",
      "narration": "지하 1층 중앙 대합실에서 동부 출입구 방향 계단을 따라 올라간다.",
      "blockedAlternative": "서부 출입구 또는 현재 위치의 다른 경로를 확인",
      "condition": "current_node == E_B1_CONCOURSE && story_day >= 1",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_B3",
      "toFloor": "E_B3",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R005_REV",
      "from": "E_B1_TICKET",
      "fromName": "발매 구역",
      "to": "E_B1_CONCOURSE",
      "toName": "중앙 대합실",
      "moveType": "복도",
      "choice": "중앙 대합실(으)로 돌아가기",
      "narration": "발매 구역에서 지나온 경로를 따라 중앙 대합실 방향으로 되돌아간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B1_TICKET",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_B3",
      "toFloor": "E_B3",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R006_REV",
      "from": "E_B1_GATE",
      "fromName": "개찰구",
      "to": "E_B1_CONCOURSE",
      "toName": "중앙 대합실",
      "moveType": "복도",
      "choice": "중앙 대합실(으)로 돌아가기",
      "narration": "개찰구에서 지나온 경로를 따라 중앙 대합실 방향으로 되돌아간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B1_GATE",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_B3",
      "toFloor": "E_B3",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R009_REV",
      "from": "E_B1_SHELTER",
      "fromName": "제4쉘터 입구",
      "to": "E_B1_CONCOURSE",
      "toName": "중앙 대합실",
      "moveType": "복도",
      "choice": "중앙 대합실(으)로 돌아가기",
      "narration": "제4쉘터 입구에서 지나온 경로를 따라 중앙 대합실 방향으로 되돌아간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B1_SHELTER",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_B3",
      "toFloor": "E_B3",
      "step": "PLACE_MOVE"
    },
    {
      "id": "E_R010_REV",
      "from": "E_B2_TRANSFER",
      "fromName": "지하 2층 환승 통로",
      "to": "E_B1_GATE",
      "toName": "개찰구",
      "moveType": "에스컬레이터",
      "choice": "개찰구(으)로 돌아가기",
      "narration": "지하 2층 환승 통로에서 지나온 경로를 따라 개찰구 방향으로 되돌아간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B2_TRANSFER",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_B1",
      "toFloor": "E_B3",
      "step": "FLOOR_MOVE"
    },
    {
      "id": "E_R011_REV",
      "from": "E_B2_P12",
      "fromName": "1·2번 승강장",
      "to": "E_B2_TRANSFER",
      "toName": "환승 통로",
      "moveType": "승강장",
      "choice": "환승 통로(으)로 돌아가기",
      "narration": "1·2번 승강장에서 지나온 경로를 따라 환승 통로 방향으로 되돌아간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B2_P12",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "통로가 이어져 있어 이동할 수 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_B3",
      "toFloor": "E_B1",
      "step": "FLOOR_MOVE"
    },
    {
      "id": "E_R020_REV",
      "from": "E_B2_SHELTER_STAIR",
      "fromName": "쉘터 비상계단 중간참",
      "to": "E_B1_SHELTER",
      "toName": "제4쉘터 입구",
      "moveType": "비상계단",
      "choice": "제4쉘터 입구(으)로 돌아가기",
      "narration": "쉘터 비상계단 중간참에서 지하 1층 제4쉘터 입구 방향으로 올라간다.",
      "blockedAlternative": "현재 위치에서 연결된 다른 경로를 확인",
      "condition": "current_node == E_B2_SHELTER_STAIR && story_day >= 1",
      "defaultState": "CLOSED",
      "requiredState": "OPEN",
      "lockedText": "열차가 없거나 승강장문과 출입문이 맞지 않아 건널 수 없다.",
      "openText": "승강장문과 열차문 사이에 안전 발판이 놓여 탑승할 수 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_B2",
      "toFloor": "E_B1",
      "step": "FLOOR_MOVE"
    },
    {
      "id": "E_R030",
      "from": "E_G_WEST",
      "fromName": "서부 출입구",
      "to": "E_B1_CONCOURSE",
      "toName": "지하 1층 중앙 대합실",
      "moveType": "계단",
      "choice": "지하 1층 중앙 대합실(으)로 이동",
      "narration": "서부 출입구의 지하 계단을 따라 지하 1층 중앙 대합실로 내려간다.",
      "blockedAlternative": "동부 출입구 또는 현재 위치의 다른 경로를 확인",
      "condition": "current_node == E_G_WEST && story_day >= 1",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "계단 통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "서부 출입구와 대합실 사이 계단이 이어져 있다.",
      "direction": "FORWARD",
      "fromFloor": "E_G",
      "toFloor": "E_B1",
      "step": "FLOOR_MOVE"
    },
    {
      "id": "E_R030_REV",
      "from": "E_B1_CONCOURSE",
      "fromName": "지하 1층 중앙 대합실",
      "to": "E_G_WEST",
      "toName": "서부 출입구",
      "moveType": "계단",
      "choice": "서부 출입구(으)로 돌아가기",
      "narration": "지하 1층 중앙 대합실에서 서부 출입구 방향 계단을 따라 올라간다.",
      "blockedAlternative": "동부 출입구 또는 현재 위치의 다른 경로를 확인",
      "condition": "current_node == E_B1_CONCOURSE && story_day >= 1",
      "defaultState": "OPEN",
      "requiredState": "OPEN",
      "lockedText": "계단 통로가 막혀 현재는 지나갈 수 없다.",
      "openText": "대합실과 서부 출입구 사이 계단이 이어져 있다.",
      "direction": "REVERSE",
      "fromFloor": "E_B1",
      "toFloor": "E_G",
      "step": "FLOOR_MOVE"
    }
  ],
  "riskProfiles": {
    "E_R001:a": {
      "id": "RISK_E_R001_a",
      "routeId": "E_R001",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_TEMP_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R001:b": {
      "id": "RISK_E_R001_b",
      "routeId": "E_R001",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R001:c": {
      "id": "RISK_E_R001_c",
      "routeId": "E_R001",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_04",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R001:d": {
      "id": "RISK_E_R001_d",
      "routeId": "E_R001",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_05",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사이를 가른다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R002:a": {
      "id": "RISK_E_R002_a",
      "routeId": "E_R002",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "통로 한가운데 카트·상자·가구가 비스듬히 쌓여 발 디딜 폭이 좁다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R002:b": {
      "id": "RISK_E_R002_b",
      "routeId": "E_R002",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_TEMP_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "같은 복도가 반투명하게 두 겹 겹치며 문과 표지판 위치가 조금씩 다르다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R002:c": {
      "id": "RISK_E_R002_c",
      "routeId": "E_R002",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_04",
        "HZ_CONT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다. / 앞쪽에서 시작된 흰 발자국이 이동 방향과 ...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R002:d": {
      "id": "RISK_E_R002_d",
      "routeId": "E_R002",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_01",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "같은 복도가 반투명하게 두 겹 겹치며 문과 표지판 위치가 조금씩 다르다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R003:a": {
      "id": "RISK_E_R003_a",
      "routeId": "E_R003",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R003:b": {
      "id": "RISK_E_R003_b",
      "routeId": "E_R003",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_CONT_03"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "통로 한쪽에 사람 형체를 닮은 젖은 웅덩이가 있고 가장자리가 미세하게 움직인다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R003:c": {
      "id": "RISK_E_R003_c",
      "routeId": "E_R003",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_01",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "통로 한가운데 카트·상자·가구가 비스듬히 쌓여 발 디딜 폭이 좁다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사이를 ...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R003:d": {
      "id": "RISK_E_R003_d",
      "routeId": "E_R003",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_04",
        "HZ_CONT_03"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다. / 통로 한쪽에 사람 형체를 닮은 젖은 웅덩이...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R004:a": {
      "id": "RISK_E_R004_a",
      "routeId": "E_R004",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_ENV_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R004:b": {
      "id": "RISK_E_R004_b",
      "routeId": "E_R004",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_ENV_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "벽과 바닥이 일정하지 않은 간격으로 진동하며 먼 곳에서 금속이 울린다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R004:c": {
      "id": "RISK_E_R004_c",
      "routeId": "E_R004",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R004:d": {
      "id": "RISK_E_R004_d",
      "routeId": "E_R004",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R005:a": {
      "id": "RISK_E_R005_a",
      "routeId": "E_R005",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R005:b": {
      "id": "RISK_E_R005_b",
      "routeId": "E_R005",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_WATER_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "파손된 배관에서 흐른 물이 흰 잔류물을 넓게 번지게 하고 있다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R005:c": {
      "id": "RISK_E_R005_c",
      "routeId": "E_R005",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_07",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "발소리와 열차 소리가 실제 통로와 반대편에서 먼저 들려 방향 감각을 흐린다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R005:d": {
      "id": "RISK_E_R005_d",
      "routeId": "E_R005",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_05",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R006:a": {
      "id": "RISK_E_R006_a",
      "routeId": "E_R006",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R006:b": {
      "id": "RISK_E_R006_b",
      "routeId": "E_R006",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_TEMP_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "같은 복도가 반투명하게 두 겹 겹치며 문과 표지판 위치가 조금씩 다르다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R006:c": {
      "id": "RISK_E_R006_c",
      "routeId": "E_R006",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R006:d": {
      "id": "RISK_E_R006_d",
      "routeId": "E_R006",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_WATER_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 파손된 배관에서 흐른 물이 흰 잔류물을 넓게 번지게 하고 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R009:a": {
      "id": "RISK_E_R009_a",
      "routeId": "E_R009",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_TEMP_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R009:b": {
      "id": "RISK_E_R009_b",
      "routeId": "E_R009",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_03"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "문틀이 비틀려 문이 반쯤 열린 채 걸려 있고 바닥에는 흰 액체 자국이 번져 있다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R009:c": {
      "id": "RISK_E_R009_c",
      "routeId": "E_R009",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_WATER_02"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 배수구에서 투명한 물과 흰 점액이 섞여 간헐적으로 밀려 나온다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R009:d": {
      "id": "RISK_E_R009_d",
      "routeId": "E_R009",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_04",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "벽과 바닥이 일정하지 않은 간격으로 진동하며 먼 곳에서 금속이 울린다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R010:a": {
      "id": "RISK_E_R010_a",
      "routeId": "E_R010",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_06"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R010:b": {
      "id": "RISK_E_R010_b",
      "routeId": "E_R010",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사이를 가른다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R010:c": {
      "id": "RISK_E_R010_c",
      "routeId": "E_R010",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_01",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "멈춘 계단판 몇 장이 서로 다른 높이로 어긋나 발을 디딜 면이 일정하지 않다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R010:d": {
      "id": "RISK_E_R010_d",
      "routeId": "E_R010",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_06",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R011:a": {
      "id": "RISK_E_R011_a",
      "routeId": "E_R011",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_12"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "HIGH_NOISE",
        "INDOOR",
        "PLATFORM",
        "RAIL_NEARBY",
        "UNDERGROUND"
      ],
      "overview": "승강장 번호와 방향 화살표가 눈을 돌릴 때마다 다른 위치로 바뀌지만 벽과 바닥의 물리 흔적은 남아 있다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R011:b": {
      "id": "RISK_E_R011_b",
      "routeId": "E_R011",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "HIGH_NOISE",
        "INDOOR",
        "PLATFORM",
        "RAIL_NEARBY",
        "UNDERGROUND"
      ],
      "overview": "안전선 바깥 바닥이 낮은 진동에 맞춰 갈라졌다 붙으며 가장자리 폭이 달라진다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R011:c": {
      "id": "RISK_E_R011_c",
      "routeId": "E_R011",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_03",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "HIGH_NOISE",
        "INDOOR",
        "PLATFORM",
        "RAIL_NEARBY",
        "UNDERGROUND"
      ],
      "overview": "승강장문과 실제 선로·열차문의 위치가 반 칸씩 어긋나 같은 문이 열렸다 닫히기를 반복한다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R011:d": {
      "id": "RISK_E_R011_d",
      "routeId": "E_R011",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_04",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "HIGH_NOISE",
        "INDOOR",
        "PLATFORM",
        "RAIL_NEARBY",
        "UNDERGROUND"
      ],
      "overview": "터널 안쪽에서 갑작스러운 바람이 밀려오며 종이와 작은 파편이 승강장 가장자리로 쏠린다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 ...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R020:a": {
      "id": "RISK_E_R020_a",
      "routeId": "E_R020",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_06"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND",
        "WATER_NEARBY"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R020:b": {
      "id": "RISK_E_R020_b",
      "routeId": "E_R020",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_02"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND",
        "WATER_NEARBY"
      ],
      "overview": "계단 모서리가 깨지고 몇 단은 아래가 비어 있어 체중을 받으면 흔들린다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R020:c": {
      "id": "RISK_E_R020_c",
      "routeId": "E_R020",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_02",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND",
        "WATER_NEARBY"
      ],
      "overview": "계단 모서리가 깨지고 몇 단은 아래가 비어 있어 체중을 받으면 흔들린다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R020:d": {
      "id": "RISK_E_R020_d",
      "routeId": "E_R020",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_02",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND",
        "WATER_NEARBY"
      ],
      "overview": "계단 모서리가 깨지고 몇 단은 아래가 비어 있어 체중을 받으면 흔들린다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R001_REV:a": {
      "id": "RISK_E_R001_REV_a",
      "routeId": "E_R001_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R001_REV:b": {
      "id": "RISK_E_R001_REV_b",
      "routeId": "E_R001_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_WATER_02"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "배수구에서 투명한 물과 흰 점액이 섞여 간헐적으로 밀려 나온다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R001_REV:c": {
      "id": "RISK_E_R001_REV_c",
      "routeId": "E_R001_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_03",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "열린 문 너머 풍경이 현재 건물 구조와 맞지 않고, 문턱의 그림자가 두 방향으로 갈라진다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R001_REV:d": {
      "id": "RISK_E_R001_REV_d",
      "routeId": "E_R001_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_04",
        "HZ_WATER_02"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다. / 배수구에서 투명한 물과 흰 점액이 섞여 간...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R002_REV:a": {
      "id": "RISK_E_R002_REV_a",
      "routeId": "E_R002_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_TEMP_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R002_REV:b": {
      "id": "RISK_E_R002_REV_b",
      "routeId": "E_R002_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R002_REV:c": {
      "id": "RISK_E_R002_REV_c",
      "routeId": "E_R002_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_04",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R002_REV:d": {
      "id": "RISK_E_R002_REV_d",
      "routeId": "E_R002_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_05",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사이를 가른다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R003_REV:a": {
      "id": "RISK_E_R003_REV_a",
      "routeId": "E_R003_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "통로 한가운데 카트·상자·가구가 비스듬히 쌓여 발 디딜 폭이 좁다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R003_REV:b": {
      "id": "RISK_E_R003_REV_b",
      "routeId": "E_R003_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_TEMP_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "같은 복도가 반투명하게 두 겹 겹치며 문과 표지판 위치가 조금씩 다르다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R003_REV:c": {
      "id": "RISK_E_R003_REV_c",
      "routeId": "E_R003_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_04",
        "HZ_CONT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다. / 앞쪽에서 시작된 흰 발자국이 이동 방향과 ...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R003_REV:d": {
      "id": "RISK_E_R003_REV_d",
      "routeId": "E_R003_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_01",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "OUTDOOR"
      ],
      "overview": "같은 복도가 반투명하게 두 겹 겹치며 문과 표지판 위치가 조금씩 다르다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R004_REV:a": {
      "id": "RISK_E_R004_REV_a",
      "routeId": "E_R004_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R004_REV:b": {
      "id": "RISK_E_R004_REV_b",
      "routeId": "E_R004_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_06"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R004_REV:c": {
      "id": "RISK_E_R004_REV_c",
      "routeId": "E_R004_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_02",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 모서리가 깨지고 몇 단은 아래가 비어 있어 체중을 받으면 흔들린다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R004_REV:d": {
      "id": "RISK_E_R004_REV_d",
      "routeId": "E_R004_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_WATER_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 파손된 배관에서 흐른 물이 흰 잔류물을 넓게 번지게 하고 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R005_REV:a": {
      "id": "RISK_E_R005_REV_a",
      "routeId": "E_R005_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "통로 한가운데 카트·상자·가구가 비스듬히 쌓여 발 디딜 폭이 좁다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R005_REV:b": {
      "id": "RISK_E_R005_REV_b",
      "routeId": "E_R005_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_WATER_02"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "배수구에서 투명한 물과 흰 점액이 섞여 간헐적으로 밀려 나온다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R005_REV:c": {
      "id": "RISK_E_R005_REV_c",
      "routeId": "E_R005_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_04",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "벽과 바닥이 일정하지 않은 간격으로 진동하며 먼 곳에서 금속이 울린다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R005_REV:d": {
      "id": "RISK_E_R005_REV_d",
      "routeId": "E_R005_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_01",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "통로 한가운데 카트·상자·가구가 비스듬히 쌓여 발 디딜 폭이 좁다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R006_REV:a": {
      "id": "RISK_E_R006_REV_a",
      "routeId": "E_R006_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R006_REV:b": {
      "id": "RISK_E_R006_REV_b",
      "routeId": "E_R006_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "천장에서 가루와 작은 파편이 간헐적으로 떨어지고 위쪽에서 균열음이 이어진다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R006_REV:c": {
      "id": "RISK_E_R006_REV_c",
      "routeId": "E_R006_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STRUCT_03",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "문틀이 비틀려 문이 반쯤 열린 채 걸려 있고 바닥에는 흰 액체 자국이 번져 있다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R006_REV:d": {
      "id": "RISK_E_R006_REV_d",
      "routeId": "E_R006_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_WATER_02"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 배수구에서 투명한 물과 흰 점액이 섞여 간헐적으로 밀려 나온다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R009_REV:a": {
      "id": "RISK_E_R009_REV_a",
      "routeId": "E_R009_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_12"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "승강장 번호와 방향 화살표가 눈을 돌릴 때마다 다른 위치로 바뀌지만 벽과 바닥의 물리 흔적은 남아 있다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R009_REV:b": {
      "id": "RISK_E_R009_REV_b",
      "routeId": "E_R009_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STRUCT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R009_REV:c": {
      "id": "RISK_E_R009_REV_c",
      "routeId": "E_R009_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_CONT_05"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 앞쪽에서 시작된 흰 발자국이 이동 방향과 반대로 하나씩 생겨난다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R009_REV:d": {
      "id": "RISK_E_R009_REV_d",
      "routeId": "E_R009_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_04",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R010_REV:a": {
      "id": "RISK_E_R010_REV_a",
      "routeId": "E_R010_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_06"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R010_REV:b": {
      "id": "RISK_E_R010_REV_b",
      "routeId": "E_R010_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "멈춘 계단판 몇 장이 서로 다른 높이로 어긋나 발을 디딜 면이 일정하지 않다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R010_REV:c": {
      "id": "RISK_E_R010_REV_c",
      "routeId": "E_R010_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_06",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R010_REV:d": {
      "id": "RISK_E_R010_REV_d",
      "routeId": "E_R010_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_06",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R011_REV:a": {
      "id": "RISK_E_R011_REV_a",
      "routeId": "E_R011_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_12"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "HIGH_NOISE",
        "INDOOR",
        "PLATFORM",
        "RAIL_NEARBY",
        "UNDERGROUND"
      ],
      "overview": "승강장 번호와 방향 화살표가 눈을 돌릴 때마다 다른 위치로 바뀌지만 벽과 바닥의 물리 흔적은 남아 있다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R011_REV:b": {
      "id": "RISK_E_R011_REV_b",
      "routeId": "E_R011_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_03"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "HIGH_NOISE",
        "INDOOR",
        "PLATFORM",
        "RAIL_NEARBY",
        "UNDERGROUND"
      ],
      "overview": "승강장문과 실제 선로·열차문의 위치가 반 칸씩 어긋나 같은 문이 열렸다 닫히기를 반복한다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R011_REV:c": {
      "id": "RISK_E_R011_REV_c",
      "routeId": "E_R011_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_04",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "HIGH_NOISE",
        "INDOOR",
        "PLATFORM",
        "RAIL_NEARBY",
        "UNDERGROUND"
      ],
      "overview": "터널 안쪽에서 갑작스러운 바람이 밀려오며 종이와 작은 파편이 승강장 가장자리로 쏠린다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 ...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R011_REV:d": {
      "id": "RISK_E_R011_REV_d",
      "routeId": "E_R011_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_12",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "HIGH_NOISE",
        "INDOOR",
        "PLATFORM",
        "RAIL_NEARBY",
        "UNDERGROUND"
      ],
      "overview": "승강장 번호와 방향 화살표가 눈을 돌릴 때마다 다른 위치로 바뀌지만 벽과 바닥의 물리 흔적은 남아 있다. / 바닥 틈을 따라 젖은 흰 선이...",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R020_REV:a": {
      "id": "RISK_E_R020_REV_a",
      "routeId": "E_R020_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_06"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND",
        "WATER_NEARBY"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R020_REV:b": {
      "id": "RISK_E_R020_REV_b",
      "routeId": "E_R020_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_TEMP_02"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND",
        "WATER_NEARBY"
      ],
      "overview": "계단참의 문과 층수 표기가 눈을 돌릴 때마다 한 칸씩 어긋난다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R020_REV:c": {
      "id": "RISK_E_R020_REV_c",
      "routeId": "E_R020_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_02",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND",
        "WATER_NEARBY"
      ],
      "overview": "계단참의 문과 층수 표기가 눈을 돌릴 때마다 한 칸씩 어긋난다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사이를 가른다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R020_REV:d": {
      "id": "RISK_E_R020_REV_d",
      "routeId": "E_R020_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_02",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND",
        "WATER_NEARBY"
      ],
      "overview": "계단참의 문과 층수 표기가 눈을 돌릴 때마다 한 칸씩 어긋난다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사이를 가른다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R030:a": {
      "id": "RISK_E_R030_a",
      "routeId": "E_R030",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_06"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R030:b": {
      "id": "RISK_E_R030_b",
      "routeId": "E_R030",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_TEMP_02"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단참의 문과 층수 표기가 눈을 돌릴 때마다 한 칸씩 어긋난다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R030:c": {
      "id": "RISK_E_R030_c",
      "routeId": "E_R030",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사이를 가른다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R030:d": {
      "id": "RISK_E_R030_d",
      "routeId": "E_R030",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_STATION_06",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼지며 실제 단차가 보이는 순간이 짧다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R030_REV:a": {
      "id": "RISK_E_R030_REV_a",
      "routeId": "E_R030_REV",
      "variant": "a",
      "chance": 20,
      "hazardCount": 1,
      "hazards": [
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_A",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R030_REV:b": {
      "id": "RISK_E_R030_REV_b",
      "routeId": "E_R030_REV",
      "variant": "b",
      "chance": 45,
      "hazardCount": 1,
      "hazards": [
        "HZ_STATION_11"
      ],
      "ambientRuleId": "EXP_AMBIENT_B",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "배수구에서 일반 물이 역류해 낮은 곳을 흐르며 이미 있던 흰 흔적의 가장자리를 넓힌다.",
      "completion": "resolved_hazard_count == 1"
    },
    "E_R030_REV:c": {
      "id": "RISK_E_R030_REV_c",
      "routeId": "E_R030_REV",
      "variant": "c",
      "chance": 70,
      "hazardCount": 2,
      "hazards": [
        "HZ_TEMP_02",
        "HZ_CONT_04"
      ],
      "ambientRuleId": "EXP_AMBIENT_C",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "계단참의 문과 층수 표기가 눈을 돌릴 때마다 한 칸씩 어긋난다. / 문손잡이와 난간 일부가 흰 유막처럼 젖어 있다.",
      "completion": "resolved_hazard_count == 2"
    },
    "E_R030_REV:d": {
      "id": "RISK_E_R030_REV_d",
      "routeId": "E_R030_REV",
      "variant": "d",
      "chance": 90,
      "hazardCount": 2,
      "hazards": [
        "HZ_ENV_01",
        "HZ_CONT_01"
      ],
      "ambientRuleId": "EXP_AMBIENT_D",
      "nodeTags": [
        "INDOOR",
        "TRANSIT_NODE",
        "UNDERGROUND"
      ],
      "overview": "빛이 닿지 않아 발판과 벽면 경계를 구분하기 어렵다. / 바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 깨끗한 발판 사이를 가른다.",
      "completion": "resolved_hazard_count == 2"
    }
  },
  "hazardTemplates": {
    "HZ_TEMP_04": {
      "name": "겹쳐 지나가는 잔상",
      "kind": "시간 중첩",
      "safeActions": [
        "벽 쪽으로 물러나 잔상의 반복 주기를 확인한다",
        "잔상이 비는 순간 한 걸음씩 이동한다"
      ],
      "safeKeywords": [
        "주기",
        "기다",
        "확인",
        "천천히",
        "비는"
      ],
      "failRule": "EXP_CONTACT_LOW"
    },
    "HZ_STRUCT_05": {
      "name": "깨진 유리와 젖은 얼룩",
      "kind": "구조·접촉",
      "safeActions": [
        "마른 발판만 골라 천천히 지난다",
        "가져온 도구로 발밑을 정리한다"
      ],
      "safeKeywords": [
        "마른",
        "천천히",
        "정리",
        "도구",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_CONT_01": {
      "name": "퍼지는 흰 침윤선",
      "kind": "접촉 오염",
      "safeActions": [
        "흰 선에서 거리를 두고 우회한다",
        "장갑이나 긴 도구로 안전한 경계를 확인한다"
      ],
      "safeKeywords": [
        "거리",
        "우회",
        "장갑",
        "도구",
        "경계"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_WATER_02": {
      "name": "배수구의 흰 유출물",
      "kind": "물 확산",
      "safeActions": [
        "높은 지면으로 물러나 흐름을 피한다",
        "배수 반대 방향의 마른 길을 택한다"
      ],
      "safeKeywords": [
        "높은",
        "피한다",
        "배수 반대",
        "마른",
        "우회"
      ],
      "failRule": "EXP_WATER_SPREAD_HIGH"
    },
    "HZ_TEMP_03": {
      "name": "서로 맞지 않는 문과 풍경",
      "kind": "시간 중첩",
      "safeActions": [
        "문턱을 넘지 않고 현재 구조와 맞는 통로를 다시 확인한다",
        "그림자가 하나로 겹치는 순간까지 기다린다"
      ],
      "safeKeywords": [
        "넘지",
        "다시 확인",
        "기다",
        "하나로",
        "현재"
      ],
      "failRule": "EXP_CONTACT_LOW"
    },
    "HZ_ENV_01": {
      "name": "어두운 발판",
      "kind": "환경",
      "safeActions": [
        "조명을 확보해 발판을 확인한다",
        "벽을 짚지 않고 천천히 이동한다"
      ],
      "safeKeywords": [
        "조명",
        "확인",
        "천천히",
        "발판"
      ],
      "failRule": "EXP_CONTACT_LOW"
    },
    "HZ_CONT_04": {
      "name": "젖은 난간과 손잡이",
      "kind": "접촉 오염",
      "safeActions": [
        "손잡이를 잡지 않고 이동한다",
        "장갑이나 천을 사이에 두고 접촉한다"
      ],
      "safeKeywords": [
        "잡지",
        "장갑",
        "천",
        "피한다"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STRUCT_03": {
      "name": "비틀린 문틀",
      "kind": "구조",
      "safeActions": [
        "문에 힘을 주기 전 경첩과 바닥을 확인한다",
        "몸으로 밀지 않고 도구로 걸린 부분을 푼다"
      ],
      "safeKeywords": [
        "경첩",
        "확인",
        "도구",
        "밀지"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STATION_11": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_ENV_04": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STATION_01": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_CONT_03": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STATION_06": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STATION_12": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_TEMP_01": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STATION_03": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STRUCT_01": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_TEMP_02": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STATION_07": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STATION_04": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_WATER_01": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STATION_05": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STRUCT_02": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_CONT_05": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    },
    "HZ_STRUCT_04": {
      "name": "불안정한 이동 구간",
      "kind": "경로 위험",
      "safeActions": [
        "멈춰 주변 상태를 확인한 뒤 안전한 쪽으로 이동한다",
        "서두르지 않고 통과 가능한 경계를 찾는다"
      ],
      "safeKeywords": [
        "확인",
        "안전",
        "천천히",
        "멈춰",
        "경계",
        "우회"
      ],
      "failRule": "EXP_CONTACT_MEDIUM"
    }
  },
  "contaminationRules": {
    "EXP_AMBIENT_A": {
      "category": "AMBIENT",
      "min": 0,
      "max": 0,
      "body": true,
      "item": false,
      "environment": false,
      "timing": "경로 이동 완료 시 1회",
      "protection": "감소 없음",
      "formula": "rng(0,0)",
      "front": "추가 오염 없음"
    },
    "EXP_AMBIENT_B": {
      "category": "AMBIENT",
      "min": 0,
      "max": 0,
      "body": true,
      "item": false,
      "environment": false,
      "timing": "경로 이동 완료 시 1회",
      "protection": "감소 없음",
      "formula": "rng(0,0)",
      "front": "추가 오염 없음"
    },
    "EXP_AMBIENT_C": {
      "category": "AMBIENT",
      "min": 0,
      "max": 1,
      "body": true,
      "item": false,
      "environment": false,
      "timing": "경로 이동 완료 시 1회",
      "protection": "완전 차단 불가",
      "formula": "rng(0,1)",
      "front": "장시간 노출이 있었다면 미세한 증가"
    },
    "EXP_AMBIENT_D": {
      "category": "AMBIENT",
      "min": 1,
      "max": 2,
      "body": true,
      "item": false,
      "environment": false,
      "timing": "경로 이동 완료 시 1회",
      "protection": "완전 차단 불가",
      "formula": "rng(1,2)",
      "front": "중첩 공간 체류에 따른 기본 증가"
    },
    "EXP_CONTACT_NONE": {
      "category": "CONTACT",
      "min": 0,
      "max": 0,
      "body": false,
      "item": false,
      "environment": false,
      "timing": "위험 해결 결과",
      "protection": "없음",
      "formula": "0",
      "front": "직접 접촉 없음"
    },
    "EXP_ITEM_ONLY": {
      "category": "CONTACT",
      "min": 0,
      "max": 0,
      "body": false,
      "item": true,
      "environment": false,
      "timing": "보호 도구·장비가 대신 접촉",
      "protection": "사용 아이템 상태 CONTAMINATED",
      "formula": "0",
      "front": "신체 대신 장비가 오염됨"
    },
    "EXP_CONTACT_LOW": {
      "category": "CONTACT",
      "min": 1,
      "max": 3,
      "body": true,
      "item": true,
      "environment": false,
      "timing": "부분 접촉",
      "protection": "적합 보호구 사용 시 EXP_ITEM_ONLY로 전환 가능",
      "formula": "rng(1,3)",
      "front": "가벼운 접촉"
    },
    "EXP_CONTACT_MEDIUM": {
      "category": "CONTACT",
      "min": 4,
      "max": 7,
      "body": true,
      "item": true,
      "environment": true,
      "timing": "명확한 직접 접촉",
      "protection": "보호구 적합도에 따라 한 단계 감소 가능",
      "formula": "rng(4,7)",
      "front": "젖은 잔류물과 직접 접촉"
    },
    "EXP_CONTACT_HIGH": {
      "category": "CONTACT",
      "min": 8,
      "max": 12,
      "body": true,
      "item": true,
      "environment": true,
      "timing": "넓은 면적 또는 장시간 접촉",
      "protection": "보호구가 있으면 MEDIUM까지 감소 가능",
      "formula": "rng(8,12)",
      "front": "넓은 부위 노출"
    },
    "EXP_CONTACT_SEVERE": {
      "category": "CONTACT",
      "min": 13,
      "max": 20,
      "body": true,
      "item": true,
      "environment": true,
      "timing": "용해 웅덩이·물 확산·붕괴 실패",
      "protection": "완전 차단 불가, 최대 HIGH까지 감소",
      "formula": "rng(13,20)",
      "front": "심한 직접 노출"
    },
    "EXP_COLLAPSE_DELAY": {
      "category": "COLLAPSE",
      "min": 10,
      "max": 20,
      "body": true,
      "item": true,
      "environment": true,
      "timing": "붕괴 탈출 단계 지연 1회당",
      "protection": "탈출 행동 성공으로 추가 적용 방지",
      "formula": "rng(10,20)",
      "front": "붕괴 지연 노출"
    },
    "EXP_WATER_SPREAD_LOW": {
      "category": "ENVIRONMENT",
      "min": 0,
      "max": 0,
      "body": false,
      "item": true,
      "environment": true,
      "timing": "오염 물질이 물을 따라 번짐",
      "protection": "방수 덮개는 아이템 오염으로 전환",
      "formula": "body 0; spread +1 tier",
      "front": "환경 오염 범위 확대"
    },
    "EXP_WATER_SPREAD_HIGH": {
      "category": "ENVIRONMENT",
      "min": 5,
      "max": 10,
      "body": true,
      "item": true,
      "environment": true,
      "timing": "오염된 물에 직접 진입",
      "protection": "방수 장비로 MEDIUM 이하 가능",
      "formula": "rng(5,10); spread +2 tiers",
      "front": "물과 함께 넓게 번짐"
    }
  }
};
