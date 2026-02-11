// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyAL2BYo6ZuFOt3ALsW4Pj3ALEKH5omaT0c",
    authDomain: "zego-87d69.firebaseapp.com",
    databaseURL: "https://zego-87d69-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "zego-87d69",
    storageBucket: "zego-87d69.firebasestorage.app",
    messagingSenderId: "435158117338",
    appId: "1:435158117338:web:3a175572508ea634da6ee3",
    measurementId: "G-RVPE4CS927"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// 출하관리 API 서버 URL
// Express 서버: http://192.168.0.67:3100
// 접속 시나리오:
//   http://192.168.0.67:3100             → same origin (Express 직접)
//   로컬 네트워크(192.168.x.x, file://) → http://192.168.0.67:3100
//   외부(Vercel 등)                      → https://durian0606.iptime.org:6443 (역방향 프록시 필요)
const CHULHA_API_URL = (() => {
    const { port, hostname, protocol } = window.location;
    // Express 서버에서 직접 서빙하는 경우
    if (port === '3100' || port === '6443') return '';
    // 로컬 네트워크 또는 file:// 접속
    if (protocol === 'file:' || hostname.startsWith('192.168.') || hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://192.168.0.67:3100';
    }
    // 외부 접속 (Vercel 등)
    return 'https://durian0606.iptime.org:6443';
})();

console.log('Firebase 연결됨!');
