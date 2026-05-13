export interface AppUser {
  id: string;
  name: string;
  wines: SavedWine[];
}

export interface SavedWine {
  id: string;
  name: string;
  producer?: string;
  vintage?: string;
  grapes?: string;
  region?: string;
  country?: string;
  color?: 'red' | 'white' | 'rose' | 'sparkling' | 'dessert';
  tastingNotes?: string;
  rating: 'Amazing' | 'Good' | 'Fine' | 'Bad';
  valueRating?: 'Great Value' | 'Fairly Priced' | 'Overrated';
  price?: number;
  dateAdded: string;
}

export function loadUsers(): AppUser[] {
  const stored = localStorage.getItem('winematch_users');
  return stored ? JSON.parse(stored) : [];
}

export function saveUsers(users: AppUser[]): void {
  localStorage.setItem('winematch_users', JSON.stringify(users));
}