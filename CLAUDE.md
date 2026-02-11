# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**우리곡간식품 재고관리 시스템** - A Firebase-based real-time barcode inventory management system with integrated order fulfillment processing. The system consists of two main components:

1. **Web Application** (docs/) - Browser-based inventory management UI with barcode scanning, production tracking, and daily closing features
2. **choolgo-watcher** - Node.js file watcher that monitors order Excel files, automatically processes them, and updates Firebase with shipment data

Both components are serverless-first: the web app runs entirely in the browser, and choolgo-watcher can run as a background service with PM2.

## Development Commands

### Running Locally

```bash
# Option 1: Double-click docs/index.html to open in browser (simplest)

# Option 2: Run with local web server (recommended to avoid CORS issues)
cd docs
python3 -m http.server 8000
# Then open http://localhost:8000
```

### choolgo-watcher (Order File Processing)

```bash
cd choolgo-watcher

# PM2 background service (recommended for production)
npm run pm2:start        # Start the watcher
npm run pm2:stop         # Stop the watcher
npm run pm2:restart      # Restart the watcher
npm run pm2:logs         # View logs
npm run pm2:status       # Check status

# Direct execution (for development/testing)
npm start                # Start file watcher
npm run server           # Run API server only (port 3100)
```

### Utilities

```bash
# Extract product list from order files
node extract-products.js
# Output: choolgo/제품목록_추출.xlsx
```

### Firebase Deployment

```bash
# Login to Firebase
firebase login

# Deploy to Firebase Hosting
firebase deploy

# Initialize Firebase (one-time setup)
firebase init hosting
```

### Git Operations

**중요: 코드 변경 작업 완료 후 항상 커밋 및 푸시를 수행하고 /context를 수행할 것.**

```bash
# Check git status
git status

# Commit changes
git add .
git commit -m "message"

# Push to remote
git push
```

## Architecture

### File Structure

```
zego/
├── docs/                        # Main web application (Firebase Hosting public folder)
│   ├── index.html              # Main HTML page (~529 lines)
│   ├── app.js                  # Core application logic (~3,866 lines)
│   ├── chulha-browser.js       # Browser-based courier form generation (~515 lines)
│   ├── style.css               # Styling (~3,037 lines)
│   └── firebase-config.js      # Firebase configuration (contains API keys)
├── choolgo-watcher/            # Order file processing service
│   ├── index.js                # Main file watcher logic
│   ├── server.js               # Express API server (port 3100)
│   ├── firebase.js             # Firebase integration
│   ├── ecosystem.config.js     # PM2 configuration
│   ├── package.json            # Dependencies and scripts
│   ├── config/                 # Configuration files
│   │   ├── channels.js         # Channel definitions
│   │   └── config.js           # Settings
│   ├── parsers/                # Channel-specific parsers
│   │   ├── iwon.js             # 아이원 parser
│   │   ├── naver.js            # 네이버 parser (encrypted files)
│   │   ├── kakao.js            # 카카오 parser
│   │   ├── paldogam.js         # 팔도감 parser
│   │   └── generic.js          # Generic auto-detect parser
│   ├── shipping/               # Courier form generation
│   │   ├── extract-shipping.js # Extract shipping data
│   │   ├── column-maps.js      # Column mapping definitions
│   │   ├── consolidate.js      # Consolidate duplicate shipments
│   │   └── courier-writer.js   # Generate courier Excel file
│   ├── utils/
│   │   └── read-xlsx.js        # Excel reader (supports encrypted files)
│   └── logs/                   # Log directory
├── choolgo/                    # Test order files directory (git untracked)
├── extract-products.js         # Product list extraction utility (~341 lines)
├── package.json                # Root dependencies (xlsx)
├── package-lock.json
├── firebase.json               # Firebase Hosting configuration
├── vercel.json                 # Vercel deployment configuration
├── README.md                   # User documentation (Korean)
├── FIREBASE_SETUP.md           # Firebase setup guide (Korean)
└── CLAUDE.md                   # Project guide (this file)
```

### Firebase Data Structure

The application uses Firebase Realtime Database with the following data nodes:

