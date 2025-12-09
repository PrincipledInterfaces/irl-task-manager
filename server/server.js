const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const https = require('https');
const { initSlack, sendTaskNotification } = require('./slack');
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

// Initialize Slack integration
initSlack();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WhenIWork credentials endpoint (authenticated)
app.get('/api/wheniwork-credentials', async (req, res) => {
  try {
    // Get the ID token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    // Check if user exists in database (any authenticated user can access WhenIWork credentials)
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Permission denied - User not found in database' });
    }

    // Return credentials from environment variables
    const credentials = {
      apiKey: process.env.WHENIWORK_API_KEY || '',
      email: process.env.WHENIWORK_EMAIL || '',
      password: process.env.WHENIWORK_PASSWORD || ''
    };

    // Check if credentials are configured
    if (!credentials.apiKey || !credentials.email || !credentials.password) {
      console.warn('WhenIWork credentials not fully configured in environment variables');
      return res.status(503).json({
        error: 'WhenIWork credentials not configured on server',
        configured: false
      });
    }

    res.json(credentials);

  } catch (error) {
    console.error('Error retrieving WhenIWork credentials:', error);
    res.status(500).json({ error: 'Failed to retrieve credentials' });
  }
});

// WhenIWork credentials endpoint for signup (unauthenticated)
// This allows the signup page to search for WhenIWork users without being logged in
app.get('/api/wheniwork-credentials-public', async (req, res) => {
  try {
    // Return credentials from environment variables
    const credentials = {
      apiKey: process.env.WHENIWORK_API_KEY || '',
      email: process.env.WHENIWORK_EMAIL || '',
      password: process.env.WHENIWORK_PASSWORD || ''
    };

    // Check if credentials are configured
    if (!credentials.apiKey || !credentials.email || !credentials.password) {
      console.warn('WhenIWork credentials not fully configured in environment variables');
      return res.status(503).json({
        error: 'WhenIWork credentials not configured on server',
        configured: false
      });
    }

    res.json(credentials);

  } catch (error) {
    console.error('Error retrieving WhenIWork credentials:', error);
    res.status(500).json({ error: 'Failed to retrieve credentials' });
  }
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

    // Extract quarter dates (start dates only)
    const quarters = {};

    // Map quarter names to their abbreviations
    const quarterMap = {
      'Autumn': 'AQ',
      'Winter': 'WQ',
      'Spring': 'SQ',
      'Summer': 'SUMMER'
    };

    // Extract start year from academic year string (e.g., "2025-2026" -> "2025")
    // All quarters in an academic year use the start year in their naming
    const [startYear] = targetYear.split('-');

    Object.entries(quarterMap).forEach(([quarterName, abbrev]) => {
      // All quarters use the academic year start year (e.g., for 2025-2026, all quarters are named with 2025)
      const year = startYear;

      // Look for begin pattern with flexible matching
      // Matches: "BEGIN AQ2025 ALL CLASSES", "Begin SQ2026 Day & Evening Classes", "BEGIN SUMMER 2026 TERM"
      const beginPattern = new RegExp(`BEGIN ${abbrev}\\s*${year}`, 'i');
      const beginEvent = allYearEvents.find(e => e.LinkTitle && beginPattern.test(e.LinkTitle));

      console.log(`${quarterName}: Begin=${!!beginEvent}`);
      if (beginEvent) {
        console.log(`  Begin: "${beginEvent.LinkTitle}" on ${beginEvent.Date}`);
        quarters[quarterName.toLowerCase()] = {
          start: new Date(beginEvent.Date).toISOString(),
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

    // Remove user from all assigned tasks and clean up WhenIWork shifts
    if (userData.assignedJobIds && userData.assignedJobIds.length > 0) {
      for (const taskId of userData.assignedJobIds) {
        try {
          const taskRef = db.collection('tasks').doc(taskId);
          const taskDoc = await taskRef.get();

          if (taskDoc.exists) {
            const taskData = taskDoc.data();

            // Clean up WhenIWork shift if it exists
            if (taskData.wiwShiftIDs && taskData.wiwShiftIDs[userId]) {
              const updatedWiwShiftIDs = { ...taskData.wiwShiftIDs };
              delete updatedWiwShiftIDs[userId];

              await taskRef.update({
                assignedTo: admin.firestore.FieldValue.arrayRemove(userId),
                assignedToNames: admin.firestore.FieldValue.arrayRemove(userName),
                wiwShiftIDs: updatedWiwShiftIDs
              });
            } else {
              await taskRef.update({
                assignedTo: admin.firestore.FieldValue.arrayRemove(userId),
                assignedToNames: admin.firestore.FieldValue.arrayRemove(userName)
              });
            }
          }
        } catch (error) {
          console.warn(`Task ${taskId} not found or error updating:`, error.message);
        }
      }
      console.log(`Removed ${userName} from tasks`);
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

// Process recurring tasks - creates new instances of recurring tasks
async function processRecurringTasks() {
  console.log('[Recurring Tasks] Starting recurring task processing...');

  try {
    const now = new Date();
    const tasksRef = db.collection('tasks');
    const recurringTasksSnapshot = await tasksRef.where('recurring', '==', true).get();

    console.log(`[Recurring Tasks] Found ${recurringTasksSnapshot.size} recurring tasks`);

    const newTasks = [];

    for (const taskDoc of recurringTasksSnapshot.docs) {
      const task = { id: taskDoc.id, ...taskDoc.data() };

      // Skip if no due date
      if (!task.due) {
        console.log(`[Recurring Tasks] Skipping "${task.title}" - no due date`);
        continue;
      }

      const dueDate = task.due.toDate();

      // Check if due date has passed
      if (dueDate > now) {
        console.log(`[Recurring Tasks] Skipping "${task.title}" - not yet due`);
        continue;
      }

      // Calculate next due date based on recurrence frequency
      let nextDueDate = new Date(dueDate);
      const frequency = task.recurrenceFrequency || 'weekly';

      switch (frequency) {
        case 'daily':
          nextDueDate.setDate(nextDueDate.getDate() + 1);
          break;
        case 'weekly':
          nextDueDate.setDate(nextDueDate.getDate() + 7);
          break;
        case 'biweekly':
          nextDueDate.setDate(nextDueDate.getDate() + 14);
          break;
        case 'monthly':
          nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          break;
        case 'custom':
          // For custom frequency, find next occurrence based on selected days
          if (task.recurrenceDays && task.recurrenceDays.length > 0) {
            const currentDay = nextDueDate.getDay();
            const sortedDays = [...task.recurrenceDays].sort((a, b) => a - b);

            // Find next day in the list
            let nextDay = sortedDays.find(day => day > currentDay);

            if (nextDay !== undefined) {
              // Next occurrence is this week
              const daysToAdd = nextDay - currentDay;
              nextDueDate.setDate(nextDueDate.getDate() + daysToAdd);
            } else {
              // Next occurrence is next week (first day in the list)
              const daysToAdd = (7 - currentDay) + sortedDays[0];
              nextDueDate.setDate(nextDueDate.getDate() + daysToAdd);
            }
          } else {
            // Default to weekly if no days specified
            nextDueDate.setDate(nextDueDate.getDate() + 7);
          }
          break;
        default:
          nextDueDate.setDate(nextDueDate.getDate() + 7);
      }

      console.log(`[Recurring Tasks] Processing "${task.title}"`);
      console.log(`  Old due date: ${dueDate.toISOString()}`);
      console.log(`  New due date: ${nextDueDate.toISOString()}`);

      // Update the original task with new due date and reset completion/assignments
      await taskDoc.ref.update({
        due: admin.firestore.Timestamp.fromDate(nextDueDate),
        completed: false,
        assignedTo: [],
        assignedToNames: []
      });

      console.log(`[Recurring Tasks] Updated "${task.title}" with new due date`);

      newTasks.push({
        id: task.id,
        title: task.title,
        oldDueDate: dueDate,
        newDueDate: nextDueDate
      });
    }

    console.log(`[Recurring Tasks] Processed ${newTasks.length} recurring tasks`);
    return newTasks;

  } catch (error) {
    console.error('[Recurring Tasks] Error processing recurring tasks:', error);
    throw error;
  }
}

// Manual endpoint to trigger recurring task processing (for testing and manual runs)
app.post('/api/process-recurring-tasks', async (req, res) => {
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
      return res.status(403).json({ error: 'Permission denied - Only managers can trigger recurring task processing' });
    }

    // Process recurring tasks
    const processedTasks = await processRecurringTasks();

    res.json({
      success: true,
      message: `Processed ${processedTasks.length} recurring tasks`,
      processedTasks: processedTasks
    });

  } catch (error) {
    console.error('Error processing recurring tasks:', error);
    res.status(500).json({ error: `Failed to process recurring tasks: ${error.message}` });
  }
});

// Automated daily check for recurring tasks (runs at midnight)
// Note: For production, you should use a proper cron service like Cloud Scheduler or a cron job
// This is a simple in-memory scheduler that runs while the server is running
setInterval(async () => {
  const now = new Date();
  // Run at midnight (00:00)
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    console.log('[Recurring Tasks] Running daily recurring task check...');
    try {
      await processRecurringTasks();
    } catch (error) {
      console.error('[Recurring Tasks] Error in daily check:', error);
    }
  }
}, 60000); // Check every minute

// ==================== SLACK NOTIFICATION ENDPOINTS ====================

// Notify when a user is assigned to a task
app.post('/api/notify/task-assigned', async (req, res) => {
  try {
    // Get the ID token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    // Check if user exists in database
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Permission denied - User not found in database' });
    }

    // Get task and user data from request
    const { taskData, userData } = req.body;

    if (!taskData || !userData) {
      return res.status(400).json({ error: 'taskData and userData are required' });
    }

    // Send Slack notification
    const result = await sendTaskNotification('task-assigned', taskData, userData);

    res.json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Error sending task assigned notification:', error);
    res.status(500).json({ error: 'Failed to send notification', details: error.message });
  }
});

// Notify when a user unclaims a task
app.post('/api/notify/task-unclaimed', async (req, res) => {
  try {
    // Get the ID token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    // Check if user exists in database
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Permission denied - User not found in database' });
    }

    // Get task and user data from request
    const { taskData, userData } = req.body;

    if (!taskData || !userData) {
      return res.status(400).json({ error: 'taskData and userData are required' });
    }

    // Send Slack notification
    const result = await sendTaskNotification('task-unclaimed', taskData, userData);

    res.json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Error sending task unclaimed notification:', error);
    res.status(500).json({ error: 'Failed to send notification', details: error.message });
  }
});

// Notify when a task is completed
app.post('/api/notify/task-completed', async (req, res) => {
  try {
    // Get the ID token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    // Check if user exists in database
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Permission denied - User not found in database' });
    }

    // Get task and user data from request
    const { taskData, userData, assignedUsers } = req.body;

    if (!taskData || !userData) {
      return res.status(400).json({ error: 'taskData and userData are required' });
    }

    // Send Slack notification (with assigned users for @mentions)
    const result = await sendTaskNotification('task-completed', taskData, userData, { assignedUsers });

    res.json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Error sending task completed notification:', error);
    res.status(500).json({ error: 'Failed to send notification', details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`IRL Task Manager API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Recurring tasks will be processed daily at midnight`);
});
