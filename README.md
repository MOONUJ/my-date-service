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

`pnpm check`에는 지도 공급자 공통 contract suite가 포함됩니다. 새 지도 공급자 어댑터는 `runPlaceProviderContract`를 호출하는 contract test를 추가해 정규화된 장소 ID, 좌표, 결과 제한, 오류 및 요청 중단 규칙을 동일하게 검증해야 합니다.

GitHub Actions는 `main` push와 모든 pull request에서 동일한 검사와 Cloudflare Worker 배포 dry-run을 실행합니다.

현재 첫 번째 수직 슬라이스는 mock 장소 검색 API를 사용합니다. 실제 지도 공급자, OpenAI, 인증과 D1은 API 경계를 유지한 채 후속 단계에서 연결합니다.
