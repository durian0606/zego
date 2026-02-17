const path = require('path');
const { readWorkbook, getRows } = require('../utils/read-xlsx');
const { getColumnMap, autoDetectColumns } = require('./column-maps');

/**
 * 주문 엑셀 파일에서 배송 데이터를 추출
 * @param {string} filePath - 엑셀 파일 경로
 * @param {string} channel - 채널 식별자 (iwon, kakao, paldogam, etc.)
 * @returns {Array<{recipientName, phone, postalCode, address, message, productName, quantity}>}
 */
async function extractShippingRows(filePath, channel) {
    const workbook = await readWorkbook(filePath);
    const rows = getRows(workbook);

    if (rows.length < 2) return [];

    const filename = path.basename(filePath);
    let columnMap = getColumnMap(channel, filename);

    if (!columnMap) {
        console.log(`  [택배양식] 채널 "${channel}"에 대한 컬럼 매핑 없음`);
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
                console.log(`  [택배양식] 자동 탐지 완료: 헤더=행${r + 1}, 수취인=${detected.recipientName}`);
                break;
            }
        }
        if (!detected) {
            console.log(`  [택배양식] 자동 탐지 실패: 수취인 컬럼을 찾을 수 없음`);
            return [];
        }
        columnMap = detected;
    }

    // 헤더 검증 (auto-detect가 아닌 경우)
    if (columnMap.headerCheck) {
        const { col, keyword } = columnMap.headerCheck;
        const headerVal = String(header[col] || '').trim();
        if (!headerVal.includes(keyword)) {
            console.log(`  [택배양식] 헤더 불일치: ${col}컬럼에 "${keyword}" 없음 (실제: "${headerVal}")`);
            return [];
        }
    }

    const results = [];

    for (let i = dataStartRow; i < rows.length; i++) {
        const row = rows[i];

        // 수취인명 추출
        const recipientName = getVal(row, columnMap.recipientName);
        if (!recipientName) continue;

        // 전화번호
        const phone = formatPhone(getVal(row, columnMap.phone));

        // 우편번호
        const postalCode = columnMap.postalCode ? getVal(row, columnMap.postalCode) : '';

        // 주소
        const address = getVal(row, columnMap.address);

        // 배송 메세지
        const message = columnMap.message ? getVal(row, columnMap.message) : '';

        // 품목명 (배열이면 합치기)
        const productName = getProductName(row, columnMap.productName);

        // 수량
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

// 셀 값 읽기
function getVal(row, col) {
    if (!col) return '';
    const val = row[col];
    if (val === undefined || val === null) return '';
    return String(val).trim();
}

// 품목명: 단일 컬럼 또는 복수 컬럼 결합
function getProductName(row, productNameSpec) {
    if (Array.isArray(productNameSpec)) {
        return productNameSpec
            .map(col => getVal(row, col))
            .filter(v => v)
            .join(' ');
    }
    return getVal(row, productNameSpec);
}

// 전화번호 포맷 정리
function formatPhone(phone) {
    if (!phone) return '';
    // 숫자만 추출
    const digits = String(phone).replace(/[^\d]/g, '');
    if (!digits) return '';
    // 하이픈 포맷팅
    if (digits.length === 11) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        // 서울 02 지역번호: 02-XXXX-XXXX (2-4-4)
        if (digits.startsWith('02')) {
            return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
        }
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return digits;
}

module.exports = { extractShippingRows };
