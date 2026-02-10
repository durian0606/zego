/**
 * 합배송 그룹핑 + 품목명 매핑
 */

/**
 * 품목명 매핑 적용 (원본 → 단축명)
 * @param {string} originalName - 주문서 원본 품목명
 * @param {Array} mappings - [{pattern, shortName, priority}] priority 내림차순 정렬됨
 * @returns {string}
 */
function applyNameMapping(originalName, mappings) {
    if (!originalName) return originalName;
    for (const m of mappings) {
        if (originalName.includes(m.pattern)) return m.shortName;
    }
    return originalName;
}

/**
 * 수령인 그룹핑 키 생성
 */
function recipientKey(row) {
    return [
        (row.recipientName || '').trim(),
        (row.phone || '').trim(),
        (row.address || '').trim(),
    ].join('|');
}

/**
 * 합배송: 같은 수령인의 배송 행들을 하나로 합침
 * @param {Array} rows - 배송 행 배열
 * @param {Array} mappings - 품목명 매핑 배열 (priority 내림차순)
 * @returns {Array} 합배송 처리된 행 배열
 */
function consolidateShipping(rows, mappings) {
    if (!rows || rows.length === 0) return [];
    if (!mappings) mappings = [];

    // 수령인별 그룹핑
    const groups = new Map();

    for (const row of rows) {
        const key = recipientKey(row);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(row);
    }

    const consolidated = [];

    for (const [, groupRows] of groups) {
        const first = groupRows[0];

        // 품목별 수량 합산 (매핑 적용 후)
        const productMap = new Map(); // shortName → totalQty
        for (const row of groupRows) {
            const shortName = applyNameMapping(row.productName, mappings);
            const qty = Number(row.quantity) || 1;
            productMap.set(shortName, (productMap.get(shortName) || 0) + qty);
        }

        // 품목명 문자열 생성: "현미뻥 7, 초코 3"
        const productParts = [];
        let totalQty = 0;
        for (const [name, qty] of productMap) {
            productParts.push(`${name} ${qty}`);
            totalQty += qty;
        }
        const combinedProductName = productParts.join(', ');

        // 메세지: 고유 메세지 합침
        const uniqueMessages = [...new Set(
            groupRows.map(r => (r.message || '').trim()).filter(Boolean)
        )];
        const combinedMessage = uniqueMessages.join(' / ');

        // 채널: 고유 채널 합침
        const uniqueChannels = [...new Set(
            groupRows.map(r => (r.channel || '').trim()).filter(Boolean)
        )];
        const combinedChannel = uniqueChannels.join('/');

        consolidated.push({
            recipientName: first.recipientName,
            phone: first.phone,
            postalCode: first.postalCode || '',
            address: first.address,
            message: combinedMessage,
            productName: combinedProductName,
            quantity: totalQty,
            invoice: '',
            courier: '',
            channel: combinedChannel,
        });
    }

    return consolidated;
}

module.exports = { consolidateShipping, applyNameMapping, recipientKey };
