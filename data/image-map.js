(() => {
  "use strict";

  /*
   * v0.3.18 illustration registry
   *
   * 새 일러스트를 연결할 때 아래 IMAGE_OVERRIDES에 src만 추가하면 됩니다.
   * src가 비어 있거나 파일 로드에 실패하면 UI가 흑백 플레이스홀더를 표시합니다.
   * 표시 전용 파일이므로 기존 저장 상태와 조사 판정에는 영향을 주지 않습니다.
   */
  const IMAGE_OVERRIDES = {
    scene: {
      byNode: {
        E_G_PLAZA: {\n          src: "assets/illustrations/scenes/E_G_PLAZA.png",\n          alt: "백화가 진행 중인 해오름역 환승구역의 흑백 조사 풍경",\n          position: "center",\n        },
      },
      byDetail: {
        // E_G_INFO: { src: "assets/illustrations/details/E_G_INFO.png", position: "center" },
      },
      byRoute: {
        // E_R002: { src: "assets/illustrations/routes/E_R002.png", position: "center" },
      },
    },
    object: {
      byId: {
        // E_OBJ_001: { src: "assets/illustrations/objects/E_OBJ_001.png", position: "center" },
      },
    },
  };

  const NODE_IDS = [
    "E_G_PLAZA", "E_G_EAST", "E_G_WEST", "E_B1_CONCOURSE", "E_B1_TICKET",
    "E_B1_GATE", "E_B1_SHELTER", "E_B2_TRANSFER", "E_B2_P12", "E_B2_SHELTER_STAIR",
  ];

  const DETAIL_IDS = [
    "E_G_INFO", "E_G_BENCH", "E_G_VIEW", "E_G_EAST_DOOR", "E_G_EAST_STAIR",
    "E_G_EAST_DRAIN", "E_G_WEST_CANOPY", "E_G_WEST_BUS", "E_G_WEST_VIEW", "E_B1_GUIDE",
    "E_B1_WAIT", "E_B1_BOARD", "E_B1_MACHINE", "E_B1_ROUTE_MAP", "E_B1_GATES",
    "E_B1_BOOTH", "E_B1_EMERGENCY_GATE", "E_B1_SHELTER_DOOR", "E_B1_SHELTER_PANEL",
    "E_B1_SHELTER_WAIT", "E_B2_ESC", "E_B2_STAIRS", "E_B2_ELEVATOR", "E_B2_SIGN",
    "E_B2_P12_WAIT", "E_B2_P12_DOORS", "E_B2_P12_EMERGENCY", "E_B2_P12_SIGN",
    "E_B2_SHELTER_LANDING", "E_B2_SHELTER_DOOR",
  ];

  const ROUTE_IDS = [
    "E_R001", "E_R002", "E_R003", "E_R004", "E_R005", "E_R006", "E_R009", "E_R010",
    "E_R011", "E_R020", "E_R001_REV", "E_R002_REV", "E_R003_REV", "E_R004_REV",
    "E_R005_REV", "E_R006_REV", "E_R009_REV", "E_R010_REV", "E_R011_REV", "E_R020_REV",
    "E_R030", "E_R030_REV",
  ];

  const OBJECT_IDS = [
    "E_OBJ_001", "E_OBJ_002", "E_OBJ_003", "E_OBJ_004", "E_OBJ_005", "E_OBJ_006",
    "E_OBJ_007", "E_OBJ_008", "E_OBJ_009", "E_OBJ_010", "E_OBJ_011", "E_OBJ_012",
    "E_OBJ_013", "E_OBJ_014", "E_OBJ_015", "E_OBJ_016", "E_OBJ_017", "E_OBJ_018",
    "E_OBJ_019", "E_OBJ_020", "E_OBJ_031", "E_OBJ_032", "E_OBJ_033", "E_OBJ_034",
    "E_OBJ_035", "E_OBJ_036", "E_OBJ_037", "E_OBJ_038", "E_OBJ_039", "E_OBJ_040",
    "E_OBJ_041", "E_OBJ_042", "E_OBJ_043", "E_OBJ_089", "E_OBJ_090",
  ];

  const emptyEntries = (ids) => Object.fromEntries(ids.map((imageId) => [imageId, {
    src: "",
    position: "center",
  }]));

  window.BAEKJI_IMAGE_MAP = {
    version: "0.3.18",
    scene: {
      default: {
        src: "assets/haeoreum-station.png",
        alt: "해오름역 조사 구역의 흑백 풍경",
        position: "center",
      },
      byNode: { ...emptyEntries(NODE_IDS), ...IMAGE_OVERRIDES.scene.byNode },
      byDetail: { ...emptyEntries(DETAIL_IDS), ...IMAGE_OVERRIDES.scene.byDetail },
      byRoute: { ...emptyEntries(ROUTE_IDS), ...IMAGE_OVERRIDES.scene.byRoute },
    },
    object: {
      byId: { ...emptyEntries(OBJECT_IDS), ...IMAGE_OVERRIDES.object.byId },
    },
  };
})();