**products/** - Keyed by product name (제품명)
```javascript
{
  "제품명": {
    name: string,           // Product name
    currentStock: number,   // Current inventory count
    minStock: number,       // Target/minimum stock level
    colorIndex: number,     // UI color index (0-19, optional)
    createdAt: timestamp,
    updatedAt: timestamp
  }
}
```

**barcodes/** - Keyed by barcode ID
```javascript
{
  "P001-IN-80": {
    barcode: string,        // Barcode ID (format: P{index}-{type}-{quantity})
    productName: string,    // Product name (foreign key to products)
    type: string,          // "IN" (production), "OUT" (shipment), or "VIEW" (query)
    quantity: number,      // Amount to add/subtract when scanned
    createdAt: timestamp
  }
}
```

**history/** - Transaction log
```javascript
{
  "-NxxXxXxXxXxXxXx": {
    productName: string,
    barcode: string,
    type: string,          // "IN", "OUT", or "ADJUST" (manual adjustment)
    quantity: number,
    beforeStock: number,
    afterStock: number,
    timestamp: number
  }
}
```

**dailyClosings/** - Daily closing records (7 days retention)
```javascript
{
  "2026-01-20": {           // Date key (YYYY-MM-DD format)
    date: string,           // Same as key
    closedAt: timestamp,    // When closing was performed
    products: {
      "제품명": {
        production: number, // Total production for the day
        shipment: number,   // Total shipment for the day
        editedAt: timestamp // Optional: when manually edited
      }
    }
  }
}
```

**choolgoLogs/{YYYY-MM-DD}/summary** - Order fulfillment summary (written by choolgo-watcher)
```javascript
{
  "2026-02-09": {
    products: {
      "제품명1": 120,        // Product-wise shipment quantity
      "제품명2": 80
    },
    channels: {
      "아이원": 50,          // Channel-wise shipment quantity
      "카카오": 70,
      "팔도감": 80
    }
  }
}
```

**productNameMappings/** - Product name mapping rules (for courier form generation)
```javascript
{
  "mapping-001": {
    pattern: "원물 백미쌀",   // Search pattern (substring match)
    shortName: "백미",        // Short name for courier form
    priority: 10,             // Priority (higher = applied first)
    channel: "잇템커머스",    // Channel filter (optional)
    createdAt: timestamp
  }
}
```

### Key Application Architecture

**State Management** (AppState object in app.js:98-109)
- `productsData`: In-memory cache of products from Firebase
- `barcodesData`: In-memory cache of barcodes from Firebase
- `historyData`: Recent 50 transaction records (sorted newest first)
- `dailyClosingsData`: Daily closing records (last 7 days)
- `choolgoSummary`: Today's order fulfillment summary from choolgo-watcher
- `productNameMappings`: Product name mapping rules
- `isEditingMinStock`, `isEditingCurrentStock`: Inline editing flags
- `editingProduct`: Product name being edited (null = new product mode)

**Real-time Sync Pattern**
- Firebase listeners on products, barcodes, history, dailyClosings, choolgoSummary, and productNameMappings refs
- On data changes, update AppState and trigger UI re-renders
- History limited to last 50 entries via `.limitToLast(50)`
- choolgoSummary listener updates "금일출고" column in real-time

**Barcode System**
- Auto-generated barcodes follow pattern: `P{productIndex}-{type}-{quantity}`
  - Example: `P001-IN-80` = Product 1, Production, 80 units
  - Example: `P002-OUT-40` = Product 2, Shipment, 40 units
  - Example: `P003-VIEW` = Product 3, Query only (no stock change)
- Multiple barcodes per product with different quantities
- Product index is 3-digit zero-padded (001, 002, etc.)

**Color System**
- 20 distinct colors cycle through products
- Colors persisted in product.colorIndex (0-19)
- If no custom color, uses sorted product name index mod 20
- Same color scheme applies to: inventory table, history, barcode print
- Color can be changed via inline color picker (`changeProductColor()`)

**Barcode Scanning Flow**
1. User scans barcode → enters in hidden input field
2. Enter key triggers lookup in `barcodesData`
3. If found, calls `updateStock()` with barcode info
4. Updates product stock in Firebase + adds history entry
5. UI updates via Firebase listener automatically
6. AudioFeedback plays success sound (beep + vibration)

**AudioFeedback System** (app.js:11-63)
- Scan success: High beep sound (880Hz + 1100Hz) + vibration
- Scan error: Low buzzer sound (200Hz) + vibration
- Uses Web Audio API for sound generation
- Uses Vibration API for mobile haptic feedback
- Can be toggled on/off via settings

**Inline Editing**
- Click on current stock or target stock to edit
- Creates inline `<input>` element with save/cancel buttons
- Enter saves, ESC cancels
- Blur (focus loss) cancels after short delay
- Updates Firebase directly on save
- Current stock edits create "ADJUST" type history entries

**Barcode Print Page**
- Opens new window with printable barcode layout
- Uses JsBarcode library (CODE128 format)
- 4-column grid layout per product
- Separate pages for production (IN) and shipment (OUT)
- Preserves product colors in print view
- Print-optimized CSS with @media print rules

**Daily Closing System**
- "금일 마감" button executes daily closing (`executeClosing()`)
- Saves today's production/shipment totals to `dailyClosings/{YYYY-MM-DD}`
- Shows last 7 days of closing records in a dedicated table
- Each record can be inline-edited (production/shipment values)
- Auto-cleanup removes records older than 7 days (`cleanupOldClosings()`)
- Optional midnight auto-closing (`scheduleMidnightClosing()`)
- Manual reset available (`resetTodayProduction()`)
- Key functions:
  - `executeClosing(dateKey)` - Execute closing for specific date
  - `closeTodayProduction()` - Execute today's closing
  - `updateClosingHistoryTable()` - Render 7-day history table
  - `editProductionValue()`, `editTodayHistoryValue()` - Inline edit
  - `setupMidnightReset()` - Schedule midnight auto-reset

**Order Fulfillment Integration (choolgo-watcher)**
- choolgo-watcher monitors order file directory with chokidar
- Detects channel (아이원, 네이버, 카카오, 팔도감) via file path/name patterns
- Parses Excel files (including encrypted 네이버 files with password `0000`)
- Extracts product names and quantities
- Writes summary to Firebase `choolgoLogs/{YYYY-MM-DD}/summary`
- Web app reads `choolgoSummary` ref in real-time → displays "금일출고" column
- Click on shipment quantity → shows channel breakdown in tooltip (`showChannelDetail()`)
- Dashboard "오늘 총 출고" card also uses choolgoSummary data

**Courier Form Generation ("밥솥" Feature)**
- Browser-based courier form generation (no server required)
- Implemented in chulha-browser.js (~515 lines)
- Workflow:
  1. User selects order Excel file(s) via file input
  2. Detects channel automatically (same logic as choolgo-watcher)
  3. Extracts shipping data (name, phone, address, product, quantity)
  4. Applies product name mappings from Firebase
  5. Consolidates duplicate shipments (same recipient + product)
  6. Generates courier Excel file with 9 columns:
     - 받는분성명, 전화번호, 우편번호, 주소, 메세지, 품목명, 수량, 운송장, 택배사
  7. Downloads Excel file via browser
- F-key shortcuts for quick product selection
- Product selection lock mode (`isProductLocked`)
- Rice cooker count adjustment (`updateRiceCookerCount()`)
- Key functions:
  - `handleChulhaFileSelection()` - Process selected files
  - `renderProcessResults()` - Display results
  - `detectChannelBrowser()` - Channel detection
  - `extractShippingBrowser()` - Extract shipping data

**Product Name Mapping**
- Managed in web app "설정" → "품목명 매핑" section
- Stored in Firebase `productNameMappings/` node
- Rules applied by priority (higher = first)
- Optional channel filter (applies only to specific channel)
- Used by choolgo-watcher and chulha-browser.js for courier form generation
- Pattern matching: substring search (e.g., "원물 백미쌀" matches "우리곡간 원물 백미쌀 500g")

**Weekly Chart**
- Displays last 7 days of production/shipment trends
- Uses dailyClosings data as source
- Bar chart visualization
- Key function: `updateWeeklyChart()`

**History Display**
- Shows yesterday and today only (configurable)
- Groups by product + type and sums quantities
- Excludes "ADJUST" type entries
- Excludes deleted products (cross-references with products list)
- Production ("생산") shows IN type entries
- Shipment ("출고") shows OUT type entries

### Important Implementation Details

**Focus Management**
- Barcode input field maintains focus automatically
- Focus returns after closing modals, except when editing inline
- Prevents focus during product registration or settings sections
- Essential for barcode scanner hardware integration
- Focus lost during chulha file processing to allow file selection

**Data Filtering**
Always filter out invalid/undefined entries:
- `filterValidProducts()` - Removes products with name === 'undefined'
- `filterValidBarcodes()` - Removes barcodes with undefined product names
- `filterValidHistory()` - Removes history with undefined product names
- One-time cleanup runs on app load (app.js:66-70)

**Product Registration vs. Edit Mode**
- `AppState.editingProduct === null` → Registration mode
- `AppState.editingProduct === productName` → Edit mode
- Edit mode:
  - Deletes old barcodes before creating new ones
  - If product name changes, deletes old product entry
  - Preserves currentStock and minStock values
  - Reuses product index for barcode generation

**IME Handling**
- Barcode input has IME disabled to prevent Korean input (app.js:86-96)
- Sets lang="en" and imeMode='disabled'
- Prevents compositionstart events

**choolgo-watcher Architecture**
- File watcher uses chokidar library (watches `add` events only)
- Channel detection: `detectChannel()` uses file path + filename patterns
- All parsers use `readWorkbook()` + `getRows()` from utils/read-xlsx.js
- Encrypted file support: officecrypto-tool with password `0000` (네이버 files)
- Generic parser: Auto-detects column mapping when channel is unknown
  - Searches for keywords: "수령인", "수령자", "수취인" for name column
  - Prefers "수령자" prefix for phone over "주문자" prefix
- Shipping data extraction: `extract-shipping.js` with column mappings from `column-maps.js`
- Deduplication: fingerprint = `${name}|${phone}|${address}|${product}|${quantity}`
- Courier Excel output: `MMDD_택배양식.xlsx` with sheet name `직택`
- Firebase summary update: `updateChoolgoSummary()` in firebase.js
- Express API server (port 3100): Serves `/api/process-chulha` endpoint for browser-based processing

## Agent Usage Guidelines

Claude Code provides specialized agents for different types of tasks. Use them proactively to improve code quality and development efficiency.

### When to Use Agents

**UI Designer (ui-designer)**
- Automatically invoked for: UI/UX improvements, styling changes, design system updates, accessibility fixes
- Use for:
  - "금일생산현황 테이블 스타일 개선"
  - "모바일 반응형 레이아웃 수정"
  - "색상 접근성 개선"
  - "다크모드 색상 조정"
- Tips: Be specific about design goals (e.g., "버튼 크기를 44x44px 이상으로")

**Explore (codebase explorer)**
- Use for: Quick file search, keyword search, understanding codebase structure
- Use when:
  - "AudioFeedback 함수 어디 있어?"
  - "Firebase 리스너 어떻게 설정했지?"
  - "바코드 스캔 로직 찾아줘"
- Thoroughness levels: "quick" (basic), "medium" (moderate), "very thorough" (comprehensive)
- Tips: Use instead of manual Grep when you're not sure what to search for

**Plan (implementation architect)**
- Use for: Designing implementation strategy before coding
- Use when:
  - Adding new major features (e.g., "신규 채널 추가")
  - Architectural changes (e.g., "Firebase 구조 변경")
  - Multi-file refactoring (e.g., "바코드 시스템 재설계")
- Tips: Use EnterPlanMode tool to enter plan mode, then ExitPlanMode when done

**General-purpose (multi-step task handler)**
- Use for: Complex tasks requiring search + analysis + implementation
- Use when:
  - "이 버그 원인 찾아서 고쳐줘"
  - "재고 추세 분석 기능 추가"
  - "테스트 케이스 작성 및 실행"
- Tips: Clearly describe the goal, not the steps

**Bash (command specialist)**
- Use for: Git operations, npm/yarn, PM2, file system operations
- Automatically invoked for: Git commands, package management, process management
- Tips: Let Claude handle git commits and PR creation

### Agent Best Practices

1. **Trust the agent**: Agents have full context and will use appropriate tools
2. **Be specific about goals**: "버튼 크기 개선" > "UI 개선"
3. **Let agents run to completion**: Don't interrupt unless necessary
4. **Review agent output**: Check results before committing
5. **Use parallel agents**: Multiple independent tasks can run simultaneously

### Custom Agent Ideas (Future)

If frequently repeating patterns emerge, consider creating custom agents:
- **Code Reviewer**: Automated code review (security, performance, best practices)
- **Firebase Validator**: Validate Firebase data structure consistency
- **Test Generator**: Generate test cases for barcode/inventory logic
- **Performance Analyzer**: Profile and optimize slow operations

To create custom agents, use Claude Agent SDK (see Agent SDK documentation).

## Role-Based Development Patterns

When Claude receives a task, you can request it to assume a specific role for specialized expertise. This ensures consistent, high-quality results aligned with best practices.

### Code Reviewer Role

**사용 시기:**
- 코드 커밋 전 리뷰 필요 시
- 보안 취약점 체크
- 성능 문제 발견
- 리팩토링 후 검증

**프롬프트 예시:**
```
Code Reviewer로서 다음 파일을 리뷰해줘:
- docs/app.js의 바코드 스캔 로직
- choolgo-watcher/parsers/generic.js

다음을 중점적으로 검토:
1. 보안 취약점 (XSS, Command Injection, Path Traversal)
2. 성능 문제 (메모리 누수, 불필요한 반복, 비효율적 쿼리)
3. 에러 처리 누락
4. Firebase 보안 규칙 위반 가능성
```

**체크리스트:**
- ✅ 보안: SQL Injection, XSS, CSRF, Command Injection
- ✅ 성능: O(n²) 알고리즘, 메모리 누수, 불필요한 렌더링
- ✅ 에러 처리: try-catch, null 체크, 예외 상황
- ✅ 베스트 프랙티스: DRY, SOLID, 네이밍 컨벤션
- ✅ Firebase: 보안 규칙, 쿼리 효율성, 리스너 정리
- ✅ 코드 품질: 가독성, 주석, 복잡도

**리뷰 결과 형식:**
- 🔴 Critical: 즉시 수정 필요 (보안, 치명적 버그)
- 🟡 Warning: 개선 권장 (성능, 유지보수성)
- 🟢 Good: 잘 작성됨
- 💡 Suggestion: 선택적 개선 아이디어

---

### Frontend Developer Role

**사용 시기:**
- 새로운 UI 기능 구현
- 기존 UI 개선 및 리팩토링
- 사용자 인터랙션 추가
- 반응형 디자인 적용

**프롬프트 예시:**
```
Frontend Developer로서 다음 기능을 구현해줘:

요구사항:
- 금일생산현황 테이블에 "주간 평균" 컬럼 추가
- 최근 7일 평균 생산량 자동 계산
- 평균보다 낮으면 🔻, 높으면 🔺 표시
- 모바일에서도 잘 보이도록 반응형 적용

기술 스택:
- Vanilla JavaScript (ES6+)
- Firebase Realtime Database
- 기존 style.css 스타일 시스템 사용
```

**체크리스트:**
- ✅ DOM 조작: 효율적인 쿼리, 불필요한 리플로우 방지
- ✅ 이벤트: 디바운싱/쓰로틀링, 이벤트 위임, 리스너 정리
- ✅ 상태 관리: AppState 일관성, 불변성 유지
- ✅ Firebase 연동: 실시간 리스너, 에러 처리, 메모리 누수 방지
- ✅ 반응형: 모바일 우선, 미디어 쿼리, 터치 친화적
- ✅ 접근성: 키보드 내비게이션, ARIA 속성, 색상 대비
- ✅ 성능: 레이지 로딩, 가상 스크롤, 렌더링 최적화

**코드 스타일:**
- camelCase 네이밍
- 한글 UI 텍스트
- 간결한 주석 (왜에 집중)
- 기존 패턴 준수

---

### Backend Developer Role

**사용 시기:**
- API 엔드포인트 설계 및 구현
- Firebase 데이터 구조 설계
- 데이터 검증 로직 추가
- 서버 로직 최적화

**프롬프트 예시:**
```
Backend Developer로서 다음 API를 구현해줘:

요구사항:
- choolgo-watcher에 새로운 채널 "쿠팡" 파서 추가
- Excel 파일 형식: A=주문번호, B=수령인, C=전화번호, D=주소, E=품목명, F=수량
- Firebase choolgoLogs에 요약 데이터 저장
- 중복 제거 로직 적용 (fingerprint 기반)

기술 스택:
- Node.js
- xlsx 라이브러리
- Firebase Admin SDK
```

**체크리스트:**
- ✅ 데이터 검증: 입력 검증, 타입 체크, 범위 확인
- ✅ 에러 처리: try-catch, 의미 있는 에러 메시지, 롤백
- ✅ 보안: 입력 새니타이징, SQL/Command Injection 방지, 권한 확인
- ✅ Firebase: 트랜잭션, 보안 규칙, 쿼리 최적화
- ✅ 성능: 캐싱, 배치 처리, 비동기 처리
- ✅ 로깅: 디버깅 정보, 에러 추적, 성능 메트릭
- ✅ 테스트 가능성: 모듈화, 의존성 주입, 순수 함수

**코드 원칙:**
- 명확한 함수명
- 한 함수는 한 가지 역할
- 에러는 상위로 전파
- 로그는 구조화

---

### Tester Role

**사용 시기:**
- 새 기능 테스트 케이스 작성
- 엣지 케이스 발견
- 버그 재현 시나리오 작성
- 통합 테스트 설계

**프롬프트 예시:**
```
Tester로서 다음 기능을 테스트해줘:

기능: 바코드 스캔 → 재고 업데이트
테스트 범위:
1. 정상 시나리오 (IN, OUT, VIEW 타입)
2. 엣지 케이스 (존재하지 않는 바코드, 재고 부족, 중복 스캔)
3. 성능 테스트 (100개 연속 스캔)
4. Firebase 동기화 확인

테스트 결과를 표로 정리해줘.
```

**체크리스트:**
- ✅ 기능 테스트: 정상 시나리오, 엣지 케이스, 경계값
- ✅ 통합 테스트: Firebase 연동, API 호출, 파일 처리
- ✅ 성능 테스트: 응답 시간, 메모리 사용량, 동시 사용자
- ✅ 보안 테스트: 입력 검증, 권한 확인, XSS/Injection
- ✅ 회귀 테스트: 기존 기능 영향 확인
- ✅ 사용성 테스트: 모바일, 키보드, 스크린 리더

**테스트 시나리오 형식:**
```markdown
## Test Case: 바코드 스캔 - 입고 처리

**Given**: 제품 "우리곡간식" 재고 100개
**When**: "P001-IN-80" 바코드 스캔
**Then**:
- 재고 100 → 180
- history에 IN 기록 추가
- Firebase 업데이트 확인
- UI에 실시간 반영
```

---

### Performance Optimizer Role

**사용 시기:**
- 로딩 시간이 느릴 때
- 메모리 사용량이 높을 때
- 렌더링이 느릴 때
- Firebase 읽기/쓰기 비용이 높을 때

**프롬프트 예시:**
```
Performance Optimizer로서 다음을 최적화해줘:

문제:
- 제품 목록 1000개일 때 테이블 렌더링이 느림 (3초 이상)
- Firebase 리스너가 너무 자주 트리거됨

목표:
- 렌더링 1초 이내
- Firebase 읽기 횟수 50% 감소
```

**체크리스트:**
- ✅ 렌더링: 가상 스크롤, 디바운싱, 불필요한 리플로우 제거
- ✅ Firebase: 쿼리 최적화, 리스너 범위 축소, 캐싱
- ✅ 네트워크: 배치 요청, 압축, CDN
- ✅ 메모리: 리스너 정리, 대용량 객체 제거, WeakMap 활용
- ✅ 번들: 코드 분할, Tree shaking, 미사용 코드 제거

---

### Database Architect Role

**사용 시기:**
- Firebase 데이터 구조 설계
- 데이터 마이그레이션
- 쿼리 최적화
- 보안 규칙 설계

**프롬프트 예시:**
```
Database Architect로서 다음을 설계해줘:

요구사항:
- 제품별 일별 생산/출고 이력 저장 (90일 보관)
- 주간/월간 통계 빠르게 조회
- Firebase 읽기 비용 최소화

제약사항:
- Firebase Realtime Database 사용
- 무료 플랜 (동시 연결 100, 1GB 저장)
```

**체크리스트:**
- ✅ 정규화 vs 비정규화: 읽기/쓰기 패턴 분석
- ✅ 인덱싱: 자주 쿼리하는 필드
- ✅ 데이터 중복: 읽기 최적화를 위한 전략적 중복
- ✅ 보안 규칙: 최소 권한 원칙
- ✅ 데이터 보존: 자동 정리, 아카이빙

---

## Using Roles Effectively

**팁:**
1. **역할을 명시적으로 요청**: "Code Reviewer로서..." 명확히 작성
2. **컨텍스트 제공**: 파일 경로, 요구사항, 제약사항 명시
3. **체크리스트 활용**: 특정 항목 중점 검토 요청
4. **결과 형식 지정**: 표, 보고서, 코드 등 원하는 형식 명시
5. **반복 개선**: 첫 결과에서 추가 요청으로 정교화

**예시 워크플로우:**
```
1. Frontend Developer로서 기능 구현
2. Code Reviewer로서 구현된 코드 리뷰
3. Performance Optimizer로서 성능 개선
4. Tester로서 테스트 케이스 작성 및 실행
```

## Common Development Patterns

### Adding a New UI Section
1. Add section HTML in index.html
2. Add toggle button in header
3. Implement toggle event listener in app.js
4. Hide scan indicator when section is open
5. Return focus to barcode input when section closes

### Modifying Firebase Data Structure
1. Update type definitions in architecture comments
2. Update data write operations
3. Update Firebase listeners and state updates
4. Update filter functions if needed
5. Consider migration path for existing data

### Testing Barcode Functionality
1. Register a product with sample quantities
2. Note the generated barcode IDs in console
3. Manually type barcode ID in scan input + Enter
4. Verify stock updates and history entries
5. Check Firebase console for data consistency

### choolgo-watcher Development

**Adding a new channel:**
1. Define channel in `config/channels.js`
2. Create parser in `parsers/` (reference existing parsers)
3. Add column mapping in `shipping/column-maps.js`
4. Test with sample file
5. Restart watcher: `npm run pm2:restart`

**Testing order file processing:**
1. Ensure choolgo-watcher is running (`npm run pm2:status`)
2. Copy test file to monitored directory
3. Check logs: `npm run pm2:logs`
4. Verify Firebase `choolgoLogs/{date}/summary` in console
5. Verify web app "금일출고" column updates in real-time

**Debugging parser issues:**
1. Add console.log in parser file
2. Restart watcher: `npm run pm2:restart`
3. Trigger with test file
4. View logs: `npm run pm2:logs`
5. Check `logs/` directory for detailed logs

### Product Name Mapping Management
1. Open web app "설정" → "품목명 매핑" section
2. Enter pattern (search keyword), short name, priority, channel
3. Save to Firebase
4. Courier form generation automatically applies mappings (higher priority first)
5. Test by processing order file with matching product name

### Testing Courier Form Generation (밥솥)
1. Open web app, click "밥솥" button in header
2. Select order Excel file(s)
3. Verify channel detection (displayed in results)
4. Check extracted products and quantities
5. Verify product name mappings applied
6. Download generated courier form Excel
7. Open Excel file and verify 9 columns with correct data

## Firebase Configuration

The `docs/firebase-config.js` file contains Firebase API keys and project configuration. This file is committed to the repository but should be reconfigured for each deployment following the setup guide in `FIREBASE_SETUP.md`.

## Notes

- All UI text is in Korean (target users are Korean-speaking warehouse staff)
- The app is designed for use with physical barcode scanners that emit Enter key
- Mobile-responsive design included in CSS
- No authentication system (relies on Firebase security rules)
- Test mode security rules allow unrestricted read/write access
- Production deployments should implement proper Firebase security rules
- choolgo-watcher runs as PM2 background service (auto-restart on crash)
- Real working folder for choolgo-watcher: `/volume1/우리곡간식품 동기화/07_출하관리                             출하팀장/07_CJ대한통운/`
- `/volume1/web/` folder is NOT synced by Synology Drive - use shared folder for actual work
