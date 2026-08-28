import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api/client';
import Search from './pages/Search';
import HallDetails from './pages/HallDetails';
import OwnerLogin from './pages/OwnerLogin';
import OwnerRegister from './pages/OwnerRegister';
import OwnerDashboard from './pages/OwnerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import AdminEditHall from './pages/AdminEditHall';
import { getSessionUser, setSessionUser, setToken, type SessionUser } from './api/client';
import { ToastHost } from './components/Toast';
import LangToggle from './components/LangToggle';
import { useT } from './i18n';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser());
  const nav = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onStorage = () => setUser(getSessionUser());
    window.addEventListener('storage', onStorage);
    window.addEventListener('cnb:auth-changed', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cnb:auth-changed', onStorage);
    };
  }, []);

  function logout() {
    setToken(null);
    setSessionUser(null);
    setUser(null);
    window.dispatchEvent(new Event('cnb:auth-changed'));
    nav('/');
  }

  const isHome = location.pathname === '/';
  const isAdminArea = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-background">
      {!isAdminArea && <TopAppBar user={user} onLogout={logout} />}

      <main className={`flex-1 ${isAdminArea || isHome ? '' : 'pt-24'}`}>
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/halls/:id" element={<HallDetails />} />
          <Route path="/owner/login" element={<OwnerLogin />} />
          <Route path="/owner/register" element={<OwnerRegister />} />
          <Route path="/owner/dashboard" element={<OwnerDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/halls/:id/edit" element={<AdminEditHall />} />
        </Routes>
      </main>

      {!isAdminArea && <SiteFooter />}
      {!isAdminArea && <MobileBottomNav />}

      <ToastHost />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" aria-label="CheckNBook home" className="flex items-center gap-3 group">
      <span
        className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary text-white font-serif font-bold text-lg shadow-sm ring-1 ring-gold/60 group-hover:ring-2 transition"
        aria-hidden
      >
        CB
      </span>
      {!compact && (
        <span className="text-2xl font-black text-primary italic font-serif tracking-tight leading-none">
          Check<span className="text-gold">N</span>Book
        </span>
      )}
    </Link>
  );
}

function CustomerCareBar() {
  const { t } = useT();
  const [contact, setContact] = useState<{ customerCarePhone: string; customerCareEmail: string } | null>(null);
  useEffect(() => {
    api.getSettings()
      .then((s) => setContact({ customerCarePhone: s.customerCarePhone, customerCareEmail: s.customerCareEmail }))
      .catch(() => { /* silent */ });
  }, []);

  return (
    <div className="bg-gradient-to-r from-primary via-primary-container to-primary text-white text-[12px]">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
        <span className="hidden sm:inline-flex items-center gap-1.5 font-medium opacity-90 leading-tight">
          <span className="material-symbols-outlined text-[14px]">support_agent</span>
          {t('care_help')}
        </span>
        <div className="flex items-center gap-4 ml-auto">
          {contact?.customerCarePhone && (
            <a
              href={`tel:${contact.customerCarePhone}`}
              className="flex items-center gap-1.5 hover:text-gold transition-colors"
              title="Call customer care"
            >
              <span className="material-symbols-outlined text-[14px]">call</span>
              <span className="font-bold tabular-nums">{contact.customerCarePhone}</span>
            </a>
          )}
          {contact?.customerCarePhone && contact?.customerCareEmail && (
            <span className="text-white/30 hidden sm:inline">·</span>
          )}
          {contact?.customerCareEmail && (
            <a
              href={`mailto:${contact.customerCareEmail}`}
              className="flex items-center gap-1.5 hover:text-gold transition-colors"
              title="Email customer care"
            >
              <span className="material-symbols-outlined text-[14px]">mail</span>
              <span className="font-bold">{contact.customerCareEmail}</span>
            </a>
          )}
          <LangToggle tone="dark" />
        </div>
      </div>
    </div>
  );
}

