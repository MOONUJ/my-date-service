# Date Mate

개인 취향과 이동 수단을 반영해 데이트 장소를 추천하는 모바일 우선 웹 앱입니다.

## 로컬 개발

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

`pnpm db:migrate:local`은 로컬 전용 D1에 사용자·세션·취향 migration을 적용합니다. `pnpm dev`는 정적 UI를 빌드한 뒤 Cloudflare Worker와 mock API를 함께 실행합니다. UI만 빠르게 수정할 때는 Worker를 별도로 실행한 상태에서 다음 명령을 사용할 수 있습니다.

```bash
pnpm dev:ui
```

기본 공급자는 `wrangler.jsonc`에 명시된 `mock`입니다. 실제 카카오 장소 검색을 로컬에서 사용하려면 `.dev.vars.example`을 참고해 gitignore된 `.dev.vars`를 만들고 다음 값을 설정합니다.

```dotenv
ENABLE_SIGNUP=true
PLACE_PROVIDER=kakao
KAKAO_REST_API_KEY=카카오_디벨로퍼스_REST_API_키
RATE_LIMIT_SECRET=최소_32자의_임의_문자열
RATE_LIMIT_NETWORK_FALLBACK=local-development
```

`RATE_LIMIT_SECRET`은 원문 IP나 사용자 식별자를 제한 키에 그대로 저장하지 않기 위한 별도 비밀값입니다. 프로덕션에서는 저장소나 일반 `vars`에 기록하지 않고 `pnpm exec wrangler secret put RATE_LIMIT_SECRET`으로 등록합니다. `RATE_LIMIT_NETWORK_FALLBACK`은 Cloudflare 연결 IP 헤더가 없는 로컬·테스트 실행만 격리하는 비밀값이 아닌 식별자이며, 운영 Worker에서는 Cloudflare가 제공하는 헤더가 우선합니다.

## OpenAI 추천

OpenAI 연결은 필수가 아닙니다. `OPENAI_API_KEY`가 없거나 API 오류·시간초과·사용량 차단선이 발생하면 기존 결정론적 TOP 3가 그대로 제공됩니다. 로컬에서 연결하려면 `.dev.vars.example`을 복사한 gitignore 대상 `.dev.vars`에 API 키를 넣습니다. 프로덕션에서는 저장소나 일반 환경 변수에 키를 기록하지 않고 `pnpm exec wrangler secret put OPENAI_API_KEY`로 Worker secret을 등록해야 합니다. 이 티켓과 자동 테스트는 실제 API 호출이나 유료 크레딧 구매를 수행하지 않습니다.

Worker는 지도 검색 결과를 먼저 정렬한 뒤 최대 6개 후보의 장소 ID·이름·카테고리·태그·현재 이동 방식에 해당하는 확인된 안내와 저장 취향만 OpenAI Responses API에 전달합니다. 이메일, 사용자 ID, 비밀번호, 세션, 전체 지도 응답은 전달하지 않습니다. 모델이 고른 근거는 기존 장소 필드와 정확히 일치하는지 검증하고, 추천 문구를 서버에서 다시 구성하므로 제공되지 않은 주차·영업시간·거리 정보는 표시하지 않습니다. 요청 본문과 모델 출력은 로그나 사용량 테이블에 저장하지 않습니다.

