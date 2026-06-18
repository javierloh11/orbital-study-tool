const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const serviceAccount = require("./firebase-key.json");

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert(serviceAccount),
      })
    : getApps()[0];

const db = getFirestore(app);
const auth = getAuth(app);

module.exports = {
  db,
  auth,
};