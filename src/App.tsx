import { useState, useRef, useEffect } from 'react'
import Webcam from 'react-webcam'
import { v4 as uuidv4 } from 'uuid'
import { saveWineWithRatings, getWinesForUsers, fetchAppUsers, addAppUser, deleteAppUser, updateUserProfiles, generateAndSaveTasteSummary } from './supabase'

const MASTER_API_KEY = import.meta.env.VITE_GROK_API_KEY || ''

// ── Personality — change this to adjust Grok's tone ──────
const GROK_PERSONALITY = `You have a fun, sassy, opinionated personality. You are confident in your recommendations, use light humor, and are not afraid to be dramatic about bad wine choices. Think knowledgeable best friend at a restaurant, not stuffy sommelier. Keep it fun but always back up your opinions with real wine knowledge. You never reccommend a wine not on the wine list.`

interface AppUser {
  id: string
  name: string
  grok_api_key?: string
  is_admin?: boolean
  taste_profile?: string
  taste_summary?: string
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
  similar_to?: string
  tasting_notes: string
  potential_drawbacks?: string
}

interface WorstPick {
  wine_name: string
  producer?: string
  vintage?: string
  menu_price?: number
  why_its_bad: string
}

interface NewWine {
  name: string
  producer: string
  vintage: string
  grapes: string
  region: string
  country: string
  color: string
  tasting_notes: string
}

interface UserRating {
  user_name: string
  rating: string
  value_rating: string
  price: string
  notes: string
}

type Screen = 'startup' | 'home' | 'scan' | 'quiz' | 'results' | 'addWine' | 'addWineForm' | 'rateWine' | 'admin'

const COUNTRIES = ['USA', 'France', 'Italy', 'Spain', 'Australia/New Zealand', 'South America', 'Germany/Austria', 'Other']
const COLORS = ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert']
const RATINGS = ['Amazing', 'Good', 'Fine', 'Bad']
const VALUE_RATINGS = ['Great Value', 'Fairly Priced', 'Overrated']

