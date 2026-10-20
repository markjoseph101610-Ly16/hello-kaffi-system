// public/firebase-config.js
// Browser-ready (walang bundler): full CDN URLs ang lahat ng import.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBGcDVhzBzfiIKIrEiyc31YAg28i5YBpqs",
  authDomain: "hello-kaffi-hybrid.firebaseapp.com",
  projectId: "hello-kaffi-hybrid",
  storageBucket: "hello-kaffi-hybrid.firebasestorage.app",
  messagingSenderId: "966898943973",
  appId: "1:966898943973:web:50056984ad6ff57a9f910c",
  measurementId: "G-EKDTEHBN4W"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export {
  app,
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
};