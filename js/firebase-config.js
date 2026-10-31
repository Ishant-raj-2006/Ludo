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
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com', // copy the exact URL shown in Realtime Database
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};

/** false until you paste real values. Offline + AI modes never need this. */
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
