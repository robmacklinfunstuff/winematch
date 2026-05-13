import { useState, useRef } from 'react'
import Webcam from 'react-webcam'
import { v4 as uuidv4 } from 'uuid'

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

interface ScannedImage {
  id: string
  dataUrl: string
}

interface Recommendation {
  wine_name: string
  producer?: string
  vintage?: string
  menu_price?: number
  retail_price?: number
  similarity_score: number
  why_it_matches: string
  tasting_notes: string
  potential_drawbacks?: string
}

type Screen = 'startup' | 'home' | 'scan' | 'quiz' | 'results' | 'addWine' | 'settings'

function loadUsers(): AppUser[] {
  const stored = localStorage.getItem('winematch_users')
  return stored ? JSON.parse(stored) : []
}

function saveUsers(users: AppUser[]): void {
  localStorage.setItem('winematch_users', JSON.stringify(users))
}

const COUNTRIES = ['USA', 'France', 'Italy', 'Spain', 'Australia/New Zealand', 'South America', 'Germany/Austria', 'Other']

export default function App() {
  const [screen, setScreen] = useState<Screen>('startup')
  const [users, setUsers] = useState<AppUser[]>(loadUsers)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [newUserName, setNewUserName] = useState('')
  const [scannedImages, setScannedImages] = useState<ScannedImage[]>([])
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [apiKey, setApiKey] = useState(localStorage.getItem('grokApiKey') || '')
  const [tempKey, setTempKey] = useState(localStorage.getItem('grokApiKey') || '')
  const webcamRef = useRef<Webcam>(null)

  // Quiz state
  const [quizStep, setQuizStep] = useState(0)
  const [wineColor, setWineColor] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [wineBody, setWineBody] = useState('')
  const [bestValue, setBestValue] = useState('')
  const [wineCountry, setWineCountry] = useState('')
  const [wineOak, setWineOak] = useState('')
  const [wineTannin, setWineTannin] = useState('')

  // Results state
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [priceFilter, setPriceFilter] = useState<{min: number, max: number} | null>(null)

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
      setIsCameraActive(false)
    }
  }

  // ── Grok API Call ─────────────────────────────────────────
  const callGrok = async () => {
    if (!apiKey) {
      alert('Please add your Grok API key in Settings first!')
      return
    }
    if (scannedImages.length === 0) {
      alert('Please scan at least one page of the wine list first!')
      return
    }

    setIsLoading(true)
    setScreen('results')

    const selectedUserNames = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name).join(', ')
    const allWines = users.filter(u => selectedUsers.includes(u.id)).flatMap(u => u.wines)

    const preferences = `
      Wine color: ${wineColor || 'no preference'}
      Price range: ${priceMin && priceMax ? `$${priceMin} - $${priceMax}` : 'no preference'}
      Body: ${wineBody || 'no preference'}
      Best value priority: ${bestValue || 'no preference'}
      Country preference: ${wineCountry || 'no preference'}
      Oak preference: ${wineOak || 'no preference'}
      Tannin preference: ${wineTannin || 'no preference'}
    `

    const wineHistory = allWines.length > 0
      ? `Past wines they loved: ${JSON.stringify(allWines)}`
      : 'No past wine history yet — rely on their stated preferences.'

    const messages: any[] = [
      {
        role: 'user',
        content: [
          ...scannedImages.map(img => ({
            type: 'image_url',
            image_url: { url: img.dataUrl }
          })),
          {
            type: 'text',
            text: `You are an expert sommelier. You are recommending wines for: ${selectedUserNames}.

${wineHistory}

Their preferences for tonight:
${preferences}

Please analyze the wine list in the image(s) above and recommend the top 5 wines that best match their preferences and taste history.

Return ONLY a valid JSON array with this exact structure, no other text:
[
  {
    "wine_name": "Full wine name",
    "producer": "Producer name",
    "vintage": "Year or null",
    "menu_price": 65,
    "retail_price": 45,
    "similarity_score": 9.2,
    "why_it_matches": "Detailed explanation of why this matches their taste",
    "tasting_notes": "Flavor profile, body, finish",
    "potential_drawbacks": "Any risks or caveats"
  }
]`
          }
        ]
      }
    ]

    try {
      setLoadingMsg('Scanning your wine list...')
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'grok-2-vision-latest',
          messages,
          max_tokens: 2000
        })
      })

      setLoadingMsg('Analyzing wines...')
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || '[]'
      const clean = content.replace(/```json|```/g, '').trim()
      const recs = JSON.parse(clean)
      setRecommendations(recs)
    } catch (err) {
      alert('Something went wrong. Check your API key and try again.')
      setScreen('quiz')
    } finally {
      setIsLoading(false)
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
          <h2 style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: '8px' }}>Who are we recommending for today?</h2>
          <p style={{ textAlign: 'center', color: '#FCD34D', fontSize: '0.9rem', marginBottom: '24px' }}>Tap names to select</p>
          {users.length === 0 && (
            <p style={{ textAlign: 'center', color: '#92400E', marginBottom: '16px' }}>No users yet — add yourself below!</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            {users.map(u => (
              <button key={u.id} onClick={() => toggleSelectUser(u.id)}
                style={{ padding: '20px', borderRadius: '16px', fontSize: '1.1rem', fontWeight: 'bold', border: '2px solid', cursor: 'pointer', background: selectedUsers.includes(u.id) ? '#B45309' : '#2A1F17', borderColor: selectedUsers.includes(u.id) ? '#FCD34D' : '#78350F', color: 'white' }}>
                👤 {u.name}
              </button>
            ))}
          </div>
          {users.length < 6 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <input value={newUserName} onChange={e => setNewUserName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUser()} placeholder="Add a name..."
                style={{ flex: 1, background: '#2A1F17', border: '1px solid #78350F', borderRadius: '12px', padding: '12px 16px', color: 'white', fontSize: '1rem' }} />
              <button onClick={addUser}
                style={{ background: '#B45309', border: 'none', borderRadius: '12px', padding: '12px 20px', color: 'white', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>
                + Add
              </button>
            </div>
          )}
          <button onClick={() => { if (users.length > 0 && selectedUsers.length === 0) { alert('Please tap at least one name'); return; } setScreen('home') }}
            style={{ width: '100%', background: '#B45309', border: 'none', borderRadius: '16px', padding: '20px', color: 'white', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', marginTop: 'auto' }}>
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
          <p style={{ textAlign: 'center', color: '#FCD34D' }}>Recommending for: <strong style={{ color: 'white' }}>{names || 'Everyone'}</strong></p>
          <button onClick={() => { setScannedImages([]); setQuizStep(0); setWineColor(''); setPriceMin(''); setPriceMax(''); setWineBody(''); setBestValue(''); setWineCountry(''); setWineOak(''); setWineTannin(''); setScreen('scan') }}
            style={{ width: '100%', background: '#B45309', border: 'none', borderRadius: '24px', padding: '48px 24px', color: 'white', fontSize: '1.5rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '3rem' }}>📷</span>
            Select a Wine
            <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#FDE68A' }}>Scan a restaurant wine list</span>
          </button>
          <button onClick={() => setScreen('addWine')}
            style={{ width: '100%', background: '#2A1F17', border: '2px solid #78350F', borderRadius: '24px', padding: '48px 24px', color: 'white', fontSize: '1.5rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '3rem' }}>➕</span>
            Add a Wine
            <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#FCD34D' }}>Save a wine you've tried</span>
          </button>
          <button onClick={() => setScreen('startup')} style={{ background: 'none', border: 'none', color: '#92400E', cursor: 'pointer', fontSize: '0.9rem' }}>← Switch users</button>
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
            <button onClick={() => setIsCameraActive(true)}
              style={{ width: '100%', background: '#B45309', border: 'none', borderRadius: '24px', padding: '48px 24px', color: 'white', fontSize: '1.3rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '3rem' }}>📷</span>
              Open Camera
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ borderRadius: '16px', overflow: 'hidden', background: 'black' }}>
                <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: 'environment' }} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={capturePhoto} style={{ flex: 1, background: 'white', color: 'black', border: 'none', borderRadius: '12px', padding: '16px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>📸 Capture Page</button>
                <button onClick={() => setIsCameraActive(false)} style={{ flex: 1, background: '#2A1F17', color: 'white', border: 'none', borderRadius: '12px', padding: '16px', cursor: 'pointer' }}>Close</button>
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
                    <button onClick={() => setScannedImages(prev => prev.filter(i => i.id !== img.id))}
                      style={{ position: 'absolute', top: '4px', right: '4px', background: '#DC2626', border: 'none', borderRadius: '50%', width: '20px', height: '20px', color: 'white', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setIsCameraActive(true)}
                  style={{ flex: 1, background: '#2A1F17', border: '1px solid #78350F', color: 'white', borderRadius: '12px', padding: '16px', cursor: 'pointer' }}>
                  + Add Page
                </button>
                <button onClick={() => { setQuizStep(0); setScreen('quiz') }}
                  style={{ flex: 1, background: '#B45309', border: 'none', color: 'white', borderRadius: '12px', padding: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Recommend Now →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── QUIZ ─────────────────────────────────────────────────
  if (screen === 'quiz') {
    const btn = (label: string, value: string, current: string, setter: (v: string) => void) => (
      <button key={label} onClick={() => setter(current === value ? '' : value)}
        style={{ padding: '18px', borderRadius: '16px', fontSize: '1.1rem', fontWeight: 'bold', border: '2px solid', cursor: 'pointer', background: current === value ? '#B45309' : '#2A1F17', borderColor: current === value ? '#FCD34D' : '#78350F', color: 'white', width: '100%' }}>
        {label}
      </button>
    )

    const steps = [
      {
        title: 'What type of wine?',
        content: (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {['🔴 Red', '⚪ White', '🌸 Rosé', '🥂 Sparkling', '🍯 Dessert', '🤷 No Preference'].map(opt =>
              btn(opt, opt.split(' ')[1] || opt, wineColor, setWineColor)
            )}
          </div>
        )
      },
      {
        title: 'Price range?',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#FCD34D', fontSize: '0.9rem' }}>Min ($)</label>
                <input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)} placeholder="0"
                  style={{ width: '100%', background: '#2A1F17', border: '1px solid #78350F', borderRadius: '12px', padding: '12px', color: 'white', fontSize: '1.1rem', boxSizing: 'border-box' }} />
              </div>
              <span style={{ color: '#FCD34D', marginTop: '20px' }}>—</span>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#FCD34D', fontSize: '0.9rem' }}>Max ($)</label>
                <input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} placeholder="200"
                  style={{ width: '100%', background: '#2A1F17', border: '1px solid #78350F', borderRadius: '12px', padding: '12px', color: 'white', fontSize: '1.1rem', boxSizing: 'border-box' }} />
              </div>
            </div>
            <button onClick={() => { setPriceMin(''); setPriceMax('') }}
              style={{ background: '#2A1F17', border: '1px solid #78350F', color: '#FCD34D', borderRadius: '12px', padding: '12px', cursor: 'pointer' }}>
              No Price Preference
            </button>
          </div>
        )
      },
      {
        title: `How full-bodied? ${wineColor === 'White' ? '(White)' : wineColor === 'Sparkling' ? '(Sparkling)' : '(Red)'}`,
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {['Light', 'Medium', 'Full', 'No Preference'].map(opt =>
              btn(opt, opt, wineBody, setWineBody)
            )}
          </div>
        )
      },
      {
        title: 'Prioritize best value?',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {['Yes — find me the best deal', 'No — just find the best match', 'No Preference'].map(opt =>
              btn(opt, opt, bestValue, setBestValue)
            )}
          </div>
        )
      },
      {
        title: 'Prefer wines from a country?',
        content: (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[...COUNTRIES, 'No Preference'].map(opt =>
              btn(opt, opt, wineCountry, setWineCountry)
            )}
          </div>
        )
      },
      {
        title: 'Oak preference?',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {['Low oak / Unoaked', 'Some oak', 'Heavily oaked', 'No Preference'].map(opt =>
              btn(opt, opt, wineOak, setWineOak)
            )}
          </div>
        )
      },
      {
        title: 'Tannin preference?',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {['Soft / Low tannins', 'Medium tannins', 'Bold / High tannins', 'No Preference'].map(opt =>
              btn(opt, opt, wineTannin, setWineTannin)
            )}
          </div>
        )
      }
    ]

    const currentStep = steps[quizStep]

    return (
      <div style={{ minHeight: '100vh', background: '#1F1209', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => quizStep === 0 ? setScreen('scan') : setQuizStep(q => q - 1)}
            style={{ background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem' }}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Question {quizStep + 1} of {steps.length}</h2>
        </div>

        {/* Progress bar */}
        <div style={{ height: '4px', background: '#2A1F17' }}>
          <div style={{ height: '100%', background: '#B45309', width: `${((quizStep + 1) / steps.length) * 100}%`, transition: 'width 0.3s' }} />
        </div>

        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ fontSize: '1.4rem', textAlign: 'center', color: '#FEF3C7' }}>{currentStep.title}</h3>
          {currentStep.content}
        </div>

        <div style={{ padding: '24px', display: 'flex', gap: '12px' }}>
          {quizStep < steps.length - 1 ? (
            <>
              <button onClick={() => setQuizStep(q => q + 1)}
                style={{ flex: 1, background: '#2A1F17', border: '1px solid #78350F', color: 'white', borderRadius: '16px', padding: '18px', fontSize: '1rem', cursor: 'pointer' }}>
                Next Question →
              </button>
              <button onClick={callGrok}
                style={{ flex: 1, background: '#B45309', border: 'none', color: 'white', borderRadius: '16px', padding: '18px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>
                Select Wine Now! 🍷
              </button>
            </>
          ) : (
            <button onClick={callGrok}
              style={{ width: '100%', background: '#B45309', border: 'none', color: 'white', borderRadius: '16px', padding: '20px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>
              Find My Wines! 🍷
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── RESULTS ───────────────────────────────────────────────
  if (screen === 'results') {
    const filtered = priceFilter
      ? recommendations.filter(r => (r.menu_price || 0) >= priceFilter.min && (r.menu_price || 0) <= priceFilter.max)
      : recommendations

    return (
      <div style={{ minHeight: '100vh', background: '#1F1209', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setScreen('quiz')} style={{ background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem' }}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Your Wine Recommendations</h2>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🍷</div>
              <p style={{ color: '#FCD34D', fontSize: '1.2rem' }}>{loadingMsg}</p>
              <p style={{ color: '#92400E', fontSize: '0.9rem' }}>This takes about 10-15 seconds...</p>
            </div>
          ) : (
            <>
              {/* Price filter */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => setPriceFilter(null)}
                  style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: !priceFilter ? '#B45309' : '#2A1F17', borderColor: !priceFilter ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.85rem' }}>
                  All Prices
                </button>
                {[{label: 'Under $50', min: 0, max: 50}, {label: '$50-$100', min: 50, max: 100}, {label: '$100+', min: 100, max: 9999}].map(f => (
                  <button key={f.label} onClick={() => setPriceFilter({min: f.min, max: f.max})}
                    style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: priceFilter?.min === f.min ? '#B45309' : '#2A1F17', borderColor: priceFilter?.min === f.min ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.85rem' }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {filtered.length === 0 && (
                <p style={{ textAlign: 'center', color: '#92400E', padding: '40px' }}>No wines match this price filter. Try a different range.</p>
              )}

              {filtered.map((rec, i) => (
                <div key={i} style={{ background: '#2A1F17', borderRadius: '20px', padding: '20px', border: '1px solid #78350F' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#FEF3C7' }}>#{i + 1} {rec.wine_name}</h3>
                      {rec.producer && <p style={{ margin: '2px 0', color: '#FCD34D', fontSize: '0.9rem' }}>{rec.producer} {rec.vintage || ''}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#FCD34D' }}>
                        {rec.menu_price ? `$${rec.menu_price}` : ''}
                      </div>
                      {rec.retail_price && <div style={{ fontSize: '0.75rem', color: '#92400E' }}>Retail ~${rec.retail_price}</div>}
                    </div>
                  </div>

                  <div style={{ background: '#1F1209', borderRadius: '12px', padding: '12px', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#FDE68A' }}>🎯 {rec.why_it_matches}</p>
                  </div>

                  <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#D4A574' }}>👅 {rec.tasting_notes}</p>

                  {rec.potential_drawbacks && (
                    <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#92400E' }}>⚠️ {rec.potential_drawbacks}</p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                    <div style={{ flex: 1, height: '6px', background: '#1F1209', borderRadius: '3px' }}>
                      <div style={{ height: '100%', background: '#B45309', borderRadius: '3px', width: `${(rec.similarity_score / 10) * 100}%` }} />
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#FCD34D' }}>{rec.similarity_score}/10</span>
                  </div>
                </div>
              ))}

              {recommendations.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button onClick={callGrok}
                    style={{ flex: 1, background: '#2A1F17', border: '1px solid #78350F', color: 'white', borderRadius: '16px', padding: '16px', cursor: 'pointer' }}>
                    🔄 More Recommendations
                  </button>
                  <button onClick={() => setScreen('home')}
                    style={{ flex: 1, background: '#B45309', border: 'none', color: 'white', borderRadius: '16px', padding: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                    🏠 Home
                  </button>
                </div>
              )}
            </>
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
    const [tempKey, setTempKey] = useState(apiKey)
    return (
      <div style={{ minHeight: '100vh', background: '#1F1209', color: 'white' }}>
        <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer' }}>← Back</button>
          <h2 style={{ margin: 0 }}>Settings</h2>
        </div>
        <div style={{ padding: '24px' }}>
          <label style={{ display: 'block', color: '#FCD34D', marginBottom: '8px', fontSize: '0.9rem' }}>Grok API Key</label>
          <input type="password" value={tempKey} onChange={e => setTempKey(e.target.value)} placeholder="xai-..."
            style={{ width: '100%', background: '#2A1F17', border: '1px solid #78350F', borderRadius: '12px', padding: '12px 16px', color: 'white', fontSize: '1rem', boxSizing: 'border-box' }} />
          <button onClick={() => { localStorage.setItem('grokApiKey', tempKey); alert('Saved!') }}
            style={{ width: '100%', background: '#B45309', border: 'none', borderRadius: '12px', padding: '16px', color: 'white', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', marginTop: '16px' }}>
            Save API Key
          </button>
        </div>
      </div>
    )
  }

  return null
}