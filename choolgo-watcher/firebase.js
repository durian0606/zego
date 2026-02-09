const https = require('https');
const { FIREBASE_URL } = require('./config/config');

function firebaseRequest(method, path, data) {
    return new Promise((resolve, reject) => {
        const fullUrl = `${FIREBASE_URL}${path}`;
        const parsed = new URL(fullUrl);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function getProduct(productName) {
    const encoded = encodeURIComponent(productName);
    return firebaseRequest('GET', `/products/${encoded}.json`);
}

async function updateProductStock(productName, newStock) {
    const encoded = encodeURIComponent(productName);
    return firebaseRequest('PATCH', `/products/${encoded}.json`, {
        currentStock: newStock,
        updatedAt: Date.now()
    });
}

async function addHistory(entry) {
    return firebaseRequest('POST', '/history.json', entry);
}

async function deductStock(productName, quantity, channel) {
    const product = await getProduct(productName);
    if (!product) {
        console.log(`  [경고] 제품 없음: ${productName}`);
        return null;
    }

    const beforeStock = product.currentStock || 0;
    const afterStock = beforeStock - quantity;

    if (afterStock < 0) {
        console.log(`  [경고] 재고 부족: ${productName} (현재: ${beforeStock}, 차감: ${quantity})`);
    }

    await updateProductStock(productName, afterStock);

    await addHistory({
        productName: productName,
        barcode: `AUTO-CHOOLGO-${channel}`,
        type: 'OUT',
        quantity: quantity,
        beforeStock: beforeStock,
        afterStock: afterStock,
        timestamp: Date.now()
    });

    console.log(`  [차감] ${productName}: ${beforeStock} → ${afterStock} (-${quantity}) [${channel}]`);
    return { beforeStock, afterStock, quantity };
}

// 출고파일 처리 로그 기록
async function addChoolgoLog(date, filename, channel, items) {
    const encodedDate = encodeURIComponent(date);
    const logEntry = {
        filename,
        channel,
        items,
        totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
        processedAt: Date.now()
    };
    return firebaseRequest('POST', `/choolgoLogs/${encodedDate}/files.json`, logEntry);
}

// 출고파일 일별 요약 업데이트
async function updateChoolgoSummary(date, items, channel) {
    const encodedDate = encodeURIComponent(date);

    // 기존 요약 가져오기
    const existing = await firebaseRequest('GET', `/choolgoLogs/${encodedDate}/summary.json`) || {};

    // 채널별 합계
    const channels = existing.channels || {};
    channels[channel] = (channels[channel] || 0) + items.reduce((sum, i) => sum + i.quantity, 0);

    // 제품별 합계
    const products = existing.products || {};
    for (const item of items) {
        products[item.product] = (products[item.product] || 0) + item.quantity;
    }

    return firebaseRequest('PUT', `/choolgoLogs/${encodedDate}/summary.json`, {
        channels,
        products,
        lastUpdated: Date.now()
    });
}

module.exports = { getProduct, updateProductStock, addHistory, deductStock, addChoolgoLog, updateChoolgoSummary };
