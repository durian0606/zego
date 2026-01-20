# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**우리곡간식품 재고관리 시스템** - A Firebase-based real-time barcode inventory management system for production and shipment tracking. This is a serverless web application that runs entirely in the browser with Firebase Realtime Database as the backend.

## Development Commands

### Running Locally

```bash
# Option 1: Double-click docs/index.html to open in browser (simplest)

# Option 2: Run with local web server (recommended to avoid CORS issues)
cd docs
python3 -m http.server 8000
# Then open http://localhost:8000
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
│   ├── index.html              # Main HTML page
│   ├── app.js                  # Core application logic (~1935 lines)
│   ├── style.css               # Styling
│   └── firebase-config.js      # Firebase configuration (contains API keys)
├── firebase.json               # Firebase Hosting configuration
├── README.md                   # User documentation (Korean)
└── FIREBASE_SETUP.md          # Firebase setup guide (Korean)
```

### Firebase Data Structure

The application uses Firebase Realtime Database with three main data nodes:

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

### Key Application Architecture

**State Management** (AppState object in app.js:40-48)
- `productsData`: In-memory cache of products from Firebase
- `barcodesData`: In-memory cache of barcodes from Firebase
- `historyData`: Recent 50 transaction records (sorted newest first)
- `dailyClosingsData`: Daily closing records (last 7 days)
- `isEditingMinStock`, `isEditingCurrentStock`: Inline editing flags
- `editingProduct`: Product name being edited (null = new product mode)

**Real-time Sync Pattern** (app.js:126-154)
- Firebase listeners on products, barcodes, and history refs
- On data changes, update AppState and trigger UI re-renders
- History limited to last 50 entries via `.limitToLast(50)`

**Barcode System**
- Auto-generated barcodes follow pattern: `P{productIndex}-{type}-{quantity}`
  - Example: `P001-IN-80` = Product 1, Production, 80 units
  - Example: `P002-OUT-40` = Product 2, Shipment, 40 units
  - Example: `P003-VIEW` = Product 3, Query only (no stock change)
- Multiple barcodes per product with different quantities
- Product index is 3-digit zero-padded (001, 002, etc.)

**Color System** (app.js:53-84)
- 20 distinct colors cycle through products
- Colors persisted in product.colorIndex (0-19)
- If no custom color, uses sorted product name index mod 20
- Same color scheme applies to: inventory table, history, barcode print

**Barcode Scanning Flow** (app.js:1097-1123)
1. User scans barcode → enters in hidden input field
2. Enter key triggers lookup in `barcodesData`
3. If found, calls `updateStock()` with barcode info
4. Updates product stock in Firebase + adds history entry
5. UI updates via Firebase listener automatically

**Inline Editing** (app.js:224-471)
- Click on current stock or target stock to edit
- Creates inline `<input>` element
- Enter saves, ESC cancels
- Blur (focus loss) cancels after short delay
- Updates Firebase directly on save
- Current stock edits create "ADJUST" type history entries

**Barcode Print Page** (app.js:1506-1899)
- Opens new window with printable barcode layout
- Uses JsBarcode library (CODE128 format)
- 4-column grid layout per product
- Separate pages for production (IN) and shipment (OUT)
- Preserves product colors in print view
- Print-optimized CSS with @media print rules

**Daily Closing System** (app.js:2057-2180)
- "금일 마감" button saves today's production/shipment totals to Firebase
- Data stored in `dailyClosings/` node with date key (YYYY-MM-DD)
- Shows last 7 days of closing records in a dedicated table
- Each record can be inline-edited (click on production/shipment values)
- Auto-cleanup removes records older than 7 days
- Key functions:
  - `closeTodayProduction()` - Execute daily closing
  - `updateClosingHistoryTable()` - Render 7-day history table
  - `editClosingValue()` - Inline edit closing records
  - `cleanupOldClosings()` - Remove old records

**Inline Edit UI** (app.js:252-401, 403-550)
- Click on stock values to edit inline
- Shows input field with save (✓) and cancel (✗) buttons
- Keyboard shortcuts: Enter to save, ESC to cancel
- CSS class: `.inline-edit-container`, `.inline-edit-btn-save`, `.inline-edit-btn-cancel`

## Important Implementation Details

### Focus Management
- Barcode input field maintains focus automatically (app.js:1911-1932)
- Focus returns after closing modals, except when editing inline
- Prevents focus during product registration or settings sections
- Essential for barcode scanner hardware integration

### Data Filtering
Always filter out invalid/undefined entries:
- `filterValidProducts()` - Removes products with name === 'undefined'
- `filterValidBarcodes()` - Removes barcodes with undefined product names
- `filterValidHistory()` - Removes history with undefined product names
- One-time cleanup runs on app load (app.js:7-12)

### Product Registration vs. Edit Mode
- `AppState.editingProduct === null` → Registration mode
- `AppState.editingProduct === productName` → Edit mode
- Edit mode:
  - Deletes old barcodes before creating new ones
  - If product name changes, deletes old product entry
  - Preserves currentStock and minStock values
  - Reuses product index for barcode generation

### History Display
- Shows only yesterday and today (app.js:473-562)
- Groups by product + type and sums quantities
- Excludes "ADJUST" type entries
- Excludes deleted products (cross-references with products list)

### IME Handling
- Barcode input has IME disabled to prevent Korean input (app.js:26-37)
- Sets lang="en" and imeMode='disabled'
- Prevents compositionstart events

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

## Firebase Configuration

The `docs/firebase-config.js` file contains Firebase API keys and project configuration. This file is committed to the repository but should be reconfigured for each deployment following the setup guide in `FIREBASE_SETUP.md`.

## Notes

- All UI text is in Korean (target users are Korean-speaking warehouse staff)
- The app is designed for use with physical barcode scanners that emit Enter key
- Mobile-responsive design included in CSS
- No authentication system (relies on Firebase security rules)
- Test mode security rules allow unrestricted read/write access
- Production deployments should implement proper Firebase security rules
