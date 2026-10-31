/* auth-pages.js - logic for login.html and register.html */
import { isConfigured, registerUser, loginUser, resetPassword, friendlyError } from './auth.js';

const $ = id => document.getElementById(id);
const next = () => {
  const n = new URLSearchParams(location.search).get('next');
  return n && /^[a-z0-9._-]+\.html(\?[\w=&%.-]*)?$/i.test(n) ? n : 'index.html';   // only same-site pages
};
const err = m => { const e = $('form-error'); e.textContent = m; e.hidden = !m; };

if (!isConfigured) { $('config-warning').hidden = false; document.querySelector('form').hidden = true; }

const form = $('auth-form');
if (form) form.addEventListener('submit', async e => {
  e.preventDefault(); err('');
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Please wait…';
  try {
    if ($('name')) {                         // register page
      const name = $('name').value.trim();
      if (name.length < 2 || name.length > 20) throw { message: 'Display name must be 2-20 characters.' };
      if ($('password').value !== $('password2').value) throw { message: 'Passwords do not match.' };
      await registerUser(name, $('email').value.trim(), $('password').value);
    } else {
      await loginUser($('email').value.trim(), $('password').value);
    }
    location.href = next();
  } catch (ex) {
    err(friendlyError(ex));
    btn.disabled = false; btn.textContent = $('name') ? 'Create account' : 'Log in';
  }
});

const forgot = $('btn-forgot');
if (forgot) forgot.addEventListener('click', async () => {
  err('');
  const email = $('email').value.trim();
  if (!email) return err('Type your email first, then press "Forgot password".');
  try { await resetPassword(email); err(''); $('form-ok').textContent = 'Password reset email sent. Check your inbox.'; $('form-ok').hidden = false; }
  catch (ex) { err(friendlyError(ex)); }
});
