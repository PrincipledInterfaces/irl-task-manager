/**
 * One-time fix: reconcile task <-> user assignment discrepancies caused by the
 * recurring-task bug that wiped assignedTo/assignedToNames in-place.
 *
 * For Direction A (main bug):
 *   If a user has a task in assignedJobIds but isn't in the task's assignedTo,
 *   it means the recurring processor bumped that task and wiped their assignment.
 *   We create ONE new non-recurring catch-up task (copy of the original, same due
 *   date) for all affected users, update their assignedJobIds to point to the new
 *   task, and leave the original task untouched.
 *
 * For Direction B (inverse):
 *   If a task lists a user in assignedTo but the user doesn't have the task in
 *   assignedJobIds, simply add it to the user's assignedJobIds.
 *
 * Run with:  node fix-assignment-sync.js
 * Pass --dry-run to preview changes without writing anything.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) {
  console.log('=== DRY RUN — no changes will be written ===\n');
}

let serviceAccount;
try {
  const keyPath = path.join(__dirname, 'service-account-key.json');
  serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
} catch {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } else {
    console.error('No service account key found. Add service-account-key.json or set FIREBASE_SERVICE_ACCOUNT_KEY.');
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.firestore();

async function run() {
  const usersSnap = await db.collection('users').get();
  const users = {};
  for (const doc of usersSnap.docs) {
    users[doc.id] = { id: doc.id, ...doc.data() };
  }
  console.log(`Loaded ${Object.keys(users).length} users`);

  const tasksSnap = await db.collection('tasks').get();
  const tasks = {};
  for (const doc of tasksSnap.docs) {
    tasks[doc.id] = { id: doc.id, ...doc.data() };
  }
  console.log(`Loaded ${Object.keys(tasks).length} tasks\n`);

  // Direction A: user has task → task doesn't list user
  // Group all affected users per task so we create one catch-up task per original
  // catchUpNeeded[taskId] = [userId, userId, ...]
  const catchUpNeeded = {};

  for (const user of Object.values(users)) {
    const jobIds = user.assignedJobIds || [];
    for (const taskId of jobIds) {
      const task = tasks[taskId];
      if (!task) {
        console.warn(`  [WARN] User ${user.id} (${user.name || user.email}) references missing task ${taskId} — skipping`);
        continue;
      }
      const taskAssignedTo = task.assignedTo || [];
      if (!taskAssignedTo.includes(user.id)) {
        if (!catchUpNeeded[taskId]) catchUpNeeded[taskId] = [];
        catchUpNeeded[taskId].push(user.id);
        console.log(`  [FIX A] Task "${task.title}" (${taskId}) — user ${user.name || user.id} needs catch-up copy`);
      }
    }
  }

  // Direction B: task lists user → user doesn't have task
  // userFixes[userId] = [taskId, ...]
  const userFixes = {};

  for (const task of Object.values(tasks)) {
    const assignedTo = task.assignedTo || [];
    for (const userId of assignedTo) {
      const user = users[userId];
      if (!user) {
        console.warn(`  [WARN] Task ${task.id} ("${task.title}") references missing user ${userId} — skipping`);
        continue;
      }
      const jobIds = user.assignedJobIds || [];
      if (!jobIds.includes(task.id)) {
        if (!userFixes[userId]) userFixes[userId] = [];
        userFixes[userId].push(task.id);
        console.log(`  [FIX B] User ${user.name || userId} missing task "${task.title}" (${task.id}) in assignedJobIds`);
      }
    }
  }

  const catchUpCount = Object.keys(catchUpNeeded).length;
  const userFixCount = Object.keys(userFixes).length;

  console.log(`\nSummary: ${catchUpCount} task(s) need catch-up copies, ${userFixCount} user(s) need assignedJobIds patched`);

  if (catchUpCount === 0 && userFixCount === 0) {
    console.log('Nothing to fix — data is already in sync.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run without --dry-run to apply fixes.');
    process.exit(0);
  }

  const FIELDS_TO_COPY = [
    'title', 'due', 'priority', 'category', 'icon', 'location', 'locationColor',
    'description', 'hours', 'apprenticeTask', 'nonflexible', 'slots',
    'requiredSkills'
  ];

  // Apply Direction A: create catch-up tasks and update user assignedJobIds
  for (const [origTaskId, affectedUserIds] of Object.entries(catchUpNeeded)) {
    const origTask = tasks[origTaskId];

    const affectedUsers = affectedUserIds.map(uid => users[uid]).filter(Boolean);
    const assignedToNames = affectedUsers.map(u => u.name || u.displayName || u.email || u.id);

    // Build catch-up task: copy of original, non-recurring, assigned to affected users
    const catchUpData = {
      recurring: false,
      completed: false,
      assignedTo: affectedUserIds,
      assignedToNames
    };
    for (const field of FIELDS_TO_COPY) {
      if (origTask[field] !== undefined) {
        catchUpData[field] = origTask[field];
      }
    }

    const newTaskRef = await db.collection('tasks').add(catchUpData);
    console.log(`  Created catch-up task "${origTask.title}" → new id: ${newTaskRef.id} (assigned to ${affectedUserIds.length} user(s))`);

    // Update each affected user: swap old task id for new catch-up task id
    for (const uid of affectedUserIds) {
      await db.collection('users').doc(uid).update({
        assignedJobIds: admin.firestore.FieldValue.arrayRemove(origTaskId)
      });
      await db.collection('users').doc(uid).update({
        assignedJobIds: admin.firestore.FieldValue.arrayUnion(newTaskRef.id)
      });
      console.log(`    Updated user ${users[uid]?.name || uid}: removed ${origTaskId}, added ${newTaskRef.id}`);
    }
  }

  // Apply Direction B: add missing task ids to users
  for (const [userId, taskIds] of Object.entries(userFixes)) {
    await db.collection('users').doc(userId).update({
      assignedJobIds: admin.firestore.FieldValue.arrayUnion(...taskIds)
    });
    console.log(`  Updated user ${users[userId]?.name || userId}: added ${taskIds.length} missing task id(s)`);
  }

  console.log('\nAll fixes applied successfully.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
