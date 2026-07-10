/**
 * activation-gate.js
 * Chuka Engineering Community — page-level activation gate
 *
 * WHAT THIS DOES
 * ---------------
 * Drop this on any page you want to restrict to activated students (Shop,
 * Documents, Groups, Events, etc — NOT index.html or admin.html). On load
 * it covers the page with an overlay and asks for a registration number.
 * A student gets through if they're either:
 *   - within their 7-day free grace period, or
 *   - fully activated (Payment Status = Paid)
 * Otherwise they see a blocking message with a link to activate.html.
 * The reg number is remembered in this browser (localStorage) so returning
 * visitors aren't asked again — it's just re-verified against the sheet
 * silently on every page load.
 *
 * HOW TO ADD IT TO A PAGE
 * -------------------------
 * Right before </body>, add:
 *   <script src="activation-gate.js"></script>
 * That's it — no other markup changes needed. It works by overlaying the
 * whole page, so it doesn't need to know anything about that page's HTML.
 *
 * IMPORTANT — this is a UX gate, not a security boundary. The underlying
 * Apps Script data endpoints (getShopInventory, getDocuments, etc.) are
 * still public URLs, same as before. This stops casual browsing by
 * unactivated students; it does not cryptographically lock the data.
 */

(function () {
  const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzY542X-KgOIN9GGLI2UfWC4PTXu9coGvn7-bd9iyaD8cqSdcvqsE7-KRj7RHeGF9VTpw/exec';
  const STORAGE_KEY = 'cec_regnumber';

  const COLORS = {
    navy: '#10243E',
    paper: '#E8EEF2',
    copper: '#C97B3D',
    ok: '#3F8F5F',
    err: '#B4453A'
  };

  let overlay;

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'cec-activation-gate';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:' + COLORS.navy + ';' +
      'display:flex;align-items:center;justify-content:center;padding:24px;' +
      'font-family:"IBM Plex Sans",sans-serif;color:' + COLORS.paper + ';';

    overlay.innerHTML =
      '<div style="max-width:420px;width:100%;border:1px solid rgba(232,238,242,0.3);' +
      'background:rgba(232,238,242,0.04);padding:32px;text-align:left;">' +
        '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:0.7rem;' +
        'letter-spacing:0.1em;text-transform:uppercase;color:#4C86AE;margin-bottom:12px;">' +
        'Chuka Engineering Community</div>' +
        '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:1.3rem;margin-bottom:10px;">' +
        'Quick check before you continue</h2>' +
        '<p id="cec-gate-msg" style="font-size:0.92rem;color:rgba(232,238,242,0.75);margin-bottom:18px;">' +
        'Enter your registration number or email to confirm your access.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
          '<input id="cec-gate-input" type="text" placeholder="Registration number or email" ' +
          'style="flex:1;min-width:180px;background:transparent;border:none;' +
          'border-bottom:1px solid rgba(232,238,242,0.35);color:' + COLORS.paper + ';' +
          'font-family:inherit;font-size:1rem;padding:10px 2px;outline:none;">' +
          '<button id="cec-gate-btn" style="font-family:\'IBM Plex Mono\',monospace;' +
          'font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase;background:' + COLORS.copper + ';' +
          'color:' + COLORS.navy + ';border:none;padding:11px 18px;cursor:pointer;font-weight:600;">Continue</button>' +
        '</div>' +
      '</div>';

    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(overlay);

    document.getElementById('cec-gate-btn').addEventListener('click', submitGate);
    document.getElementById('cec-gate-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitGate(); }
    });
  }

  function setMsg(text, color) {
    const el = document.getElementById('cec-gate-msg');
    if (el) { el.textContent = text; el.style.color = color || 'rgba(232,238,242,0.75)'; }
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.documentElement.style.overflow = '';
  }

  function showBlocked(info) {
    overlay.querySelector('div').innerHTML =
      '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:0.7rem;' +
      'letter-spacing:0.1em;text-transform:uppercase;color:' + COLORS.err + ';margin-bottom:12px;">' +
      'Activation required</div>' +
      '<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:1.3rem;margin-bottom:10px;">' +
      'Your free access has ended</h2>' +
      '<p style="font-size:0.92rem;color:rgba(232,238,242,0.75);margin-bottom:22px;">' +
      (info && info.fullName ? escapeHtml(info.fullName) + ', y' : 'Y') +
      'our 7-day free period is over. Activate your account with a one-time ' +
      'KES ' + (info && info.feeKes ? info.feeKes : 100) + ' payment to keep browsing.</p>' +
      '<a href="activate.html' + (info && info.regNumber ? '?reg=' + encodeURIComponent(info.regNumber) : '') + '" ' +
      'style="display:inline-block;font-family:\'IBM Plex Mono\',monospace;font-size:0.8rem;' +
      'letter-spacing:0.06em;text-transform:uppercase;background:' + COLORS.copper + ';color:' + COLORS.navy + ';' +
      'text-decoration:none;padding:12px 20px;font-weight:600;">Activate now</a> ' +
      '<a href="index.html" style="display:inline-block;font-family:\'IBM Plex Mono\',monospace;' +
      'font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase;color:' + COLORS.paper + ';' +
      'text-decoration:underline;padding:12px 6px;">Back to home</a>';
  }

  function escapeHtml(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function verify(regNumber) {
    try {
      const res = await fetch(WEB_APP_URL + '?action=checkActivation&regNumber=' + encodeURIComponent(regNumber));
      const result = await res.json();

      if (!result.success || !result.data || !result.data.found) {
        setMsg('No registration found for that reg. number/email.', COLORS.err);
        return false;
      }

      const info = result.data;
      if (info.paid || !info.mustPayNow) {
        localStorage.setItem(STORAGE_KEY, info.regNumber);
        removeOverlay();
        return true;
      }

      showBlocked(info);
      return false;
    } catch (err) {
      setMsg('Network error — please try again.', COLORS.err);
      return false;
    }
  }

  function submitGate() {
    const input = document.getElementById('cec-gate-input');
    const btn = document.getElementById('cec-gate-btn');
    const value = input.value.trim();
    if (!value) { setMsg('Please enter your registration number or email.', COLORS.err); return; }

    btn.disabled = true;
    setMsg('Checking…');
    verify(value).finally(function () { if (btn) btn.disabled = false; });
  }

  function init() {
    buildOverlay();
    const remembered = localStorage.getItem(STORAGE_KEY);
    if (remembered) {
      document.getElementById('cec-gate-input').value = remembered;
      setMsg('Checking your access…');
      verify(remembered);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
