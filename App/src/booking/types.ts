// BookingDraft is the in-progress, multi-step form state held in
// BookingDraftContext while the customer fills in BookingForm/Summary/
// Payment. Once submitted, it's sent to the real backend (see
// api/client.ts's createBooking) — this file no longer has a local-only
// persistence shape.

export type EventType = 'wedding' | 'engagement' | 'reception' | 'birthday' | 'corporate' | 'other';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'cash';

export const EVENT_TYPE_LABEL_KEYS: Record<EventType, 'event_wedding' | 'event_engagement' | 'event_reception' | 'event_birthday' | 'event_corporate' | 'event_other'> = {
  wedding: 'event_wedding',
  engagement: 'event_engagement',
  reception: 'event_reception',
  birthday: 'event_birthday',
  corporate: 'event_corporate',
  other: 'event_other',
};

export const PAYMENT_METHOD_LABEL_KEYS: Record<PaymentMethod, 'pay_upi' | 'pay_card' | 'pay_netbanking' | 'pay_cash'> = {
  upi: 'pay_upi',
  card: 'pay_card',
  netbanking: 'pay_netbanking',
  cash: 'pay_cash',
};

export type BookingDraft = {
  hallId: string;
  hallName: string;
  hallImage?: string;
  hallCity: string;
  hallArea?: string;
  hallCapacity: number;
  contactNumber: string;
  pricePerDay: number;
  advancePercent: number;
  cancellationPolicy?: string | null;
  date?: string;
  customerName: string;
  customerPhone: string;
  eventType?: EventType;
  guestCount?: number;
  specialRequests: string;
  paymentMethod?: PaymentMethod;
};

export const emptyDraft: BookingDraft = {
  hallId: '',
  hallName: '',
  hallCity: '',
  hallCapacity: 0,
  contactNumber: '',
  pricePerDay: 0,
  advancePercent: 50,
  date: undefined,
  customerName: '',
  customerPhone: '',
  specialRequests: '',
};
