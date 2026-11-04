import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Hall } from '../api/types';
import type { LocalFavorite } from './types';

const KEY = 'cnb_favorites';

// This file is the single integration point for favorites. If the backend
// ever adds a real Favorite model + endpoints, swap the AsyncStorage reads
// below for api.* calls here — call sites (HallDetailScreen,
// FavoritesListScreen) never touch AsyncStorage directly.

export async function getFavorites(): Promise<LocalFavorite[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addFavorite(hall: Hall): Promise<LocalFavorite[]> {
  const all = await getFavorites();
  if (all.some((f) => f.id === hall.id)) return all;
  const next: LocalFavorite[] = [{ ...hall, savedAt: new Date().toISOString() }, ...all];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function removeFavorite(hallId: string): Promise<LocalFavorite[]> {
  const all = await getFavorites();
  const next = all.filter((f) => f.id !== hallId);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
