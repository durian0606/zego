const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { deductStock, addChoolgoLog, updateChoolgoSummary } = require('./firebase');
const iwonParser = require('./parsers/iwon');
const naverParser = require('./parsers/naver');
const kakaoParser = require('./parsers/kakao');
const paldogamParser = require('./parsers/paldogam');
const genericParser = require('./parsers/generic');
const { extractShippingRows } = require('./shipping/extract-shipping');
const { appendShippingRows } = require('./shipping/courier-writer');

// 설정
const CHOOLGO_DIR = path.resolve(__dirname, '../choolgo');
const PROCESSED_FILE = path.join(__dirname, 'processed.json');
const START_DATE = '2026-02-08'; // 이 날짜 이후 파일만 처리
const DRY_RUN = process.argv.includes('--dry-run'); // 테스트 모드 (Firebase 차감 안 함)

// 감시 대상 폴더
const WATCH_PATHS = [
    path.join(CHOOLGO_DIR, '직택배'),
    path.join(CHOOLGO_DIR, '카카오'),
    path.join(CHOOLGO_DIR, '팔도감'),
];

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

// 파일 경로로 채널 판별
function detectChannel(filePath) {
    const normalized = filePath.replace(/\\/g, '/');

    if (normalized.includes('/카카오/')) {
        return 'kakao';
    }

    if (normalized.includes('/팔도감/')) {
        if (normalized.includes('/네이버/')) {
            return 'paldogam-naver';
        }
        return 'paldogam';
    }

    if (normalized.includes('/직택배/')) {
        const filename = path.basename(filePath);

        // 엑셀 임시 파일 무시
        if (filename.startsWith('~$')) return null;

        // 아이원 발주서
        if (filename.includes('아이원') || filename.includes('발주서')) {
            return 'iwon';
        }
        // 네이버/스마트스토어
        if (filename.includes('네이버') || filename.includes('스마트스토어')) {
            return 'jiktaebae-naver';
        }
        // J우리곡간 (두브로 등)
        if (filename.match(/^\d{8}_J우리곡간/)) {
            return 'jiktaebae-generic';
        }
        // 크레이지아지트
        if (filename.includes('크레이지')) {
            return 'jiktaebae-generic';
        }
        // 잇템커머스
        if (filename.includes('잇템커머스')) {
            return 'jiktaebae-generic';
        }
        // 브랜딩리드
        if (filename.includes('브랜딩리드')) {
            return 'jiktaebae-generic';
        }
        // 기타 xlsx 파일 → 제네릭 파서로 시도
        return 'jiktaebae-generic';
    }

    return null;
}

// 채널별 파서 선택
function getParser(channel) {
    switch (channel) {
        case 'iwon':
            return iwonParser;
        case 'jiktaebae-naver':
        case 'paldogam-naver':
            return naverParser;
        case 'kakao':
            return kakaoParser;
        case 'paldogam':
            return paldogamParser;
        case 'jiktaebae-generic':
            return genericParser;
        default:
            return null;
    }
}

// 채널 한글명
function getChannelName(channel) {
    const names = {
        'iwon': '직택배/아이원',
        'jiktaebae-naver': '직택배/네이버',
        'jiktaebae-generic': '직택배/기타',
        'paldogam-naver': '팔도감/네이버',
        'kakao': '카카오',
        'paldogam': '팔도감'
    };
    return names[channel] || channel;
}

// 파일 처리
async function processFile(filePath) {
    const processed = loadProcessed();
    const absPath = path.resolve(filePath);

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

    // 채널 판별
    const channel = detectChannel(filePath);
    if (!channel) {
        return;
    }

    // 파서 선택
    const parser = getParser(channel);
    if (!parser) {
        return;
    }

    const channelName = getChannelName(channel);
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
}

startWatcher();
