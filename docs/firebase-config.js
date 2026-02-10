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
// Express 서버에서 웹앱도 서빙하므로 같은 origin 사용 (http://NAS_IP:3100)
// Vercel 등 외부 호스팅에서는 NAS에 접근 불가 → http://NAS_IP:3100 으로 직접 접속 필요
const CHULHA_API_URL = window.location.port === '3100'
    ? ''  // 같은 origin (Express 서버에서 접속 시)
    : `http://${window.location.hostname}:3100`;  // 다른 서버에서 접속 시

console.log('Firebase 연결됨!');
