import { createContext, useContext, useEffect, useState } from 'react';

// Global "Beginner mode" — persisted in the browser. When on, pages hide raw
// indicators and show only the plain-English verdict + reason + simple risk/reward.
const BeginnerContext = createContext({ beginner: false, setBeginner: () => {} });

export function BeginnerProvider({ children }) {
  const [beginner, setBeginner] = useState(
    () => localStorage.getItem('tf_beginner') === '1'
  );
  useEffect(() => {
    localStorage.setItem('tf_beginner', beginner ? '1' : '0');
  }, [beginner]);
  return (
    <BeginnerContext.Provider value={{ beginner, setBeginner }}>
      {children}
    </BeginnerContext.Provider>
  );
}

export const useBeginner = () => useContext(BeginnerContext);
