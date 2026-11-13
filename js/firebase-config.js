/* =====================================================================
   firebase-config.js - the ONLY place you edit to connect Firebase.
   1. Firebase Console > Project settings > Your apps > Web app > Config
   2. Paste the values below (these web values are NOT secrets).
   NEVER put service-account keys or admin credentials in this project.
   The Firebase SDK version is also set here (one place for the whole app).
   ===================================================================== */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyBn5EO05e15VQ8p_GrmDJVpb4pIBZmc-f4',
  authDomain: 'ludo-4ec15.firebaseapp.com',
  databaseURL: 'https://ludo-4ec15-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'ludo-4ec15',
  storageBucket: 'ludo-4ec15.firebasestorage.app',
  messagingSenderId: '180530017282',
  appId: '1:180530017282:web:2a7c050478338dce93e31b',
  measurementId: 'G-L5M4K32K7C'
};

/** Offline + AI modes never need Firebase, even when it is configured. */
export const isConfigured =
  !String(firebaseConfig.apiKey).includes('YOUR_') &&
  !String(firebaseConfig.databaseURL).includes('YOUR_');

let app = null, auth = null, db = null;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}
export { app, auth, db };

// Re-export the SDK functions the app uses, so every file imports from one place.
export {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
export {
  ref, get, set, update, remove, onValue, runTransaction,
  onDisconnect, serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
