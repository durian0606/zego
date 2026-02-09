const { readWorkbook, getRows } = require('../utils/read-xlsx');
const mapping = require('../config/product-mapping.json');

// 카카오 주문서 파서
// 컬럼: E=상품, F=옵션, G=수량
async function parse(filePath) {
    const workbook = await readWorkbook(filePath);
    const rows = getRows(workbook);

    if (rows.length < 2) return [];

    const header = rows[0];
    if (!header.F || !String(header.F).includes('옵션')) {
        console.log('  [카카오] 헤더 불일치, 스킵');
        return [];
    }

    const results = [];
    const 종합제품 = mapping['종합누룽지'];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const option = String(row.F || '').trim();
        const orderQty = parseInt(row.G) || 1;

        if (!option) continue;

        // 정규화: "옵션 - " 접두사, 가격 정보 제거
        const cleaned = option
            .replace(/^옵션\s*-\s*/, '')
            .replace(/\(\d[\d,]*원\)/, '')
            .trim();

        // "추가 증정" 패턴: "A5봉+B 5봉 추가 증정"
        const bonusMatch = cleaned.match(/^(.+?)(\d+)봉\s*\+\s*(.+?)\s*(\d+)\s*봉\s*추가\s*증정$/);
        if (bonusMatch) {
            const mainType = bonusMatch[1].trim();
            const mainCount = parseInt(bonusMatch[2]);
            const bonusType = bonusMatch[3].trim();
            const bonusCount = parseInt(bonusMatch[4]);

            addProductFromType(results, mainType, mainCount * orderQty, 종합제품);
            addProductFromType(results, bonusType, bonusCount * orderQty, 종합제품);
            continue;
        }

        // 뻥튀기
        const ppungMatch = cleaned.match(/현미뻥튀기쌀과자(\d+)봉/);
        if (ppungMatch) {
            results.push({ product: '우리곡간 현미뻥튀기', quantity: parseInt(ppungMatch[1]) * orderQty });
            continue;
        }

        // 서리태
        const seriMatch = cleaned.match(/서리태\s*(\d+)봉/);
        if (seriMatch) {
            results.push({ product: '우리곡간 서리태', quantity: parseInt(seriMatch[1]) * orderQty });
            continue;
        }

        // 누룽지 종류
        const nurunMatch = cleaned.match(/(현미|귀리|강황|검정깨|코코넛|종합)누룽지\s*(\d+)봉/);
        if (nurunMatch) {
            const type = nurunMatch[1];
            const count = parseInt(nurunMatch[2]);
            addProductFromType(results, type + '누룽지', count * orderQty, 종합제품);
            continue;
        }
    }

    return aggregateResults(results);
}

function addProductFromType(results, typeStr, quantity, 종합제품) {
    const typeMap = {
        '현미누룽지': '우리곡간 현미누룽지',
        '귀리누룽지': '우리곡간 귀리누룽지',
        '강황누룽지': '우리곡간 강황누룽지',
        '검정깨누룽지': '우리곡간 검정깨누룽지',
        '코코넛누룽지': '우리곡간 코코넛누룽지',
        '현미뻥튀기': '우리곡간 현미뻥튀기',
        '서리태': '우리곡간 서리태'
    };

    for (const [keyword, product] of Object.entries(typeMap)) {
        if (typeStr.includes(keyword)) {
            results.push({ product, quantity });
            return;
        }
    }

    // 종합누룽지: 5종류 균등 배분
    if (typeStr.includes('종합')) {
        const perItem = Math.floor(quantity / 종합제품.length);
        const remainder = quantity % 종합제품.length;
        for (let i = 0; i < 종합제품.length; i++) {
            const q = perItem + (i < remainder ? 1 : 0);
            if (q > 0) {
                results.push({ product: 종합제품[i], quantity: q });
            }
        }
        return;
    }

    console.log(`  [카카오] 매핑 실패: "${typeStr}" (${quantity}봉)`);
}

function aggregateResults(results) {
    const map = {};
    for (const r of results) {
        map[r.product] = (map[r.product] || 0) + r.quantity;
    }
    return Object.entries(map).map(([product, quantity]) => ({ product, quantity }));
}

module.exports = { parse };
