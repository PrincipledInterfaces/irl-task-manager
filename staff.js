import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, arrayRemove, Timestamp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getPageUrl } from './utils.js';
import { initialize as initializeWhenIWork, getUserById, deleteWIWShift } from './wheniwork.js';
import { fadeIn, fadeInStagger } from './animations.js';

let currentUser = null;
let tasksData = [];

// Check auth state and redirect if not logged in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is logged in, fetch their data
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentUser = {
                id: user.uid,
                ...userDoc.data()
            };
            console.log("Logged in as:", currentUser.fullName);

            // Update greeting with animation
            const nameText = document.getElementById('nameText');
            nameText.textContent = `Hello ${currentUser.fullName}!`;
            fadeIn(nameText);

            // Initialize WhenIWork once (login + get users)
            console.log('[Render Hours] Initializing WhenIWork...');
            await initializeWhenIWork().catch(err => { console.error('[WhenIWork Init]', err); });

            // Load tasks and render board
            await loadTasks();
            renderWeeklyHours();
            renderSkills();
            renderBoard();

            // Setup logout button
            setupLogoutButton();
        }
    } else {
        // No user logged in, redirect to signin
        window.location.href = getPageUrl("signin");
    }
});

// Setup logout button functionality
function setupLogoutButton() {
    const logoutButton = document.querySelector('button[style*="rgb(255, 93, 93)"]');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                // onAuthStateChanged will automatically redirect to signin.html
            } catch (error) {
                console.error("Error signing out:", error);
                alert("Error signing out: " + error.message);
            }
        });
    }
}

// Format Firestore timestamp to readable string
function formatDueDate(timestamp) {
    if (!timestamp) return "No due date";

    // Convert Firestore Timestamp to JS Date
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    // Format: "Sat Nov 17, 10:30 AM"
    const options = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };

    return date.toLocaleString('en-US', options);
}

// Load tasks from Firestore
async function loadTasks() {
    try {
        console.log("Loading tasks from Firestore...");
        const tasksCollection = collection(db, "tasks");
        const tasksSnapshot = await getDocs(tasksCollection);
        tasksData = tasksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log("Tasks loaded:", tasksData.length, "tasks found");
        console.log("Task data:", tasksData);
    } catch (error) {
        console.error("Error loading tasks:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
    }
}

// Helper function to check if a date is in the current week
function isDateInCurrentWeek(date) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return date >= startOfWeek && date < endOfWeek;
}

