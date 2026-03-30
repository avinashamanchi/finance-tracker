import React, { createContext, useContext, useState, useCallback } from 'react';

const AUTH_KEY = 'finova_users';
const SESSION_KEY = 'finova_session';

function getUsers() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)||'{}'); } catch { return {}; } }
function saveUsers(u) { localStorage.setItem(AUTH_KEY,JSON.stringify(u)); }
function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); } catch { return null; } }
function saveSession(s) { if(s) localStorage.setItem(SESSION_KEY,JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession());

  const signUp = useCallback((name, email, password) => {
    const users = getUsers();
    const key = email.toLowerCase().trim();
    if (users[key]) return { error: 'Account already exists with this email.' };
    if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
    if (!name.trim()) return { error: 'Name is required.' };
    const newUser = { id: Date.now().toString(), name: name.trim(), email: key, password, createdAt: Date.now() };
    users[key] = newUser;
    saveUsers(users);
    const session = { id: newUser.id, name: newUser.name, email: key };
    saveSession(session);
    setUser(session);
    return { success: true };
  }, []);

  const signIn = useCallback((email, password) => {
    const users = getUsers();
    const key = email.toLowerCase().trim();
    const found = users[key];
    if (!found) return { error: 'No account found with that email.' };
    if (found.password !== password) return { error: 'Incorrect password.' };
    const session = { id: found.id, name: found.name, email: key };
    saveSession(session);
    setUser(session);
    return { success: true };
  }, []);

  const signOut = useCallback(() => { saveSession(null); setUser(null); }, []);

  return <AuthContext.Provider value={{ user, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
