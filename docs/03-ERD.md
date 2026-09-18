# 03. ERD — 데이터 모델

## 개요
12-테이블 코어 스키마 + 소셜 스키마.

## 테이블
- (users / accounts / holdings / orders / stocks / ...)
- (posts / comments / reactions / reposts / follows / ...)

## 관계
- ERD 다이어그램:

## RLS 정책 요약
- posts / comments / reactions / follows 등 행 수준 접근 통제
- ⚠️ 알려진 이슈: `post_reactions` UPDATE RLS 정책 보완 필요
