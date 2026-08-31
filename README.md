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

기본 공급자는 `wrangler.jsonc`에 명시된 `mock`입니다. 실제 카카오 장소 검색을 로컬에서 사용하려면 `.dev.vars.example`을 참고해 gitignore된 `.dev.vars`를 만들고 다음 값을 설정합니다.

```dotenv
PLACE_PROVIDER=kakao
KAKAO_REST_API_KEY=카카오_디벨로퍼스_REST_API_키
```

REST API 키는 Worker에서만 읽으며 클라이언트 번들에 포함하지 않습니다. 프로덕션에서는 `PLACE_PROVIDER`를 `kakao`로 설정하고 `pnpm wrangler secret put KAKAO_REST_API_KEY`로 secret을 별도 등록해야 합니다. 이 저장소의 테스트와 CI는 고정 fixture만 사용하므로 카카오 API를 호출하지 않습니다. 카카오 Local API의 쿼터와 이용 조건은 배포 전에 [공식 쿼터 문서](https://developers.kakao.com/docs/latest/ko/getting-started/quota)와 [키워드 장소 검색 문서](https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-keyword)에서 다시 확인합니다.

실제 지도를 표시하려면 `.env.example`을 `.env.local`로 복사해 카카오 플랫폼 키 중 **JavaScript 키**를 설정합니다.

```dotenv
VITE_KAKAO_MAP_JAVASCRIPT_KEY=카카오_디벨로퍼스_JavaScript_키
```

카카오 개발자 콘솔에서 이 키의 JavaScript SDK 허용 도메인에 로컬 주소와 실제 서비스 도메인을 각각 등록해야 합니다. JavaScript 키는 브라우저 번들에 포함되는 공개 식별자이므로 REST API 키나 Admin 키를 넣지 말고, 허용 도메인을 필요한 주소로만 제한합니다. 키가 없거나 SDK 로딩이 실패해도 검색 결과 목록은 계속 표시됩니다.

2026년 8월 기준 카카오 지도 Web SDK의 무료 쿼터는 일 300,000건이지만, 2026년 7월 21일부터 개발자 계정에서 처음 활성화한 앱에만 무료 쿼터가 제공됩니다. 다른 앱에서 활성화하거나 무료량을 초과하면 비즈월렛 연결과 유료 API 사용 설정이 필요할 수 있습니다. 이 프로젝트는 유료 사용을 자동으로 활성화하지 않으며, 실제 앱 활성화 전에 [카카오맵 이용 정책](https://developers.kakao.com/docs/latest/ko/kakaomap/common)과 [공식 쿼터 문서](https://developers.kakao.com/docs/latest/ko/getting-started/quota)를 다시 확인해야 합니다.

## 검증

```bash
pnpm check
```

`pnpm check`에는 지도 공급자 공통 contract suite가 포함됩니다. 새 지도 공급자 어댑터는 `runPlaceProviderContract`를 호출하는 contract test를 추가해 정규화된 장소 ID, 좌표, 결과 제한, 오류 및 요청 중단 규칙을 동일하게 검증해야 합니다.

GitHub Actions는 `main` push와 모든 pull request에서 동일한 검사와 Cloudflare Worker 배포 dry-run을 실행합니다.

현재 수직 슬라이스는 기본적으로 mock 장소 검색 API를 사용하며, 설정을 통해 카카오 Local 키워드 검색과 지도 렌더링으로 전환할 수 있습니다. OpenAI, 인증과 D1은 API 경계를 유지한 채 후속 단계에서 연결합니다.