// Calculate and render weekly hours usage
function renderWeeklyHours() {
    console.log('=== RENDER WEEKLY HOURS DEBUG ===');
    console.log('Current user:', currentUser);
    console.log('User allowedHours:', currentUser.allowedHours);

    const allowedHours = currentUser.allowedHours || 0;

    if (allowedHours === 0) {
        console.warn('WARNING: allowedHours is 0! User may not have this field set.');
    }

    // Calculate weekly hours from tasks completed this week
    let weeklyHours = 0;

    const now = new Date();
    console.log('Current date:', now.toISOString());
    console.log('Checking week:', getWeekRange());

    console.log(`Total tasks in database: ${tasksData.length}`);

    const userAssignedTasks = tasksData.filter(task =>
        task.assignedTo && task.assignedTo.includes(currentUser.id)
    );
    console.log(`Tasks assigned to current user: ${userAssignedTasks.length}`, userAssignedTasks);

    // get hours from wheniwork shifts (excluding task manager created shifts)
    let whenIWorkHours = 0;
    if (currentUser.wiwUserId) {
        // Find user by wiwUserId in the WhenIWork users list
        const wiwUser = getUserById(currentUser.wiwUserId);
        if (wiwUser && wiwUser.shifts) {
            whenIWorkHours = 0;
            for (const shift of wiwUser.shifts) {
                const shiftStart = new Date(shift.start_time);
                // Only count shifts in current week that are NOT task manager created
                if (isDateInCurrentWeek(shiftStart) && (!shift.notes || !shift.notes.includes('(Created via IRL Task Manager'))) {
                    const shiftEnd = new Date(shift.end_time);
                    const hours = (shiftEnd - shiftStart) / (1000 * 60 * 60); // convert ms to hours
                    whenIWorkHours += hours;
                    console.log(`  WhenIWork Shift: ${shiftStart.toLocaleString()} - ${shiftEnd.toLocaleString()} (${hours.toFixed(2)} hours)`);
                }
            }
            console.log(`Total WhenIWork hours this week: ${whenIWorkHours.toFixed(2)}`);
        } else {
            console.log(`No WhenIWork user found with ID ${currentUser.wiwUserId}`);
        }
    } else {
        console.log(`User ${currentUser.fullName} does not have a wiwUserId set`);
    }

    weeklyHours += whenIWorkHours;

    // Now add completed tasks hours
    console.log('Checking completed tasks for current user:');

    tasksData.forEach(task => {
        // Count if task is assigned to current user AND has been completed
        if (task.assignedTo && task.assignedTo.includes(currentUser.id) && task.completed) {
            if (task.completedDate) {
                const completedDate = task.completedDate.toDate ? task.completedDate.toDate() : new Date(task.completedDate);
                const isThisWeek = isDateInCurrentWeek(completedDate);
                console.log(`  Task "${task.title}": completed ${completedDate.toLocaleDateString()}, this week: ${isThisWeek}, hours: ${task.hours}`);

                if (isThisWeek) {
                    weeklyHours += Number(task.hours) || 0;
                }
            } else {
                // Fallback for old tasks: use due date if completedDate doesn't exist
                console.log(`  Task "${task.title}": COMPLETED but no completedDate (using due date as fallback)`);
                if (task.due) {
                    const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);
                    const isThisWeek = isDateInCurrentWeek(dueDate);
                    console.log(`    Due date: ${dueDate.toLocaleDateString()}, this week: ${isThisWeek}, hours: ${task.hours}`);
                    if (isThisWeek) {
                        weeklyHours += Number(task.hours) || 0;
                    }
                } else {
                    console.log(`    No due date either - skipping`);
                }
            }
        }
    });

    console.log(`FINAL Weekly hours: ${weeklyHours} / ${allowedHours}`);
    console.log('=================================');

    // Update circular progress
    updateCircularProgress(weeklyHours, allowedHours);
}

// Helper to show current week range
function getWeekRange() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
}

// Helper function to update circular progress bar
function updateCircularProgress(used, budget) {
    const remaining = budget - used;
    const percentage = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
    const isOverBudget = remaining < 0;

    // Update text
    document.getElementById('weeklyUsage').innerHTML = `${used} out of ${budget} hours this week <em data-tooltip="Including scheduled shifts in WhenIWork as well as tasks marked as complete."><i class="fa-solid fa-info-circle"></i></em>`;

    const remainingElement = document.getElementById('weeklyRemaining');
    remainingElement.textContent = `${Math.abs(remaining)} hours ${remaining >= 0 ? 'remaining' : 'over budget'}`;

    // Add/remove negative class
    if (isOverBudget) {
        remainingElement.classList.add('negative');
    } else {
        remainingElement.classList.remove('negative');
    }

    // Update percentage display
    document.getElementById('weeklyPercent').textContent = `${Math.round(percentage)}%`;

    // Update circular progress
    const circle = document.getElementById('weeklyCircle');
    const radius = 54;
    const circumference = 2 * Math.PI * radius; // 339.292
    const offset = circumference - (percentage / 100 * circumference);

    circle.style.strokeDashoffset = offset;

    // Add/remove over-budget class
    if (isOverBudget) {
        circle.classList.add('over-budget');
    } else {
        circle.classList.remove('over-budget');
    }
}

