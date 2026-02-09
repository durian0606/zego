const { readWorkbook, getRows } = require('../utils/read-xlsx');
const mapping = require('../config/product-mapping.json');

// 네이버 주문서 파서 (직택배/네이버 + 팔도감/네이버)
// 컬럼: A=수취인명, D=상품명, E=옵션정보, F=수량
// 옵션 패턴:
//   - 현미뻥튀기쌀과자5개입/추가*1
//   - 수제현미누룽지5개입
//   - 선물세트: 선물세트1호(현미12봉)
//   - 선물세트: 선물세트2호(종합12봉)
//   - 선물세트: 선물세트3호(현미8봉)
//   - 선택1.: ★현미누룽지 4봉 / 선택2.: ★귀리누룽지 4봉
//   - 종류: 강황누룽지 1봉
async function parse(filePath) {
    const workbook = await readWorkbook(filePath);
    const rows = getRows(workbook);

    if (rows.length < 2) return [];

    const header = rows[0];
    const hasNaverHeader = (
        (header.D && String(header.D).includes('상품명')) &&
        (header.E && (String(header.E).includes('옵션') || String(header.E).includes('옵션정보')))
    );

    if (!hasNaverHeader) {
        console.log('  [네이버] 헤더 불일치, 스킵');
        return [];
    }

    const results = [];
    const 종합제품 = mapping['종합누룽지'];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const option = String(row.E || '').trim();
        const orderQty = parseInt(row.F) || 1;

        if (!option) continue;

        // 선물세트 패턴
        const giftMatch = option.match(/선물세트\d*호\((\S+?)(\d+)봉\)/);
        if (giftMatch) {
            const type = giftMatch[1]; // 현미 or 종합
            const count = parseInt(giftMatch[2]);
            if (type === '종합') {
                distributeAssorted(results, count * orderQty, 종합제품);
            } else {
                const product = resolveType(type);
                if (product) {
                    results.push({ product, quantity: count * orderQty });
                }
            }
            continue;
        }

        // 선택1/선택2 패턴: "선택1.: ★현미누룽지 4봉 / 선택2.: ★귀리누룽지 4봉"
        const selectPattern = /선택\d+\.\s*[:：]?\s*★?(\S+?누룽지|뻥튀기|서리태)\s*(\d+)\s*봉/g;
        let selectMatch;
        let hasSelect = false;
        while ((selectMatch = selectPattern.exec(option)) !== null) {
            hasSelect = true;
            const type = selectMatch[1];
            const count = parseInt(selectMatch[2]);
            const product = resolveType(type);
            if (product) {
                results.push({ product, quantity: count * orderQty });
            }
        }
        if (hasSelect) continue;

        // 종류 패턴: "종류: 강황누룽지 1봉"
        const kindMatch = option.match(/종류\s*[:：]?\s*(\S+?누룽지|뻥튀기|서리태)\s*(\d+)\s*봉/);
        if (kindMatch) {
            const type = kindMatch[1];
            const count = parseInt(kindMatch[2]);
            const product = resolveType(type);
            if (product) {
                results.push({ product, quantity: count * orderQty });
            }
            continue;
        }

        // 기존 패턴: "현미뻥튀기쌀과자5개입" 등
        const rules = mapping.naver.rules;
        for (const rule of rules) {
            if (!new RegExp(rule.pattern, 'i').test(option)) continue;

            const packMatch = option.match(new RegExp(rule.packRegex));
            const packCount = packMatch ? parseInt(packMatch[1]) : 5;

            results.push({
                product: rule.product,
                quantity: packCount * orderQty
            });
            break;
        }
    }

    return aggregateResults(results);
}

// 타입명 → Firebase 제품명 변환
function resolveType(type) {
    const typeMap = {
        '현미누룽지': '우리곡간 현미누룽지',
        '현미': '우리곡간 현미누룽지',
        '귀리누룽지': '우리곡간 귀리누룽지',
        '강황누룽지': '우리곡간 강황누룽지',
        '검정깨누룽지': '우리곡간 검정깨누룽지',
        '코코넛누룽지': '우리곡간 코코넛누룽지',
        '현미뻥튀기': '우리곡간 현미뻥튀기',
        '뻥튀기': '우리곡간 현미뻥튀기',
        '서리태': '우리곡간 서리태',
    };

    for (const [keyword, product] of Object.entries(typeMap)) {
        if (type.includes(keyword)) return product;
    }

    console.log(`  [네이버] 타입 매핑 실패: "${type}"`);
    return null;
}

// 종합 → 5종류 균등 배분
function distributeAssorted(results, totalCount, products) {
    const perItem = Math.floor(totalCount / products.length);
    const remainder = totalCount % products.length;

    for (let i = 0; i < products.length; i++) {
        const q = perItem + (i < remainder ? 1 : 0);
        if (q > 0) {
            results.push({ product: products[i], quantity: q });
        }
    }
}

function aggregateResults(results) {
    const map = {};
    for (const r of results) {
        if (r.product) {
            map[r.product] = (map[r.product] || 0) + r.quantity;
        }
    }
    return Object.entries(map).map(([product, quantity]) => ({ product, quantity }));
}

module.exports = { parse };
