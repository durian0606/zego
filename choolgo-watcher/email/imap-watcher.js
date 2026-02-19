const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { processAttachments, cleanupTempDir } = require('./attachment-handler');
const { getEmailSettings } = require('../firebase');

/**
 * 네이버 이메일 IMAP 감시
 * - 새 메일 도착 시 첨부파일 자동 다운로드
 * - 엑셀 파일만 처리
 * - 발신자 기반 채널 분류
 * - Firebase 또는 .env에서 설정 읽기
 */

let imapClient = null;
let isConnected = false;
let reconnectTimeout = null;
let currentConfig = null;

/**
 * IMAP 연결 시작 (Firebase 우선, .env fallback)
 */
async function startEmailWatcher() {
  try {
    // Firebase에서 설정 읽기
    console.log('[이메일] Firebase에서 이메일 설정 읽는 중...');
    const firebaseSettings = await getEmailSettings();

    let imapConfig;
    let pollInterval;
    let mailbox;
    let markSeen;

    if (firebaseSettings && firebaseSettings.account && firebaseSettings.account.email && firebaseSettings.account.password) {
      // Firebase 설정 사용
      console.log('[이메일] Firebase 설정 발견 ✓');
      const account = firebaseSettings.account;
      imapConfig = {
        user: account.email,
        password: account.password,
        host: account.host || 'imap.naver.com',
        port: parseInt(account.port || '993'),
        tls: account.tls !== false,
        tlsOptions: { rejectUnauthorized: false }
      };
      pollInterval = parseInt(account.pollInterval || '60000');
      mailbox = 'INBOX';
      markSeen = true;

      currentConfig = imapConfig;
    } else {
      // .env fallback
      console.log('[이메일] Firebase 설정 없음 → .env fallback');
      imapConfig = {
        user: process.env.NAVER_EMAIL,
        password: process.env.NAVER_PASSWORD,
        host: process.env.IMAP_HOST || 'imap.naver.com',
        port: parseInt(process.env.IMAP_PORT || '993'),
        tls: process.env.IMAP_TLS !== 'false',
        tlsOptions: { rejectUnauthorized: false }
      };
      pollInterval = parseInt(process.env.EMAIL_POLL_INTERVAL || '60000');
      mailbox = process.env.EMAIL_CHECK_MAILBOX || 'INBOX';
      markSeen = process.env.EMAIL_MARK_SEEN !== 'false';

      currentConfig = imapConfig;
    }

    // 설정 검증
    if (!imapConfig.user || !imapConfig.password) {
      console.warn('[이메일] 이메일 또는 비밀번호 미설정 → 이메일 감시 비활성화');
      console.warn('[이메일] 웹앱 "설정 > 이메일 관리"에서 계정 정보를 입력하세요.');
      return;
    }

    console.log(`[이메일] IMAP 연결 시작: ${imapConfig.user}`);

    imapClient = new Imap(imapConfig);

    // 연결 성공
    imapClient.once('ready', () => {
      isConnected = true;
      console.log('[이메일] IMAP 연결 완료');

      // 메일함 열기
      openInbox(mailbox);

      // 주기적으로 새 메일 확인
      setInterval(() => {
        if (isConnected) {
          checkNewMail(markSeen);
        }
      }, pollInterval);

      // 임시 디렉토리 정리 (1시간마다)
      setInterval(cleanupTempDir, 60 * 60 * 1000);
    });

    // 연결 종료
    imapClient.once('end', () => {
      isConnected = false;
      console.log('[이메일] IMAP 연결 종료');
      scheduleReconnect();
    });

    // 에러 처리
    imapClient.once('error', (err) => {
      isConnected = false;
      console.error('[이메일] IMAP 에러:', err.message);
      scheduleReconnect();
    });

    imapClient.connect();
  } catch (error) {
    console.error('[이메일] startEmailWatcher 에러:', error);
  }
}

/**
 * 메일함 열기
 */
function openInbox(mailbox = 'INBOX') {
  imapClient.openBox(mailbox, false, (err, box) => {
    if (err) {
      console.error('[이메일] 메일함 열기 실패:', err.message);
      return;
    }
    console.log(`[이메일] 메일함 열림: ${mailbox} (${box.messages.total}개 메시지)`);
  });
}

/**
 * 새 메일 확인
 */
function checkNewMail(markSeen = true) {
  imapClient.search(['UNSEEN'], (err, results) => {
    if (err) {
      console.error('[이메일] 메일 검색 실패:', err.message);
      return;
    }

    if (!results || results.length === 0) {
      return; // 새 메일 없음
    }

    console.log(`[이메일] 읽지 않은 메일 ${results.length}개 발견`);

    const fetch = imapClient.fetch(results, {
      bodies: '',
      markSeen: markSeen
    });

    fetch.on('message', (msg, seqno) => {
      msg.on('body', (stream, info) => {
        simpleParser(stream, async (err, parsed) => {
          if (err) {
            console.error(`[이메일] 메일 파싱 실패 (seqno: ${seqno}):`, err.message);
            return;
          }

          await handleMail(parsed);
        });
      });
    });

    fetch.once('error', (err) => {
      console.error('[이메일] 메일 가져오기 실패:', err.message);
    });

    fetch.once('end', () => {
      console.log('[이메일] 메일 확인 완료');
    });
  });
}

/**
 * 메일 처리
 * @param {object} mail - mailparser의 parsed mail 객체
 */
async function handleMail(mail) {
  const from = mail.from?.text || mail.from?.value?.[0]?.address || 'unknown';
  const subject = mail.subject || '(제목 없음)';
  const attachments = mail.attachments || [];

  console.log(`[이메일] 처리 중: ${from} | ${subject} | 첨부 ${attachments.length}개`);

  if (attachments.length === 0) {
    console.log('[이메일] 첨부파일 없음 → 건너뜀');
    return;
  }

  try {
    const savedFiles = await processAttachments(attachments, from);

    if (savedFiles.length > 0) {
      console.log(`[이메일] 첨부파일 ${savedFiles.length}개 저장 완료`);
      savedFiles.forEach(file => {
        console.log(`  - ${file.originalName} → ${file.savedPath}`);
      });
    }
  } catch (error) {
    console.error('[이메일] 첨부파일 처리 실패:', error);
  }
}

/**
 * 재연결 스케줄링
 */
function scheduleReconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  console.log('[이메일] 30초 후 재연결 시도...');
  reconnectTimeout = setTimeout(() => {
    startEmailWatcher();
  }, 30000);
}

/**
 * IMAP 연결 종료
 */
function stopEmailWatcher() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  if (imapClient && isConnected) {
    console.log('[이메일] IMAP 연결 종료 중...');
    imapClient.end();
  }
}

module.exports = {
  startEmailWatcher,
  stopEmailWatcher
};
