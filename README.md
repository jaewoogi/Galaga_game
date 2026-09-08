# GALAGA · Retro Squadron

설치 없이 실행하는 갤러그 스타일 HTML5 Canvas 팬 게임입니다. 원작 ROM, 이미지, 음악을 사용하지 않고 픽셀 스프라이트와 효과음을 직접 구현했습니다. 원작과 동일한 복제판은 아니며 적 AI, 타이밍, 점수 체계와 보너스 패턴에는 차이가 있습니다.

## 바로 실행

압축을 푼 다음 `dist/index.html`을 Chrome 또는 Edge로 열면 됩니다. Python, Node.js, npm 설치가 필요하지 않습니다. 스마트폰에서는 GitHub Pages로 접속하는 방식을 권장합니다.

- 이동: ← → 또는 A / D
- 발사: Space 길게 누르기 (일반 기체 최대 2발, 듀얼 최대 4발)
- 시작: Enter / 게임 시작 버튼
- 일시정지: P 또는 Esc / 일시정지 버튼
- 소리: M / 사운드 버튼
- 터치: 하단 이동·발사 버튼, 또는 화면을 드래그하면 이동과 자동 발사

## 게임 기능

곡선 편대 진입, 대열 이동, 조준 급강하 및 적 탄환, 보스 2회 명중, 생명 3개, 피격 후 무적, 스테이지 진행, 3·7·11… 보너스 스테이지, 기기별 최고 점수, 합성 효과음, 창 전환 시 자동 일시정지.

보스가 초록색 포획 광선을 펼 때 그 아래에 머물면 기체가 포획됩니다. 여분 기체가 있을 때만 포획되며, 포획한 보스가 다시 급강하할 때 격추하면 듀얼 파이터가 됩니다. 편대에 있을 때 격추하면 포획 기체를 잃습니다. 듀얼 상태에서 한 번 피격되면 단일 기체로 돌아옵니다. 첫 추가 기체는 20,000점, 이후 70,000점마다 지급됩니다.

## GitHub에 처음 올리기 — Windows 일반 CMD

Git 설치 후 GitHub에서 **빈 저장소** `galaga-web`을 생성합니다. README, .gitignore, 라이선스 자동 생성은 선택하지 마세요. 이미 파일이 있는 저장소에는 아래 초기 업로드 대신 별도 병합이 필요합니다.

압축을 푼 실제 폴더로 이동합니다. 아래 `YOUR_NAME`은 본인 GitHub 아이디로 바꾸세요.

```bat
cd /d D:\MyProject_4\galaga-web
git init
git add .
git commit -m "Add Galaga web game"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/galaga-web.git
git push -u origin main
```

처음 커밋할 때 작성자 설정이 없다는 오류가 나면 이 저장소에서 아래를 한 번 실행한 후 커밋부터 다시 진행합니다. 이메일은 GitHub 설정의 비공개 noreply 주소도 사용할 수 있습니다.

```bat
git config user.name "YOUR_NAME"
git config user.email "YOUR_EMAIL"
```

푸시 시 나타나는 브라우저 로그인으로 인증합니다. GitHub 계정 비밀번호나 토큰을 채팅에 붙여 넣지 마세요.

## GitHub Pages 켜기

1. GitHub 저장소의 **Settings → Pages**로 이동합니다.
2. **Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. **Actions → Deploy game to GitHub Pages → Run workflow**를 실행합니다. 최초 푸시가 설정 전에 실패했다면 이 단계로 재실행하세요.
4. 작업이 성공하면 다음 주소에서 플레이합니다.
   `https://YOUR_NAME.github.io/galaga-web/`

무료 계정에서는 일반적으로 public 저장소를 사용합니다. 저장소 이름을 다르게 만들면 URL 마지막 부분도 달라집니다. 워크플로는 `dist` 폴더를 배포하므로 파일 위치를 유지하세요.

공식 안내: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## 수정 후 다시 올리기

```bat
git add .
git commit -m "Update game"
git push
```

이후 main 브랜치에 푸시할 때마다 자동 배포됩니다.

## 파일 구조

- `dist/index.html`: 게임 화면
- `dist/style.css`: 반응형 스타일
- `dist/game.js`: 게임 엔진, 그래픽, 오디오
- `.github/workflows/pages.yml`: Pages 자동 배포

## 확인 범위

JavaScript 구문 검사 및 모의 Canvas 환경에서 시작, 이동 경계, 발사, 일시정지, 2,000프레임 진행, 스테이지 클리어, 보너스 종료, 포획·구출, 듀얼 피격, 게임오버와 재시작을 검사했습니다. 실제 브라우저 렌더링, 모바일 실기기 조작과 GitHub 원격 배포는 아직 확인하지 않았습니다.
