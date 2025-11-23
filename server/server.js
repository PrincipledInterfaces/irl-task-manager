const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const https = require('https');
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

// Debug endpoint to see raw HTML
app.get('/api/debug-calendar', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    const fetchPage = () => {
      return new Promise((resolve, reject) => {
        https.get('https://academics.depaul.edu/calendar/Pages/default.aspx', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }, (response) => {
          let data = '';
          response.on('data', (chunk) => { data += chunk; });
          response.on('end', () => { resolve(data); });
        }).on('error', (error) => { reject(error); });
      });
    };

    const html = await fetchPage();

    // Save HTML to file for inspection
    const debugPath = path.join(__dirname, 'calendar-debug.html');
    fs.writeFileSync(debugPath, html);
    console.log('Saved HTML to:', debugPath);

    // Find any variables that might contain calendar data
    const lines = html.split('\n')
      .filter(line => line.includes('Calendar') || line.includes('Rows') || line.includes('Academic'))
      .slice(0, 100); // First 100 relevant lines

    // Look for JSON-like structures
    const jsonPatterns = html.match(/=\s*\[{/g);

    res.json({
      htmlLength: html.length,
      savedTo: debugPath,
      relevantLines: lines,
      hasCalendarVar: html.includes('Calendar'),
      hasRowsVar: html.includes('Rows'),
      hasDpuexp: html.includes('dpuexp'),
      jsonArrayCount: jsonPatterns ? jsonPatterns.length : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get academic quarter dates from DePaul calendar
app.get('/api/quarter-dates', async (req, res) => {
  try {
    console.log('Fetching DePaul academic calendar...');

    // Fetch the page using native https module
    const fetchPage = () => {
      return new Promise((resolve, reject) => {
        https.get('https://academics.depaul.edu/calendar/Pages/default.aspx', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }, (response) => {
          let data = '';

          response.on('data', (chunk) => {
            data += chunk;
          });

          response.on('end', () => {
            resolve(data);
          });
        }).on('error', (error) => {
          reject(error);
        });
      });
    };

    const html = await fetchPage();

    console.log(`Fetched HTML length: ${html.length} characters`);

    // Extract the JSON data from the page
    // Look for: dpuexp.Academic_Calendar.Current_Active = { Rows: [...] }
    const jsonMatch = html.match(/dpuexp\.Academic_Calendar\.Current_Active\s*=\s*\{\s*Rows:\s*(\[[\s\S]*?\])\s*\}/);

    if (!jsonMatch) {
      console.error('Could not find calendar data with pattern: dpuexp.Academic_Calendar.Current_Active = { Rows: [...] }');
      throw new Error('Could not find academic calendar data in page');
    }

    console.log('Found JSON match, attempting to parse...');
    const calendarData = JSON.parse(jsonMatch[1]);
    console.log(`Found ${calendarData.length} calendar entries`);

    // Get current year to determine which academic year to use
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    // Determine academic year (if we're in Aug-Dec, academic year is current-next, else previous-current)
    let academicYearString;
    if (currentMonth >= 7) { // August onwards
      academicYearString = `${currentYear}-${currentYear + 1}`;
    } else {
      academicYearString = `${currentYear - 1}-${currentYear}`;
    }

    console.log(`Looking for academic year: ${academicYearString}`);

    // Check what academic years are actually in the data
    const uniqueYears = [...new Set(calendarData.map(e => e.Academic_x0020_Calendar_x0020_Ye))];
    console.log('Available academic years in data:', uniqueYears);

    // Find the most recent academic year that has data
    let targetYear = academicYearString;
    if (!uniqueYears.includes(academicYearString)) {
      console.warn(`Academic year ${academicYearString} not found in data. Using most recent year.`);
      // Sort years and get the most recent
      const sortedYears = uniqueYears.sort().reverse();
      targetYear = sortedYears[0];
      console.log(`Using academic year: ${targetYear}`);
    }

    // First, let's see what events exist for this year
    const allYearEvents = calendarData.filter(event =>
      event.Academic_x0020_Calendar_x0020_Ye === targetYear
    );

    console.log(`Total events for ${targetYear}: ${allYearEvents.length}`);

    // See what event types exist
    const eventTypes = [...new Set(allYearEvents.map(e => e.Event_x0020_Type))];
    console.log('Event types in this year:', eventTypes);

    // Sample some link titles
    const sampleTitles = allYearEvents.slice(0, 10).map(e => e.LinkTitle);
    console.log('Sample link titles:', sampleTitles);

    // Filter for Begin/End Date events for the target academic year
    const relevantEvents = calendarData.filter(event =>
      event.Academic_x0020_Calendar_x0020_Ye === targetYear &&
      event.Event_x0020_Type === 'Begin/End Date' &&
      (event.LinkTitle.includes('Begin') || event.LinkTitle.includes('End'))
    );

    console.log(`Found ${relevantEvents.length} relevant events for ${targetYear}`);

    // Extract quarter dates
    const quarters = {};

    // Map quarter names to their abbreviations
    const quarterMap = {
      'Autumn': 'AQ',
      'Winter': 'WQ',
      'Spring': 'SQ',
      'Summer': 'SUM'
    };

    // Extract year from academic year string (e.g., "2025-2026" -> "2025" for autumn, "2026" for others)
    const [startYear, endYear] = targetYear.split('-');

    Object.entries(quarterMap).forEach(([quarterName, abbrev]) => {
      // Autumn quarter uses the start year, others use the end year
      const year = quarterName === 'Autumn' ? startYear : endYear;

      // Look for begin pattern: "BEGIN AQ2025 ALL CLASSES"
      const beginPattern = new RegExp(`BEGIN ${abbrev}${year} ALL CLASSES`, 'i');
      const beginEvent = allYearEvents.find(e => beginPattern.test(e.LinkTitle));

      // Look for end pattern: "END OF AUTUMN QUARTER 2025"
      const endPattern = new RegExp(`END OF ${quarterName.toUpperCase()} QUARTER ${year}`, 'i');
      const endEvent = allYearEvents.find(e => endPattern.test(e.LinkTitle));

      console.log(`${quarterName}: Begin=${!!beginEvent}, End=${!!endEvent}`);
      if (beginEvent) console.log(`  Begin: "${beginEvent.LinkTitle}" on ${beginEvent.Date}`);
      if (endEvent) console.log(`  End: "${endEvent.LinkTitle}" on ${endEvent.Date}`);

      if (beginEvent && endEvent) {
        quarters[quarterName.toLowerCase()] = {
          start: new Date(beginEvent.Date).toISOString(),
          end: new Date(endEvent.Date).toISOString(),
          name: quarterName
        };
      }
    });

    console.log('Extracted quarter dates:', quarters);

    // Return the quarters with academic year info
    res.json({
      academicYear: targetYear,
      requestedYear: academicYearString,
      quarters: quarters,
      fetchedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching quarter dates:', error);
    res.status(500).json({
      error: 'Failed to fetch quarter dates',
      message: error.message
    });
  }
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
