// Import necessary modules
import { auth } from './firebase-config.js';
import { getApiUrl } from './utils.js';

// Configuration - will be loaded from server
let CONFIG = {
  apiKey: '',
  email: '',
  password: ''
};

let token = null;
let userId = null;
let users = [];
let configLoaded = false;

// Load credentials from server
async function loadCredentials() {
  if (configLoaded) return CONFIG;

  try {
    // Get current user's auth token
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('[WhenIWork] No authenticated user - cannot load credentials');
      return CONFIG;
    }

    const idToken = await currentUser.getIdToken();

    // Fetch credentials from server
    const response = await fetch(getApiUrl('wheniwork-credentials'), {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load WhenIWork credentials: ${response.statusText}`);
    }

    const credentials = await response.json();
    CONFIG = credentials;
    configLoaded = true;
    console.log('[WhenIWork] Credentials loaded successfully');
    return CONFIG;

  } catch (error) {
    console.error('[WhenIWork] Error loading credentials:', error);
    return CONFIG;
  }
}

// Login and initialize
async function login() {
  try {
    // Load credentials from server first
    await loadCredentials();

    if (!CONFIG.apiKey || !CONFIG.email || !CONFIG.password) {
      throw new Error('WhenIWork credentials not configured');
    }

    const loginResponse = await fetch('https://api.login.wheniwork.com/login', {
      method: 'POST',
      headers: {
        'W-Key': CONFIG.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: CONFIG.email,
        password: CONFIG.password
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    console.log('[WhenIWork] Login response:', loginData);
    token = loginData.token;
    userId = loginData.person?.id || loginData.user?.id || loginData.users?.[0]?.id;

    console.log('[WhenIWork] Login successful, userId:', userId);
    return { token, userId };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// Get all users
async function getAllUsers() {
  try {
    console.log('[WhenIWork] Fetching users with token:', token ? 'present' : 'missing', 'userId:', userId);
    const usersResponse = await fetch('https://api.wheniwork.com/2/users', {
      headers: {
        'W-Token': token
      }
    });

    if (!usersResponse.ok) {
      const errorText = await usersResponse.text();
      console.error('[WhenIWork] Users API error:', usersResponse.status, errorText);
      throw new Error(`Failed to fetch users: ${usersResponse.status}`);
    }

    const usersData = await usersResponse.json();
    users = usersData.users || [];

    console.log(`[WhenIWork] Fetched ${users.length} users`);
    return users;
  } catch (error) {
    console.error('[WhenIWork] Error fetching users:', error);
    throw error;
  }
}

// Get shifts with date range
async function getShifts(startDate, endDate) {
  try {
    const shiftsUrl = 'https://api.wheniwork.com/2/shifts';
    const params = new URLSearchParams({
      start: startDate || new Date().toISOString().split('T')[0], // Default to today
      end: endDate || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0] // Default to 30 days from now
    });

    const shiftsResponse = await fetch(`${shiftsUrl}?${params}`, {
      headers: {
        'W-Token': token
      }
    });

    if (!shiftsResponse.ok) {
      throw new Error(`Failed to fetch shifts: ${shiftsResponse.status}`);
    }

    const shiftsData = await shiftsResponse.json();
    console.log(`Fetched ${shiftsData.shifts?.length || 0} shifts`);
    return shiftsData;
  } catch (error) {
    console.error('Error fetching shifts:', error);
    throw error;
  }
}

// Search for user by name
function getUser(searchString) {
  if (!searchString || !users.length) {
    console.log('No search string or users not loaded');
    return [];
  }

  const searchLower = searchString.toLowerCase();
  const filteredUsers = users.filter(user => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    const email = (user.email || '').toLowerCase();
    
    return fullName.includes(searchLower) || email.includes(searchLower);
  });

  console.log(`Found ${filteredUsers.length} matching users`);
  return filteredUsers;
}

// Initialize everything
async function initialize() {
  try {
    await loadCredentials();
    await login();
    await getAllUsers();

    // Fetch shifts for a wide date range (academic year)
    const now = new Date();
    const startDate = new Date(now.getFullYear(), 7, 1); // Aug 1 this year
    const endDate = new Date(now.getFullYear() + 1, 7, 31); // July 31 next year

    const shiftsData = await getShifts(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    // Associate shifts with users
    const shiftsArray = shiftsData.shifts || [];
    console.log(`[WhenIWork] Associating ${shiftsArray.length} shifts with ${users.length} users`);

    // Initialize shifts array for each user
    users.forEach(user => {
      user.shifts = [];
    });

    // Group shifts by user ID
    shiftsArray.forEach(shift => {
      const user = users.find(u => u.id === shift.user_id);
      if (user) {
        user.shifts.push(shift);
      }
    });

    console.log('[WhenIWork] Initialization complete');
  } catch (error) {
    console.error('[WhenIWork] Initialization failed:', error);
  }
}

// Export the loadCredentials function so it can be called before other functions
export { loadCredentials, initialize, login, getAllUsers, getUser, getShifts, getScheduledWeek, getScheduledQuarter, getScheduledYear };

async function getScheduledWeek() {
    if (!token) {
        await login();
        await getAllUsers();
    }
    const now = new Date();
    let hoursToAdd = 0;
    for (var i = 0; i < users.length; i++) {
        const user = users[i];
        if (!user.shifts || user.shifts.length === 0) continue;
        for (var j = 0; j < user.shifts.length; j++) {
            const shift = user.shifts[j];
            const shiftDate = new Date(shift.start_time);
            const diffTime = Math.abs(shiftDate - now);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            // Check if shiftDate is in the current week (Sunday-Saturday)
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            if (shiftDate >= startOfWeek && shiftDate <= endOfWeek) {
                console.log(`User ${user.first_name} ${user.last_name} has a shift on ${shiftDate}`);
                hoursToAdd += shift.hours;
            }
        }
    }
    return hoursToAdd;

}

async function getScheduledQuarter() {
    if (!token) {
        await login();
        await getAllUsers();
    }
    // Fetch quarter dates (same as loadQuarterDates in manager.js)
    let quarterDates = null;
    try {
        console.log('[getScheduledQuarter] Loading DePaul academic quarter dates...');
        const response = await fetch(getApiUrl('quarter-dates'));

        if (!response.ok) {
            throw new Error(`Failed to fetch quarter dates: ${response.statusText}`);
        }

        quarterDates = await response.json();
        console.log('[getScheduledQuarter] Quarter dates loaded:', quarterDates);
    } catch (error) {
        console.error('[getScheduledQuarter] Error loading quarter dates:', error);
        return 0;
    }

    if (!quarterDates || !quarterDates.quarters) {
        console.error('[getScheduledQuarter] Quarter data not loaded!');
        return 0;
    }

    const now = new Date();
    let hoursToAdd = 0;

    // Get all quarters in chronological order (same logic as manager.js)
    const quarterOrder = ['autumn', 'winter', 'spring', 'summer'];
    const sortedQuarters = quarterOrder
        .filter(q => quarterDates.quarters[q])
        .map(q => ({
            name: q,
            start: new Date(quarterDates.quarters[q].start),
            displayName: quarterDates.quarters[q].name
        }));

    // Find which quarter we're currently in
    let quarterStart = null;
    let quarterEnd = null;

    for (let i = 0; i < sortedQuarters.length; i++) {
        const quarter = sortedQuarters[i];
        const nextQuarter = sortedQuarters[i + 1];

        const qStart = quarter.start;
        // Quarter ends when next quarter starts, or Aug 1 next year if last quarter
        const qEnd = nextQuarter ? nextQuarter.start : new Date(quarter.start.getFullYear() + 1, 8, 1);

        if (now >= qStart && now < qEnd) {
            quarterStart = qStart;
            quarterEnd = qEnd;
            console.log(`[getScheduledQuarter] Current quarter: ${quarter.displayName}`);
            break;
        }
    }

    if (!quarterStart || !quarterEnd) {
        console.log('[getScheduledQuarter] Not currently in any academic quarter');
        return 0;
    }

    // Iterate through users and shifts
    for (var i = 0; i < users.length; i++) {
        const user = users[i];
        if (!user.shifts || user.shifts.length === 0) continue;
        for (var j = 0; j < user.shifts.length; j++) {
            const shift = user.shifts[j];
            const shiftDate = new Date(shift.start_time);

            if (shiftDate >= quarterStart && shiftDate < quarterEnd) {
                console.log(`User ${user.first_name} ${user.last_name} has a shift on ${shiftDate}`);
                hoursToAdd += shift.hours;
            }
        }
    }

    return hoursToAdd;
}

async function getScheduledYear() {
    if (!token) {
        await login();
        await getAllUsers();
    }
    // Fetch quarter dates (same as loadQuarterDates in manager.js)
    let quarterDates = null;
    try {
        console.log('[getScheduledYear] Loading DePaul academic quarter dates...');
        const response = await fetch(getApiUrl('quarter-dates'));

        if (!response.ok) {
            throw new Error(`Failed to fetch quarter dates: ${response.statusText}`);
        }

        quarterDates = await response.json();
        console.log('[getScheduledYear] Quarter dates loaded:', quarterDates);
    } catch (error) {
        console.error('[getScheduledYear] Error loading quarter dates:', error);
        return 0;
    }

    if (!quarterDates || !quarterDates.quarters) {
        console.error('[getScheduledYear] Quarter data not loaded!');
        return 0;
    }

    // Academic year runs from Autumn start to next Autumn start (same logic as manager.js)
    const autumn = quarterDates.quarters.autumn;
    if (!autumn) {
        console.error('[getScheduledYear] Quarter data incomplete (missing autumn)!');
        return 0;
    }

    const academicYearStart = new Date(autumn.start);
    const academicYearEnd = new Date(academicYearStart);
    academicYearEnd.setFullYear(academicYearEnd.getFullYear() + 1);

    console.log(`[getScheduledYear] Academic year: ${academicYearStart.toLocaleDateString()} - ${academicYearEnd.toLocaleDateString()}`);

    let hoursToAdd = 0;

    // Iterate through users and shifts
    for (var i = 0; i < users.length; i++) {
        const user = users[i];
        if (!user.shifts || user.shifts.length === 0) continue;
        for (var j = 0; j < user.shifts.length; j++) {
            const shift = user.shifts[j];
            const shiftDate = new Date(shift.start_time);

            if (shiftDate >= academicYearStart && shiftDate < academicYearEnd) {
                console.log(`User ${user.first_name} ${user.last_name} has a shift on ${shiftDate}`);
                hoursToAdd += shift.hours;
            }
        }
    }

    return hoursToAdd;
}

// Usage example:
// await initialize();
// const foundUsers = getUser('john');
// const shifts = await getShifts('2025-11-01', '2025-11-30');