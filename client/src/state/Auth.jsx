import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as fbUpdateProfile,
} from 'firebase/auth';
import { auth, isFirebaseConfigured, db } from '../lib/firebase.js';
import { get, set, ref } from 'firebase/database';
import { createProfile, getProfile, ensureUsernameMapping } from '../lib/db.js';
import { isValidUsername } from '../lib/id.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFbUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        // fetch profile
        const snap = await get(ref(db, `profiles/${u.uid}`));
        if (snap.exists()) {
          setProfile(snap.val());
        } else {
          // create minimal profile if not exists (e.g. old flow)
          const minimal = {
            uid: u.uid,
            email: u.email || '',
            username: (u.email ? u.email.split('@')[0] : 'user').toLowerCase().replace(/[^a-z0-9\-_~]/g, '').slice(0, 20) || 'user',
            displayName: u.displayName || u.email?.split('@')[0] || 'User',
            avatar: '',
            createdAt: Date.now(),
          };
          // ensure uniqueness simplistic: append random if needed
          let finalUsername = minimal.username;
          let attempts = 0;
          while (attempts < 5) {
            const uSnap = await get(ref(db, `usernames/${finalUsername}`));
            if (!uSnap.exists() || uSnap.val() === u.uid) break;
            finalUsername = minimal.username + Math.floor(Math.random() * 99);
            attempts++;
          }
          minimal.username = finalUsername;
          await set(ref(db, `profiles/${u.uid}`), minimal);
          await set(ref(db, `usernames/${finalUsername}`), u.uid);
          setProfile(minimal);
        }
      } catch (e) {
        console.warn('[auth] profile fetch failed', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  async function register(email, username, password, displayName) {
    if (!isFirebaseConfigured) throw new Error('Firebase not configured');
    if (!isValidUsername(username)) throw new Error('Никнейм: 2-32 символа, только строчные латинские буквы/цифры, дефис, подчёркивание или тильда.');
    if (password.length < 6) throw new Error('Пароль минимум 6 символов.');
    // check username uniqueness
    const existing = await get(ref(db, `usernames/${username.toLowerCase()}`));
    if (existing.exists()) throw new Error('Этот никнейм уже занят');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    try {
      await ensureUsernameMapping(username.toLowerCase(), uid);
    } catch (e) {
      // rollback?
      throw e;
    }
    const prof = await createProfile(uid, { email, username: username.toLowerCase(), displayName: displayName || username });
    setProfile(prof);
    return prof;
  }

  async function login(email, password) {
    if (!isFirebaseConfigured) throw new Error('Firebase not configured');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // profile will be loaded by onAuthStateChanged; but also fetch now
    const p = await getProfile(cred.user.uid);
    if (p) setProfile(p);
    return p;
  }

  async function logout() {
    if (!auth) return;
    await signOut(auth);
    setFbUser(null);
    setProfile(null);
  }

  function updateUserLocal(updates) {
    setProfile(prev => ({ ...prev, ...updates }));
  }

  const user = profile
    ? {
        id: profile.uid,
        uid: profile.uid,
        email: profile.email,
        username: profile.username,
        displayName: profile.displayName || profile.username,
        avatar: profile.avatar || '',
        banner: profile.banner || '',
        bannerColor: profile.bannerColor || '#5865f2',
        status: profile.status || 'online',
        customStatus: profile.customStatus || '',
        ...profile,
      }
    : null;

  return (
    <AuthCtx.Provider value={{ fbUser, user, profile, loading, error, login, register, logout, updateUser: updateUserLocal, isConfigured: isFirebaseConfigured }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
