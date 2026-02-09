const { readWorkbook, getRows } = require('../utils/read-xlsx');
const mapping = require('../config/product-mapping.json');

// 팔도감 주문서 파서
// 컬럼: J=상품명, L=옵션명, N=수량
// 팔도감 채널 → @온도감 현미누룽지로 매핑
async function parse(filePath) {
    const workbook = await readWorkbook(filePath);
    const rows = getRows(workbook);

    if (rows.length < 2) return [];

    const header = rows[0];
    const hasPaldogamHeader = (
        (header.J && String(header.J).includes('상품명')) &&
        (header.L && String(header.L).includes('옵션'))
    );

    if (!hasPaldogamHeader) {
        console.log('  [팔도감] 헤더 불일치, 스킵');
        return [];
    }

    const results = [];
    const rules = mapping.paldogam.rules;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const option = String(row.L || '').trim();
        const orderQty = parseInt(row.N) || 1;

        if (!option) continue;

        for (const rule of rules) {
            if (new RegExp(rule.pattern, 'i').test(option)) {
                const packMatch = option.match(/(\d+)\s*봉/);
                const packCount = packMatch ? parseInt(packMatch[1]) : rule.defaultPack;

                results.push({
                    product: rule.product,
                    quantity: packCount * orderQty
                });
                break;
            }
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
