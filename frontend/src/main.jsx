import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { SocketProvider } from './context/SocketContext'
import ServerSetup from './pages/ServerSetup'
import { initNativeShell, needsServerSetup } from './platform'
import './styles/index.css'
import './styles/app.css'
import './styles/landing.css'

initNativeShell()

function Root() {
  // In the Android app the backend address must be configured before anything else.
  const [ready, setReady] = useState(!needsServerSetup())
  return (
    <ThemeProvider>
      {ready ? (
        <AuthProvider>
          <SocketProvider>
            <App />
          </SocketProvider>
        </AuthProvider>
      ) : (
        <ServerSetup onDone={() => setReady(true)} />
      )}
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 500 },
          success: { iconTheme: { primary: '#2f7d4f', secondary: '#fff' } },
        }}
      />
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
)
