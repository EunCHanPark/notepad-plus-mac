# Notepad+ Mac

Notepad++ 스타일의 macOS 텍스트 에디터 (Electron + Monaco Editor 기반)

## 주요 기능

- **다중 탭 편집** - Notepad++ 스타일 탭 인터페이스
- **구문 강조** - 20+ 프로그래밍 언어 지원 (JavaScript, Python, C++, Java, Go, Rust 등)
- **찾기/바꾸기** - 정규식 지원
- **줄 이동** - Ctrl/Cmd+G
- **미니맵** - 코드 미리보기
- **테마 전환** - 다크/라이트 모드
- **확대/축소** - 글꼴 크기 조절
- **자동 줄바꿈** - 토글 가능
- **파일 드래그 & 드롭** - 파일을 에디터로 끌어다 놓기
- **최근 파일** - 최근 열었던 파일 목록
- **인코딩 선택** - UTF-8, EUC-KR 등
- **줄 번호** - 토글 가능
- **코드 접기** - 블록 접기/펼치기
- **괄호 색상** - 괄호 쌍 색상 표시

## macOS에서 DMG 빌드하기

### 방법 1: 로컬 빌드 (macOS 필요)

```bash
# 1. 프로젝트 클론 또는 복사
# 2. 의존성 설치
npm install

# 3. DMG 빌드
chmod +x build-mac-dmg.sh
./build-mac-dmg.sh

# 또는 직접 명령어
npm run build:mac:dmg
```

빌드 결과물: `dist/Notepad+ Mac-1.0.0.dmg`

### 방법 2: GitHub Actions (자동 빌드)

1. 이 프로젝트를 GitHub에 push
2. GitHub Actions가 자동으로 macOS에서 DMG을 빌드
3. Actions > Artifacts에서 DMG 다운로드

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/notepad-plus-mac.git
git push -u origin main
```

태그를 push하면 자동으로 GitHub Release가 생성됩니다:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## 개발

```bash
# 실행
npm start

# Windows에서 빌드
npm run build:win

# macOS에서 빌드 (macOS 필요)
npm run build:mac:dmg
npm run build:mac:arm64    # Apple Silicon
npm run build:mac:universal # 유니버설 바이너리
```

## 기술 스택

- **Electron** - 크로스 플랫폼 데스크톱 앱 프레임워크
- **Monaco Editor** - VS Code의 에디터 엔진
- **electron-builder** - 앱 패키징 및 배포

## 키보드 단축키

| 기능 | macOS | Windows |
|------|-------|---------|
| 새 파일 | Cmd+N | Ctrl+N |
| 열기 | Cmd+O | Ctrl+O |
| 저장 | Cmd+S | Ctrl+S |
| 다른 이름으로 저장 | Cmd+Shift+S | Ctrl+Shift+S |
| 모두 저장 | Cmd+Alt+S | Ctrl+Alt+S |
| 탭 닫기 | Cmd+W | Ctrl+W |
| 찾기 | Cmd+F | Ctrl+F |
| 바꾸기 | Cmd+H | Ctrl+H |
| 줄 이동 | Cmd+G | Ctrl+G |
| 확대 | Cmd+= | Ctrl+= |
| 축소 | Cmd+- | Ctrl+- |
| 테마 전환 | Cmd+T | Ctrl+T |
| 전체 화면 | Ctrl+Cmd+F | F11 |

## 참고

이 프로젝트는 Windows용 Notepad++ (by Don Ho)에서 영감을 받았습니다.
원본 Notepad++: https://notepad-plus-plus.org/
