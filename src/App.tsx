import { useState, useRef } from 'react'
import Webcam from 'react-webcam'
import { v4 as uuidv4 } from 'uuid'

// ── Types ──────────────────────────────────────────────────
interface SavedWine {
  id: string
  name: string
  producer?: string
  vintage?: string
  grapes?: string
  region?: string
  country?: string
  color?: string
  tastingNotes?: string
  rating: string
  valueRating?: string
  price?: number
  dateAdded: string
}

interface AppUser {
  id: string
  name: string
  wines: SavedWine[]
}

// ── Storage helpers ────────────────────────────────────────
function loadUsers(): AppUser[] {
  const stored = localStorage.getItem('winematch_users')
  return stored ? JSON.parse(stored) : []
}

function saveUsers(users: AppUser[]): void {
  localStorage.setItem('winematch_users', JSON.stringify(users))
}

// ── Scanned image type ─────────────────────────────────────
interface ScannedImage {
  id: string
  dataUrl: string
}

type Screen = 'startup' | 'home' | 'scan' | 'addWine' | 'settings'

// ── Main App ───────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>('startup')
  const [users, setUsers] = useState<AppUser[]>(loadUsers)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [newUserName, setNewUserName] = useState('')
  const [scannedImages, setScannedImages] = useState<ScannedImage[]>([])
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [apiKey, setApiKey] = useState(localStorage.getItem('grokApiKey') || '')
  const webcamRef = useRef<Webcam>(null)

  const persistUsers = (updated: AppUser[]) => {
    setUsers(updated)
    saveUsers(updated)
  }

  const addUser = () => {
    const trimmed = newUserName.trim()
    if (!trimmed || users.length >= 6) return
    const updated = [...users, { id: uuidv4(), name: trimmed, wines: [] }]
    persistUsers(updated)
    setNewUserName('')
  }

  const toggleSelectUser = (id: string) => {
    setSelectedUsers(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    )
  }

  const capturePhoto = () => {
    const imageSrc = webcamRef.current?.getScreenshot()
    if (imageSrc) {
      setScannedImages(prev => [...prev, { id: uuidv4(), dataUrl: imageSrc }])
    }
  }

  // ── STARTUP ──────────────────────────────────────────────
  if (screen === 'startup') {
    return (
      <div style={{ minHeight: '100vh', background: '#1F1209', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#3C2A1F', padding: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', color: '#FEF3C7', margin: 0 }}>🍷 WineMatch</h1>
          <p style={{ color: '#FCD34D', margin: '4px 0 0' }}>Your personal AI sommelier</p>
        </div>

        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: '8px' }}>
            Who are we recommending for today?
          </h2>
          <p style={{ textAlign: 'center', color: '#FCD34D', fontSize: '0.9rem', marginBottom: '24px' }}>
            Tap names to select
          </p>

          {users.length === 0 && (
            <p style={{ textAlign: 'center', color: '#92400E', marginBottom: '16px' }}>
              No users yet — add yourself below!
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => toggleSelectUser(u.id)}
                style={{
                  padding: '20px',
                  borderRadius: '16px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  border: '2px solid',
                  cursor: 'pointer',
                  background: selectedUsers.includes(u.id) ? '#B45309' : '#2A1F17',
                  borderColor: selectedUsers.includes(u.id) ? '#FCD34D' : '#78350F',
                  color: 'white'
                }}
              >
                👤 {u.name}
              </button>
            ))}
          </div>

          {users.length < 6 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <input
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addUser()}
                placeholder="Add a name..."
                style={{
                  flex: 1, background: '#2A1F17', border: '1px solid #78350F',
                  borderRadius: '12px', padding: '12px 16px', color: 'white', fontSize: '1rem'
                }}
              />
              <button
                onClick={addUser}
                style={{
                  background: '#B45309', border: 'none', borderRadius: '12px',
                  padding: '12px 20px', color: 'white', fontSize: '1rem',
                  fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                + Add
              </button>
            </div>
          )}

          <button
            onClick={() => {
              if (users.length > 0 && selectedUsers.length === 0) {
                alert('Please tap at least one name')
                return
              }
              setScreen('home')
            }}
            style={{
              width: '100%', background: '#B45309', border: 'none',
              borderRadius: '16px', padding: '20px', color: 'white',
              fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', marginTop: 'auto'
            }}
          >
            Let's Go →
          </button>
        </div>
      </div>
    )
  }

  // ── HOME ─────────────────────────────────────────────────
  if (screen === 'home') {
    const names = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name).join(', ')
    return (
      <div style={{ minHeight: '100vh', background: '#1F1209', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '1.8rem', color: '#FEF3C7', margin: 0 }}>🍷 WineMatch</h1>
          <button onClick={() => setScreen('settings')} style={{ background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer', fontSize: '1.5rem' }}>⚙️</button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          <p style={{ textAlign: 'center', color: '#FCD34D' }}>
            Recommending for: <strong style={{ color: 'white' }}>{names || 'Everyone'}</strong>
          </p>

          <button
            onClick={() => { setScannedImages([]); setScreen('scan') }}
            style={{
              width: '100%', background: '#B45309', border: 'none', borderRadius: '24px',
              padding: '48px 24px', color: 'white', fontSize: '1.5rem', fontWeight: 'bold',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
            }}
          >
            <span style={{ fontSize: '3rem' }}>📷</span>
            Select a Wine
            <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#FDE68A' }}>Scan a restaurant wine list</span>
          </button>

          <button
            onClick={() => setScreen('addWine')}
            style={{
              width: '100%', background: '#2A1F17', border: '2px solid #78350F', borderRadius: '24px',
              padding: '48px 24px', color: 'white', fontSize: '1.5rem', fontWeight: 'bold',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
            }}
          >
            <span style={{ fontSize: '3rem' }}>➕</span>
            Add a Wine
            <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#FCD34D' }}>Save a wine you've tried</span>
          </button>

          <button onClick={() => setScreen('startup')} style={{ background: 'none', border: 'none', color: '#92400E', cursor: 'pointer', fontSize: '0.9rem' }}>
            ← Switch users
          </button>
        </div>
      </div>
    )
  }

  // ── SCAN ─────────────────────────────────────────────────
  if (screen === 'scan') {
    return (
      <div style={{ minHeight: '100vh', background: '#1F1209', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem' }}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Scan Wine List</h2>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {!isCameraActive ? (
            <button
              onClick={() => setIsCameraActive(true)}
              style={{
                width: '100%', background: '#B45309', border: 'none', borderRadius: '24px',
                padding: '48px 24px', color: 'white', fontSize: '1.3rem', fontWeight: 'bold',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
              }}
            >
              <span style={{ fontSize: '3rem' }}>📷</span>
              Open Camera
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ borderRadius: '16px', overflow: 'hidden', background: 'black' }}>
                <Webcam
  ref={webcamRef}
  audio={false}
  screenshotFormat="image/jpeg"
  videoConstraints={{ facingMode: 'environment' }}
  style={{ width: '100%' }}
/>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={capturePhoto} style={{ flex: 1, background: 'white', color: 'black', border: 'none', borderRadius: '12px', padding: '16px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>
                  📸 Capture Page
                </button>
                <button onClick={() => setIsCameraActive(false)} style={{ flex: 1, background: '#2A1F17', color: 'white', border: 'none', borderRadius: '12px', padding: '16px', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          )}

          {scannedImages.length > 0 && (
            <div>
              <p style={{ color: '#FCD34D', marginBottom: '12px' }}>Captured pages ({scannedImages.length})</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                {scannedImages.map(img => (
                  <div key={img.id} style={{ position: 'relative' }}>
                    <img src={img.dataUrl} style={{ width: '100%', borderRadius: '8px' }} />
                    <button
                      onClick={() => setScannedImages(prev => prev.filter(i => i.id !== img.id))}
                      style={{ position: 'absolute', top: '4px', right: '4px', background: '#DC2626', border: 'none', borderRadius: '50%', width: '20px', height: '20px', color: 'white', cursor: 'pointer', fontSize: '0.7rem' }}
                    >✕</button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setIsCameraActive(true)}
                  style={{ flex: 1, background: '#2A1F17', border: '1px solid #78350F', color: 'white', borderRadius: '12px', padding: '16px', cursor: 'pointer' }}
                >
                  + Add Page
                </button>
                <button
                  onClick={() => alert('Quiz + Grok call coming next!')}
                  style={{ flex: 1, background: '#B45309', border: 'none', color: 'white', borderRadius: '12px', padding: '16px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Recommend Now →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── ADD WINE placeholder ──────────────────────────────────
  if (screen === 'addWine') {
    return (
      <div style={{ minHeight: '100vh', background: '#1F1209', color: 'white' }}>
        <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer' }}>← Back</button>
          <h2 style={{ margin: 0 }}>Add a Wine</h2>
        </div>
        <div style={{ padding: '24px', textAlign: 'center', color: '#92400E', marginTop: '80px', fontSize: '1.1rem' }}>
          Coming next — scan label or enter by hand
        </div>
      </div>
    )
  }

  // ── SETTINGS ─────────────────────────────────────────────
  if (screen === 'settings') {
    return (
      <div style={{ minHeight: '100vh', background: '#1F1209', color: 'white' }}>
        <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer' }}>← Back</button>
          <h2 style={{ margin: 0 }}>Settings</h2>
        </div>
        <div style={{ padding: '24px' }}>
          <label style={{ display: 'block', color: '#FCD34D', marginBottom: '8px', fontSize: '0.9rem' }}>Grok API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="xai-..."
            style={{ width: '100%', background: '#2A1F17', border: '1px solid #78350F', borderRadius: '12px', padding: '12px 16px', color: 'white', fontSize: '1rem', boxSizing: 'border-box' }}
          />
          <button
            onClick={() => { localStorage.setItem('grokApiKey', apiKey); alert('Saved!') }}
            style={{ width: '100%', background: '#B45309', border: 'none', borderRadius: '12px', padding: '16px', color: 'white', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', marginTop: '16px' }}
          >
            Save API Key
          </button>
        </div>
      </div>
    )
  }

  return null
}