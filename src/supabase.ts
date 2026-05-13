import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://voanosgjbzxxnucyuzxd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvYW5vc2dqYnp4eG51Y3l1enhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NDM1MzIsImV4cCI6MjA5NDIxOTUzMn0.PFxWI-9bWS3zrTAJUt5nVcHX8VWo3k72VLkdq7ptMk8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── App Users ─────────────────────────────────────────────
export async function fetchAppUsers() {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, name, grok_api_key, is_admin, taste_profile, taste_summary')
    .order('name')
  if (error) { console.error('Error fetching users:', error); return [] }
  return data
}

export async function addAppUser(name: string, grokApiKey?: string, tasteProfile?: string) {
  const { data, error } = await supabase
    .from('app_users')
    .insert([{ name, grok_api_key: grokApiKey || null, taste_profile: tasteProfile || null }])
    .select()
    .single()
  if (error) { console.error('Error adding user:', error); return null }
  return data
}

export async function deleteAppUser(id: string) {
  const { error } = await supabase
    .from('app_users')
    .delete()
    .eq('id', id)
  if (error) { console.error('Error deleting user:', error); return false }
  return true
}

export async function updateUserProfiles(id: string, tasteProfile: string) {
  const { error } = await supabase
    .from('app_users')
    .update({ taste_profile: tasteProfile })
    .eq('id', id)
  if (error) { console.error('Error updating profile:', error); return false }
  return true
}

export async function generateAndSaveTasteSummary(id: string, summary: string) {
  const { error } = await supabase
    .from('app_users')
    .update({ taste_summary: summary })
    .eq('id', id)
  if (error) { console.error('Error saving summary:', error); return false }
  return true
}

// ── Wines & Ratings ───────────────────────────────────────
export async function saveWineWithRatings(
  wine: {
    name: string
    producer?: string
    vintage?: string
    grapes?: string
    region?: string
    country?: string
    color?: string
    tasting_notes?: string
  },
  ratings: {
    user_name: string
    rating?: string
    value_rating?: string
    price?: number
    notes?: string
  }[]
) {
  const { data: wineData, error: wineError } = await supabase
    .from('wines')
    .insert([wine])
    .select()
    .single()

  if (wineError) { console.error('Error saving wine:', wineError); return { success: false, error: wineError } }

  if (ratings.length > 0) {
    const ratingsToInsert = ratings
      .filter(r => r.rating)
      .map(r => ({ ...r, wine_id: wineData.id }))
    if (ratingsToInsert.length > 0) {
      const { error: ratingsError } = await supabase
        .from('ratings')
        .insert(ratingsToInsert)
      if (ratingsError) { console.error('Error saving ratings:', ratingsError); return { success: false, error: ratingsError } }
    }
  }

  return { success: true, wine: wineData }
}

export async function getWinesForUsers(userNames: string[]) {
  if (userNames.length === 0) return []
  const { data, error } = await supabase
    .from('ratings')
    .select(`
      user_name,
      rating,
      value_rating,
      price,
      notes,
      wines (
        name,
        producer,
        vintage,
        grapes,
        region,
        country,
        color,
        tasting_notes
      )
    `)
    .in('user_name', userNames)

  if (error) { console.error('Error fetching wines:', error); return [] }

  return data.map((row: any) => ({
    user_name: row.user_name,
    rating: row.rating,
    value_rating: row.value_rating,
    price: row.price,
    notes: row.notes,
    ...row.wines,
  }))
}