function TopAppBar({ user, onLogout }: { user: SessionUser | null; onLogout: () => void }) {
  const { t } = useT();
  return (
    <header className="bg-white/95 backdrop-blur-md fixed top-0 z-50 w-full border-b border-yellow-600/20 shadow-sm">
      <CustomerCareBar />
      <div className="flex justify-between items-center px-4 md:px-6 py-3 max-w-[1440px] mx-auto">
        <div className="flex items-center gap-8">
          <Brand />
          <nav className="hidden md:flex gap-6" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `font-serif font-bold tracking-tight transition-colors ${
                  isActive
                    ? 'text-primary border-b-2 border-gold'
                    : 'text-slate-600 hover:text-primary'
                }`
              }
            >
              {t('nav_explore')}
            </NavLink>
            {user?.role === 'OWNER' && (
              <NavLink
                to="/owner/dashboard"
                className={({ isActive }) =>
                  `font-serif font-bold tracking-tight transition-colors ${
                    isActive ? 'text-primary border-b-2 border-gold' : 'text-slate-600 hover:text-primary'
                  }`
                }
              >
                My Halls
              </NavLink>
            )}
            {user?.role === 'ADMIN' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `font-serif font-bold tracking-tight transition-colors ${
                    isActive ? 'text-primary border-b-2 border-gold' : 'text-slate-600 hover:text-primary'
                  }`
                }
              >
                Admin
              </NavLink>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">

          <button
            type="button"
            aria-label="Notifications"
            className="p-2 text-primary hover:bg-surface-container-high rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">notifications</span>
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-xs text-on-surface-variant">
                Hi, <span className="font-bold text-primary">{user.name.split(' ')[0]}</span>
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="hidden sm:inline-flex text-xs font-bold uppercase tracking-widest text-primary border border-gold/60 px-4 py-2 rounded-lg hover:bg-gold/10 transition"
              >
                Sign out
              </button>
              <button
                type="button"
                aria-label="Account"
                className="sm:hidden p-2 text-primary hover:bg-surface-container-high rounded-full transition-colors"
                onClick={onLogout}
              >
                <span className="material-symbols-outlined">account_circle</span>
              </button>
            </div>
          ) : (
            <Link
              to="/owner/login"
              className="hidden sm:inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-primary text-white px-4 py-2 rounded-lg shadow-md shadow-red-900/10 hover:bg-primary-container transition"
            >
              {t('nav_list_hall')}
            </Link>
          )}

          <Link
            to="/owner/login"
            aria-label="Account"
            className="sm:hidden p-2 text-primary hover:bg-surface-container-high rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">account_circle</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  const [contact, setContact] = useState<{ customerCarePhone: string; customerCareEmail: string } | null>(null);
  useEffect(() => {
    api.getSettings()
      .then((s) => setContact({ customerCarePhone: s.customerCarePhone, customerCareEmail: s.customerCareEmail }))
      .catch(() => { /* silent */ });
  }, []);

  return (
    <footer className="bg-slate-50 border-t-2 border-yellow-600/10 py-12 px-6 md:px-8 relative overflow-hidden mt-auto">
      <div className="kolam-bg absolute inset-0 pointer-events-none" aria-hidden />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-[1280px] mx-auto relative z-10">
        <div>
          <div className="mb-4">
            <Brand />
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed max-w-xs font-serif">
            Find and book verified marriage halls across Tamil Nadu — real-time availability,
            transparent pricing, direct contact with owners.
          </p>

          {(contact?.customerCarePhone || contact?.customerCareEmail) && (
            <div className="mt-6 pt-4 border-t border-yellow-600/10">
              <h6 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                Customer care
              </h6>
              {contact.customerCarePhone && (
                <a
                  href={`tel:${contact.customerCarePhone}`}
                  className="flex items-center gap-2 text-sm text-primary font-bold hover:underline mb-1"
                >
                  <span className="material-symbols-outlined text-base">call</span>
                  <span className="tabular-nums">{contact.customerCarePhone}</span>
                </a>
              )}
              {contact.customerCareEmail && (
                <a
                  href={`mailto:${contact.customerCareEmail}`}
                  className="flex items-center gap-2 text-sm text-primary font-bold hover:underline"
                >
                  <span className="material-symbols-outlined text-base">mail</span>
                  {contact.customerCareEmail}
                </a>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <h6 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
              For guests
            </h6>
            <Link to="/" className="text-xs text-slate-500 hover:text-primary transition-colors font-serif">Search halls</Link>
            <a href="#how" className="text-xs text-slate-500 hover:text-primary transition-colors font-serif">How it works</a>
            <a href="#faq" className="text-xs text-slate-500 hover:text-primary transition-colors font-serif">FAQ</a>
          </div>
          <div className="flex flex-col gap-3">
            <h6 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
              For owners
            </h6>
            <Link to="/owner/register" className="text-xs text-slate-500 hover:text-primary transition-colors font-serif">List your hall</Link>
            <Link to="/owner/login" className="text-xs text-slate-500 hover:text-primary transition-colors font-serif">Owner sign in</Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-yellow-600/10 shadow-sm">
          <h6 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Newsletter</h6>
          <p className="text-[11px] text-on-surface-variant mb-4 font-serif italic">
            Auspicious dates and new venue launches — straight to your inbox.
          </p>
          <div className="flex border border-slate-200 rounded overflow-hidden">
            <input
              className="flex-1 px-3 py-2 text-xs border-none focus:ring-0"
              placeholder="Your email"
              type="email"
            />
            <button className="bg-primary text-white px-4 py-2 text-[11px] font-bold uppercase tracking-widest">
              Join
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto mt-10 pt-6 border-t border-slate-200 text-center relative z-10">
        <p className="text-[11px] font-serif text-slate-400">
          © {new Date().getFullYear()} CheckNBook. Tradition meets elegance.
        </p>
      </div>
    </footer>
  );
}

function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 w-full z-50 bg-white border-t border-yellow-600/30 rounded-t-xl shadow-[0_-5px_15px_rgba(0,0,0,0.05)] flex justify-around items-center h-16 pb-safe px-4">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `flex flex-col items-center gap-1 ${isActive ? 'text-primary font-bold scale-110' : 'text-slate-400'}`
        }
      >
        {({ isActive }) => (
          <>
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
            >
              temple_hindu
            </span>
            <span className="text-[10px] uppercase tracking-widest font-medium">Explore</span>
          </>
        )}
      </NavLink>
      <button type="button" className="flex flex-col items-center gap-1 text-slate-400">
        <span className="material-symbols-outlined">favorite</span>
        <span className="text-[10px] uppercase tracking-widest font-medium">Favorites</span>
      </button>
      <button type="button" className="flex flex-col items-center gap-1 text-slate-400">
        <span className="material-symbols-outlined">calendar_month</span>
        <span className="text-[10px] uppercase tracking-widest font-medium">Bookings</span>
      </button>
      <NavLink
        to="/owner/login"
        className={({ isActive }) =>
          `flex flex-col items-center gap-1 ${isActive ? 'text-primary font-bold' : 'text-slate-400'}`
        }
      >
        <span className="material-symbols-outlined">person</span>
        <span className="text-[10px] uppercase tracking-widest font-medium">Account</span>
      </NavLink>
    </nav>
  );
}