// Render a single job card
function renderJobCard(task) {
    const isCompleted = task.completed;
    if (isCompleted) {
        return ''; // Don't render completed jobs
    }

    const workerSlots = task.workerSlots || 1;
    const assignedUsers = task.assignedTo || [];
    const assignedNames = task.assignedToNames || [];

    // Build assignment section
    let assignmentSection = '';

    if (workerSlots > 1) {
        assignmentSection += '<h6>Assigned workers:</h6><div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">';

        assignedNames.forEach(name => {
            assignmentSection += `<span class="badge badge-green"><i class="fa-solid fa-user"></i> ${name}</span>`;
        });

        assignmentSection += '</div>';
    }

    // Conditional rendering: show priority badge if isPriority is true
    const priorityBadge = task.isPriority
        ? ` <span class="badge badge-yellow"><i class="fa-solid fa-triangle-exclamation"></i> High Priority</span>`
        : '';

    return `
        <article data-job-id="${task.id}">
            <h3>${task.title}${priorityBadge}</h3>
            <h5><span class="badge badge-gray"><i class="fa-regular fa-clock"></i> ${task.hours} Hours</span> <span class="badge badge-gray"><i class="fa-solid fa-${task.icon}"></i> ${task.category}</span></h5>
            <h6>Due: <span class="badge badge-purple"><i class="fa-regular fa-calendar"></i> ${formatDueDate(task.due)}</span></h6>
            <h6>Location: <span class="badge badge-${task.locationColor}"><i class="fa-solid fa-location-dot"></i> ${task.location}</span></h6>
            <details>
                <summary>View Description</summary>
                <div class="details-content">
                    <p>${task.description}</p>
                </div>
            </details>
            ${assignmentSection}
            <button class="unclaim-button" data-job-id="${task.id}"><i class="fa-solid fa-xmark"></i> Unclaim Task</button>
            <button class="complete-button" data-job-id="${task.id}"><i class="fa-solid fa-check"></i> Mark as Complete</button>
        </article>
    `;
}

// Render all jobs to the board
function renderBoard() {
    console.log("Rendering user dashboard...");
    console.log("Total tasks:", tasksData.length);
    console.log("Current user assigned job IDs:", currentUser.assignedJobIds);
    const boardContainer = document.getElementById('user-tasks');
    // Filter to only show jobs assigned to current user
    const userTasks = tasksData.filter(task =>
        currentUser.assignedJobIds && currentUser.assignedJobIds.includes(task.id)
    );
    console.log("User's assigned tasks:", userTasks.length);
    console.log("User tasks:", userTasks);
    if (userTasks.length === 0) {
        boardContainer.innerHTML = '<h4>You have no assigned tasks at the moment.</h4>';
        fadeIn(boardContainer.querySelector('h4'));
        return;
    } else {
        boardContainer.innerHTML = userTasks.map(task => renderJobCard(task)).join('');
        // Add stagger animation to task cards
        fadeInStagger(boardContainer, 'article');
    }
    console.log("User dashboard rendered with", userTasks.length, "tasks");

    // Attach event listeners to unclaim and complete buttons
    attachUnclaimListeners();
}

// Renders skills
function renderSkills() {
    const skillsContainer = document.getElementById('skillsContainer');

    if (!currentUser.skills || currentUser.skills.length === 0) {
        skillsContainer.innerHTML = '<p>No skills specified.</p>';
        fadeIn(skillsContainer.querySelector('p'));
        return;
    }

    currentUser.skills.forEach((skill) => {
        const skillElement = document.createElement('span');
        skillElement.className = 'badge badge-blue';
        skillElement.innerHTML = `${skill}`;
        skillsContainer.appendChild(skillElement);
    });

    // Animate all skill badges with stagger effect
    fadeInStagger(skillsContainer, '.badge');
}

// Handle unclaim and complete button clicks
function attachUnclaimListeners() {
    const unclaimButtons = document.querySelectorAll('.unclaim-button');
    unclaimButtons.forEach(button => {
        button.addEventListener('click', handleUnclaim);
    });

    const completeButtons = document.querySelectorAll('.complete-button');
    completeButtons.forEach(button => {
        button.addEventListener('click', handleComplete);
    });
}

