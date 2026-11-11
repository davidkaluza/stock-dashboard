import React, { useEffect, useState } from 'react';
import App from './App.jsx';
import Login from './components/Login.jsx';
import { isConfigured, supabase } from './lib/supabase';

// Zeigt je nach Anmeldestatus Login oder Dashboard.
const Root = () => {
  const [session, setSession] = useState(undefined); // undefined = wird geprüft

  useEffect(() => {
    if (!isConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <div className="p-8 font-mono text-sm-mono max-w-xl">
        <h1 className="text-title-mono font-bold mb-2">Nicht konfiguriert</h1>
        <p className="text-muted">
          Diese Version wurde ohne <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> gebaut.
          Siehe <code>docs/einrichtung.md</code>.
        </p>
      </div>
    );
  }
  if (session === undefined) return null;
  if (!session) return <Login client={supabase} />;
  return <App client={supabase} session={session} />;
};

export default Root;
