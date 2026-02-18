#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const CHOOLGO_DIR = '/volume1/web/dev/zego/choolgo';
const OUTPUT_FILE = '/volume1/web/dev/zego/choolgo/제품목록_추출.xlsx';

// Channel detection based on file path and name
function detectChannel(filePath, fileName) {
  const lowerFileName = fileName.toLowerCase();
  const lowerPath = filePath.toLowerCase();

  if (lowerFileName.includes('아이원')) return '아이원';
  if (lowerFileName.includes('잇템')) return '잇템커머스';
  if (lowerFileName.includes('포앤서치') || lowerFileName.includes('캄므')) return '포앤서치/캄므';
  if (lowerFileName.includes('크레이지')) return '크레이지';
  if (lowerFileName.includes('j우리곡간')) return 'J우리곡간';
  if (lowerFileName.includes('브랜딩리드')) return '브랜딩리드';

  if (lowerPath.includes('카카오')) return '카카오';
  if (lowerPath.includes('팔도감')) {
    if (lowerPath.includes('네이버') || lowerFileName.includes('네이버')) return '네이버';
    return '팔도감';
  }
  if (lowerFileName.includes('네이버')) return '네이버';

  return '기타';
}

// Read Excel file safely
function readWorkbook(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message);
    return null;
  }
}

// Get rows from worksheet
function getRows(worksheet) {
  if (!worksheet || !worksheet['!ref']) return [];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
}

// Extract products based on channel
function extractProducts(filePath, fileName, channel) {
  const workbook = readWorkbook(filePath);
  if (!workbook) return [];

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = getRows(worksheet);

  const products = [];

  try {
    switch (channel) {
      case '아이원':
        // D=상품명, E=수량
        for (let i = 1; i < rows.length; i++) {
          const productName = String(rows[i][3] || '').trim(); // Column D (index 3)
          const quantity = rows[i][4]; // Column E (index 4)
          if (productName && productName !== '상품명') {
            products.push({
              channel,
              fileName,
              productName,
              option: '',
              quantity: quantity || ''
            });
          }
        }
        break;

      case '네이버':
        // D=상품명, E=옵션정보, F=수량
        // Skip encrypted files
        if (fileName.endsWith('.xlsx')) {
          console.log(`Skipping encrypted Naver file: ${fileName}`);
          return [];
        }
        for (let i = 1; i < rows.length; i++) {
          const productName = String(rows[i][3] || '').trim(); // Column D
          const option = String(rows[i][4] || '').trim(); // Column E
          const quantity = rows[i][5]; // Column F
          if (productName && productName !== '상품명') {
            products.push({
              channel,
              fileName,
              productName,
              option,
              quantity: quantity || ''
            });
          }
        }
        break;

      case '카카오':
        // E=상품, F=옵션, G=수량
        for (let i = 1; i < rows.length; i++) {
          const productName = String(rows[i][4] || '').trim(); // Column E
          const option = String(rows[i][5] || '').trim(); // Column F
          const quantity = rows[i][6]; // Column G
          if (productName && productName !== '상품명') {
            products.push({
              channel,
              fileName,
              productName,
              option,
              quantity: quantity || ''
            });
          }
        }
        break;

      case '팔도감':
        // J=상품명, L=옵션명, N=수량
        for (let i = 1; i < rows.length; i++) {
          const productName = String(rows[i][9] || '').trim(); // Column J (index 9)
          const option = String(rows[i][11] || '').trim(); // Column L (index 11)
          const quantity = rows[i][13]; // Column N (index 13)
          if (productName && productName !== '상품명') {
            products.push({
              channel,
              fileName,
              productName,
              option,
              quantity: quantity || ''
            });
          }
        }
        break;

      case '잇템커머스':
        // 인덱스 1=상품명, 2=수량 (복합헤더 Row 2-3, 데이터 Row 4부터)
        for (let i = 4; i < rows.length; i++) {
          const productName = String(rows[i][1] || '').trim();
          const quantity = rows[i][2];
          if (productName) {
            products.push({
              channel,
              fileName,
              productName,
              option: '',
              quantity: quantity || ''
            });
          }
        }
        break;

      case '포앤서치/캄므':
        // D=상품명, E=옵션, I=수량
        for (let i = 1; i < rows.length; i++) {
          const productName = String(rows[i][3] || '').trim(); // Column D
          const option = String(rows[i][4] || '').trim(); // Column E
          const quantity = rows[i][8]; // Column I (index 8)
          if (productName && productName !== '상품명') {
            products.push({
              channel,
              fileName,
              productName,
              option,
              quantity: quantity || ''
            });
          }
        }
        break;

      case '크레이지':
        // F=상품명1, E=수량
        for (let i = 1; i < rows.length; i++) {
          const productName = String(rows[i][5] || '').trim(); // Column F (index 5)
          const quantity = rows[i][4]; // Column E (index 4)
          if (productName && productName !== '상품명') {
            products.push({
              channel,
              fileName,
              productName,
              option: '',
              quantity: quantity || ''
            });
          }
        }
        break;

      case 'J우리곡간':
        // A=상품명, B=옵션명, C=수량
        for (let i = 1; i < rows.length; i++) {
          const productName = String(rows[i][0] || '').trim(); // Column A
          const option = String(rows[i][1] || '').trim(); // Column B
          const quantity = rows[i][2]; // Column C
          if (productName && productName !== '상품명') {
            products.push({
              channel,
              fileName,
              productName,
              option,
              quantity: quantity || ''
            });
          }
        }
        break;

      case '브랜딩리드':
        // E=제품명, F=수량
        for (let i = 1; i < rows.length; i++) {
          const productName = String(rows[i][4] || '').trim(); // Column E
          const quantity = rows[i][5]; // Column F
          if (productName && productName !== '제품명') {
            products.push({
              channel,
              fileName,
              productName,
              option: '',
              quantity: quantity || ''
            });
          }
        }
        break;
    }
  } catch (error) {
    console.error(`Error extracting from ${fileName}:`, error.message);
  }

  return products;
}

