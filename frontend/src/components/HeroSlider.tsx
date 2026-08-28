import { useEffect, useState } from 'react';

type Slide = {
  src: string;
  alt: string;
};

const SLIDES: Slide[] = [
  {
    src: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1920&q=70',
    alt: 'Elegant South Indian wedding hall decorated with flowers',
  },
  {
    src: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1920&q=70',
    alt: 'Traditional mandapam with gold lamps and garlands',
  },
  {
    src: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1920&q=70',
    alt: 'Grand wedding stage with red and gold decor',
  },
];

type HeroSliderProps = {
  onCtaClick?: () => void;
};

export default function HeroSlider({ onCtaClick }: HeroSliderProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length);
    }, 5500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="hero" aria-label="Featured marriage halls">
      <div className="hero__slides" aria-hidden="true">
        {SLIDES.map((s, i) => (
          <div key={s.src} className={`hero__slide${i === active ? ' is-active' : ''}`}>
            <img src={s.src} alt={s.alt} loading={i === 0 ? 'eager' : 'lazy'} />
          </div>
        ))}
        <div className="hero__overlay" />
        <div className="hero__ornament-top" />
        <div className="hero__ornament-bottom" />
      </div>

      <div className="hero__inner">
        <span className="hero__eyebrow">
          <span aria-hidden>✦</span> Trusted by families across South India
        </span>
        <h1>
          Find Your Perfect <em>Wedding Hall</em>
        </h1>
        <p className="hero__lede">
          Discover verified marriage halls and mandapams with real-time availability,
          transparent pricing, and direct contact with owners — no middlemen, no hidden fees.
        </p>
        <div className="hero__cta">
          <button
            type="button"
            className="btn btn--gold btn--lg"
            onClick={onCtaClick}
          >
            Check Availability
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="hero__dots" role="tablist" aria-label="Hero slides">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            className={`hero__dot${i === active ? ' is-active' : ''}`}
            onClick={() => setActive(i)}
            aria-label={`Show slide ${i + 1}`}
            aria-selected={i === active}
            role="tab"
          />
        ))}
      </div>
    </section>
  );
}
