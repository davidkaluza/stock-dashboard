import React, { useState } from 'react';
import { Mail, KeyRound, ArrowLeft } from 'lucide-react';

// Anmeldung per 6-stelligem Code (nicht per Link): auf dem iPhone öffnet ein Link Safari statt der installierten App.
const Login = ({ client }) => {
  const [email, setEmail] = useState(() => localStorage.getItem('loginEmail') || '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const sendCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    // shouldCreateUser: false – nur das in Supabase angelegte Konto darf sich anmelden
    const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) {
      setMessage(error.status === 422 || /signups not allowed|not found/i.test(error.message)
        ? 'Für diese E-Mail-Adresse gibt es kein Konto.'
        : `Code konnte nicht gesendet werden: ${error.message}`);
      return;
    }
    try { localStorage.setItem('loginEmail', email.trim()); } catch { /* egal */ }
    setStep('code');
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const { error } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setMessage('Der Code ist falsch oder abgelaufen.');
  };

  const input = 'w-full h-11 rounded-xl bg-surface2 px-3 focus:outline-none focus:ring-2 focus:ring-accent';
  const button = 'w-full h-11 rounded-xl bg-accent text-accent-fg font-semibold disabled:opacity-40 flex items-center justify-center';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 safe-area">
      <div className="w-full max-w-sm bg-surface rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-1">Stock Dashboard</h1>
        <p className="text-sm text-muted mb-6">Anmelden, um Kurse zu laden. Deine Depots bleiben auf diesem Gerät.</p>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block text-sm text-muted">E-Mail</label>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            <button type="submit" disabled={busy || !email} className={button}>
              <Mail size={14} className="inline mr-2" />{busy ? 'Sende…' : 'Code senden'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <label className="block text-sm text-muted">Code aus der E-Mail an {email}</label>
            <input
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${input} tracking-[0.5em] text-center text-lg`}
            />
            <button type="submit" disabled={busy || code.length < 6} className={button}>
              <KeyRound size={14} className="inline mr-2" />{busy ? 'Prüfe…' : 'Anmelden'}
            </button>
            <button type="button" onClick={() => { setStep('email'); setCode(''); setMessage(''); }} className="text-sm text-accent">
              <ArrowLeft size={12} className="inline mr-1" />andere E-Mail / neuer Code
            </button>
          </form>
        )}

        {message && <p className="text-sm text-neg mt-4">{message}</p>}
      </div>
    </div>
  );
};

export default Login;
