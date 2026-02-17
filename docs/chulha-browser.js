/**
 * 브라우저 기반 택배양식 생성
 * 채널 정의/컬럼 매핑은 channel-maps.js 참조
 */

// ============================================
// C. 배송 데이터 추출 (from extract-shipping.js)
// ============================================

function getVal(row, col) {
    if (!col) return '';
    const val = row[col];
    if (val === undefined || val === null) return '';
    return String(val).trim();
}

function getProductName(row, productNameSpec) {
    if (Array.isArray(productNameSpec)) {
        return productNameSpec
            .map(col => getVal(row, col))
            .filter(v => v)
            .join(' ');
    }
    return getVal(row, productNameSpec);
}

function formatPhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/[^\d]/g, '');
    if (!digits) return '';
    if (digits.length === 11) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return digits;
}

/**
 * 워크북에서 배송 행 추출 (브라우저용)
 * @param {Object} workbook - XLSX.read()로 읽은 워크북
 * @param {string} channelId - 채널 ID
 * @param {string} filename - 파일명
 * @returns {Array}
 */
function extractShippingRowsBrowser(workbook, channelId, filename) {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 'A', defval: '' });

    if (rows.length < 2) return [];

    let columnMap = getColumnMap(channelId, filename);
    if (!columnMap) {
        console.log(`[택배양식] 채널 "${channelId}"에 대한 컬럼 매핑 없음`);
        return [];
    }

    // skipRows 지원 (멀티행 헤더 파일)
    let dataStartRow = 1;
    if (columnMap !== 'auto-detect' && columnMap.skipRows) {
        dataStartRow = columnMap.skipRows;
    }

    const header = rows[0];

    // 자동 탐지 모드: 여러 행에서 헤더 탐색
    if (columnMap === 'auto-detect') {
        let detected = null;
        const maxScan = Math.min(5, rows.length);
        for (let r = 0; r < maxScan; r++) {
            detected = autoDetectColumns(rows[r]);
            if (detected) {
                dataStartRow = r + 1;
                console.log(`[택배양식] 자동 탐지 완료: 헤더=행${r + 1}, 수취인=${detected.recipientName}`);
                break;
            }
        }
        if (!detected) {
            console.log(`[택배양식] 자동 탐지 실패: 수취인 컬럼을 찾을 수 없음`);
            return [];
        }
        columnMap = detected;
    }

    // 헤더 검증
    if (columnMap.headerCheck) {
        const { col, keyword } = columnMap.headerCheck;
        const headerVal = String(header[col] || '').trim();
        if (!headerVal.includes(keyword)) {
            console.log(`[택배양식] 헤더 불일치: ${col}컬럼에 "${keyword}" 없음 (실제: "${headerVal}")`);
            return [];
        }
    }

    const results = [];

    for (let i = dataStartRow; i < rows.length; i++) {
        const row = rows[i];
        const recipientName = getVal(row, columnMap.recipientName);
        if (!recipientName) continue;

        const phone = formatPhone(getVal(row, columnMap.phone));
        const postalCode = columnMap.postalCode ? getVal(row, columnMap.postalCode) : '';
        const address = getVal(row, columnMap.address);
        const message = columnMap.message ? getVal(row, columnMap.message) : '';
        const productName = getProductName(row, columnMap.productName);
        const quantity = columnMap.quantity ? (parseInt(getVal(row, columnMap.quantity)) || 1) : 1;

        results.push({
            recipientName,
            phone,
            postalCode: String(postalCode || ''),
            address: String(address || ''),
            message: String(message || ''),
            productName: String(productName || ''),
            quantity,
        });
    }

    return results;
}

// ============================================
// D. 합배송 (from consolidate.js)  [섹션 D → 이전 D 유지]
// ============================================

function extractPackInfo(name) {
    if (!name) return null;
    const m = name.match(/(\d+)\s*(봉|팩)/);
    if (!m) return null;
    return { count: parseInt(m[1], 10), unit: m[2] };
}

function applyNameMapping(originalName, mappings) {
    if (!originalName) return originalName;
    for (const m of mappings) {
        if (originalName.includes(m.pattern)) {
            const packInfo = extractPackInfo(originalName);
            if (packInfo) {
                return `${m.shortName} ${packInfo.count}${packInfo.unit}`;
            }
            return m.shortName;
        }
    }
    return originalName;
}

function findUnmappedProducts(rows, mappings) {
    if (!rows || rows.length === 0) return [];
    if (!mappings) mappings = [];

    const counts = new Map();
    for (const row of rows) {
        const original = row.productName;
        if (!original) continue;
        const mapped = applyNameMapping(original, mappings);
        if (mapped === original) {
            counts.set(original, (counts.get(original) || 0) + 1);
        }
    }

    return Array.from(counts.entries())
        .map(([originalName, count]) => ({ originalName, count }))
        .sort((a, b) => b.count - a.count);
}

function recipientKey(row) {
    return [
        (row.recipientName || '').trim(),
        (row.phone || '').trim(),
        (row.address || '').trim(),
    ].join('|');
}

