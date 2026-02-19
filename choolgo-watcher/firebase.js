const https = require('https');
const { FIREBASE_URL } = require('./config/config');

const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1초

function firebaseRequest(method, reqPath, data) {
    return new Promise((resolve, reject) => {
        const fullUrl = `${FIREBASE_URL}${reqPath}`;
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
                if (res.statusCode >= 500) {
                    reject(new Error(`Firebase ${res.statusCode}: ${body}`));
                    return;
                }
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

async function firebaseRequestWithRetry(method, reqPath, data) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await firebaseRequest(method, reqPath, data);
        } catch (err) {
            if (attempt === MAX_RETRIES) {
                console.error(`  [Firebase] ${MAX_RETRIES}회 재시도 실패: ${method} ${reqPath}`);
                throw err;
            }
            const delay = BASE_DELAY * Math.pow(2, attempt);
            console.log(`  [Firebase] 재시도 ${attempt + 1}/${MAX_RETRIES} (${delay}ms 후): ${err.message}`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

async function getProduct(productName) {
    const encoded = encodeURIComponent(productName);
    return firebaseRequestWithRetry('GET', `/products/${encoded}.json`);
}

async function updateProductStock(productName, newStock) {
    const encoded = encodeURIComponent(productName);
    return firebaseRequestWithRetry('PATCH', `/products/${encoded}.json`, {
        currentStock: newStock,
        updatedAt: Date.now()
    });
}

async function addHistory(entry) {
    return firebaseRequestWithRetry('POST', '/history.json', entry);
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
        const error = new Error(`재고 부족: ${productName} (현재: ${beforeStock}, 차감: ${quantity})`);
        error.code = 'INSUFFICIENT_STOCK';
        error.details = { productName, beforeStock, quantity };
        throw error;
    }

    // 재고 차감 + 이력 기록을 multi-path update로 원자적 수행
    const historyKey = `AUTO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const encodedProduct = encodeURIComponent(productName);
    const multiUpdate = {};
    multiUpdate[`products/${encodedProduct}/currentStock`] = afterStock;
    multiUpdate[`products/${encodedProduct}/updatedAt`] = Date.now();
    multiUpdate[`history/${historyKey}`] = {
        productName: productName,
        barcode: `AUTO-CHOOLGO-${channel}`,
        type: 'OUT',
        quantity: quantity,
        beforeStock: beforeStock,
        afterStock: afterStock,
        timestamp: Date.now()
    };

    await firebaseRequestWithRetry('PATCH', '/.json', multiUpdate);

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
    return firebaseRequestWithRetry('POST', `/choolgoLogs/${encodedDate}/files.json`, logEntry);
}

// 출고파일 일별 요약 업데이트
// GET-PUT 대신 필드별 PATCH로 전환: 동시 처리 시 덮어쓰기 위험 제거
async function updateChoolgoSummary(date, items, channel) {
    const encodedDate = encodeURIComponent(date);
    const channelTotal = items.reduce((sum, i) => sum + i.quantity, 0);

    // 기존 채널/제품 값 조회 (증분 계산용)
    const existing = await firebaseRequestWithRetry('GET', `/choolgoLogs/${encodedDate}/summary.json`) || {};
    const existingChannels = existing.channels || {};
    const existingProducts = existing.products || {};

    // 증분 후 값 계산
    const newChannelValue = (existingChannels[channel] || 0) + channelTotal;
    const newProducts = { ...existingProducts };
    for (const item of items) {
        newProducts[item.product] = (newProducts[item.product] || 0) + item.quantity;
    }

    // 채널/제품을 개별 PATCH — 전체 덮어쓰기 대신 필드 단위 업데이트
    const encodedChannel = encodeURIComponent(channel);
    await firebaseRequestWithRetry('PUT', `/choolgoLogs/${encodedDate}/summary/channels/${encodedChannel}.json`, newChannelValue);

    const productUpdates = {};
    for (const [productName, qty] of Object.entries(newProducts)) {
        productUpdates[encodeURIComponent(productName)] = qty;
    }
    // multi-path PATCH로 제품별 수량 업데이트
    const multiPath = {};
    for (const item of items) {
        const encodedProduct = encodeURIComponent(item.product);
        multiPath[`choolgoLogs/${encodedDate}/summary/products/${encodedProduct}`] = newProducts[item.product];
    }
    multiPath[`choolgoLogs/${encodedDate}/summary/lastUpdated`] = Date.now();

    return firebaseRequestWithRetry('PATCH', '/.json', multiPath);
}

// 품목명 매핑 전체 조회
async function getProductNameMappings() {
    const data = await firebaseRequestWithRetry('GET', '/productNameMappings.json');
    if (!data) return [];
    return Object.entries(data)
        .filter(([, v]) => v && v.pattern)
        .map(([id, m]) => ({
            id,
            pattern: m.pattern,
            shortName: m.shortName,
            priority: m.priority || 0,
        }))
        .sort((a, b) => b.priority - a.priority);
}

// 이메일 설정 조회
async function getEmailSettings() {
    const data = await firebaseRequestWithRetry('GET', '/emailSettings.json');
    if (!data) return null;

    // 비밀번호 복호화 (Base64)
    if (data.account && data.account.password) {
        try {
            data.account.password = Buffer.from(data.account.password, 'base64').toString('utf-8');
        } catch (e) {
            console.error('[Firebase] 비밀번호 복호화 실패:', e.message);
            data.account.password = '';
        }
    }

    return data;
}

module.exports = { deductStock, addChoolgoLog, updateChoolgoSummary, getProductNameMappings, getEmailSettings };
