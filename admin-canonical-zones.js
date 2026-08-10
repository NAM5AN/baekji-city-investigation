(() => {
  "use strict";

  const data = window.DAY1_DATA;
  if (!data?.places || !data?.meta?.startNode) return;

  const startNode = String(data.meta.startNode || "");
  if (!startNode || data.places[startNode]) return;

  data.places[startNode] = {
    id: startNode,
    floorId: "E_BOUNDARY",
    floor: "구역 경계",
    name: startNode === "E_ENTRY" ? "해오름역 구역 입구" : startNode,
    order: 0,
    details: [],
    adminVirtual: true,
  };
})();
