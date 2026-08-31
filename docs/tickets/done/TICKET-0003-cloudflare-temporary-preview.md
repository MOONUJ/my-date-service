---
id: TICKET-0003
title: Cloudflare 임시 프리뷰 배포
status: done
created_at: 2026-08-31
approved_at: "2026-08-31T13:01:39+09:00"
started_at: "2026-08-31T13:01:39+09:00"
completed_at: "2026-08-31T13:05:36+09:00"
---

## 목적과 사용자 가치

현재 앱을 공개 `workers.dev` URL에서 직접 열어 검색 UI와 Worker API를 확인할 수 있는 60분짜리 Cloudflare 프리뷰로 제공한다.

## 구현 범위

- 현재 `main`의 검증된 빌드를 Cloudflare Workers 임시 프리뷰 계정에 배포
- Worker API와 정적 자산을 기존 `wrangler.jsonc` 설정대로 하나의 배포 단위로 게시
- 배포 URL에서 홈 화면, `/api/health`, mock 장소 검색과 지도 fallback 확인
- 모바일과 데스크톱 브라우저에서 공개 URL의 핵심 흐름 확인
- 배포 URL과 60분 안에 계정을 귀속할 수 있는 비공개 claim URL을 사용자에게 전달
- 배포 결과와 만료·귀속 조건을 완료 증거에 기록하되 claim URL과 임시 자격 증명은 저장소나 로그에 기록하지 않음

## 제외 범위

- 영구 Cloudflare 계정 로그인·OAuth 승인 또는 API 토큰 생성
- claim URL을 통한 계정 귀속 절차 대행
- 카카오 REST API 키, JavaScript 키 또는 허용 도메인 등록
- 실제 카카오 장소 검색·지도 타일 표시
- 사용자 지정 도메인, DNS, 프로덕션 배포와 CI/CD 구성
- 유료 Workers 플랜 또는 기타 유료 Cloudflare 제품 활성화
- 코드·설정·의존성 변경

## 기술적 접근

- Wrangler 4.126.0의 `deploy --temporary`를 사용해 인증 없는 임시 계정에 현재 Worker와 정적 자산을 배포한다.
- 배포 전 `pnpm check`와 `pnpm worker:check`를 다시 실행하고 깨끗한 `main`만 게시한다.
- `PLACE_PROVIDER=mock`을 유지해 외부 API 비밀값과 카카오 호출 비용 없이 동작시킨다.
- 공개 URL에서 정적 자산 요청과 `/api/*` Worker 요청을 각각 확인한다.
- claim URL은 소유권을 넘길 수 있는 bearer credential로 취급해 사용자에게만 전달하고 티켓·커밋·일반 로그에 남기지 않는다.

## 비용 영향

- 임시 프리뷰 생성 자체로 유료 Workers 플랜을 활성화하지 않는다.
- 현재 Cloudflare 정책상 정적 자산 요청은 무료이며, Worker 무료 플랜은 일 100,000건과 호출당 CPU 10ms 제한이 있다.
- 프리뷰는 60분 안에 귀속하지 않으면 임시 계정과 리소스가 삭제된다.
- 카카오 API를 호출하지 않으므로 이번 배포에서 카카오 사용량은 발생하지 않는다.

## 보안·개인정보 영향

- URL을 아는 누구나 접속할 수 있는 공개 프리뷰이며 인증 기능은 아직 없다.
- mock 검색만 사용하고 사용자 계정·취향을 서버에 저장하지 않는다.
- 검색어는 Cloudflare Worker에 전송되지만 카카오에는 전송되지 않는다.
- 임시 API 토큰과 claim URL은 저장소, 티켓, CI, 분석 로그에 넣지 않는다.

## 완료 조건

- [x] 검증된 `main`이 임시 `workers.dev` URL에 배포된다.
- [x] 공개 URL의 홈 화면과 `/api/health`가 정상 응답한다.
- [x] mock 검색 결과와 지도 fallback이 공개 URL에서 동작한다.
- [x] 모바일과 데스크톱에서 핵심 흐름에 가로 스크롤이나 치명적 콘솔 오류가 없다.
- [x] 배포 URL과 claim 기한을 사용자에게 전달하고 claim URL은 저장소에 남기지 않는다.
- [x] 구현 전 CI와 로컬 검증이 성공하고 배포 후 작업 트리가 깨끗하다.

## 검증 계획

- `pnpm check`
- `pnpm worker:check`
- `git status`와 배포 대상 커밋 확인
- 공개 `/api/health` 응답 확인
- 공개 URL에서 mock 검색 실행
- 320px 전후 모바일과 데스크톱 브라우저 확인
- 브라우저 콘솔 오류 확인
- 티켓·diff·Git 이력에 claim URL, 토큰과 비밀값이 없는지 확인

## 예상 변경 파일

- 배포 자체는 코드와 설정을 변경하지 않음
- `docs/tickets/in-progress/TICKET-0003-cloudflare-temporary-preview.md`
- `docs/tickets/done/TICKET-0003-cloudflare-temporary-preview.md`

## 결정 사항

- 영구 프로덕션 대신 60분짜리 공개 Cloudflare 임시 프리뷰를 사용한다.
- `TICKET-0003 승인`은 Cloudflare 이용약관(https://www.cloudflare.com/terms/)과 개인정보처리방침(https://www.cloudflare.com/privacypolicy/)을 확인하고 임시 계정 생성·공개 배포에 동의한다는 의미를 포함한다.
- 실제 카카오 검색과 지도는 키·도메인 등록 및 카카오 비용 조건을 별도 승인한 후 연결한다.
- 프리뷰를 유지하려면 사용자가 전달받은 claim URL을 60분 안에 직접 열어 Cloudflare 계정으로 귀속해야 한다.

## 완료 증거

- 배포 대상 커밋: `590a3ab76c7d98c6a9b5674dfcde88066e20b357`
- 배포 URL: https://my-date-service.raspy-tachometer.workers.dev
- 브랜치: `main`
- CI: 성공 — https://github.com/MOONUJ/my-date-service/actions/runs/33355715144
- 검증 결과: `pnpm check` 성공(27 tests, typecheck, production build), `pnpm worker:check` 성공(Wrangler 4.126.0 dry-run), Worker 시작 시간 4ms, 공개 `/api/health`와 mock 검색 성공, 320px·1280px 브라우저에서 문서 가로 넘침·콘솔 오류 없음
- 잔여 위험: 임시 프리뷰를 60분 안에 귀속하지 않으면 계정과 리소스가 삭제됨. 실제 카카오 키와 허용 도메인을 설정하지 않아 지도는 fallback으로 표시됨. claim URL은 저장소에 기록하지 않고 사용자에게만 전달함.

## 이력

- 2026-08-31: proposed — 티켓 생성
- 2026-08-31: in-progress — 사용자 승인 및 Cloudflare 약관 동의 후 배포 시작
- 2026-08-31: done — 임시 배포·공개 API·반응형 브라우저 검증 완료
