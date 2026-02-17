const { readWorkbook, getRows } = require('../utils/read-xlsx');

// 제품 패턴 (모듈 로드 시 1회 컴파일)
const PRODUCT_PATTERNS = [
    { regex: /현미.*뻥튀기|뻥튀기.*쌀과자/, product: '우리곡간 현미뻥튀기' },
    { regex: /강황누룽지/, product: '우리곡간 강황누룽지' },
    { regex: /귀리누룽지/, product: '우리곡간 귀리누룽지' },
    { regex: /검정깨누룽지/, product: '우리곡간 검정깨누룽지' },
    { regex: /코코넛누룽지/, product: '우리곡간 코코넛누룽지' },
    { regex: /현미누룽지|수제.*누룽지/, product: '우리곡간 현미누룽지' },
    { regex: /서리태/, product: '우리곡간 서리태' },
];

// 제네릭 파서 - 다양한 직택배 주문서 형식 처리
// J우리곡간 (두브로), 크레이지아지트, 스마트스토어 등
// 상품명/옵션을 찾아서 키워드 매칭으로 제품 추출
async function parse(filePath) {
    const workbook = await readWorkbook(filePath);
    const rows = getRows(workbook);

    if (rows.length < 2) return [];

    const header = rows[0];

    // 상품명, 옵션, 수량 컬럼 자동 탐지
    const cols = detectColumns(header);
    if (!cols.productCol) {
        console.log('  [제네릭] 상품명 컬럼을 찾을 수 없음');
        return [];
    }

    const results = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const productText = String(row[cols.productCol] || '').trim();
        const optionText = cols.optionCol ? String(row[cols.optionCol] || '').trim() : '';
        const orderQty = cols.qtyCol ? (parseInt(row[cols.qtyCol]) || 1) : 1;

        if (!productText && !optionText) continue;

        // 상품명 + 옵션 합쳐서 분석
        const combined = productText + ' ' + optionText;

        const items = extractProducts(combined, orderQty);
        results.push(...items);
    }

    return aggregateResults(results);
}

// 헤더에서 상품명/옵션/수량 컬럼 자동 탐지
function detectColumns(header) {
    let productCol = null;
    let optionCol = null;
    let qtyCol = null;

    for (const [col, val] of Object.entries(header)) {
        const s = String(val || '').trim();
        if (s.includes('상품명') || s === '품목명') {
            productCol = col;
        } else if (s.includes('옵션') && !optionCol) {
            optionCol = col;
        } else if ((s === '수량' || s.includes('내품수량') || s.match(/수량\(/)) && !qtyCol) {
            qtyCol = col;
        }
    }

    return { productCol, optionCol, qtyCol };
}

// 텍스트에서 제품명 + 봉수 추출
function extractProducts(text, orderQty) {
    const results = [];

    for (const p of PRODUCT_PATTERNS) {
        if (p.regex.test(text)) {
            // 봉수 추출 시도
            const packMatch = text.match(/(\d+)\s*(?:봉|팩|개입)/);
            const packCount = packMatch ? parseInt(packMatch[1]) : 1;

            results.push({
                product: p.product,
                quantity: packCount * orderQty
            });
            return results; // 첫 매칭만
        }
    }

    return results;
}

function aggregateResults(results) {
    const map = {};
    for (const r of results) {
        map[r.product] = (map[r.product] || 0) + r.quantity;
    }
    return Object.entries(map).map(([product, quantity]) => ({ product, quantity }));
}

module.exports = { parse };