동일 사용자·취향 버전·검색 조건·이동 수단·후보·모델·프롬프트 결과는 D1에 최대 24시간 캐시합니다. 사용자별 하루 30회, 서비스 전체 월 1,000회에서 앱의 새 OpenAI 호출을 차단합니다. 이 차단선은 동시 요청이나 OpenAI 계정의 다른 프로젝트 비용까지 보장하는 청구 한도가 아니므로, 실제 활성화 전 OpenAI 프로젝트에도 별도의 월 예산과 알림을 설정하세요. 모델과 가격은 바뀔 수 있으므로 배포 직전 [OpenAI 모델 문서](https://developers.openai.com/api/docs/models)와 [가격 문서](https://developers.openai.com/api/docs/pricing)를 다시 확인해야 합니다.

## 인증과 취향 데이터

회원가입은 비공개 개인용 운영을 위해 기본적으로 닫혀 있습니다. 첫 개인 계정을 만들 때만 gitignore된 `.dev.vars`에서 `ENABLE_SIGNUP=true`로 실행하고, 계정 생성 후에는 값을 제거하거나 `false`로 돌려 다시 시작하세요. 이 설정을 켠 채 공개 배포하지 마세요.

비밀번호 원문은 저장하지 않고 Web Crypto PBKDF2 파생값과 salt만 D1에 저장합니다. 로그인 세션은 브라우저 JavaScript 저장소 대신 `HttpOnly`, `Secure`, `SameSite=Lax` 쿠키로 유지하며 D1에는 토큰 해시만 저장합니다. 이메일과 취향 문장은 서비스 기능에 필요한 최소 개인정보이며 외부 지도 공급자에는 취향 원문을 보내지 않습니다.

로그인·회원가입·계정 삭제 재인증은 네트워크별 5분당 5회, 취향 저장은 사용자별 1분당 10회, 장소 검색은 사용자별 1분당 20회로 제한합니다. 초과 응답은 HTTP 429와 재시도 가능 시간을 반환하며, 장소 및 AI 공급자를 호출하기 전에 차단합니다. 제한 테이블에는 원문 IP·이메일·검색어·취향 대신 `RATE_LIMIT_SECRET`으로 HMAC 처리한 키와 짧은 구간의 횟수·만료 시각만 저장합니다. 이는 개인용 MVP의 기본적인 남용 완화이며 여러 데이터센터에 걸친 대규모 분산 공격을 완전히 막는 전용 엣지 제한 장치는 아닙니다.

이메일, 비밀번호 파생값과 취향은 계정이 유지되는 동안 저장됩니다. 로그인 세션의 인증 유효기간은 7일이고 AI 추천 캐시는 최대 24시간이며, 만료 데이터는 정상 요청 중 제한적으로 정리됩니다. 사용자는 취향 설정의 `계정 삭제`에서 현재 비밀번호와 정확한 확인 문구를 입력해 계정과 모든 세션, 취향, 사용자별 AI 추천 캐시·일별 사용량을 활성 D1에서 즉시 삭제할 수 있습니다. 삭제는 유예나 복구 기능이 없는 hard delete입니다. 사용자 식별자·이메일·취향·검색어를 포함하지 않는 서비스 월별 AI 호출·토큰 합계는 비용 차단선을 위해 익명 집계로 유지됩니다.

Cloudflare 계정 수준의 백업이나 Time Travel에 남는 데이터는 애플리케이션 활성 D1 삭제와 별도 경계입니다. 프로덕션 공개 전 실제 D1 백업 설정과 당시 Cloudflare 보존 정책을 확인하고 개인정보 처리방침에 반영해야 합니다.

현재 `wrangler.jsonc`의 D1 ID는 로컬 개발용 placeholder입니다. 실제 원격 D1 생성, migration 적용과 binding ID 등록은 별도 승인·배포 작업이며 이 저장소가 자동으로 수행하지 않습니다. Cloudflare D1 무료 플랜의 사용량과 저장 한도는 배포 직전 [공식 가격 문서](https://developers.cloudflare.com/d1/platform/pricing/)에서 다시 확인하세요.

REST API 키는 Worker에서만 읽으며 클라이언트 번들에 포함하지 않습니다. 프로덕션에서는 `PLACE_PROVIDER`를 `kakao`로 설정하고 `pnpm exec wrangler secret put KAKAO_REST_API_KEY`로 secret을 별도 등록해야 합니다. 이 저장소의 테스트와 CI는 고정 fixture만 사용하므로 카카오 API를 호출하지 않습니다. 카카오 Local API의 쿼터와 이용 조건은 배포 전에 [공식 쿼터 문서](https://developers.kakao.com/docs/latest/ko/getting-started/quota)와 [키워드 장소 검색 문서](https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-keyword)에서 다시 확인합니다.

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

현재 수직 슬라이스는 D1에 저장한 계정별 취향과 기본 mock 장소 검색 API를 사용하며, 설정을 통해 카카오 Local 키워드 검색과 지도 렌더링으로 전환할 수 있습니다. OpenAI 기반 순위 보정은 API 경계를 유지한 채 후속 단계에서 연결합니다.
