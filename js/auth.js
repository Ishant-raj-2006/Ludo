/* auth.js - Firebase Authentication (email + password) and per-user stats. */
import {
  auth, db, isConfigured, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile, sendPasswordResetEmail, ref, get, set, update, increment
} from './firebase-config.js';

export { isConfigured };

/** Resolves once with the signed-in user (or null). */
export function currentUserReady() {
  return new Promise(resolve => {
    if (!auth) return resolve(null);
    const off = onAuthStateChanged(auth, u => { off(); resolve(u); });
  });
}
export function onUser(cb) {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}
export const displayName = u => (u && (u.displayName || (u.email || 'Player').split('@')[0])) || 'Player';

export async function registerUser(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await set(ref(db, `users/${cred.user.uid}`), { name, played: 0, wins: 0, createdAt: Date.now() });
  return cred.user;
}
export const loginUser = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logoutUser = () => signOut(auth);
export const resetPassword = email => sendPasswordResetEmail(auth, email);

export async function getStats(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  const v = snap.val() || {};
  return { played: v.played || 0, wins: v.wins || 0 };
}
/** Called once at the end of an online match. */
export async function recordResult(uid, won) {
  await update(ref(db, `users/${uid}`), { played: increment(1), wins: increment(won ? 1 : 0) });
}

/** Turn Firebase error codes into sentences a person can act on. */
export function friendlyError(e) {
  const map = {
    'auth/invalid-email': 'That email address does not look right.',
    'auth/missing-password': 'Please enter your password.',
    'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
    'auth/email-already-in-use': 'An account with this email already exists. Try logging in.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/user-not-found': 'No account found for this email.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'Network problem. Check your internet connection.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in your Firebase console.',
    'PERMISSION_DENIED': 'The database refused this action (check your security rules).'
  };
  const code = e && (e.code || e.message || '');
  return map[code] || (e && e.message) || 'Something went wrong. Please try again.';
}
