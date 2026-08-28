import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getSessionUser, type Availability, type Hall, type SessionUser } from '../api/client';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import OtpAuthModal from '../components/OtpAuthModal';
import { useT } from '../i18n';

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function HallDetails() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const [hall, setHall] = useState<Hall | null>(null);
  const [avail, setAvail] = useState<Availability[]>([]);
  const [similar, setSimilar] = useState<Hall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [openFaq, setOpenFaq] = useState<number | null>(2);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [h, a] = await Promise.all([api.getHall(id), api.getAvailability(id)]);
        setHall(h);
        setAvail(a);
        try {
          const sim = await api.searchHalls({ city: h.city });
          setSimilar(sim.filter((x) => x.id !== h.id).slice(0, 6));
        } catch {
          /* ignore */
        }
      } catch (e: unknown) {
        setError((e as Error).message);
      }
    })();
  }, [id]);

  const gallery = useMemo(() => {
    if (!hall?.imageUrl) return [];
    const base = hall.imageUrl;
    if (base.includes('images.unsplash.com')) {
      const sep = base.includes('?') ? '&' : '?';
      return [base, `${base}${sep}crop=entropy`, `${base}${sep}sat=-15`, `${base}${sep}sat=-30`];
    }
    return [base];
  }, [hall]);

  const [activeImg, setActiveImg] = useState(0);
  useEffect(() => setActiveImg(0), [gallery]);

  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const [otpOpen, setOtpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const sync = () => setUser(getSessionUser());
    window.addEventListener('cnb:auth-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('cnb:auth-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const isVerified = !!user;
  function maskPhone(p: string) {
    const digits = p.replace(/\D/g, '');
    if (digits.length < 4) return '••••••••••';
    return `${p.startsWith('+') ? '+' : ''}${digits.slice(0, 2)} ••••• ${digits.slice(-2)}`;
  }
  async function copyContact(num: string) {
    try {
      await navigator.clipboard.writeText(num);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard might be denied; ignore */
    }
  }

  if (error) {
    return (
      <div className="max-w-[1280px] mx-auto px-6 py-10">
        <div className="px-4 py-3 bg-error-container text-on-error-container rounded-lg">{error}</div>
        <p className="mt-4">
          <Link to="/" className="text-primary font-bold">← Back to search</Link>
        </p>
      </div>
    );
  }
  if (!hall) {
    return (
      <div className="max-w-[1280px] mx-auto px-6 py-10">
        <p className="text-on-surface-variant">Loading hall…</p>
      </div>
    );
  }

  const callHref = `tel:${hall.contactNumber}`;
  const waDigits = hall.contactNumber.replace(/^\+/, '').replace(/\D/g, '');
  const waHref = `https://wa.me/${waDigits}?text=${encodeURIComponent(
    `Hi, I saw "${hall.name}" on CheckNBook. Is it available on ${
      selectedDate ? selectedDate.toDateString() : 'my wedding date'
    }?`
  )}`;

  const reviews = [
    {
      name: 'Raghavan Iyer',
      role: "Groom's Father",
      stars: 5,
      body:
        'The hospitality was unmatched. Every traditional detail we requested for the Muhurtham was executed flawlessly. Truly the most elegant venue in Tamil Nadu.',
      photo:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC4jF5b0Fgqs9PvauGeXH5RMzN2L5mjaJuWqoiEdFmhTHvwLrICvJoQ8mP0QQ97CME76uk539cj4Qo1Opkhh0kiRW6ySUnIppMZNXIEmJtzxwCpJpHbpSrr7Hw4aLm2-PkQyjtE7i2iK7a3oyjRSrKk4HJ4dDl0iSRaINTBBfFgnPPA0cojDg1nXxjmN9Q7P__AdHaLHPotPHX_QukXPTyaAgX-C2x26OpXJlOwKdebJ8oY0rHkLE9XZlKQCoA8MyQAo_YewK4JaA',
    },
    {
      name: 'Priya Sundaram',
      role: 'Bride',
      stars: 5,
      body:
        'The air conditioning and parking facilities were a huge relief for our 1000+ guests. The dining hall is massive and very well maintained.',
      photo:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDs0-La2iZQydMH55Tpsy9fXnDu94FLnBcVcwS9nIlHIlzEOObjmTL3wnxWya_EMxaHdKJ7JRdLnK3j8pgtBfR_qLSNWsmrr3vkvpZEMiYlb-kfG673k4Fg9MZitJcHbFItu4IwtELx3SDMJJ-n0NgkgjCMkqDEDPaeDYk47lJqRpqX_CsG_328ksgNZWjnlun8uL12HaAdEkdiitxFKnm6Q0Pcqbl-gmFt4XxUzUbHtF3XfB7vLjxtL4N9C8vxuvPwSOOyYkpk8Q',
    },
    {
      name: 'Meenakshi G.',
      role: 'Wedding Planner',
      stars: 4,
      body:
        'Absolutely divine atmosphere. The interior carvings provide a natural backdrop that did not need much extra decoration.',
      photo:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC0SF5VPjtYCnr8HODbH9auUKKEsmLo1xECjp_ilr9ZM1qbvfA0Yhz9iLmJjB845itez2YIHv2_hhlpYHWM7F-UP-s6eIYUfGaZk7A5obS4gUheBWnJBVSBFiB-7fNSRU6fw3LXvpCpdBbgx4RNaRusXfZu4JP-wKYdQhjOUlmGSh_uLxcmi-AHRJDmntV9pltQz276oBJ7qOQGsBJWNhwDRYKfRND4EuThtZULlJlEvb_8-PruSDo_5OjswG8T1EHbUkociFEo7A',
    },
  ];

  const faqs = [
    { q: 'What is your cancellation policy?', a: 'Full refund up to 60 days prior to the event. 50% refund up to 30 days prior. No refund within 30 days.' },
    { q: 'Are external catering teams allowed?', a: 'Yes, with prior approval. A nominal usage charge applies for kitchen facilities.' },
    { q: 'Is there a separate hall for Vidhi/Rituals?', a: `Yes, ${hall.name} includes a dedicated Yagya Mandap zone with specialized ventilation designed for traditional rituals.` },
    { q: 'Do you provide in-house decoration?', a: 'Our in-house décor team offers curated traditional and modern packages. Custom themes are also welcome.' },
  ];

  return (
    <main className="max-w-[1280px] mx-auto px-4 md:px-6 py-6 md:py-10">
      <p className="mb-4 text-sm">
        <Link to="/" className="text-on-surface-variant hover:text-primary">{t('back_to_results')}</Link>
      </p>

      {/* Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 mb-12">
        <div className="lg:col-span-8 flex flex-col md:flex-row gap-4">
          {gallery.length > 1 && (
            <div className="hidden md:flex flex-col gap-3 w-24">
              {gallery.map((src, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`h-24 w-24 rounded-lg overflow-hidden border-2 transition-all ${
                    i === activeImg ? 'border-gold shadow-md' : 'border-outline-variant hover:border-gold'
                  }`}
                  aria-label={`Photo ${i + 1}`}
                >
                  <img className="w-full h-full object-cover" src={src} alt="" />
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 relative rounded-xl overflow-hidden shadow-soft-lg group min-h-[320px]">
            <div className="absolute top-4 right-4 bg-primary text-white px-4 py-1 font-bold text-sm tracking-widest rounded shadow-lg z-10">
              {t('available')}
            </div>
            {gallery[activeImg] ? (
              <img
                className="w-full h-[360px] md:h-[500px] object-cover transition-transform duration-700 group-hover:scale-105"
                src={gallery[activeImg]}
                alt={hall.name}
              />
            ) : (
              <div className="w-full h-[360px] md:h-[500px] bg-gradient-to-br from-primary/10 to-gold/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-8xl text-primary">temple_hindu</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center gap-1 mb-2" aria-label="4.5 out of 5 stars">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className="material-symbols-outlined filled text-gold text-xl">star</span>
              ))}
              <span className="material-symbols-outlined text-gold text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                star_half
              </span>
              <span className="text-on-surface-variant text-sm font-medium ml-2">(124 Reviews)</span>
            </div>
            <h1 className="font-serif text-3xl md:text-h1 md:leading-[1.15] text-primary mb-4 font-bold">
              {hall.name}
            </h1>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="font-serif text-h2 text-primary font-semibold">{formatINR(hall.price)}</span>
              <span className="text-on-surface-variant font-medium">{t('per_day_word')}</span>
            </div>
            <p className="text-body-md md:text-body-lg text-on-surface-variant mb-8 border-l-4 border-gold pl-5 italic">
              {hall.description ||
                `Experience the zenith of South Indian tradition in a venue that breathes royalty. ${hall.name} offers a seamless blend of heritage architecture and modern luxury.`}
            </p>
          </div>

          <div className="bg-surface-container-low p-6 rounded-xl border border-yellow-600/10 shadow-sm">
            <h3 className="font-serif text-h3 text-primary mb-4">Elite Facilities</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-gold bg-white p-2 rounded-lg">ac_unit</span>
                <span className="font-medium">{hall.hasAC ? 'Central AC' : 'Non-AC'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-gold bg-white p-2 rounded-lg">groups</span>
                <span className="font-medium">Up to {hall.capacity}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-gold bg-white p-2 rounded-lg">bed</span>
                <span className="font-medium">{hall.hasRooms ? 'Guest Rooms' : 'No Rooms'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-gold bg-white p-2 rounded-lg">local_parking</span>
                <span className="font-medium">Valet Parking</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Availability */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 py-12 border-y border-yellow-600/10">
        <div className="lg:col-span-8">
          <div className="flex flex-wrap justify-between items-end gap-4 mb-6">
            <div>
              <h2 className="font-serif text-h2 text-primary">{t('check_avail_h')}</h2>
              <p className="text-on-surface-variant text-sm mt-1">
                {t('selected_date')}{' '}
                <span className="font-bold text-primary">
                  {selectedDate ? selectedDate.toDateString() : t('pick_date')}
                </span>
                {selectedDate && ' — '}
                {selectedDate && <span className="text-green-700 font-bold">{t('legend_available')}</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-100 border border-green-300 rounded-sm" /> {t('legend_available')}
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-100 border border-red-300 rounded-sm" /> {t('legend_booked')}
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-[#fff8e1] border border-gold/70 rounded-sm relative">
                  <span className="absolute -top-1 -right-1 text-gold text-[8px] leading-none">★</span>
                </div>
                {t('legend_muhurtham')}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-soft-lg overflow-hidden border border-yellow-600/10">
            <div className="bg-primary text-white px-6 py-4 text-center">
              <span className="font-serif font-bold text-lg">{t('select_a_date')}</span>
            </div>
            <div className="p-4 flex justify-center">
              <AvailabilityCalendar
                availability={avail}
                mode="toggle"
                selected={selectedDate ? [selectedDate] : []}
                onToggle={(d) => setSelectedDate(d)}
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="sticky top-28 bg-white p-8 rounded-2xl shadow-soft-lg border-t-4 border-gold">
            <h3 className="font-serif text-h3 text-primary mb-6">{t('secure_your_date')}</h3>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-surface-container-lowest border border-slate-100">
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block mb-1">
                  {t('wedding_date')}
                </label>
                <p className="font-bold">{selectedDate ? selectedDate.toDateString() : t('not_selected')}</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-container-lowest border border-slate-100">
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block mb-1">
                  {t('time_slot')}
                </label>
                <p className="font-bold">{t('full_day_24')}</p>
              </div>

              {/* Office Contact (gated by OTP auth) */}
              <div className="rounded-xl border border-yellow-600/30 bg-gradient-to-br from-white to-surface-container-low/60 p-5 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-[20px]">support_agent</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {t('office_contact')}
                  </span>
                  {isVerified && (
                    <span className="ml-auto text-[10px] font-bold text-green-700 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">verified</span> {t('verified')}
                    </span>
                  )}
                </div>

                {isVerified ? (
                  <>
                    <a
                      href={callHref}
                      className="block text-xl font-bold text-primary tabular-nums tracking-wide hover:underline"
                    >
                      {hall.contactNumber}
                    </a>
                    <button
                      type="button"
                      onClick={() => copyContact(hall.contactNumber)}
                      className="mt-1 text-[11px] font-bold uppercase tracking-widest text-secondary hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      {copied ? t('copied') : t('copy_number')}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-bold text-slate-400 tabular-nums tracking-wide select-none">
                      {maskPhone(hall.contactNumber)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setOtpOpen(true)}
                      className="mt-3 w-full bg-secondary-container text-on-secondary-container py-2.5 rounded-lg font-bold tracking-widest text-[11px] hover:bg-secondary-fixed-dim transition-colors flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">lock_open</span>
                      {t('verify_to_view')}
                    </button>
                  </>
                )}
              </div>

              <div className="space-y-3 pt-4">
                {isVerified ? (
                  <>
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary-container hover:shadow-lg transition-all shadow-md"
                    >
                      {t('enquire_now')}
                    </a>
                    <a
                      href={callHref}
                      className="block text-center w-full border-2 border-primary text-primary font-bold py-4 rounded-xl hover:bg-surface-container transition-all"
                    >
                      {t('call_owner')}
                    </a>
                    <div className="flex gap-3 pt-2">
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-lg text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
                      >
                        <span className="material-symbols-outlined text-base">chat_bubble</span>
                        {t('whatsapp')}
                      </a>
                      <a
                        href={callHref}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-lg text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
                      >
                        <span className="material-symbols-outlined text-base">call</span>
                        {t('call')}
                      </a>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOtpOpen(true)}
                    className="block text-center w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary-container hover:shadow-lg transition-all shadow-md"
                  >
                    {t('verify_to_enquire')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="py-12">
        <h2 className="font-serif text-h2 text-primary mb-6">{t('location_office')}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl overflow-hidden h-80 md:h-96 shadow-soft border border-yellow-600/10 bg-surface-container">
            <iframe
              title="Venue Location"
              src={`https://www.google.com/maps?q=${encodeURIComponent(hall.address + ', ' + hall.city)}&output=embed`}
              width="100%"
              height="100%"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={{ border: 0 }}
            />
          </div>
          <div className="bg-surface-container-low p-8 rounded-2xl flex flex-col">
            <span className="material-symbols-outlined text-gold mb-4 text-4xl">location_on</span>
            <h4 className="font-serif text-h3 text-primary mb-2">{hall.name}</h4>
            <p className="text-on-surface-variant mb-6 leading-relaxed">{hall.address}</p>

            <div className="rounded-xl bg-white border border-yellow-600/20 p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary text-[18px]">call</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {t('office_contact')}
                </span>
              </div>
              {isVerified ? (
                <a
                  href={callHref}
                  className="text-lg font-bold text-primary tabular-nums hover:underline"
                >
                  {hall.contactNumber}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setOtpOpen(true)}
                  className="w-full text-left flex items-center justify-between gap-2 group"
                >
                  <span className="text-lg font-bold text-slate-400 tabular-nums select-none">
                    {maskPhone(hall.contactNumber)}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-secondary group-hover:text-primary flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined text-[14px]">lock_open</span>
                    Verify
                  </span>
                </button>
              )}
            </div>

            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hall.address + ', ' + hall.city)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary font-bold hover:underline mt-auto"
            >
              {t('get_directions')} <span className="material-symbols-outlined">north_east</span>
            </a>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="py-12 border-t border-yellow-600/10">
        <div className="flex justify-between items-end mb-10 gap-4 flex-wrap">
          <div>
            <h2 className="font-serif text-h2 text-primary">Voices of Joy</h2>
            <p className="text-on-surface-variant">Hear from families who celebrated with us</p>
          </div>
          <button
            type="button"
            className="bg-gold/10 text-primary border border-gold px-6 py-3 rounded-full font-bold text-sm hover:bg-gold/20 transition-all"
          >
            Write a Review
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((r) => (
            <div
              key={r.name}
              className="bg-white p-card-padding rounded-2xl shadow-soft border-t-2 border-gold flex flex-col"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`material-symbols-outlined text-sm ${
                      i < r.stars ? 'text-gold filled' : 'text-on-surface-variant'
                    }`}
                    style={{ fontVariationSettings: i < r.stars ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    star
                  </span>
                ))}
              </div>
              <p className="text-on-surface-variant italic mb-6 leading-relaxed">"{r.body}"</p>
              <div className="mt-auto flex items-center gap-4">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-container flex-shrink-0">
                  <img className="w-full h-full object-cover" src={r.photo} alt={r.name} />
                </div>
                <div>
                  <p className="font-bold text-primary">{r.name}</p>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">{r.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Similar */}
      {similar.length > 0 && (
        <section className="py-12">
          <h2 className="font-serif text-h2 text-primary mb-8">You Might Also Adore</h2>
          <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide">
            {similar.map((s) => (
              <Link
                to={`/halls/${s.id}`}
                key={s.id}
                className="min-w-[300px] bg-white rounded-xl shadow-soft overflow-hidden border border-yellow-600/10 group flex-shrink-0"
              >
                <div className="h-44 overflow-hidden">
                  {s.imageUrl ? (
                    <img
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      src={s.imageUrl}
                      alt={s.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/10 to-gold/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-5xl text-primary">temple_hindu</span>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h5 className="font-bold text-lg text-primary mb-1 font-serif">{s.name}</h5>
                  <p className="text-xs text-on-surface-variant mb-3">
                    {s.area ? `${s.area}, ${s.city}` : s.city} • {s.capacity} Guests
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-primary">{formatINR(s.price)}</span>
                    <span className="text-primary text-sm font-bold flex items-center gap-1 group-hover:gap-2 transition-all">
                      View <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="py-12 border-t border-yellow-600/10" id="faq">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-h2 text-primary mb-10 text-center">Planning Essentials</h2>
          <div className="space-y-4">
            {faqs.map((f, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={f.q}
                  className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex justify-between items-center px-6 py-4 cursor-pointer hover:bg-slate-50"
                    aria-expanded={isOpen}
                  >
                    <span className="font-bold text-primary text-left">{f.q}</span>
                    <span
                      className={`material-symbols-outlined text-primary transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    >
                      expand_more
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-6 text-on-surface-variant text-sm leading-relaxed">{f.a}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <OtpAuthModal
        open={otpOpen}
        onClose={() => setOtpOpen(false)}
        hallName={hall.name}
      />
    </main>
  );
}
