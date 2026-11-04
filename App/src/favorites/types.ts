import type { Hall } from '../api/types';

// No Favorite model exists on the backend yet — storing the full Hall
// snapshot (not just an id) means the list screen can render immediately
// offline and reuse <HallCard> unmodified, with no extra fetch.
export type LocalFavorite = Hall & { savedAt: string };
