import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD1CUyoT6X0Mb7fZ5KMQz5ifmZhxNH8LYg",
  authDomain: "studysync-web-75893.firebaseapp.com",
  projectId: "studysync-web-75893",
  storageBucket: "studysync-web-75893.firebasestorage.app",
  messagingSenderId: "454976413555",
  appId: "1:454976413555:web:2df6823311dec90115af06"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signupWithEmail = async (email, password, username) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName: username });
  return result.user;
};

export const loginWithEmail = async (email, password) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

export const logoutUser = async () => {
  await signOut(auth);
};

// Firebase sends reset email automatically to ANY email!
export const resetPassword = async (email) => {
  await sendPasswordResetEmail(auth, email);
};

export const getToken = async () => {
  const user = auth.currentUser;
  if (user) return await user.getIdToken();
  return null;
};

export default app;
