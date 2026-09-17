import { useState } from 'react';
import { Link } from 'react-router-dom';
import { branches as branchesApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { Icons } from '../components/Icons';

function extractError(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) return data.detail[0];
  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;
  const v = data[firstKey];
  return Array.isArray(v) ? v[0] : String(v);
}

export default function ReceiptSetup() {
  const { user, shopId, refreshUser } = useAuth();

  const [name, setName] = useState(user?.shop_name || '');
  const [address, setAddress] = useState(user?.shop_address || '');
  const [phone, setPhone] = useState(user?.shop_phone || '');
  const [email, setEmail] = useState(user?.shop_email || '');
  const [logoUrl, setLogoUrl] = useState(user?.shop_logo_url || '');
  const [footerNote, setFooterNote] = useState(user?.shop_receipt_footer_note || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!name.trim()) { setError('Your shop needs a name — it prints at the top of every receipt.'); return; }
    setSaving(true);
    try {
      await branchesApi.update(shopId, {
        name, address, phone, email, logo_url: logoUrl, receipt_footer_note: footerNote,
      });
      await refreshUser();
      setSuccess('Saved.');
    } catch (err) {
      setError(extractError(err, 'Could not save your receipt details — check the fields and try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="branded-page">
      <Link to="/settings" className="branded-page-back">← Back to Settings</Link>

      <div className="branded-page-header">
        <img src="/logo.png" alt="" className="branded-page-logo" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1>Receipt settings</h1>
        <p>What prints at the top and bottom of every sale receipt, on both Android and the web app.</p>
      </div>

      <div className="branded-card">
        {error && <div className="form-error">{error}</div>}
        {success && <div className="banner good" style={{ marginBottom: 12 }}>{success}</div>}
        <form onSubmit={handleSave}>
          <div className="form-section-title">Company details</div>
          <div className="field"><label>Shop name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chidi's Gadget Store" />
          </div>
          <div className="field"><label>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city" />
          </div>
          <div className="field-row">
            <div className="field"><label>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
            </div>
            <div className="field"><label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="shop@example.com" />
            </div>
          </div>
          <div className="field"><label>Logo URL</label>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
            <div className="field-hint">Shows on the web/desktop receipt. Thermal receipts printed from this phone are plain text, so the logo image itself won't print here — only the name and address will.</div>
          </div>

          <div className="form-section-title">{Icons.edit} Receipt message</div>
          <div className="field"><label>Closing line</label>
            <input value={footerNote} onChange={(e) => setFooterNote(e.target.value)} placeholder="Thanks for your patronage!!!" maxLength={200} />
            <div className="field-hint">Printed at the bottom of every receipt — a thank-you note, a return policy, whatever you like. Leave blank to use the default.</div>
          </div>

          <PreviewCard name={name} address={address} phone={phone} footerNote={footerNote} />

          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PreviewCard({ name, address, phone, footerNote }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div className="form-section-title">Preview (thermal printer)</div>
      <div style={{
        background: '#fff', color: '#111', fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.5,
        border: '1px dashed var(--border)', borderRadius: 6, padding: '14px 12px', maxWidth: 260,
      }}>
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 13 }}>{name || 'Your Shop Name'}</div>
        {address && <div style={{ textAlign: 'center' }}>{address}</div>}
        {phone && <div style={{ textAlign: 'center' }}>Tel: {phone}</div>}
        <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
        <div>1 x Sample item .......... N5,000</div>
        <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
        <div style={{ textAlign: 'center' }}>{footerNote || 'Thanks for your patronage!!!'}</div>
      </div>
    </div>
  );
}
