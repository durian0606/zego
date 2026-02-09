const { readWorkbook, getRows } = require('../utils/read-xlsx');
const mapping = require('../config/product-mapping.json');

// 직택배/아이원 발주서 파서
// 컬럼: A=날짜, B=주문번호, C=업체명, D=상품명, E=수량
// 상품명 예: [바른쌀과자] 국내산 현미 뻥튀기 쌀과자 70gx5팩
async function parse(filePath) {
    const workbook = await readWorkbook(filePath);
    const rows = getRows(workbook);

    if (rows.length < 2) return [];

    const header = rows[0];
    if (!header.D || !String(header.D).includes('상품명')) {
        console.log('  [아이원] 헤더 불일치, 스킵');
        return [];
    }

    const results = [];
    const rules = mapping.iwon.rules;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const productName = String(row.D || '').trim();
        const orderQty = parseInt(row.E) || 1;

        if (!productName) continue;

        for (const rule of rules) {
            if (!new RegExp(rule.pattern, 'i').test(productName)) continue;

            const packMatch = productName.match(new RegExp(rule.packRegex));
            const packCount = packMatch ? parseInt(packMatch[1]) : 0;

            if (packCount > 0) {
                results.push({
                    product: rule.product,
                    quantity: packCount * orderQty
                });
            }
            break;
        }
    }

    return aggregateResults(results);
}

function aggregateResults(results) {
    const map = {};
    for (const r of results) {
        map[r.product] = (map[r.product] || 0) + r.quantity;
    }
    return Object.entries(map).map(([product, quantity]) => ({ product, quantity }));
}

module.exports = { parse };
