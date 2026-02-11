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

console.log('Firebase 연결됨!');
