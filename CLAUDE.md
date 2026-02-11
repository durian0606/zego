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
