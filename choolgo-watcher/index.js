const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { deductStock, addChoolgoLog, updateChoolgoSummary } = require('./firebase');
const { detectChannel } = require('./config/channels');
const { extractShippingRows } = require('./shipping/extract-shipping');
const { appendShippingRows } = require('./shipping/courier-writer');
const { START_DATE, WATCH_PATHS, PROCESSED_FILE } = require('./config/config');

const DRY_RUN = process.argv.includes('--dry-run'); // 테스트 모드 (Firebase 차감 안 함)
const REPROCESS_ARG = process.argv.indexOf('--reprocess');

// 처리 완료 파일 목록 로드
function loadProcessed() {
    try {
        return JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveProcessed(data) {
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(data, null, 2));
}

// 파일 날짜 필터 (START_DATE 이후만 처리)
function isRecentFile(filePath) {
    try {
        const stat = fs.statSync(filePath);
        const fileDate = stat.mtime.toISOString().slice(0, 10);
        return fileDate >= START_DATE;
    } catch {
        return false;
    }
}

// 파일 처리 (skipChecks: 중복/날짜 체크 건너뛰기 - 재처리용)
async function processFile(filePath, skipChecks = false) {
    const processed = loadProcessed();
    const absPath = path.resolve(filePath);

    if (!skipChecks) {
        // 중복 체크
        if (processed[absPath]) {
            return;
        }

        // xlsx/xls 파일만 처리
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls') {
            return;
        }

        // 날짜 필터
        if (!isRecentFile(filePath)) {
            return;
        }

        // 파일이 아직 쓰기 중일 수 있으므로 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 채널 판별
    const ch = detectChannel(filePath);
    if (!ch) {
        return;
    }

    const { id: channel, name: channelName, parser } = ch;
    const filename = path.basename(filePath);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[처리] ${filename} (${channelName})`);
    console.log(`${'='.repeat(60)}`);

    try {
        // 파싱 (비동기 - 암호화 파일 지원)
        const items = await parser.parse(filePath);

        if (items.length === 0) {
            console.log('  상품 추출 결과 없음');
            processed[absPath] = { channel: channelName, date: new Date().toISOString(), items: 0 };
            saveProcessed(processed);
        } else {
            console.log(`  추출 결과: ${items.length}개 제품`);
            for (const item of items) {
                console.log(`    - ${item.product}: ${item.quantity}봉`);
            }

            // Firebase 차감
            if (DRY_RUN) {
                console.log('  [DRY-RUN] Firebase 차감 건너뜀');
            } else {
                console.log('  Firebase 차감 시작...');
                for (const item of items) {
                    await deductStock(item.product, item.quantity, channelName);
                }
            }

            // 처리 완료 기록
            processed[absPath] = {
                channel: channelName,
                date: new Date().toISOString(),
                items: items.length,
                details: items
            };
            saveProcessed(processed);

            // Firebase 로그 기록
            if (!DRY_RUN) {
                const today = new Date().toISOString().slice(0, 10);
                await addChoolgoLog(today, filename, channelName, items);
                await updateChoolgoSummary(today, items, channelName);
            }

            console.log(`  [완료] ${filename} - ${items.length}개 제품 차감 완료`);
        }
    } catch (err) {
        console.error(`  [오류] ${filename}: ${err.message}`);
    }

    // 택배양식 추출 (재고 파싱과 독립적으로 실행)
    try {
        const shippingRows = await extractShippingRows(filePath, channel);
        if (shippingRows.length > 0) {
            if (DRY_RUN) {
                console.log(`  [DRY-RUN] 택배양식 ${shippingRows.length}행 추출:`);
                for (const row of shippingRows.slice(0, 5)) {
                    console.log(`    - ${row.recipientName} | ${row.phone} | ${row.address.slice(0, 30)}... | ${row.productName}`);
                }
                if (shippingRows.length > 5) {
                    console.log(`    ... 외 ${shippingRows.length - 5}행`);
                }
            } else {
                await appendShippingRows(shippingRows);
            }
        }
    } catch (shippingErr) {
        console.error(`  [택배양식 오류] ${shippingErr.message}`);
    }
}

// 메인: 파일 감시 시작
function startWatcher() {
    console.log('='.repeat(60));
    console.log('출고 파일 자동 감시 서비스 시작');
    console.log(`감시 폴더: ${WATCH_PATHS.join(', ')}`);
    console.log(`시작 날짜: ${START_DATE} 이후 파일만 처리`);
    if (DRY_RUN) console.log('** DRY-RUN 모드: Firebase 차감 없이 파싱만 수행 **');
    console.log('='.repeat(60));

    const watcher = chokidar.watch(WATCH_PATHS, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
            stabilityThreshold: 3000,
            pollInterval: 500
        },
        depth: 1,
        ignored: [
            /(^|[\/\\])\../,
            /~\$/,
            /\.tmp$/,
        ]
    });

    // 파일 큐 (순차 처리)
    let processing = false;
    const queue = [];

    async function processQueue() {
        if (processing || queue.length === 0) return;
        processing = true;

        while (queue.length > 0) {
            const filePath = queue.shift();
            await processFile(filePath);
        }

        processing = false;
    }

    watcher.on('add', (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.xlsx' || ext === '.xls') {
            queue.push(filePath);
            processQueue();
        }
    });

    watcher.on('ready', () => {
        console.log('\n감시 준비 완료. 새 파일을 기다리는 중...\n');
    });

    watcher.on('error', (error) => {
        console.error('감시 오류:', error);
    });

    process.on('SIGINT', () => {
        console.log('\n서비스 종료...');
        watcher.close();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n서비스 종료...');
        watcher.close();
        process.exit(0);
    });

    process.on('uncaughtException', (err) => {
        console.error('[치명적 오류]', err);
        // pm2가 자동 재시작하도록 종료
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        console.error('[미처리 Promise 오류]', reason);
    });
}

// 재처리 모드
async function reprocessFile(targetPath) {
    const absPath = path.resolve(targetPath);
    if (!fs.existsSync(absPath)) {
        console.error(`파일 없음: ${absPath}`);
        process.exit(1);
    }

    // processed.json에서 해당 항목 삭제
    const processed = loadProcessed();
    if (processed[absPath]) {
        delete processed[absPath];
        saveProcessed(processed);
        console.log(`[재처리] processed.json에서 제거: ${path.basename(absPath)}`);
    }

    await processFile(absPath, true);
    console.log('\n재처리 완료.');
    process.exit(0);
}

// 진입점 분기
if (REPROCESS_ARG !== -1) {
    const targetPath = process.argv[REPROCESS_ARG + 1];
    if (!targetPath) {
        console.error('사용법: node index.js --reprocess <파일경로>');
        process.exit(1);
    }
    reprocessFile(targetPath);
} else {
    startWatcher();
}
