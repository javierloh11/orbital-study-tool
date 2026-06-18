import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAHRXKstt9gsTbSS3R_9qAnU4uEoBjDSOo",
  authDomain: "stitch-io-9fc27.firebaseapp.com",
  projectId: "stitch-io-9fc27",
  storageBucket: "stitch-io-9fc27.firebasestorage.app",
  messagingSenderId: "312196606593",
  appId: "1:312196606593:web:e07add90cdb6ea00a7fb80"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);