// Unclaim a job
async function handleUnclaim(event) {
    const taskId = event.currentTarget.getAttribute('data-job-id');

    try {
        const task = tasksData.find(t => t.id === taskId);
        if (task && currentUser) {
            const assignedUsers = task.assignedTo || [];

            // Check if user is actually assigned
            if (!assignedUsers.includes(currentUser.id)) {
                alert("You are not assigned to this task!");
                return;
            }

            // Delete WhenIWork shift for this user if it exists
            const wiwShiftIDs = task.wiwShiftIDs || {};
            const shiftId = wiwShiftIDs[currentUser.id];
            if (shiftId) {
                try {
                    console.log(`Deleting WhenIWork shift ${shiftId} for user ${currentUser.id}`);
                    await deleteWIWShift(shiftId);
                    delete wiwShiftIDs[currentUser.id];
                    console.log(`✓ WhenIWork shift ${shiftId} deleted`);
                } catch (wiwError) {
                    console.error(`Error deleting WhenIWork shift:`, wiwError);
                }
            }

            // Update task in Firestore - remove from arrays and update wiwShiftIDs
            await updateDoc(doc(db, "tasks", taskId), {
                assignedTo: arrayRemove(currentUser.id),
                assignedToNames: arrayRemove(currentUser.fullName),
                wiwShiftIDs: wiwShiftIDs
            });

            // Update user's assignedJobIds in Firestore
            await updateDoc(doc(db, "users", currentUser.id), {
                assignedJobIds: arrayRemove(taskId)
            });

            // Update local data
            if (task.assignedTo) {
                const userIndex = task.assignedTo.indexOf(currentUser.id);
                if (userIndex > -1) {
                    task.assignedTo.splice(userIndex, 1);
                }
            }
            if (task.assignedToNames) {
                const nameIndex = task.assignedToNames.indexOf(currentUser.fullName);
                if (nameIndex > -1) {
                    task.assignedToNames.splice(nameIndex, 1);
                }
            }
            task.wiwShiftIDs = wiwShiftIDs;

            const index = currentUser.assignedJobIds.indexOf(taskId);
            if (index > -1) {
                currentUser.assignedJobIds.splice(index, 1);
            }

            // Send Slack notification
            try {
                const idToken = await auth.currentUser.getIdToken();
                await fetch(getApiUrl('notify/task-unclaimed'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        taskData: {
                            title: task.title,
                            hours: task.hours,
                            due: task.due
                        },
                        userData: {
                            email: currentUser.email,
                            fullName: currentUser.fullName
                        }
                    })
                });
            } catch (slackError) {
                console.warn('Slack notification failed (non-critical):', slackError);
            }

            // Re-render the board and hours to show updated state
            renderWeeklyHours();
            renderBoard();

            console.log(`Task ${taskId} unclaimed by ${currentUser.fullName}`);
        }
    } catch (error) {
        console.error("Error unclaiming task:", error);
        alert("Error unclaiming task: " + error.message);
    }
}

// Mark a job as complete
async function handleComplete(event) {
    const taskId = event.currentTarget.getAttribute('data-job-id');

    try {
        const task = tasksData.find(t => t.id === taskId);
        if (task && currentUser) {
            const assignedUsers = task.assignedTo || [];

            // Check if user is actually assigned
            if (!assignedUsers.includes(currentUser.id)) {
                alert("You are not assigned to this task!");
                return;
            }

            // Get current timestamp for completedDate
            const completedDate = Timestamp.fromDate(new Date());

            // Update task in Firestore
            await updateDoc(doc(db, "tasks", taskId), {
                completed: true,
                completedDate: completedDate
            });

            // Update user's assignedJobIds in Firestore (remove from active list)
            await updateDoc(doc(db, "users", currentUser.id), {
                assignedJobIds: arrayRemove(taskId)
            });

            // Update local data
            task.completed = true;
            task.completedDate = completedDate;
            const index = currentUser.assignedJobIds.indexOf(taskId);
            if (index > -1) {
                currentUser.assignedJobIds.splice(index, 1);
            }

            // Send Slack notification to all assigned users
            try {
                // Get all assigned users' data from Firestore
                const assignedUsersData = [];
                for (let i = 0; i < assignedUsers.length; i++) {
                    const userId = assignedUsers[i];
                    const userDoc = await getDoc(doc(db, "users", userId));
                    if (userDoc.exists()) {
                        assignedUsersData.push({
                            email: userDoc.data().email,
                            fullName: userDoc.data().fullName
                        });
                    }
                }

                const idToken = await auth.currentUser.getIdToken();
                await fetch(getApiUrl('notify/task-completed'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        taskData: {
                            title: task.title,
                            hours: task.hours,
                            due: task.due
                        },
                        userData: {
                            email: currentUser.email,
                            fullName: currentUser.fullName
                        },
                        assignedUsers: assignedUsersData
                    })
                });
            } catch (slackError) {
                console.warn('Slack notification failed (non-critical):', slackError);
            }

            // Re-render the board and hours to show updated state
            renderWeeklyHours();
            renderBoard();

            console.log(`Task ${taskId} completed by ${currentUser.fullName} at ${new Date().toISOString()}`);
        }
    } catch (error) {
        console.error("Error completing task:", error);
        alert("Error completing task: " + error.message);
    }
}
