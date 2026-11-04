import {
  useFonts as useNotoSerif,
  NotoSerif_400Regular,
  NotoSerif_600SemiBold,
  NotoSerif_700Bold,
} from '@expo-google-fonts/noto-serif';
import {
  useFonts as useManrope,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  useFonts as useNotoSansTamil,
  NotoSansTamil_400Regular,
  NotoSansTamil_600SemiBold,
  NotoSansTamil_700Bold,
} from '@expo-google-fonts/noto-sans-tamil';

/** Loads the same three Google Font families the web app uses (Noto Serif,
 * Manrope, Noto Sans Tamil). Returns true once every weight is ready. */
export function useAppFonts(): boolean {
  const [serifLoaded] = useNotoSerif({
    NotoSerif_400Regular,
    NotoSerif_600SemiBold,
    NotoSerif_700Bold,
  });
  const [sansLoaded] = useManrope({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  const [tamilLoaded] = useNotoSansTamil({
    NotoSansTamil_400Regular,
    NotoSansTamil_600SemiBold,
    NotoSansTamil_700Bold,
  });

  return serifLoaded && sansLoaded && tamilLoaded;
}
