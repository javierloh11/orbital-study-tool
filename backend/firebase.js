const {
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

if (getApps().length === 0) {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    // Production: Render environment variables
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(
          /\\n/g,
          "\n"
        ),
      }),
    });
  } else {
    // Local development
    const serviceAccount = require("./firebase-key.json");

    initializeApp({
      credential: cert(serviceAccount),
    });
  }
}

const db = getFirestore();
const auth = getAuth();

module.exports = {
  db,
  auth,
};