import { createContext, useContext, useState, type ReactNode } from 'react';
import { emptyDraft, type BookingDraft } from './types';

type BookingDraftContextValue = {
  draft: BookingDraft;
  patchDraft: (patch: Partial<BookingDraft>) => void;
  resetDraft: () => void;
};

const BookingDraftContext = createContext<BookingDraftContextValue>({
  draft: emptyDraft,
  patchDraft: () => {},
  resetDraft: () => {},
});

export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft>(emptyDraft);

  function patchDraft(patch: Partial<BookingDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function resetDraft() {
    setDraft(emptyDraft);
  }

  return (
    <BookingDraftContext.Provider value={{ draft, patchDraft, resetDraft }}>
      {children}
    </BookingDraftContext.Provider>
  );
}

export function useBookingDraft() {
  return useContext(BookingDraftContext);
}
