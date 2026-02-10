const express = require('express');
const cors = require('cors');
const path = require('path');
const { scanAndProcess } = require('./index');
const { API_PORT, WATCH_PATHS, START_DATE } = require('./config/config');

const app = express();
app.use(cors());
app.use(express.json());

// 웹앱 정적 파일 서빙 (docs/ 폴더)
app.use(express.static(path.join(__dirname, '..', 'docs')));

// 동시 처리 방지
let isProcessing = false;

// 헬스체크
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        watchPaths: WATCH_PATHS,
        startDate: START_DATE,
        isProcessing,
    });
});

// 출고 파일 처리 (수동 트리거)
app.post('/api/process', async (req, res) => {
    if (isProcessing) {
        return res.status(409).json({
            success: false,
            error: '이미 처리 중입니다. 잠시 후 다시 시도해주세요.',
        });
    }

    isProcessing = true;
    try {
        const { dryRun = false, force = false } = req.body || {};
        const { results, summary } = await scanAndProcess({ dryRun, force });

        res.json({
            success: true,
            results: results.map(r => ({
                filename: r.filename,
                channel: r.channel,
                items: r.items ? r.items.length : 0,
                shippingRows: r.shippingRows ? r.shippingRows.length : 0,
                error: r.error,
            })),
            summary,
        });
    } catch (err) {
        console.error('[API 오류]', err);
        res.status(500).json({
            success: false,
            error: err.message,
        });
    } finally {
        isProcessing = false;
    }
});

// 서버 시작
app.listen(API_PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log(`출하관리 API 서버 시작 (포트: ${API_PORT})`);
    console.log(`감시 폴더: ${WATCH_PATHS.join(', ')}`);
    console.log(`시작 날짜: ${START_DATE} 이후 파일만 처리`);
    console.log('='.repeat(60));
});

process.on('uncaughtException', (err) => {
    console.error('[치명적 오류]', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('[미처리 Promise 오류]', reason);
});
