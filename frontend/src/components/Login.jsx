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

  const input = 'w-full bg-background border border-accent text-sm-mono p-2 focus:outline-none focus:border-muted';
  const button = 'w-full border border-accent bg-accent text-white text-sm-mono uppercase py-2 disabled:opacity-40';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm border border-accent bg-surface p-6">
        <h1 className="text-title-mono font-bold uppercase mb-1">Stock Dashboard</h1>
        <p className="text-xs-mono text-muted mb-6">Anmelden, um Kurse zu laden. Deine Depots bleiben auf diesem Gerät.</p>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block text-xs-mono uppercase text-muted">E-Mail</label>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            <button type="submit" disabled={busy || !email} className={button}>
              <Mail size={14} className="inline mr-2" />{busy ? 'Sende…' : 'Code senden'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <label className="block text-xs-mono uppercase text-muted">Code aus der E-Mail an {email}</label>
            <input
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${input} tracking-[0.5em] text-center text-lg`}
            />
            <button type="submit" disabled={busy || code.length < 6} className={button}>
              <KeyRound size={14} className="inline mr-2" />{busy ? 'Prüfe…' : 'Anmelden'}
            </button>
            <button type="button" onClick={() => { setStep('email'); setCode(''); setMessage(''); }} className="text-xs-mono text-muted hover:text-white">
              <ArrowLeft size={12} className="inline mr-1" />andere E-Mail / neuer Code
            </button>
          </form>
        )}

        {message && <p className="text-xs-mono text-neg mt-4">{message}</p>}
      </div>
    </div>
  );
};

export default Login;
