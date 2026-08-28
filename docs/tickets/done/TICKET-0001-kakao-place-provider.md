---
id: TICKET-0001
title: 카카오 장소 검색 공급자 연결
status: done
created_at: 2026-08-28
approved_at: "2026-08-28T15:41:50+09:00"
started_at: "2026-08-28T15:41:50+09:00"
completed_at: "2026-08-28T15:47:30+09:00"
---

## 목적과 사용자 가치

현재 mock 장소 목록을 한국 지역 검색에 적합한 실제 장소 결과로 교체해 사용자가 지역과 음식 키워드로 유효한 데이트 장소를 찾을 수 있게 한다.

## 구현 범위

- 카카오 Local 키워드 장소 검색 API 어댑터 구현
- 기존 `PlaceProvider` 계약과 내부 장소 모델로 응답 정규화
- API 응답 fixture와 contract·parser 테스트
- Worker secret을 통한 REST API 키 주입
- 개발 환경에서 명시적인 mock/카카오 공급자 전환
- timeout, 요청 취소, 잘못된 응답과 공급자 장애의 안전한 API 오류 처리
- README에 로컬 secret 설정과 실행 방법 문서화

## 제외 범위

- 카카오 지도 SDK의 시각 지도와 마커 렌더링
- 네이버·Google 등 복수 공급자 동시 운영
- OpenAI 추천과 추천 이유 생성
- D1, 회원가입과 사용자 취향 영구 저장
- Cloudflare 프로덕션 배포 및 실제 secret 등록

## 기술적 접근

- Worker에서 카카오 REST API를 호출하고 키를 클라이언트에 노출하지 않는다.
- 외부 JSON을 런타임에서 검증한 뒤 `ProviderPlace`로 변환한다.
- 실제 API를 반복 호출하지 않는 고정 fixture로 parser와 contract를 검증한다.
- mock 공급자는 기본 로컬 fallback으로 유지하되 프로덕션에서 장애를 조용히 mock 데이터로 위장하지 않는다.

## 비용 영향

- 카카오 개발자 API의 현재 무료 쿼터와 약관을 구현 직전에 공식 문서에서 확인한다.
- 테스트와 CI는 fixture만 사용하므로 실제 API 호출 비용이 없다.
- 검색 한 번당 장소 API 호출은 원칙적으로 한 번이며 클라이언트 자동 재시도는 추가하지 않는다.

## 보안·개인정보 영향

- 카카오 REST API 키는 Wrangler secret/로컬 `.dev.vars`로만 주입한다.
- 키, 전체 외부 응답과 사용자 취향을 로그에 남기지 않는다.
- 검색어가 카카오에 전송된다는 사실을 이후 개인정보 안내에 반영해야 한다.

## 완료 조건

- [x] 카카오 어댑터가 공유 `PlaceProvider` contract suite를 통과한다.
- [x] 대표 fixture의 장소 ID, 이름, 카테고리, 주소와 좌표가 정확히 정규화된다.
- [x] timeout, 취소, 인증 오류, rate limit, 잘못된 JSON을 구분 가능한 내부 오류로 변환한다.
- [x] API 키가 없는 로컬 환경에서는 명시적으로 mock 모드를 사용할 수 있다.
- [x] `pnpm check`와 `pnpm worker:check`가 통과한다.
- [x] 구현 커밋이 push되고 GitHub Actions CI가 성공한다.

## 검증 계획

- unit test와 카카오 fixture parser test
- 공유 지도 공급자 contract test
- Worker 정상·입력 오류·공급자 장애 통합 확인
- `pnpm check`
- `pnpm worker:check`
- GitHub Actions CI 결과 확인
- diff에서 secret과 실제 API 응답이 포함되지 않았는지 확인

## 예상 변경 파일

- `src/providers/kakao-place-provider.ts`
- `src/providers/kakao-place-provider.contract.test.ts`
- `src/providers/fixtures/`
- `src/providers/place-provider.ts`
- `src/worker.ts`
- `wrangler.jsonc`
- `.dev.vars.example`
- `README.md`

## 결정 사항

- 지도/장소 공급자로 카카오를 선택한다.
- 이 티켓 승인은 카카오 API 연결과 검색어의 카카오 전송에 대한 승인을 포함한다.
- 실제 Cloudflare secret 등록과 프로덕션 배포는 포함하지 않는다.

## 완료 증거

- 구현 커밋: `68f6676455f22d4fd2f6294b0f46997709da84c9`
- 브랜치: `main`
- CI: 성공 — https://github.com/MOONUJ/my-date-service/actions/runs/33149096321
- 검증 결과: `pnpm check` 성공(23 tests), `pnpm worker:check` 성공, `git diff --check` 성공
- 잔여 위험: 실제 카카오 키 발급·실환경 호출·Cloudflare secret 등록·프로덕션 배포는 이 티켓 범위에서 수행하지 않음. 배포 직전 카카오 쿼터와 약관을 다시 확인해야 함.

## 이력

- 2026-08-28: proposed — 티켓 생성
- 2026-08-28: in-progress — 사용자 승인 후 구현 시작
- 2026-08-28: done — 구현·로컬 검증·원격 CI 성공 확인
