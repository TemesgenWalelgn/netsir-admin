import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB7L9Fqxf9Mh5aarNeS7xUe_yVA8p6KjO4",
  authDomain: "netsir-lyrics.firebaseapp.com",
  projectId: "netsir-lyrics",
  storageBucket: "netsir-lyrics.firebasestorage.app",
  messagingSenderId: "833425007162",
  appId: "1:833425007162:web:7a0fa10f11ffa59f998b03",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;