// Scan directory recursively for Excel files
function scanDirectory(dir) {
  const allProducts = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        // Skip temp files
        if (entry.name.startsWith('~$')) continue;

        // Process Excel files
        if (entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls')) {
          console.log(`Processing: ${fullPath}`);

          const channel = detectChannel(fullPath, entry.name);
          const products = extractProducts(fullPath, entry.name, channel);

          console.log(`  → Found ${products.length} products from ${channel}`);
          allProducts.push(...products);
        }
      }
    }
  }

  scan(dir);
  return allProducts;
}

// Create output workbook with multiple sheets
function createOutputWorkbook(allProducts) {
  const workbook = XLSX.utils.book_new();

  // Deduplicate products (same productName + option)
  const uniqueProducts = [];
  const seen = new Set();

  for (const product of allProducts) {
    const key = `${product.channel}|${product.productName}|${product.option}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueProducts.push(product);
    }
  }

  console.log(`\nTotal unique products: ${uniqueProducts.length}`);

  // Sheet 1: 전체목록
  const allData = [
    ['채널', '파일명', '상품명', '옵션', '수량'],
    ...uniqueProducts.map(p => [p.channel, p.fileName, p.productName, p.option, p.quantity])
  ];
  const allSheet = XLSX.utils.aoa_to_sheet(allData);
  XLSX.utils.book_append_sheet(workbook, allSheet, '전체목록');

  // Sheets 2-10: By channel
  const channels = [
    { name: '아이원', sheetName: '아이원' },
    { name: '네이버', sheetName: '네이버' },
    { name: '카카오', sheetName: '카카오' },
    { name: '팔도감', sheetName: '팔도감' },
    { name: '잇템커머스', sheetName: '잇템커머스' },
    { name: '포앤서치/캄므', sheetName: '포앤서치캄므' },
    { name: '크레이지', sheetName: '크레이지' },
    { name: 'J우리곡간', sheetName: 'J우리곡간' },
    { name: '브랜딩리드', sheetName: '브랜딩리드' }
  ];

  for (const channel of channels) {
    const channelProducts = uniqueProducts.filter(p => p.channel === channel.name);
    const channelData = [
      ['파일명', '상품명', '옵션', '수량'],
      ...channelProducts.map(p => [p.fileName, p.productName, p.option, p.quantity])
    ];
    const channelSheet = XLSX.utils.aoa_to_sheet(channelData);
    XLSX.utils.book_append_sheet(workbook, channelSheet, channel.sheetName);

    console.log(`  ${channel.name}: ${channelProducts.length} products`);
  }

  return workbook;
}

// Main execution
console.log('=== 제품명 추출 시작 ===\n');

if (!fs.existsSync(CHOOLGO_DIR)) {
  console.error(`Error: Directory not found: ${CHOOLGO_DIR}`);
  process.exit(1);
}

try {
  const allProducts = scanDirectory(CHOOLGO_DIR);
  console.log(`\nTotal products extracted: ${allProducts.length}`);

  const workbook = createOutputWorkbook(allProducts);

  XLSX.writeFile(workbook, OUTPUT_FILE);
  console.log(`\n✓ Output saved to: ${OUTPUT_FILE}`);
} catch (error) {
  console.error('\n✗ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
