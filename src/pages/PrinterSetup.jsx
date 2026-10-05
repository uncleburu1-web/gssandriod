import { useEffect, useState } from 'react';
import {
  isAvailable,
  isBluetoothEnabled,
  listPairedDevices,
  getSavedPrinterAddress,
  savePrinterAddress,
  clearSavedPrinter,
  testPrint,
} from '../utils/btPrinter';
import { isIos } from '../utils/platform';

export default function PrinterSetup() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(getSavedPrinterAddress());
  const [testingAddress, setTestingAddress] = useState(null);
  const [testResult, setTestResult] = useState('');

  async function loadDevices() {
    if (isIos) { setLoading(false); return; } // no Bluetooth printers on iOS — see the info screen below
    setLoading(true);
    setError('');
    try {
      if (!isAvailable()) {
        setError('Bluetooth printing only works inside the installed Android app — not in a web browser.');
        return;
      }
      const enabled = await isBluetoothEnabled();
      if (!enabled) {
        setError('Bluetooth is turned off on this device. Turn it on in Android Settings, then come back and refresh.');
        return;
      }
      const list = await listPairedDevices();
      setDevices(list);
      if (list.length === 0) {
        setError('No paired Bluetooth devices found. Go to Android Settings > Bluetooth, pair your printer first, then come back here and refresh.');
      }
    } catch (err) {
      setError(err.message || 'Could not load Bluetooth devices.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, []);

  function selectPrinter(address) {
    setSelected(address);
    savePrinterAddress(address);
  }

  function forget() {
    clearSavedPrinter();
    setSelected(null);
  }

  async function runTestPrint(address) {
    setTestingAddress(address);
    setTestResult('');
    try {
      await testPrint(address);
      setTestResult(`✓ Test print sent to ${address}. Check the printer.`);
    } catch (err) {
      setTestResult(`✗ ${err.message || 'Test print failed.'}`);
    } finally {
      setTestingAddress(null);
    }
  }

  if (isIos) {
    // iOS doesn't allow apps to connect to ordinary Bluetooth thermal
    // printers, so there is nothing to pair or select here. Receipts and
    // reports open in the iOS share sheet instead (see utils/receiptPdf.js).
    return (
      <>
        <div className="topbar">
          <div>
            <div className="page-title">Printing</div>
            <div className="page-sub">How receipts print on iPhone and iPad</div>
          </div>
        </div>

        <div className="section">
          <div className="section-head"><h3>Printing from iPhone / iPad</h3></div>
          <div className="section-body" style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7 }}>
            Apple doesn't allow apps to connect to ordinary Bluetooth thermal printers, so there is nothing to pair on this device.
            Instead, when a sale is completed — or when you tap the print button on a past sale — the receipt opens as a PDF in the iOS share sheet:<br />
            1. Tap <strong>Print</strong> to send it to any AirPrint printer on your Wi‑Fi.<br />
            2. Or choose <strong>Save to Files</strong>, WhatsApp or Mail to keep it or send it to your customer.<br />
            Reports export the same way.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Printer Setup</div>
          <div className="page-sub">Pick which paired Bluetooth device prints your receipts</div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Paired Bluetooth devices</h3>
          <button className="btn small ghost" onClick={loadDevices} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="section-body">
          {error && <div className="form-error">{error}</div>}

          {!error && devices.length === 0 && !loading && (
            <div className="empty">No devices found.</div>
          )}

          {devices.map((d) => (
            <div
              key={d.address}
              className="stock-card"
              style={{ marginBottom: 10, borderColor: selected === d.address ? 'var(--accent)' : undefined }}
            >
              <div className="stock-card-main" style={{ cursor: 'default' }}>
                <div>
                  <div className="stock-card-title">
                    {d.name || 'Unknown device'}
                    {selected === d.address && (
                      <span className="badge ready" style={{ marginLeft: 8 }}>
                        <span className="ledot" />Selected printer
                      </span>
                    )}
                  </div>
                  <div className="stock-card-sub mono">{d.address}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    className="btn small ghost"
                    onClick={() => runTestPrint(d.address)}
                    disabled={testingAddress === d.address}
                  >
                    {testingAddress === d.address ? 'Printing…' : 'Test print'}
                  </button>
                  <button
                    className={`btn small ${selected === d.address ? 'danger' : ''}`}
                    onClick={() => (selected === d.address ? forget() : selectPrinter(d.address))}
                  >
                    {selected === d.address ? 'Forget' : 'Use this printer'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {testResult && (
            <div style={{ marginTop: 10, fontSize: 13, color: testResult.startsWith('✓') ? 'var(--good)' : 'var(--danger)' }}>
              {testResult}
            </div>
          )}
        </div>
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <div className="section-head"><h3>How to pair a new printer</h3></div>
        <div className="section-body" style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          1. Turn on your thermal printer and put it in pairing mode (check its manual — usually holding the feed button).<br />
          2. On this Android device, go to Settings → Bluetooth → Pair new device, and select the printer.<br />
          3. Come back to this screen and tap Refresh — it should now appear in the list above.<br />
          4. Tap "Test print" to confirm it actually prints, then "Use this printer" to save it.
        </div>
      </div>
    </>
  );
}
