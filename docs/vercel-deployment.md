# Vercel 배포 메모

이 저장소는 Vercel 프로젝트 `baekji-city-investigation`에 연결되어 있으며 `main` 브랜치 커밋으로 Production 배포를 갱신한다.

## 필요한 환경변수

- `OPENAI_API_KEY`: 서버 전용 OpenAI API 키
- `OPENAI_MODEL`: 사용할 OpenAI 모델명
- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_PUBLISHABLE_KEY`: 브라우저에서 사용할 Supabase publishable key

실제 비밀값은 GitHub에 저장하지 않고 Vercel의 Production, Preview, Development 환경변수에 등록한다.

## 배포 주소

- `https://baekji-city-investigation.vercel.app`
