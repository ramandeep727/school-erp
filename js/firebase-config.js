// firebase-config.js
// IMPORT FIREBASE MODULES
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyAi4CrcwRIHSlPlcQ5gOZss5eSADJ4KNaA",
  authDomain: "school-erp-b0953.firebaseapp.com",
  projectId: "school-erp-b0953",
  storageBucket: "school-erp-b0953.firebasestorage.app",
  messagingSenderId: "432478869827",
  appId: "1:432478869827:web:d8acf0dab4a067662df7f6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