// ── Image compression helper ──────────────────────────────
function compressImage(dataUrl: string, maxWidth = 600, quality = 0.4): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('startup')
  const [users, setUsers] = useState<AppUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [scannedImages, setScannedImages] = useState<ScannedImage[]>([])
  const [isCameraActive, setIsCameraActive] = useState(false)
  const webcamRef = useRef<Webcam>(null)
  const labelCamRef = useRef<Webcam>(null)

  const [quizStep, setQuizStep] = useState(0)
  const [wineColor, setWineColor] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [wineBody, setWineBody] = useState('')
  const [bestValue, setBestValue] = useState('')
  const [wineCountry, setWineCountry] = useState('')
  const [wineOak, setWineOak] = useState('')
  const [wineTannin, setWineTannin] = useState('')

  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [worstPick, setWorstPick] = useState<WorstPick | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [priceFilter, setPriceFilter] = useState<{ min: number; max: number } | null>(null)

  const [newWine, setNewWine] = useState<NewWine>({ name: '', producer: '', vintage: '', grapes: '', region: '', country: '', color: '', tasting_notes: '' })
  const [userRatings, setUserRatings] = useState<UserRating[]>([])
  const [ratingUserIndex, setRatingUserIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isParsingLabel, setIsParsingLabel] = useState(false)
  const [labelCameraActive, setLabelCameraActive] = useState(false)

  const [newUserName, setNewUserName] = useState('')
  const [newUserKey, setNewUserKey] = useState('')
  const [newUserProfile, setNewUserProfile] = useState('')
  const [logoTapCount, setLogoTapCount] = useState(0)
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [editingProfile, setEditingProfile] = useState<{ id: string; text: string } | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setUsersLoading(true)
    const data = await fetchAppUsers()
    setUsers(data)
    setUsersLoading(false)
  }

  const getApiKey = () => {
    const selectedUserObjects = users.filter(u => selectedUsers.includes(u.id))
    for (const user of selectedUserObjects) {
      if (user.grok_api_key) return user.grok_api_key
    }
    return MASTER_API_KEY
  }

  const toggleSelectUser = (id: string) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id])
  }

  // ── Capture with compression ──────────────────────────────
  const capturePhoto = async () => {
    const imageSrc = webcamRef.current?.getScreenshot()
    if (!imageSrc) return
    const compressed = await compressImage(imageSrc)
    setScannedImages(prev => [...prev, { id: uuidv4(), dataUrl: compressed }])
    // Release camera stream so flashlight becomes available
    const stream = webcamRef.current?.video?.srcObject as MediaStream
    if (stream) stream.getTracks().forEach(track => track.stop())
    setIsCameraActive(false)
  }

  const startAddWine = () => {
    setNewWine({ name: '', producer: '', vintage: '', grapes: '', region: '', country: '', color: '', tasting_notes: '' })
    const names = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name)
    setUserRatings(names.map(name => ({ user_name: name, rating: '', value_rating: '', price: '', notes: '' })))
    setRatingUserIndex(0)
    setLabelCameraActive(false)
    setScreen('addWine')
  }

  // ── Scan label with compression ───────────────────────────
  const scanWineLabel = async () => {
    const imageSrc = labelCamRef.current?.getScreenshot()
    if (!imageSrc) return
    setIsParsingLabel(true)
    setLabelCameraActive(false)
    try {
      const compressed = await compressImage(imageSrc)
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getApiKey() },
        body: JSON.stringify({
          model: 'grok-4.3',
          messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: compressed, detail: 'high' } }, { type: 'text', text: 'You are a wine expert. Analyze this wine label and extract details. Return ONLY valid JSON:\n{"name":"wine name","producer":"winery","vintage":"year or null","grapes":"grape varieties","region":"region","country":"country","color":"Red or White or Rose or Sparkling or Dessert","tasting_notes":"notes or null"}' }] }],
          max_tokens: 500
        })
      })
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(content.replace(/```json|```/g, '').trim())
      setNewWine(prev => ({ ...prev, ...Object.fromEntries(Object.entries(parsed).filter(([_, v]) => v)) }))
      setScreen('addWineForm')
    } catch (err) {
      console.error(err)
      alert('Could not read label. Please fill in manually.')
      setScreen('addWineForm')
    } finally {
      setIsParsingLabel(false)
    }
  }

  const updateRating = (field: keyof UserRating, value: string) => {
    setUserRatings(prev => prev.map((r, i) => i === ratingUserIndex ? { ...r, [field]: value } : r))
  }

  const goToNextRating = async () => {
    if (ratingUserIndex < userRatings.length - 1) {
      setRatingUserIndex(i => i + 1)
    } else {
      await handleSaveWine()
    }
  }

  const handleSaveWine = async () => {
    if (!newWine.name.trim()) { alert('Please enter at least the wine name'); return }
    setIsSaving(true)
    try {
      const ratingsToSave = userRatings.map(r => ({
        user_name: r.user_name,
        rating: r.rating || undefined,
        value_rating: r.value_rating || undefined,
        price: r.price ? parseFloat(r.price) : undefined,
        notes: r.notes || undefined,
      }))
      const result = await saveWineWithRatings(newWine, ratingsToSave)
      if (result.success) { alert('Wine saved! 🍷'); setScreen('home') }
      else { alert('Error saving wine. Please try again.') }
    } catch (err) {
      console.error(err)
      alert('Error saving wine. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddUser = async () => {
    if (!newUserName.trim()) { alert('Please enter a name'); return }
    setIsAddingUser(true)
    const result = await addAppUser(newUserName.trim(), newUserKey.trim() || undefined, newUserProfile.trim() || undefined)
    if (result) {
      await loadUsers()
      setNewUserName('')
      setNewUserKey('')
      setNewUserProfile('')
      alert(newUserName + ' added!')
    } else {
      alert('Error adding user. Name may already exist.')
    }
    setIsAddingUser(false)
  }

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm('Remove ' + name + '?')) return
    await deleteAppUser(id)
    await loadUsers()
  }

  const handleSaveProfile = async (userId: string, profileText: string) => {
    await updateUserProfiles(userId, profileText)
    await loadUsers()
    setEditingProfile(null)
  }

  const handleGenerateSummary = async (user: AppUser) => {
    setIsGeneratingSummary(user.id)
    try {
      const allWines = await getWinesForUsers([user.name])
      if (allWines.length === 0) { alert('No wine history yet for ' + user.name + '. Add some wines first!'); return }
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + MASTER_API_KEY },
        body: JSON.stringify({
          model: 'grok-4.3',
          messages: [{
            role: 'user',
            content: GROK_PERSONALITY + '\n\nBased on this person\'s wine history, write a SHORT 2-3 sentence taste profile summary that captures their preferences. Be specific about grapes, regions, styles they love and avoid. Make it fun and personal.\n\nWine history:\n' + JSON.stringify(allWines) + '\n\nReturn ONLY the summary paragraph, no other text.'
          }],
          max_tokens: 300
        })
      })
      const data = await response.json()
      const summary = data.choices?.[0]?.message?.content || ''
      if (summary) {
        await generateAndSaveTasteSummary(user.id, summary)
        await loadUsers()
        alert('Taste summary generated for ' + user.name + '!')
      }
    } catch (err) {
      console.error(err)
      alert('Error generating summary. Please try again.')
    } finally {
      setIsGeneratingSummary(null)
    }
  }

  const handleLogoTap = () => {
    const newCount = logoTapCount + 1
    setLogoTapCount(newCount)
    if (newCount >= 3) { setLogoTapCount(0); setScreen('admin') }
  }

  const callGrok = async () => {
    if (scannedImages.length === 0) { alert('Please scan at least one page of the wine list first!'); return }
    setIsLoading(true); setRecommendations([]); setWorstPick(null); setScreen('results')

    const selectedUserNamesList = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name)
    const selectedUserNames = selectedUserNamesList.join(', ')
    const allWines = await getWinesForUsers(selectedUserNamesList)

    const selectedUserObjects = users.filter(u => selectedUsers.includes(u.id))
    const userContext = selectedUserObjects.map(u => {
      const parts = ['User: ' + u.name]
      if (u.taste_profile) parts.push('Their own description of their taste: "' + u.taste_profile + '"')
      if (u.taste_summary) parts.push('AI-generated taste summary: "' + u.taste_summary + '"')
      return parts.join('\n')
    }).join('\n\n')

    const preferences = 'Wine color: ' + (wineColor || 'no preference') + ', Price range: ' + (priceMin && priceMax ? '$' + priceMin + '-$' + priceMax : 'no preference') + ', Body: ' + (wineBody || 'no preference') + ', Best value: ' + (bestValue || 'no preference') + ', Country: ' + (wineCountry || 'no preference') + ', Oak: ' + (wineOak || 'no preference') + ', Tannins: ' + (wineTannin || 'no preference')
    const wineHistory = allWines.length > 0 ? 'Past wine ratings:\n' + JSON.stringify(allWines) : 'No past wine history — rely on stated preferences.'

    const promptText = GROK_PERSONALITY + '\n\n' +
  `CRITICAL RULE — YOU MUST OBEY THIS OR YOU FAIL:
You are ONLY allowed to recommend or mention wines that are EXPLICITLY VISIBLE and clearly readable in the attached image(s).
If a wine name, producer, vintage, or price is blurry, cut off, or you are not 100% confident you read it correctly — SKIP IT completely.
DO NOT invent, guess, or hallucinate any wine that is not clearly shown.
If you cannot confidently read any wines, return empty recommendations and say so.

You are recommending wines for: ${selectedUserNames}

USER PROFILES AND HISTORY:
${userContext}

${wineHistory}

Tonight's preferences: ${preferences}

TASK (follow exactly in this order):

1. FIRST, carefully examine ALL attached images.
   Extract EVERY wine that is clearly readable. Create an internal list with:
   - exact name
   - producer (if visible)
   - vintage (if visible)
   - menu_price (if visible)

2. ONLY AFTER you have the complete extracted list, evaluate which ones best match the users' taste, ratings, value preference, and tonight's preferences.

3. From that extracted list only, pick the top 3 best matches.

Be sassy, fun, and opinionated in your explanations — but NEVER make up a wine.

Return ONLY valid JSON. No other text, no explanations outside the JSON:

{
  "extracted_wines": [
    {
      "wine_name": "exact name as seen",
      "producer": "producer or null",
      "vintage": "year or null",
      "menu_price": number or null
    }
  ],
  "recommendations": [
    {
      "wine_name": "exact name",
      "producer": "producer or null",
      "vintage": "year or null",
      "menu_price": number,
      "retail_price": number or null,
      "similarity_score": number,
      "why_it_matches": "short, fun, sassy explanation referencing their past wines",
      "similar_to": "name of one wine from their history or null",
      "tasting_notes": "brief flavor profile",
      "potential_drawbacks": "any honest risks or null"
    }
  ],
  "worst_pick": {
    "wine_name": "exact name or null",
    "why_its_bad": "fun sassy explanation why this is terrible for them or null"
  }
}

If no wines are readable, return:
{
  "extracted_wines": [],
  "recommendations": [],
  "worst_pick": null
}`

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getApiKey() },
        body: JSON.stringify({
          model: 'grok-4.3',
          messages: [{ role: 'user', content: [...scannedImages.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })), { type: 'text', text: promptText }] }],
          max_tokens: 2500
        })
      })
      const data = await response.json()
      console.log('Grok response:', data)
      if (data.error) { alert('Grok API error: ' + data.error.message); setScreen('quiz'); return }
      const content = data.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(content.replace(/```json|```/g, '').trim())
      setExtractedWines(parsed.extracted_wines || [])
      console.log('Extracted wines from menu:', parsed.extracted_wines)
      setRecommendations(parsed.recommendations || [])
      setWorstPick(parsed.worst_pick || null)
    } catch (err) {
      console.error(err); alert('Something went wrong. Please try again.'); setScreen('quiz')
    } finally { setIsLoading(false) }
  }

  const resetQuiz = () => { setQuizStep(0); setWineColor(''); setPriceMin(''); setPriceMax(''); setWineBody(''); setBestValue(''); setWineCountry(''); setWineOak(''); setWineTannin('') }

  const s: Record<string, any> = {
    page: { minHeight: '100vh', background: '#1F1209', color: 'white', display: 'flex', flexDirection: 'column' },
    header: { background: '#3C2A1F', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' },
    backBtn: { background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem' },
    primaryBtn: { background: '#B45309', border: 'none', borderRadius: '16px', padding: '18px', color: 'white', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', width: '100%' },
    secondaryBtn: { background: '#2A1F17', border: '1px solid #78350F', borderRadius: '16px', padding: '18px', color: 'white', fontSize: '1rem', cursor: 'pointer', flex: 1 },
    card: { background: '#2A1F17', borderRadius: '20px', padding: '20px', border: '1px solid #78350F' },
    input: { width: '100%', background: '#2A1F17', border: '1px solid #78350F', borderRadius: '12px', padding: '12px 16px', color: 'white', fontSize: '1rem', boxSizing: 'border-box' as const },
    label: { display: 'block', color: '#FCD34D', fontSize: '0.85rem', marginBottom: '4px' },
  }

  const optionBtn = (label: string, value: string, current: string, setter: (v: string) => void) => (
    <button key={label} onClick={() => setter(current === value ? '' : value)}
      style={{ padding: '18px', borderRadius: '16px', fontSize: '1rem', fontWeight: 'bold', border: '2px solid', cursor: 'pointer', width: '100%', background: current === value ? '#B45309' : '#2A1F17', borderColor: current === value ? '#FCD34D' : '#78350F', color: 'white' }}>
      {label}
    </button>
  )

  // ── HELP POPUP ────────────────────────────────────────────
  const HelpPopup = () => (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#2A1F17', borderRadius: '24px', padding: '28px', border: '1px solid #78350F', maxWidth: '400px', width: '100%', maxHeight: '80vh', overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#FEF3C7', fontSize: '1.3rem' }}>🍷 How to Use WineMatch</h2>
          <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', color: '#FCD34D', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        {[
          { icon: '👤', title: 'Select Who\'s Drinking', text: 'At startup, tap names to choose who\'s at the table tonight. Grok will combine everyone\'s taste history to make recommendations.' },
          { icon: '📷', title: 'Scan the Wine List', text: 'Tap "Select a Wine" then open the camera. Take clear photos of each page of the wine list. Add as many pages as needed.' },
          { icon: '🎯', title: 'Answer the Quiz', text: 'After scanning, answer a few quick questions about what you\'re in the mood for tonight — color, price, body, country, etc. Skip any you don\'t care about.' },
          { icon: '🍾', title: 'Get Recommendations', text: 'Grok picks the top 5 wines from the actual list that match your taste history and tonight\'s preferences — plus one wine to avoid! Filter by price if you want.' },
          { icon: '➕', title: 'Add Wines You\'ve Tried', text: 'Tap "Add a Wine" to save wines you\'ve had. Scan the label or enter by hand. Rate it Amazing/Good/Fine/Bad. The more you add, the smarter Grok gets.' },
          { icon: '👑', title: 'Admin (Tap Logo 3x)', text: 'On the startup screen, tap the 🍷 logo three times to open Admin. Add or remove users and edit taste profiles.' },
        ].map(item => (
          <div key={item.title} style={{ marginBottom: '20px' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 'bold', color: '#FEF3C7' }}>{item.icon} {item.title}</p>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#D4A574', lineHeight: 1.5 }}>{item.text}</p>
          </div>
        ))}

        <button onClick={() => setShowHelp(false)} style={{ ...s.primaryBtn, marginTop: '8px' }}>Got it!</button>
      </div>
    </div>
  )

  // ── STARTUP ──────────────────────────────────────────────
  if (screen === 'startup') return (
    <div style={s.page}>
      {showHelp && <HelpPopup />}
      <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: '36px' }} />
        <div style={{ textAlign: 'center' }}>
          <h1 onClick={handleLogoTap} style={{ fontSize: '2rem', color: '#FEF3C7', margin: 0, cursor: 'pointer', userSelect: 'none' as const }}>🍷 WineMatch</h1>
          <p style={{ color: '#FCD34D', margin: '4px 0 0', fontSize: '0.9rem' }}>Your personal AI sommelier</p>
        </div>
        <button onClick={() => setShowHelp(true)} style={{ background: 'none', border: '1px solid #78350F', borderRadius: '50%', width: '36px', height: '36px', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', flexShrink: 0 }}>?</button>
      </div>
      <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: '8px' }}>Who are we recommending for today?</h2>
        <p style={{ textAlign: 'center', color: '#FCD34D', fontSize: '0.9rem', marginBottom: '24px' }}>Tap names to select</p>
        {usersLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#FCD34D' }}>Loading users...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#92400E', marginBottom: '16px' }}>No users yet!</p>
            <p style={{ color: '#FCD34D', fontSize: '0.9rem' }}>Tap the 🍷 logo 3 times to open Admin.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            {users.map(u => (
              <button key={u.id} onClick={() => toggleSelectUser(u.id)}
                style={{ padding: '20px', borderRadius: '16px', fontSize: '1.1rem', fontWeight: 'bold', border: '2px solid', cursor: 'pointer', background: selectedUsers.includes(u.id) ? '#B45309' : '#2A1F17', borderColor: selectedUsers.includes(u.id) ? '#FCD34D' : '#78350F', color: 'white' }}>
                👤 {u.name}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => { if (users.length > 0 && selectedUsers.length === 0) { alert('Please tap at least one name'); return; } setScreen('home') }}
          style={{ ...s.primaryBtn, marginTop: 'auto', padding: '20px', fontSize: '1.2rem' }}>
          Let's Go →
        </button>
      </div>
    </div>
  )

  // ── HOME ─────────────────────────────────────────────────
  if (screen === 'home') {
    const names = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name).join(', ')
    return (
      <div style={s.page}>
        {showHelp && <HelpPopup />}
        <div style={{ background: '#3C2A1F', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '1.8rem', color: '#FEF3C7', margin: 0 }}>🍷 WineMatch</h1>
          <button onClick={() => setShowHelp(true)} style={{ background: 'none', border: '1px solid #78350F', borderRadius: '50%', width: '36px', height: '36px', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>?</button>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          <p style={{ textAlign: 'center', color: '#FCD34D' }}>Recommending for: <strong style={{ color: 'white' }}>{names || 'Everyone'}</strong></p>
          <button onClick={() => { setScannedImages([]); resetQuiz(); setScreen('scan') }}
            style={{ width: '100%', background: '#B45309', border: 'none', borderRadius: '24px', padding: '48px 24px', color: 'white', fontSize: '1.5rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '3rem' }}>📷</span>
            Select a Wine
            <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#FDE68A' }}>Scan a restaurant wine list</span>
          </button>
          <button onClick={startAddWine}
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

  // ── ADMIN ─────────────────────────────────────────────────
  if (screen === 'admin') return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => setScreen('startup')} style={s.backBtn}>← Back</button>
        <h2 style={{ margin: 0 }}>👑 Admin — Manage Users</h2>
      </div>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' as const }}>
        <div style={s.card}>
          <h3 style={{ margin: '0 0 16px', color: '#FEF3C7' }}>Add New User</h3>
          <label style={s.label}>Name</label>
          <input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="e.g. Sarah" style={{ ...s.input, marginBottom: '12px' }} />
          <label style={s.label}>Their Grok API Key (optional)</label>
          <input value={newUserKey} onChange={e => setNewUserKey(e.target.value)} placeholder="xai-... or leave blank" style={{ ...s.input, marginBottom: '12px' }} />
          <label style={s.label}>Taste Profile (optional)</label>
          <textarea value={newUserProfile} onChange={e => setNewUserProfile(e.target.value)} placeholder="e.g. I love bold reds, especially Cabernet and Malbec. I hate anything oaky or buttery..."
            style={{ ...s.input, minHeight: '80px', resize: 'vertical' as const, marginBottom: '16px' }} />
          <button onClick={handleAddUser} disabled={isAddingUser} style={{ ...s.primaryBtn, opacity: isAddingUser ? 0.6 : 1 }}>
            {isAddingUser ? 'Adding...' : '+ Add User'}
          </button>
        </div>
        <div>
          <h3 style={{ color: '#FEF3C7', margin: '0 0 12px' }}>Current Users ({users.length})</h3>
          {users.map(u => (
            <div key={u.id} style={{ ...s.card, marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', color: '#FEF3C7', fontSize: '1.1rem' }}>{u.name} {u.is_admin ? '👑' : ''}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#92400E' }}>{u.grok_api_key ? '🔑 Has own API key' : '🔑 Using master key'}</p>
                </div>
                {!u.is_admin && (
                  <button onClick={() => handleDeleteUser(u.id, u.name)}
                    style={{ background: '#DC2626', border: 'none', borderRadius: '8px', padding: '8px 12px', color: 'white', cursor: 'pointer', fontSize: '0.85rem' }}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ background: '#1F1209', borderRadius: '12px', padding: '12px', margin: '10px 0' }}>
                <p style={{ margin: '0 0 6px', fontSize: '0.8rem', color: '#FCD34D', fontWeight: 'bold' }}>✍️ TASTE PROFILE — What do they like in their own words?</p>
                <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: '#92400E' }}>This goes directly to Grok with every recommendation.</p>
              </div>

              {editingProfile?.id === u.id ? (
                <div>
                  <label style={s.label}>Taste Profile</label>
                  <textarea value={editingProfile.text} onChange={e => setEditingProfile({ id: u.id, text: e.target.value })}
                    style={{ ...s.input, minHeight: '80px', resize: 'vertical' as const, marginBottom: '8px' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleSaveProfile(u.id, editingProfile.text)}
                      style={{ flex: 1, background: '#B45309', border: 'none', borderRadius: '10px', padding: '10px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                    <button onClick={() => setEditingProfile(null)}
                      style={{ flex: 1, background: '#2A1F17', border: '1px solid #78350F', borderRadius: '10px', padding: '10px', color: 'white', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  {u.taste_profile
                    ? <p style={{ margin: '8px 0', fontSize: '0.85rem', color: '#FDE68A', fontStyle: 'italic' }}>"{u.taste_profile}"</p>
                    : <p style={{ margin: '8px 0', fontSize: '0.85rem', color: '#92400E' }}>No taste profile yet</p>}
                  <button onClick={() => setEditingProfile({ id: u.id, text: u.taste_profile || '' })}
                    style={{ background: '#2A1F17', border: '1px solid #78350F', borderRadius: '8px', padding: '6px 12px', color: '#FCD34D', cursor: 'pointer', fontSize: '0.8rem', marginRight: '8px' }}>
                    ✏️ Edit Profile
                  </button>
                </div>
              )}
              {u.taste_summary && (
                <div style={{ background: '#1F1209', borderRadius: '10px', padding: '10px', marginTop: '8px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: '#92400E' }}>🤖 AI Taste Summary:</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#D4A574' }}>{u.taste_summary}</p>
                </div>
              )}
              <button onClick={() => handleGenerateSummary(u)} disabled={isGeneratingSummary === u.id}
                style={{ background: '#1F1209', border: '1px solid #78350F', borderRadius: '8px', padding: '6px 12px', color: '#FCD34D', cursor: 'pointer', fontSize: '0.8rem', marginTop: '8px', opacity: isGeneratingSummary === u.id ? 0.6 : 1 }}>
                {isGeneratingSummary === u.id ? '⏳ Generating...' : '🤖 Generate Taste Summary'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── SCAN ─────────────────────────────────────────────────
  if (screen === 'scan') return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => setScreen('home')} style={s.backBtn}>← Back</button>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Scan Wine List</h2>
      </div>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {!isCameraActive ? (
          <button onClick={() => setIsCameraActive(true)}
            style={{ width: '100%', background: '#B45309', border: 'none', borderRadius: '24px', padding: '48px 24px', color: 'white', fontSize: '1.3rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '3rem' }}>📷</span>Open Camera
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
              <button onClick={() => setIsCameraActive(true)} style={s.secondaryBtn}>+ Add Page</button>
              <button onClick={() => { setQuizStep(0); setScreen('quiz') }}
                style={{ flex: 1, background: '#B45309', border: 'none', color: 'white', borderRadius: '16px', padding: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                Recommend Now →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ── ADD WINE ──────────────────────────────────────────────
  if (screen === 'addWine') return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => setScreen('home')} style={s.backBtn}>← Back</button>
        <h2 style={{ margin: 0 }}>Add a Wine</h2>
      </div>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ textAlign: 'center', color: '#FCD34D' }}>How would you like to add this wine?</p>
        <button onClick={() => setLabelCameraActive(true)}
          style={{ width: '100%', background: '#B45309', border: 'none', borderRadius: '24px', padding: '36px 24px', color: 'white', fontSize: '1.3rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '3rem' }}>📷</span>
          Scan Wine Label
          <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#FDE68A' }}>AI reads the label automatically</span>
        </button>
        <button onClick={() => setScreen('addWineForm')}
          style={{ width: '100%', background: '#2A1F17', border: '2px solid #78350F', borderRadius: '24px', padding: '36px 24px', color: 'white', fontSize: '1.3rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '3rem' }}>✏️</span>
          Enter by Hand
          <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#FCD34D' }}>Fill in what you know</span>
        </button>
        {labelCameraActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ borderRadius: '16px', overflow: 'hidden', background: 'black' }}>
              <Webcam ref={labelCamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: 'environment' }} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={scanWineLabel} style={{ flex: 1, background: 'white', color: 'black', border: 'none', borderRadius: '12px', padding: '16px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>📸 Read Label</button>
              <button onClick={() => setLabelCameraActive(false)} style={{ flex: 1, background: '#2A1F17', color: 'white', border: 'none', borderRadius: '12px', padding: '16px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        )}
        {isParsingLabel && <div style={{ textAlign: 'center', padding: '20px', color: '#FCD34D' }}>🍷 Reading label...</div>}
      </div>
    </div>
  )

  // ── ADD WINE FORM ─────────────────────────────────────────
  if (screen === 'addWineForm') return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => setScreen('addWine')} style={s.backBtn}>← Back</button>
        <h2 style={{ margin: 0 }}>Wine Details</h2>
      </div>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' as const }}>
        <p style={{ color: '#FCD34D', fontSize: '0.9rem', margin: 0 }}>Fill in what you know — everything except the name is optional</p>
        {[
          { label: 'Wine Name *', key: 'name', placeholder: 'e.g. Caymus Cabernet Sauvignon' },
          { label: 'Producer / Winery', key: 'producer', placeholder: 'e.g. Caymus Vineyards' },
          { label: 'Vintage (Year)', key: 'vintage', placeholder: 'e.g. 2021' },
          { label: 'Grape(s)', key: 'grapes', placeholder: 'e.g. Cabernet Sauvignon' },
          { label: 'Region', key: 'region', placeholder: 'e.g. Napa Valley' },
          { label: 'Tasting Notes', key: 'tasting_notes', placeholder: 'What did it taste like?' },
        ].map(field => (
          <div key={field.key}>
            <label style={s.label}>{field.label}</label>
            <input value={newWine[field.key as keyof NewWine]} onChange={e => setNewWine(prev => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder} style={s.input} />
          </div>
        ))}
        <div>
          <label style={s.label}>Country</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {COUNTRIES.map(c => (
              <button key={c} onClick={() => setNewWine(prev => ({ ...prev, country: prev.country === c ? '' : c }))}
                style={{ padding: '12px', borderRadius: '12px', border: '1px solid', cursor: 'pointer', background: newWine.country === c ? '#B45309' : '#2A1F17', borderColor: newWine.country === c ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.85rem' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={s.label}>Color</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setNewWine(prev => ({ ...prev, color: prev.color === c ? '' : c }))}
                style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid', cursor: 'pointer', background: newWine.color === c ? '#B45309' : '#2A1F17', borderColor: newWine.color === c ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.85rem' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { if (!newWine.name.trim()) { alert('Please enter the wine name'); return; } setRatingUserIndex(0); setScreen('rateWine') }}
          style={{ ...s.primaryBtn, marginTop: '8px' }}>
          Next: Rate This Wine →
        </button>
      </div>
    </div>
  )

  // ── RATE WINE ─────────────────────────────────────────────
  if (screen === 'rateWine') {
    const currentUser = userRatings[ratingUserIndex]
    const isLastUser = ratingUserIndex === userRatings.length - 1
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => ratingUserIndex === 0 ? setScreen('addWineForm') : setRatingUserIndex(i => i - 1)} style={s.backBtn}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Rate: {newWine.name}</h2>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {userRatings.length > 1 && (
            <div style={{ background: '#2A1F17', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#FCD34D', fontSize: '1.1rem', fontWeight: 'bold' }}>Rating for: {currentUser?.user_name}</p>
              <p style={{ margin: '4px 0 0', color: '#92400E', fontSize: '0.85rem' }}>{ratingUserIndex + 1} of {userRatings.length} people</p>
            </div>
          )}
          <div>
            <label style={s.label}>How was it?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {RATINGS.map(r => (
                <button key={r} onClick={() => updateRating('rating', currentUser?.rating === r ? '' : r)}
                  style={{ padding: '16px', borderRadius: '12px', border: '2px solid', cursor: 'pointer', background: currentUser?.rating === r ? '#B45309' : '#2A1F17', borderColor: currentUser?.rating === r ? '#FCD34D' : '#78350F', color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>
                  {r === 'Amazing' ? '🤩 Amazing' : r === 'Good' ? '😊 Good' : r === 'Fine' ? '😐 Fine' : '😞 Bad'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={s.label}>Value for money? (optional)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {VALUE_RATINGS.map(r => (
                <button key={r} onClick={() => updateRating('value_rating', currentUser?.value_rating === r ? '' : r)}
                  style={{ padding: '14px', borderRadius: '12px', border: '1px solid', cursor: 'pointer', background: currentUser?.value_rating === r ? '#B45309' : '#2A1F17', borderColor: currentUser?.value_rating === r ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.9rem' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={s.label}>Price paid (optional)</label>
            <input type="number" value={currentUser?.price || ''} onChange={e => updateRating('price', e.target.value)} placeholder="e.g. 65" style={s.input} />
          </div>
          <div>
            <label style={s.label}>Notes (optional)</label>
            <input value={currentUser?.notes || ''} onChange={e => updateRating('notes', e.target.value)} placeholder="Anything else to remember?" style={s.input} />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => { updateRating('rating', ''); updateRating('value_rating', ''); updateRating('price', ''); goToNextRating() }} style={s.secondaryBtn}>Skip Rating</button>
            <button onClick={goToNextRating} disabled={isSaving}
              style={{ flex: 1, background: '#B45309', border: 'none', color: 'white', borderRadius: '16px', padding: '18px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? 'Saving...' : isLastUser ? '💾 Save Wine' : 'Next Person →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── QUIZ ─────────────────────────────────────────────────
  if (screen === 'quiz') {
    const steps = [
      { title: 'What type of wine?', content: (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>{['🔴 Red', '⚪ White', '🌸 Rosé', '🥂 Sparkling', '🍯 Dessert', '🤷 No Preference'].map(opt => optionBtn(opt, opt, wineColor, setWineColor))}</div>) },
      { title: 'Price range on the menu?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}><div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}><div style={{ flex: 1 }}><label style={s.label}>Min ($)</label><input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)} placeholder="0" style={s.input} /></div><span style={{ color: '#FCD34D', paddingBottom: '14px' }}>—</span><div style={{ flex: 1 }}><label style={s.label}>Max ($)</label><input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} placeholder="200" style={s.input} /></div></div><button onClick={() => { setPriceMin(''); setPriceMax('') }} style={s.secondaryBtn}>No Price Preference</button></div>) },
      { title: 'How full-bodied?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{['Light', 'Medium', 'Full', 'No Preference'].map(opt => optionBtn(opt, opt, wineBody, setWineBody))}</div>) },
      { title: 'Prioritize best value?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{['Yes — find me the best deal', 'No — best match only', 'No Preference'].map(opt => optionBtn(opt, opt, bestValue, setBestValue))}</div>) },
      { title: 'Country preference?', content: (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>{[...COUNTRIES, 'No Preference'].map(opt => optionBtn(opt, opt, wineCountry, setWineCountry))}</div>) },
      { title: 'Oak preference?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{['Low oak / Unoaked', 'Some oak', 'Heavily oaked', 'No Preference'].map(opt => optionBtn(opt, opt, wineOak, setWineOak))}</div>) },
      { title: 'Tannin preference?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{['Soft / Low tannins', 'Medium tannins', 'Bold / High tannins', 'No Preference'].map(opt => optionBtn(opt, opt, wineTannin, setWineTannin))}</div>) },
    ]
    const step = steps[quizStep]
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => quizStep === 0 ? setScreen('scan') : setQuizStep(q => q - 1)} style={s.backBtn}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Question {quizStep + 1} of {steps.length}</h2>
        </div>
        <div style={{ height: '4px', background: '#2A1F17' }}>
          <div style={{ height: '100%', background: '#B45309', width: ((quizStep + 1) / steps.length * 100) + '%', transition: 'width 0.3s' }} />
        </div>
        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ fontSize: '1.4rem', textAlign: 'center', color: '#FEF3C7', margin: 0 }}>{step.title}</h3>
          {step.content}
        </div>
        <div style={{ padding: '24px', display: 'flex', gap: '12px' }}>
          {quizStep < steps.length - 1 ? (
            <>
              <button onClick={() => setQuizStep(q => q + 1)} style={s.secondaryBtn}>Next Question →</button>
              <button onClick={callGrok} style={{ flex: 1, background: '#B45309', border: 'none', color: 'white', borderRadius: '16px', padding: '18px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>Select Wine Now! 🍷</button>
            </>
          ) : (
            <button onClick={callGrok} style={s.primaryBtn}>Find My Wines! 🍷</button>
          )}
        </div>
      </div>
    )
  }

  // ── RESULTS ───────────────────────────────────────────────
  const [showExtracted, setShowExtracted] = useState(false)
  const [extractedWines, setExtractedWines] = useState<any[]>([])

  if (screen === 'results') {
    const filtered = priceFilter ? recommendations.filter(r => (r.menu_price || 0) >= priceFilter.min && (r.menu_price || 0) <= priceFilter.max) : recommendations
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => setScreen('quiz')} style={s.backBtn}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Your Recommendations</h2>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🍷</div>
              <p style={{ color: '#FCD34D', fontSize: '1.2rem' }}>Your sommelier is on it...</p>
              <p style={{ color: '#92400E', fontSize: '0.9rem' }}>This takes about 15 seconds</p>
            </div>
          ) : (
            
            <>
              {/* Debug panel — shows what Grok read from the menu */}
              <div style={{ background: '#1A1A2E', borderRadius: '16px', border: '1px solid #4A4A8A', overflow: 'hidden' }}>
                <button
                  onClick={() => setShowExtracted(p => !p)}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '12px 16px', color: '#A0A0FF', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span>🔍 What Grok read from the menu ({extractedWines.length} wines)</span>
                  <span>{showExtracted ? '▲' : '▼'}</span>
                </button>
                {showExtracted && (
                  <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {extractedWines.length === 0 ? (
                      <p style={{ color: '#FF6B6B', fontSize: '0.85rem', margin: 0 }}>⚠️ Grok could not read any wines from the image. Try a clearer photo.</p>
                    ) : (
                      extractedWines.map((w, i) => (
                        <div key={i} style={{ background: '#2A2A4A', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', color: '#C0C0FF' }}>
                          <strong>{w.wine_name}</strong>
                          {w.producer ? ' — ' + w.producer : ''}
                          {w.vintage ? ' ' + w.vintage : ''}
                          {w.menu_price ? <span style={{ color: '#A0FFA0', marginLeft: '8px' }}>${w.menu_price}</span> : ''}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                {[{ label: 'All Prices', min: 0, max: 99999 }, { label: 'Under $50', min: 0, max: 50 }, { label: '$50–$100', min: 50, max: 100 }, { label: '$100+', min: 100, max: 99999 }].map(f => (
                  <button key={f.label} onClick={() => f.label === 'All Prices' ? setPriceFilter(null) : setPriceFilter({ min: f.min, max: f.max })}
                    style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: (f.label === 'All Prices' && !priceFilter) || priceFilter?.min === f.min ? '#B45309' : '#2A1F17', borderColor: (f.label === 'All Prices' && !priceFilter) || priceFilter?.min === f.min ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.85rem' }}>
                    {f.label}
                  </button>
                ))}
              </div>
              {filtered.length === 0 && recommendations.length > 0 && <p style={{ textAlign: 'center', color: '#92400E', padding: '40px' }}>No wines match this price filter.</p>}
              {filtered.map((rec, i) => (
                <div key={i} style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#FEF3C7' }}>#{i + 1} {rec.wine_name}</h3>
                      {rec.producer && <p style={{ margin: '2px 0', color: '#FCD34D', fontSize: '0.9rem' }}>{rec.producer} {rec.vintage || ''}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {rec.menu_price && <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#FCD34D' }}>${rec.menu_price}</div>}
                      {rec.retail_price && <div style={{ fontSize: '0.75rem', color: '#92400E' }}>Retail ~${rec.retail_price}</div>}
                    </div>
                  </div>
                  <div style={{ background: '#1F1209', borderRadius: '12px', padding: '12px', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#FDE68A' }}>🎯 {rec.why_it_matches}</p>
                  </div>
                  {rec.similar_to && (
                    <p style={{ margin: '6px 0', fontSize: '0.85rem', color: '#86EFAC' }}>🍾 Similar to: <em>{rec.similar_to}</em></p>
                  )}
                  <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#D4A574' }}>👅 {rec.tasting_notes}</p>
                  {rec.potential_drawbacks && <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#92400E' }}>⚠️ {rec.potential_drawbacks}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                    <div style={{ flex: 1, height: '6px', background: '#1F1209', borderRadius: '3px' }}>
                      <div style={{ height: '100%', background: '#B45309', borderRadius: '3px', width: (rec.similarity_score / 10 * 100) + '%' }} />
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#FCD34D' }}>{rec.similarity_score}/10</span>
                  </div>
                </div>
              ))}
              {worstPick && (
                <div style={{ background: '#2D0A0A', borderRadius: '20px', padding: '20px', border: '2px solid #7F1D1D', marginTop: '8px' }}>
                  <h3 style={{ margin: '0 0 8px', color: '#FCA5A5', fontSize: '1rem' }}>💀 The Worst Pick on This List</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 'bold', color: '#FEF2F2' }}>{worstPick.wine_name}</p>
                      {worstPick.producer && <p style={{ margin: '2px 0', color: '#FCA5A5', fontSize: '0.85rem' }}>{worstPick.producer} {worstPick.vintage || ''}</p>}
                    </div>
                    {worstPick.menu_price && <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#FCA5A5' }}>${worstPick.menu_price}</div>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#FECACA', fontStyle: 'italic' }}>😬 {worstPick.why_its_bad}</p>
                </div>
              )}
              {recommendations.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button onClick={callGrok} style={s.secondaryBtn}>🔄 More Recommendations</button>
                  <button onClick={() => setScreen('home')} style={{ flex: 1, background: '#B45309', border: 'none', color: 'white', borderRadius: '16px', padding: '16px', fontWeight: 'bold', cursor: 'pointer' }}>🏠 Home</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }



  return null
}
