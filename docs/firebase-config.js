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
// Express 서버가 웹앱 + API를 모두 서빙하므로 같은 origin 사용
// 접속 시나리오:
//   http://192.168.0.67:3100             → port=3100 → same origin
//   https://durian0606.iptime.org:6443   → port=6443 → same origin (역방향 프록시)
//   https://zego-gules.vercel.app        → 외부 → DDNS URL로 API 호출
const CHULHA_API_URL = (() => {
    const port = window.location.port;
    if (port === '3100' || port === '6443') return '';
    return 'https://durian0606.iptime.org:6443';
})();

console.log('Firebase 연결됨!');
