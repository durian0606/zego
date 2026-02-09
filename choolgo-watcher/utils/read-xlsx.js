const XLSX = require('xlsx');
const officeCrypto = require('officecrypto-tool');
const fs = require('fs');

const NAVER_PASSWORD = '0000';

async function readWorkbook(filePath) {
    const buf = fs.readFileSync(filePath);

    // 암호화 여부 확인
    if (officeCrypto.isEncrypted(buf)) {
        try {
            const decrypted = await officeCrypto.decrypt(buf, { password: NAVER_PASSWORD });
            return XLSX.read(decrypted, { type: 'buffer' });
        } catch (e) {
            console.log(`  [복호화 실패] ${filePath}: ${e.message}`);
            return null;
        }
    }

    // 일반 파일
    return XLSX.read(buf, { type: 'buffer' });
}

function getRows(workbook) {
    if (!workbook) return [];
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 'A' });
}

module.exports = { readWorkbook, getRows };