function consolidateShipping(rows, mappings) {
    if (!rows || rows.length === 0) return [];
    if (!mappings) mappings = [];

    const groups = new Map();
    for (const row of rows) {
        const key = recipientKey(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }

    const consolidated = [];

    for (const [, groupRows] of groups) {
        const first = groupRows[0];

        const productMap = new Map();
        for (const row of groupRows) {
            const shortName = applyNameMapping(row.productName, mappings);
            const qty = Number(row.quantity) || 1;
            productMap.set(shortName, (productMap.get(shortName) || 0) + qty);
        }

        const productParts = [];
        let totalQty = 0;
        for (const [name, qty] of productMap) {
            if (qty > 1) {
                productParts.push(`${name}*${qty}`);
            } else {
                productParts.push(name);
            }
            totalQty += qty;
        }

        const uniqueMessages = [...new Set(
            groupRows.map(r => (r.message || '').trim()).filter(Boolean)
        )];

        const uniqueChannels = [...new Set(
            groupRows.map(r => (r.channel || '').trim()).filter(Boolean)
        )];

        consolidated.push({
            recipientName: first.recipientName,
            phone: first.phone,
            postalCode: first.postalCode || '',
            address: first.address,
            message: uniqueMessages.join(' / '),
            productName: productParts.join(', '),
            quantity: totalQty,
            invoice: '',
            courier: '',
            channel: uniqueChannels.join('/'),
        });
    }

    return consolidated;
}

// ============================================
// E. 택배양식 생성 + 다운로드 (from courier-writer.js)
// ============================================

const COURIER_HEADERS = [
    '받는분성명',
    '받는분전화번호',
    '받는분우편번호',
    '받는분주소(전체, 분할)',
    '배송메세지1',
    '품목명',
    '내품수량',
    '운송장',
    '택배사',
    '채널',
];

const COURIER_COL_WIDTHS = [
    { wch: 10 },
    { wch: 15 },
    { wch: 8 },
    { wch: 50 },
    { wch: 25 },
    { wch: 40 },
    { wch: 8 },
    { wch: 15 },
    { wch: 10 },
    { wch: 14 },
];

function generateCourierXlsx(rows) {
    const sheetData = [COURIER_HEADERS];
    for (const row of rows) {
        sheetData.push([
            row.recipientName,
            row.phone,
            row.postalCode,
            row.address,
            row.message,
            row.productName,
            row.quantity,
            row.invoice || '',
            row.courier || '',
            row.channel || '',
        ]);
    }

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);
    sheet['!cols'] = COURIER_COL_WIDTHS;
    XLSX.utils.book_append_sheet(workbook, sheet, '직택');
    return workbook;
}

function downloadCourierXlsx(workbook) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    XLSX.writeFile(workbook, `${mm}${dd}_택배양식.xlsx`);
}

// ============================================
// F. 메인 파이프라인
// ============================================

/**
 * 선택된 파일들을 처리하여 택배양식 데이터 생성
 * @param {FileList|File[]} fileList - 선택된 파일 목록
 * @returns {Promise<{results: Array, allRows: Array, consolidated: Array, workbook: Object}>}
 */
async function processSelectedFiles(fileList) {
    const results = [];
    const allRows = [];

    // 매핑 데이터 가져오기 (AppState에서)
    const mappingsObj = (typeof AppState !== 'undefined') ? AppState.productNameMappings : {};
    const mappings = Object.values(mappingsObj)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const file of fileList) {
        // 엑셀 파일만 처리
        if (!file.name.match(/\.xlsx?$/i) || file.name.startsWith('~$')) continue;

        const channel = detectChannelBrowser(file);
        if (!channel) {
            results.push({ filename: file.name, channel: '-', error: '채널 감지 실패' });
            continue;
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            let workbook;
            try {
                workbook = XLSX.read(arrayBuffer, { type: 'array' });
            } catch (e) {
                results.push({
                    filename: file.name,
                    channel: channel.name,
                    error: '암호화된 파일은 엑셀에서 열어 다른이름으로 저장 후 다시 시도해주세요.',
                });
                continue;
            }

            const rows = extractShippingRowsBrowser(workbook, channel.id, file.name);

            // 채널 정보 추가
            for (const row of rows) {
                row.channel = channel.name;
            }

            allRows.push(...rows);
            results.push({
                filename: file.name,
                channel: channel.name,
                items: rows.length,
                shippingRows: rows.length,
            });
        } catch (err) {
            results.push({ filename: file.name, channel: channel.name, error: err.message });
        }
    }

    // 미매핑 상품 탐지
    const unmappedProducts = findUnmappedProducts(allRows, mappings);

    // 합배송 처리
    const consolidated = consolidateShipping(allRows, mappings);

    // 택배양식 워크북 생성
    let courierWorkbook = null;
    if (consolidated.length > 0) {
        courierWorkbook = generateCourierXlsx(consolidated);
    }

    return { results, allRows, consolidated, workbook: courierWorkbook, unmappedProducts };
}
