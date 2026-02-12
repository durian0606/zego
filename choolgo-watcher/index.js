const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { deductStock, addChoolgoLog, updateChoolgoSummary, getProductNameMappings } = require('./firebase');
const { detectChannel } = require('./config/channels');
const { extractShippingRows } = require('./shipping/extract-shipping');
const { appendShippingRows } = require('./shipping/courier-writer');
const { consolidateShipping } = require('./shipping/consolidate');
const { START_DATE, WATCH_PATHS, PROCESSED_FILE, FAILED_FILE } = require('./config/config');

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

// 처리 실패 파일 목록 관리
function loadFailed() {
    try {
        return JSON.parse(fs.readFileSync(FAILED_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveFailed(data) {
    fs.writeFileSync(FAILED_FILE, JSON.stringify(data, null, 2));
}

function addFailed(filePath, error, details) {
    const failed = loadFailed();
    const absPath = path.resolve(filePath);
    failed[absPath] = {
        error: error.message,
        code: error.code || 'UNKNOWN',
        timestamp: new Date().toISOString(),
        details: details || {},
        retryCount: (failed[absPath]?.retryCount || 0) + 1
    };
    saveFailed(failed);
}

function clearFailed(filePath) {
    const failed = loadFailed();
    const absPath = path.resolve(filePath);
    delete failed[absPath];
    saveFailed(failed);
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

/**
 * 파일 처리
 * @param {string} filePath
 * @param {Object} options
 * @param {boolean} options.skipChecks - 중복/날짜 체크 건너뛰기
 * @param {boolean} options.dryRun - DRY-RUN 모드
 * @param {boolean} options.collectShipping - true이면 택배양식 직접 쓰지 않고 반환
 * @returns {Object|null} { filename, channel, items, shippingRows, error }
 */
async function processFile(filePath, options = {}) {
    // 하위 호환: boolean이면 skipChecks로 처리
    if (typeof options === 'boolean') {
        options = { skipChecks: options };
    }
    const { skipChecks = false, dryRun = DRY_RUN, collectShipping = false } = options;

    const processed = loadProcessed();
    const absPath = path.resolve(filePath);
    const filename = path.basename(filePath);
    const result = { filename, channel: null, items: [], shippingRows: [], error: null };

    if (!skipChecks) {
        // 중복 체크
        if (processed[absPath]) {
            return null; // 이미 처리됨
        }

        // xlsx/xls 파일만 처리
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls') {
            return null;
        }

        // 날짜 필터
        if (!isRecentFile(filePath)) {
            return null;
        }

        // 파일이 아직 쓰기 중일 수 있으므로 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 채널 판별
    const ch = detectChannel(filePath);
    if (!ch) {
        return null;
    }

    const { id: channel, name: channelName, parser } = ch;
    result.channel = channelName;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[처리] ${filename} (${channelName})`);
    console.log(`${'='.repeat(60)}`);

    // 재고 파싱 + 차감
    try {
        const items = await parser.parse(filePath);
        result.items = items;

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
            if (dryRun) {
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

            // 성공 시 failed.json에서 제거
            clearFailed(filePath);

            // Firebase 로그 기록
            if (!dryRun) {
                const today = new Date().toISOString().slice(0, 10);
                await addChoolgoLog(today, filename, channelName, items);
                await updateChoolgoSummary(today, items, channelName);
            }

            console.log(`  [완료] ${filename} - ${items.length}개 제품 차감 완료`);
        }
    } catch (err) {
        console.error(`  [오류] ${filename}: ${err.message}`);
        addFailed(filePath, err, { channel: channelName, items: result.items });
        result.error = err.message;
        return result;
    }

    // 택배양식 추출 (재고 파싱과 독립적으로 실행)
    try {
        const shippingRows = await extractShippingRows(filePath, channel);
        for (const row of shippingRows) row.channel = channelName;
        result.shippingRows = shippingRows;

        if (shippingRows.length > 0) {
            if (collectShipping) {
                // 호출자가 모아서 합배송 처리
                console.log(`  [택배양식] ${shippingRows.length}행 추출 (합배송 대기)`);
            } else if (dryRun) {
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

    return result;
}

/**
 * 모든 감시 폴더를 스캔하여 미처리 파일을 처리하고 합배송 적용
 * @param {Object} options
 * @param {boolean} options.dryRun - DRY-RUN 모드
 * @param {boolean} options.force - 이미 처리된 파일도 재처리
 * @returns {Object} { results, summary }
 */
async function scanAndProcess(options = {}) {
    const { dryRun = false, force = false } = options;
    const processed = loadProcessed();
    const results = [];
    const allShippingRows = [];

    console.log('\n' + '='.repeat(60));
    console.log('[스캔] 미처리 파일 검색 시작');
    console.log(`감시 폴더: ${WATCH_PATHS.join(', ')}`);
    console.log('='.repeat(60));

    for (const watchPath of WATCH_PATHS) {
        if (!fs.existsSync(watchPath)) {
            console.log(`  [경고] 폴더 없음: ${watchPath}`);
            continue;
        }

        let files;
        try {
            files = fs.readdirSync(watchPath)
                .filter(f => /\.xlsx?$/i.test(f))
                .filter(f => !f.startsWith('~$'))  // Excel 임시 파일 제외
                .filter(f => !f.includes('택배양식'))  // 출력 파일 제외
                .map(f => path.join(watchPath, f));
        } catch (err) {
            console.error(`  [오류] 폴더 읽기 실패: ${watchPath} - ${err.message}`);
            continue;
        }

        for (const filePath of files) {
            const absPath = path.resolve(filePath);

            // 이미 처리된 파일 건너뛰기
            if (!force && processed[absPath]) continue;

            // 날짜 필터
            if (!isRecentFile(filePath)) continue;

            const result = await processFile(filePath, {
                skipChecks: true,
                dryRun,
                collectShipping: true,
            });

            if (result) {
                results.push(result);
                if (result.shippingRows && result.shippingRows.length > 0) {
                    allShippingRows.push(...result.shippingRows);
                }
            }
        }
    }

    // 합배송 처리 + 택배양식 쓰기
    let consolidatedCount = 0;
    if (allShippingRows.length > 0 && !dryRun) {
        console.log(`\n[합배송] 전체 ${allShippingRows.length}행 합배송 처리 시작`);
        const mappings = await getProductNameMappings();
        console.log(`  품목명 매핑 ${mappings.length}건 로드`);
        const consolidated = consolidateShipping(allShippingRows, mappings);
        consolidatedCount = consolidated.length;
        console.log(`  합배송 결과: ${allShippingRows.length}행 → ${consolidated.length}행`);
        await appendShippingRows(consolidated);
    } else if (allShippingRows.length > 0 && dryRun) {
        console.log(`\n[DRY-RUN] 합배송 대상: ${allShippingRows.length}행`);
    }

    const summary = {
        filesProcessed: results.length,
        totalItems: results.reduce((sum, r) => sum + (r.items ? r.items.length : 0), 0),
        totalShippingRows: allShippingRows.length,
        consolidatedRows: consolidatedCount,
    };

    console.log(`\n[완료] ${summary.filesProcessed}개 파일 처리, 택배양식 ${summary.totalShippingRows}행 → ${summary.consolidatedRows}행`);

    return { results, summary };
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

        try {
            while (queue.length > 0) {
                const filePath = queue.shift();
                await processFile(filePath);
            }
        } catch (err) {
            console.error('[processQueue 오류]', err.message);
        } finally {
            processing = false;
        }
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

    const processed = loadProcessed();
    if (processed[absPath]) {
        delete processed[absPath];
        saveProcessed(processed);
        console.log(`[재처리] processed.json에서 제거: ${path.basename(absPath)}`);
    }

    await processFile(absPath, { skipChecks: true });
    console.log('\n재처리 완료.');
    process.exit(0);
}

// 진입점 분기 (직접 실행 시에만)
if (require.main === module) {
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
}

module.exports = { processFile, scanAndProcess, loadProcessed, saveProcessed, loadFailed, saveFailed, addFailed, clearFailed };
