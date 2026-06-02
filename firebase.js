import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCTWwwTk272ptAsNCkgxjebqetmFOM9F1M",
  authDomain: "cccc-1d7af.firebaseapp.com",
  projectId: "cccc-1d7af",
  storageBucket: "cccc-1d7af.firebasestorage.app",
  messagingSenderId: "44957397152",
  appId: "1:44957397152:web:83aee32b78e47a713099c5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);