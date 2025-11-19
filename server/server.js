const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
// Try to load from service-account-key.json file, fallback to env variable
let serviceAccount;
try {
  const fs = require('fs');
  const path = require('path');
  const keyPath = path.join(__dirname, 'service-account-key.json');
  serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  console.log('Loaded service account from service-account-key.json');
} catch (error) {
  // Fallback to environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    console.log('Loaded service account from environment variable');
  } else {
    console.error('Error: No service account key found!');
    console.error('Please create service-account-key.json or set FIREBASE_SERVICE_ACCOUNT_KEY');
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.firestore();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Delete user endpoint
app.post('/api/delete-user', async (req, res) => {
  try {
    // Get the ID token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the ID token and get the caller's UID
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    const callerUid = decodedToken.uid;

    // Check if caller is a manager
    const callerDoc = await db.collection('users').doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'manager') {
      return res.status(403).json({ error: 'Permission denied - Only managers can delete users' });
    }

    // Get the userId to delete from request body
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Prevent managers from deleting themselves
    if (userId === callerUid) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get the user document to check if they exist
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    const userData = userDoc.data();
    const userName = userData.fullName || 'Unknown User';

    // Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(userId);
      console.log(`Deleted Firebase Auth user: ${userId} (${userName})`);
    } catch (authError) {
      // If user doesn't exist in Auth, log it but continue
      console.warn(`Auth user not found: ${userId}`, authError.message);
    }

    // Remove user from all assigned tasks
    if (userData.assignedJobIds && userData.assignedJobIds.length > 0) {
      const batch = db.batch();

      for (const taskId of userData.assignedJobIds) {
        const taskRef = db.collection('tasks').doc(taskId);
        batch.update(taskRef, {
          assignedTo: admin.firestore.FieldValue.arrayRemove(userId),
          assignedToNames: admin.firestore.FieldValue.arrayRemove(userName)
        });
      }

      await batch.commit();
      console.log(`Removed ${userName} from ${userData.assignedJobIds.length} tasks`);
    }

    // Delete from Firestore
    await db.collection('users').doc(userId).delete();
    console.log(`Deleted Firestore document for user: ${userId} (${userName})`);

    res.json({
      success: true,
      message: `User ${userName} deleted successfully`,
      deletedUserId: userId
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: `Failed to delete user: ${error.message}` });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`IRL Task Manager API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
