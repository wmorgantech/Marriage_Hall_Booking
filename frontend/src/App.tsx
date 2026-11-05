import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import Search from './pages/Search';
import HallDetails from './pages/HallDetails';
import OwnerLogin from './pages/OwnerLogin';
import OwnerRegister from './pages/OwnerRegister';
import OwnerDashboard from './pages/OwnerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import AdminEditHall from './pages/AdminEditHall';
import NotFound from './pages/NotFound';
import { getSessionUser, setSessionUser, setToken, setRefreshToken, type SessionUser } from './api/client';
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
    setRefreshToken(null);
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

      <main className={`flex-1 overflow-x-clip ${isAdminArea || isHome ? '' : 'pt-24'}`}>
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/halls/:slug/:city" element={<HallDetails />} />
          <Route path="/halls/:id" element={<HallDetails />} />

          <Route path="/owner/login" element={<OwnerLogin />} />
          <Route path="/owner/register" element={<OwnerRegister />} />
          <Route path="/owner/dashboard" element={<OwnerDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/halls/:id/edit" element={<AdminEditHall />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {!isAdminArea && <SiteFooter />}
      {!isAdminArea && <MobileBottomNav user={user} onLogout={logout} />}

      <ToastHost />
    </div>
  );
}

function Brand({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <Link to="/" aria-label="CheckNBook home" className="flex items-center gap-3 group">
      <span
        className={`flex items-center justify-center h-10 w-10 rounded-xl font-serif font-bold text-lg shadow-sm ring-1 ring-gold/70 group-hover:ring-2 transition ${
          dark ? 'bg-white text-primary' : 'bg-primary text-white'
        }`}
        aria-hidden
      >
        CB
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={`text-2xl font-bold font-serif tracking-tight ${dark ? 'text-white' : 'text-primary'}`}>
            check<span className="text-gold">N</span>book
          </span>
          <span className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${dark ? 'text-white/60' : 'text-on-surface-variant'}`}>
            Find · Check · Book
          </span>
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
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
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
    <header className="bg-surface/95 backdrop-blur-md fixed top-0 z-50 w-full border-b border-gold/30 shadow-sm">
      <CustomerCareBar />
      <div className="flex justify-between items-center px-4 md:px-6 py-3 max-w-[1280px] mx-auto">
        <div className="contents">
          <Brand />
          <nav className="hidden md:flex flex-1 justify-center gap-10" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `font-sans font-semibold text-sm transition-colors pb-1 ${
                  isActive
                    ? 'text-primary border-b-2 border-primary'
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
                  `font-sans font-semibold text-sm transition-colors pb-1 ${
                    isActive ? 'text-primary border-b-2 border-primary' : 'text-slate-600 hover:text-primary'
                  }`
                }
              >
                My Halls
              </NavLink>
            )}
            {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `font-sans font-semibold text-sm transition-colors pb-1 ${
                    isActive ? 'text-primary border-b-2 border-primary' : 'text-slate-600 hover:text-primary'
                  }`
                }
              >
                Admin
              </NavLink>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
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
              <AccountMenu user={user} onLogout={onLogout} className="sm:hidden" />
            </div>
          ) : (
            <Link
              to="/admin/login"
              className="hidden sm:inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-primary text-white px-4 py-2 rounded-lg shadow-md shadow-primary/10 hover:bg-primary-container transition"
            >
              {t('nav_admin_login')}
            </Link>
          )}

          {!user && (
            <Link
              to="/admin/login"
              aria-label="Admin Login"
              className="sm:hidden p-2 text-primary hover:bg-surface-container-high rounded-full transition-colors"
            >
              <span className="material-symbols-outlined">admin_panel_settings</span>
            </Link>
          )}
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
    <footer className="bg-primary-container text-white border-t-4 border-gold py-8 px-6 md:px-8 relative overflow-hidden mt-auto">
      <div className="kolam-bg absolute inset-0 pointer-events-none" aria-hidden />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-[1280px] mx-auto relative z-10">
        <div>
          <div className="mb-4">
            <Brand dark />
          </div>
          <p className="text-xs text-white/60 leading-relaxed max-w-xs font-serif">
            Find marriage halls across Tamil Nadu — owner-maintained availability,
            transparent pricing, direct contact with owners.
          </p>

          {(contact?.customerCarePhone || contact?.customerCareEmail) && (
            <div className="mt-6 pt-4 border-t border-white/10">
              <h6 className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-2">
                Customer care
              </h6>
              {contact.customerCarePhone && (
                <a
                  href={`tel:${contact.customerCarePhone}`}
                  className="flex items-center gap-2 text-sm text-gold font-bold hover:underline mb-1"
                >
                  <span className="material-symbols-outlined text-base">call</span>
                  <span className="tabular-nums">{contact.customerCarePhone}</span>
                </a>
              )}
              {contact.customerCareEmail && (
                <a
                  href={`mailto:${contact.customerCareEmail}`}
                  className="flex items-center gap-2 text-sm text-gold font-bold hover:underline"
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
            <h6 className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-2">
              For guests
            </h6>
            <Link to="/" className="text-xs text-white/80 hover:text-gold transition-colors font-serif inline-block py-2">Search halls</Link>
          </div>
          <div className="flex flex-col gap-3">
            <h6 className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-2">
              For owners
            </h6>
            <Link to="/owner/register" className="text-xs text-white/80 hover:text-gold transition-colors font-serif inline-block py-2">List your hall</Link>
            <Link to="/owner/login" className="text-xs text-white/80 hover:text-gold transition-colors font-serif inline-block py-2">Owner sign in</Link>
          </div>
        </div>

      </div>

      <div className="max-w-[1280px] mx-auto mt-6 pt-4 border-t border-white/10 text-center relative z-10">
        <p className="text-[11px] font-serif text-white/50">
          © {new Date().getFullYear()} CheckNBook. Tradition meets elegance.
        </p>
      </div>
    </footer>
  );
}

/** Where "Account" leads for a signed-in user (customers have no dashboard: only the menu). */
function dashboardFor(user: SessionUser): { to: string; key: 'acct_my_halls' | 'acct_admin' } | null {
  if (user.role === 'OWNER') return { to: '/owner/dashboard', key: 'acct_my_halls' };
  if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') return { to: '/admin', key: 'acct_admin' };
  return null;
}

/** One Account control: signed in = a small menu (dashboard link by role + sign out); never signs out on a single tap. */
function AccountMenu({ user, onLogout, className = '', placement = 'header' }: {
  user: SessionUser; onLogout: () => void; className?: string; placement?: 'header' | 'bottom';
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const dash = dashboardFor(user);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={placement === 'header'
          ? 'p-2 text-primary hover:bg-surface-container-high rounded-full transition-colors'
          : `flex flex-col items-center gap-1 ${open ? 'text-primary font-bold' : 'text-slate-400'}`}
      >
        <span className="material-symbols-outlined">{placement === 'header' ? 'account_circle' : 'person'}</span>
        {placement === 'bottom' && <span className="text-[10px] uppercase tracking-widest font-medium">{t('acct_title')}</span>}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-[60] w-60 bg-white rounded-2xl shadow-soft-lg ring-1 ring-gold/40 p-2 ${
            placement === 'header' ? 'right-0 top-full mt-2' : 'right-0 bottom-full mb-3'
          }`}
        >
          <p className="px-3 py-2 text-xs text-on-surface-variant border-b border-gold/20 mb-1 truncate">
            {t('acct_signed_in_as', { vars: { name: user.name } })}
          </p>
          {dash && (
            <Link role="menuitem" to={dash.to} className="flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-bold text-primary hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>dashboard</span>{t(dash.key)}
            </Link>
          )}
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onLogout(); }} className="w-full flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-bold text-error hover:bg-error-container/40">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>logout</span>{t('acct_sign_out')}
          </button>
        </div>
      )}
    </div>
  );
}

function MobileBottomNav({ user, onLogout }: { user: SessionUser | null; onLogout: () => void }) {
  const { t } = useT();
  return (
    <nav className="lg:hidden fixed bottom-0 w-full z-50 bg-white border-t border-gold/30 rounded-t-xl shadow-[0_-5px_15px_rgba(0,0,0,0.05)] flex justify-around items-center h-16 pb-safe px-4">
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
      {user ? (
        <AccountMenu user={user} onLogout={onLogout} placement="bottom" />
      ) : (
        <NavLink
          to="/owner/login"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 ${isActive ? 'text-primary font-bold' : 'text-slate-400'}`
          }
        >
          <span className="material-symbols-outlined">person</span>
          <span className="text-[10px] uppercase tracking-widest font-medium">{t('acct_title')}</span>
        </NavLink>
      )}
    </nav>
  );
}
