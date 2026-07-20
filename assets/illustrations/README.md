# 일러스트 연결 위치

실제 오브젝트 이미지 파일은 v0.3.7에 포함하지 않았습니다. 장면·세부 구역·이동 경로·오브젝트 이미지는 `data/image-map.js`의 `IMAGE_OVERRIDES`에서 연결합니다.

예시:

```js
E_G_INFO: {
  src: "assets/illustrations/details/E_G_INFO.png",
  alt: "환승 안내대 흑백 조사 풍경",
  position: "center"
}
```

권장 폴더:

- `assets/illustrations/scenes/`: 장소 이미지
- `assets/illustrations/details/`: 세부 구역 이미지
- `assets/illustrations/routes/`: 이동 경로 이미지
- `assets/illustrations/objects/`: 오브젝트 상세 이미지

`src`가 빈 값이거나 파일 로드에 실패하면 화면은 자동으로 기본 흑백 플레이스홀더를 사용합니다.
