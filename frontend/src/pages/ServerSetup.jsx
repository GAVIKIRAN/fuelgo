import { useState } from 'react'
import Icon from '../components/Icon'
import { Logo } from '../components/Layout'
import { Field, Spinner } from '../components/ui'
import { checkServer, getServerUrl, setServerUrl } from '../platform'

/** First-run screen in the Android app: point it at the FuelGo backend. */
export default function ServerSetup({ onDone, onCancel }) {
  const [url, setUrl] = useState(getServerUrl() || 'http://192.168.1.5:5000')
  const [state, setState] = useState({ busy: false, error: '', ok: false })

  const test = async (e) => {
    e.preventDefault()
    setState({ busy: true, error: '', ok: false })
    try {
      await checkServer(url)
      setServerUrl(url)
      setState({ busy: false, error: '', ok: true })
      setTimeout(() => onDone?.(), 500)
    } catch (err) {
      setState({ busy: false, error: err.message, ok: false })
    }
  }

  return (
    <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
      <main className="auth-main">
        <form className="auth-card" onSubmit={test} noValidate>
          <div style={{ marginBottom: 20 }}><span className="server-logo"><Logo /></span></div>
          <h1>Connect to FuelGo</h1>
          <p className="muted">Enter the address of the FuelGo server. On a local network, this is your computer's Wi-Fi IP with port 5000.</p>
          {state.error && <div className="alert alert-error" role="alert"><Icon name="alert" size={18} /> {state.error}</div>}
          {state.ok && <div className="alert alert-success"><Icon name="check" size={18} /> Connected</div>}
          <Field label="Server address" hint="Example: http://192.168.1.5:5000">
            {(id) => <input id={id} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />}
          </Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={state.busy}>
            {state.busy ? <Spinner size={18} /> : 'Connect'}
          </button>
          {onCancel && <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onCancel}>Cancel</button>}
          <div className="test-hints" style={{ marginTop: 18 }}>
            <strong>Running the server on your PC?</strong> Start it with <code>flask run --host 0.0.0.0</code>, keep the phone on the same Wi-Fi, and allow Python through Windows Firewall when asked. Find the IP with <code>ipconfig</code> (IPv4 Address).
          </div>
        </form>
      </main>
    </div>
  )
}
