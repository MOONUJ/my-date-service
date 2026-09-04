---
id: TICKET-0006
title: OpenAI 개인화 큐레이션과 비용 차단선
status: in-progress
created_at: 2026-09-04
approved_at: "2026-09-04T10:33:23+09:00"
started_at: "2026-09-04T10:33:23+09:00"
completed_at: null
---

## 목적과 사용자 가치

저장된 자연어 취향과 지도 검색 후보를 함께 평가해 사용자에게 더 맥락적인 TOP 3와 짧은 추천 이유를 제공하되, 모델 장애나 예산 소진 시에도 기존 결정론적 추천을 계속 사용할 수 있게 한다.

## 구현 범위

- Worker에서 OpenAI Responses API를 호출하는 분리된 큐레이션 어댑터 구현
- 비용과 지연을 우선해 `gpt-5.4-nano-2026-03-17` snapshot을 기본 모델로 사용
- 지도 API 구조화 필드로 1차 정렬한 최대 6개 후보만 모델에 전달
- 장소 ID별 순위와 검증 가능한 짧은 한국어 추천 이유를 strict JSON Schema Structured Outputs로 요청
- 모델 결과의 장소 ID, 중복, TOP 3 개수, 문자열 길이와 스키마를 런타임에서 검증
- 모델이 반환한 사실은 기존 장소 데이터에서 검증 가능한 표현으로 제한하고 주차·영업시간·거리 등 없는 사실은 표시하지 않음
- 동일 사용자·취향 버전·검색 조건·이동 수단·후보 fingerprint·모델·프롬프트 버전 결과를 D1에 최대 24시간 캐시
- 사용자별 일 30회, 서비스 전체 월 1,000회의 OpenAI 호출 차단선과 출력 토큰 상한 적용
- API 키 누락, 차단선 도달, timeout, rate limit, OpenAI 장애, 거부 또는 잘못된 출력 시 기존 결정론적 TOP 3와 이유로 안전하게 fallback
- 응답과 UI에서 `ai`, `deterministic`, `cached` 출처 및 fallback 상태를 구분해 표시
- 실제 API를 호출하지 않는 fixture·fake 기반 어댑터, 스키마, 캐시, 차단선과 fallback 테스트
- OpenAI secret 설정, 사용량 차단선과 개인정보 전송 범위를 README에 문서화

## 제외 범위

- OpenAI API 키 구매·발급·등록, 실제 유료 API 호출과 프로덕션 배포
- 모델 web search, 도구 호출, 임베딩, Vectorize, fine-tuning과 복수 모델 동시 운영
- 지도 후보 전체, 이메일, 비밀번호·세션, 원본 사용자 로그의 OpenAI 전송
- 장소의 주차·영업시간·역 출구·실거리 같은 새 사실 생성 또는 별도 교통 데이터 공급자 연결
- 추천 기록 화면, 장기 검색 기록, 사용자 피드백 학습과 A/B 테스트
- 계정 삭제와 전체 개인정보 보존 정책

## 기술적 접근

- 기존 결정론적 scorer를 항상 1차 후보 축소와 fallback으로 유지하고 LLM은 최종 순위 보정과 이유 생성에만 사용한다.
- OpenAI SDK 의존성을 추가하지 않고 Worker `fetch`로 Responses API를 호출해 번들 크기와 공급망 비용을 줄인다.
- 서버 secret `OPENAI_API_KEY`만 사용하며 클라이언트 번들·D1·로그에 키를 저장하지 않는다.
- 4초 timeout, 자동 재시도 없음, 검색 한 번당 cache miss에서 OpenAI 호출 최대 1회로 제한한다.
- 모델 입력은 저장 취향과 최대 6개 후보의 ID·이름·카테고리·태그·확인된 교통 안내로 allowlist한다.
- 응답은 strict JSON Schema와 별도의 런타임 검증을 모두 통과해야 채택하며, 기존 장소 데이터와 ID로 다시 결합한다.
- cache key는 사용자 ID, 취향 `updated_at`, 검색어, 이동 수단, 후보 fingerprint, 모델 snapshot과 prompt version을 SHA-256으로 해시한다.
- 호출 전 D1의 사용자 일별·전체 월별 카운터를 확인하고 성공·실패 호출 수와 OpenAI 응답의 토큰 수만 집계한다. 취향·검색어·장소 원문은 사용량 테이블에 저장하지 않는다.
- 캐시는 24시간 이후 읽지 않고 정상 요청 중 제한적으로 만료 행을 정리한다. 장기 추천 이력으로 사용하지 않는다.

## 비용 영향

- 2026-09-04 OpenAI 공식 문서 기준 `gpt-5.4-nano` 가격은 입력 100만 토큰당 미화 0.20달러, 출력 100만 토큰당 1.25달러다.
- 요청당 최대 후보 6개, 입력 약 2,500토큰과 출력 최대 300토큰을 목표 상한으로 두면 검색 1회 추정 비용은 약 0.000875달러이고 월 1,000회는 약 0.875달러다. 실제 토큰화와 가격 변동에 따라 달라질 수 있다.
- 앱 차단선은 월 1,000회이며 OpenAI 대시보드에도 월 미화 1달러 이하의 별도 project budget/알림 설정을 권장한다. 앱 카운터는 OpenAI 계정 전체 청구 한도를 대신하지 않는다.
- 캐시 hit와 fallback에는 OpenAI 비용이 없고, 테스트·CI는 실제 OpenAI API를 호출하지 않는다.
- 이 티켓 승인은 코드와 로컬 fake 검증만 포함하며 유료 크레딧 구매·API 키 발급·실제 호출·배포는 승인하지 않는다.

