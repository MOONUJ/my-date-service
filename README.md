# Date Mate

개인 취향과 이동 수단을 반영해 데이트 장소를 추천하는 모바일 우선 웹 앱입니다.

## 로컬 개발

```bash
pnpm install
pnpm dev
```

`pnpm dev`는 정적 UI를 빌드한 뒤 Cloudflare Worker와 mock API를 함께 실행합니다. UI만 빠르게 수정할 때는 Worker를 별도로 실행한 상태에서 다음 명령을 사용할 수 있습니다.

```bash
pnpm dev:ui
```

## 검증

```bash
pnpm check
```

현재 첫 번째 수직 슬라이스는 mock 장소 검색 API를 사용합니다. 실제 지도 공급자, OpenAI, 인증과 D1은 API 경계를 유지한 채 후속 단계에서 연결합니다.
