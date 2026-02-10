const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { CHOOLGO_DIR } = require('../config/config');

// 대한통운 택배양식 헤더
const HEADERS = [
    '받는분성명',
    '받는분전화번호',
    '받는분우편번호',
    '받는분주소(전체, 분할)',
    '배송메세지1',
    '품목명',
    '내품수량',
    '운송장',
    '택배사',
    '채널',
];

// 컬럼 너비 설정
const COL_WIDTHS = [
    { wch: 10 },  // 받는분성명
    { wch: 15 },  // 받는분전화번호
    { wch: 8 },   // 받는분우편번호
    { wch: 50 },  // 받는분주소
    { wch: 25 },  // 배송메세지1
    { wch: 40 },  // 품목명
    { wch: 8 },   // 내품수량
    { wch: 15 },  // 운송장
    { wch: 10 },  // 택배사
    { wch: 14 },  // 채널
];

/**
 * 오늘 날짜의 택배양식 파일 경로
 */
function getOutputPath() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return path.join(CHOOLGO_DIR, `${mm}${dd}_택배양식.xlsx`);
}

/**
 * 행의 fingerprint 생성 (중복 방지용 - 개별 행)
 */
function fingerprint(row) {
    return [
        row.recipientName || '',
        row.phone || '',
        row.address || '',
        row.productName || '',
        String(row.quantity || ''),
    ].join('|');
}

/**
 * 합배송 후 fingerprint (수령인 단위 중복 방지)
 */
function consolidatedFingerprint(row) {
    return [
        row.recipientName || '',
        row.phone || '',
        row.address || '',
    ].join('|');
}

/**
 * 기존 파일에서 행 읽어오기
 */
function readExistingRows(filePath) {
    if (!fs.existsSync(filePath)) return [];

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 첫 행은 헤더, 나머지가 데이터
    if (rows.length < 2) return [];

    return rows.slice(1).map(r => ({
        recipientName: String(r[0] || ''),
        phone: String(r[1] || ''),
        postalCode: String(r[2] || ''),
        address: String(r[3] || ''),
        message: String(r[4] || ''),
        productName: String(r[5] || ''),
        quantity: r[6] != null ? r[6] : '',
        invoice: String(r[7] || ''),
        courier: String(r[8] || ''),
        channel: String(r[9] || ''),
    }));
}

/**
 * 파일이 다른 프로그램에서 열려있는지 확인 (Excel ~$ 임시파일)
 */
function isFileLocked(filePath) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const lockFile = path.join(dir, `~$${base}`);
    return fs.existsSync(lockFile);
}

/**
 * 배송 행들을 택배양식 파일에 추가
 * @param {Array} newRows - extractShippingRows()의 반환값
 */
async function appendShippingRows(newRows) {
    const outputPath = getOutputPath();

    // 파일 잠금 확인 (Excel에서 열려있으면 .pending에 저장)
    if (isFileLocked(outputPath)) {
        const pendingPath = outputPath.replace('.xlsx', '.pending.json');
        const existing = fs.existsSync(pendingPath)
            ? JSON.parse(fs.readFileSync(pendingPath, 'utf8'))
            : [];
        existing.push(...newRows);
        fs.writeFileSync(pendingPath, JSON.stringify(existing, null, 2));
        console.log(`  [택배양식] 파일이 열려있어 ${path.basename(pendingPath)}에 ${newRows.length}행 임시 저장`);
        return;
    }

    // pending 파일이 있으면 함께 병합
    const pendingPath = outputPath.replace('.xlsx', '.pending.json');
    if (fs.existsSync(pendingPath)) {
        try {
            const pendingRows = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
            newRows = [...pendingRows, ...newRows];
            fs.unlinkSync(pendingPath);
            console.log(`  [택배양식] pending 파일 ${pendingRows.length}행 병합`);
        } catch (e) {
            console.error(`  [택배양식] pending 파일 읽기 실패: ${e.message}`);
        }
    }

    // 기존 데이터 로드
    const existingRows = readExistingRows(outputPath);

    // 기존 fingerprint 세트 구성
    const existingFingerprints = new Set(existingRows.map(r => fingerprint(r)));

    // 중복 제거 후 새 행 추가
    let addedCount = 0;
    const allRows = [...existingRows];

    for (const row of newRows) {
        const fp = fingerprint(row);
        if (existingFingerprints.has(fp)) continue;

        existingFingerprints.add(fp);
        allRows.push(row);
        addedCount++;
    }

    if (addedCount === 0) {
        console.log(`  [택배양식] 새로 추가할 행 없음 (모두 중복)`);
        return;
    }

    // 시트 데이터 구성
    const sheetData = [HEADERS];
    for (const row of allRows) {
        sheetData.push([
            row.recipientName,
            row.phone,
            row.postalCode,
            row.address,
            row.message,
            row.productName,
            row.quantity,
            row.invoice || '',
            row.courier || '',
            row.channel || '',
        ]);
    }

    // 워크북 생성
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(sheetData);
    sheet['!cols'] = COL_WIDTHS;
    XLSX.utils.book_append_sheet(workbook, sheet, '직택');

    // choolgo 폴더 확인
    if (!fs.existsSync(CHOOLGO_DIR)) {
        fs.mkdirSync(CHOOLGO_DIR, { recursive: true });
    }

    XLSX.writeFile(workbook, outputPath);
    console.log(`  [택배양식] ${path.basename(outputPath)}에 ${addedCount}행 추가 (총 ${allRows.length}행)`);
}

module.exports = { appendShippingRows, getOutputPath, readExistingRows, fingerprint, consolidatedFingerprint };