## 보안·개인정보 영향

- 사용자의 취향 문장과 검색 후보 장소 정보가 OpenAI에 전송되는 새 개인정보 처리 경계가 생긴다. 이 티켓 승인은 실제 호출이 아니라 해당 전송 경계의 코드 구현 승인이다.
- 이메일, 사용자 ID, 비밀번호, 세션 토큰, 전체 외부 응답과 원본 로그는 OpenAI에 보내지 않는다.
- AI 입력과 장소 데이터는 신뢰할 수 없는 텍스트로 취급하고 명령이 아닌 데이터 필드로 구분한다.
- 모델 출력은 HTML로 직접 삽입하지 않고 스키마·ID allowlist·길이 검증 후 기존 escaping 경계를 통해 렌더링한다.
- 캐시에는 사용자별 추천 결과가 최대 24시간 저장되며 다른 사용자에게 조회되지 않도록 사용자 ID 범위와 cache key를 함께 검증한다.
- 취향 원문, 모델 입력·출력 본문은 로그와 사용량 집계에 남기지 않는다.

## 완료 조건

- [ ] 최대 6개 후보만 포함한 Responses API 요청이 지정된 model snapshot, timeout, 출력 상한과 strict JSON Schema를 사용한다.
- [ ] 유효한 모델 응답은 장소 ID allowlist와 런타임 스키마 검증 후 TOP 3 순위와 짧은 이유에 반영된다.
- [ ] 존재하지 않는 ID, 중복 장소, 과도한 문자열, 누락 필드와 잘못된 JSON은 채택되지 않는다.
- [ ] 모델이 장소 원본에 없는 주차·영업시간·거리·교통 사실을 추천 이유에 추가하지 못한다.
- [ ] 같은 검색은 24시간 cache hit에서 OpenAI를 다시 호출하지 않고 취향·후보·모델·프롬프트 변경 시 cache miss가 된다.
- [ ] 사용자 일 30회 또는 전체 월 1,000회 차단선에 도달하면 외부 호출 없이 결정론적 추천을 반환한다.
- [ ] 키 누락, timeout, rate limit, 서버 오류, 거부와 invalid output에서 검색 전체가 실패하지 않고 fallback 출처가 표시된다.
- [ ] API 키, 이메일, 세션, 취향·검색 원문과 전체 OpenAI 응답이 클라이언트 번들이나 로그에 포함되지 않는다.
- [ ] fixture·fake 기반 테스트, 자동 검사, 로컬 Worker·D1·브라우저 검증, diff 자체 리뷰, push와 GitHub Actions CI가 성공한다.

## 검증 계획

- OpenAI 요청 payload snapshot과 후보 6개·출력 토큰·timeout 경계 단위 테스트
- 정상·거부·timeout·429·5xx·invalid JSON·schema mismatch fixture 테스트
- ID allowlist, 중복·누락·과도한 이유와 근거 없는 사실 거부 테스트
- D1 cache key 분리, 24시간 TTL, 사용자 격리와 일/월 차단선 테스트
- fallback에서 기존 결정론적 순위·검색 API·지도·목록이 유지되는지 통합 테스트
- `pnpm check`
- `pnpm worker:check`
- API 키 없는 로컬 Worker에서 fallback 검색 확인
- fake OpenAI 응답을 사용하는 로컬 Worker에서 AI·cached 상태 확인
- 320px 전후 모바일과 데스크톱에서 출처·fallback 상태 및 핵심 검색 흐름 확인
- diff와 번들에서 secret, 이메일, 세션과 취향·검색 원문 로깅 여부 확인
- push 후 GitHub Actions CI 결과 확인

## 예상 변경 파일

- `migrations/0002_ai_curation.sql`
- `src/ai/`
- `src/search.ts`
- `src/search.test.ts`
- `src/worker.ts`
- `src/worker.test.ts`
- `src/domain.ts`
- `src/main.ts`
- `src/styles.css`
- `wrangler.jsonc`
- `.dev.vars.example`
- `README.md`

## 결정 사항

- 기본 모델은 순위·추출 작업과 비용을 고려해 `gpt-5.4-nano-2026-03-17` snapshot을 권장한다. 이 티켓 승인은 해당 모델 선택 승인이다.
- 앱 차단선은 사용자 일 30회, 서비스 전체 월 1,000회로 권장한다. 2026-09-04 가격과 목표 토큰 상한 기준 월 추정 비용은 약 0.875달러이며, 이 티켓 승인은 이 호출 설계 승인이지 실제 지출 승인이 아니다.
- 추천 캐시는 최대 24시간만 유지하고 장기 검색 기록으로 사용하지 않는다. 이 티켓 승인은 이 보존 기간 승인이다.
- 모델 장애나 예산 소진 시 기존 결정론적 추천을 노출하는 graceful degradation을 기본 동작으로 승인한다.
- 실제 OpenAI API 키 등록·유료 호출·프로덕션 활성화는 별도 명시적 승인 후 진행한다.

## 완료 증거

- 구현 커밋: 미완료
- 브랜치: 미완료
- CI: 미완료
- 검증 결과: 미완료
- 잔여 위험: 미완료

## 이력

- 2026-09-04: proposed — 티켓 생성
- 2026-09-04: in-progress — 사용자 승인 후 구현 시작
