const fs = require('fs');
const path = require('path');
const { detectChannelBySender } = require('./sender-rules');

/**
 * 이메일 첨부파일 처리
 * - 엑셀 파일만 추출 (.xlsx, .xls)
 * - 발신자 기반 채널 분류
 * - 지정된 폴더에 저장
 */

const TEMP_DIR = process.env.EMAIL_TEMP_DIR || './temp/email-attachments';
const BASE_WATCH_PATH = '/volume1/우리곡간식품 동기화/07_출하관리                             출하팀장/07_CJ대한통운';

/**
 * 임시 디렉토리 생성
 */
function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * 엑셀 파일 여부 확인
 * @param {string} filename
 * @returns {boolean}
 */
function isExcelFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.xlsx' || ext === '.xls';
}

/**
 * 안전한 파일명 생성 (특수문자 제거)
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200); // 파일명 길이 제한
}

/**
 * 첨부파일 처리
 * @param {Array} attachments - mailparser의 attachments 배열
 * @param {string} from - 발신자 이메일
 * @returns {Promise<Array>} 저장된 파일 경로 배열
 */
async function processAttachments(attachments, from) {
  ensureTempDir();

  const savedFiles = [];
  const { channel, folder } = detectChannelBySender(from);

  console.log(`[이메일] 발신자: ${from} → 채널: ${channel}, 폴더: ${folder}`);

  for (const attachment of attachments) {
    const filename = attachment.filename;

    // 엑셀 파일만 처리
    if (!isExcelFile(filename)) {
      console.log(`[이메일] 건너뜀 (엑셀 아님): ${filename}`);
      continue;
    }

    try {
      // 1. 임시 파일로 저장
      const safeFilename = sanitizeFilename(filename);
      const tempPath = path.join(TEMP_DIR, safeFilename);
      fs.writeFileSync(tempPath, attachment.content);

      // 2. 최종 목적지 경로 생성
      const targetDir = path.join(BASE_WATCH_PATH, folder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // 3. 파일명 중복 처리 (타임스탬프 추가)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const basename = path.basename(safeFilename, path.extname(safeFilename));
      const ext = path.extname(safeFilename);
      const finalFilename = `${basename}_${timestamp}${ext}`;
      const finalPath = path.join(targetDir, finalFilename);

      // 4. 최종 위치로 이동
      fs.renameSync(tempPath, finalPath);

      savedFiles.push({
        originalName: filename,
        savedPath: finalPath,
        channel,
        folder,
        size: attachment.size
      });

      console.log(`[이메일] 저장 완료: ${finalPath}`);

    } catch (error) {
      console.error(`[이메일] 첨부파일 저장 실패: ${filename}`, error.message);
    }
  }

  return savedFiles;
}

/**
 * 임시 디렉토리 정리 (7일 이상 된 파일 삭제)
 */
function cleanupTempDir() {
  ensureTempDir();

  const files = fs.readdirSync(TEMP_DIR);
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  files.forEach(file => {
    const filePath = path.join(TEMP_DIR, file);
    const stats = fs.statSync(filePath);

    if (now - stats.mtimeMs > SEVEN_DAYS) {
      fs.unlinkSync(filePath);
      console.log(`[이메일] 임시 파일 삭제: ${file}`);
    }
  });
}

module.exports = {
  processAttachments,
  cleanupTempDir,
  isExcelFile
};
