const path = require('path');

// 기본 출고 관리 폴더
const CHOOLGO_DIR = process.env.CHOOLGO_DIR
    || '/volume1/우리곡간식품 동기화/07_출하관리                             출하팀장/07_CJ대한통운';

// 이 날짜 이후 파일만 처리
const START_DATE = process.env.START_DATE || '2026-02-08';

// Firebase Realtime Database URL
const FIREBASE_URL = process.env.FIREBASE_URL
    || 'https://zego-87d69-default-rtdb.asia-southeast1.firebasedatabase.app';

// 감시 대상 하위 폴더
const WATCH_SUBDIRS = ['직택배', '카카오', '팔도감'];
const WATCH_PATHS = WATCH_SUBDIRS.map(d => path.join(CHOOLGO_DIR, d));

// 처리 완료 기록 파일
const PROCESSED_FILE = path.join(__dirname, '..', 'processed.json');

// 처리 실패 기록 파일
const FAILED_FILE = path.join(__dirname, '..', 'failed.json');

// Express API 서버 포트
const API_PORT = process.env.API_PORT || 3100;

module.exports = {
    CHOOLGO_DIR,
    START_DATE,
    FIREBASE_URL,
    WATCH_PATHS,
    PROCESSED_FILE,
    FAILED_FILE,
    API_PORT,
};
