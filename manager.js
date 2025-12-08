import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getPageUrl, getApiUrl } from './utils.js';
import { initialize as initializeWhenIWork, getScheduledWeek, getScheduledQuarter, getScheduledYear, createWIWShift, deleteWIWShift } from './wheniwork.js';
import { fadeIn, fadeInStagger } from './animations.js';

let currentUser = null;
let allUsers = [];
let allTasks = [];
let selectedUser = null;
let selectedTask = null;
let budgetData = null;
let quarterDates = null; // Store DePaul quarter dates

// Task filter state
let taskFilters = {
    dueFrom: null,
    dueTo: null,
    hoursMin: null,
    hoursMax: null,
    locations: ['IRL 1', 'IRL 2', 'Remote', 'custom'],
    categories: ['Workshop', 'Maintenance', 'Project', 'Media', 'Event', 'Other'],
    priorityOnly: false,
    skills: []
};

// Available skills from skills.txt
const AVAILABLE_SKILLS = [
    "Textiles",
    "Screen Printing",
    "3D Printer (FDM)",
    "3D Printer (Resin)",
    "Laser Cutter",
    "Wood Shop",
    "Programming",
    "Mechanical",
    "Electronics",
    "3D Modeling",
    "Graphic Design",
    "Photo/Video",
    "CNC"
];

// Check auth state and redirect if not logged in or not a manager
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentUser = {
                id: user.uid,
                ...userDoc.data()
            };

            // Check if user is a manager
            if (currentUser.role !== "manager") {
                alert("Access denied. Manager privileges required.");
                window.location.href = getPageUrl("staff");
                return;
            }

            console.log("Logged in as manager:", currentUser.fullName);

            // Load data
            await loadAllUsers();
            await loadAllTasks();
            await loadBudgetData();
            await loadQuarterDates();

            // Render team list
            renderTeamList();

            // Render tasks tab
            renderTasksTab();

            // Setup logout button
            setupLogoutButton();

            // Setup tab switching
            setupTabs();

            // Setup task dialog
            setupTaskDialog();

            // Setup task filters
            setupTaskFilters();

            // Setup hours calculation mode switch
            setupHoursCalculationSwitch();

            // Setup edit budget button (hour budget dialog)
            setupEditBudgetButton();

            // Render hours
            await renderHours();
        }
    } else {
        window.location.href = getPageUrl("signin");
    }
});

// Setup logout button
function setupLogoutButton() {
    const logoutButton = document.querySelector('button[style*="rgb(255, 93, 93)"]');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Error signing out:", error);
                alert("Error signing out: " + error.message);
            }
        });
    }
}

// Setup tab switching functionality
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Load all users from Firestore
async function loadAllUsers() {
    try {
        console.log("Loading users from Firestore...");
        const usersCollection = collection(db, "users");
        const usersSnapshot = await getDocs(usersCollection);
        allUsers = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log("Users loaded:", allUsers.length, "users found");
    } catch (error) {
        console.error("Error loading users:", error);
    }
}

// Load all tasks from Firestore
async function loadAllTasks() {
    try {
        console.log("Loading tasks from Firestore...");
        const tasksCollection = collection(db, "tasks");
        const tasksSnapshot = await getDocs(tasksCollection);
        allTasks = tasksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log("Tasks loaded:", allTasks.length, "tasks found");
    } catch (error) {
        console.error("Error loading tasks:", error);
    }
}

// Load budget data from Firestore
async function loadBudgetData() {
    try {
        console.log("Loading budget data from Firestore...");
        const dataCollection = collection(db, "data");
        const dataSnapshot = await getDocs(dataCollection);

        if (!dataSnapshot.empty) {
            // Get the first (and only) document
            const dataDoc = dataSnapshot.docs[0];
            budgetData = {
                id: dataDoc.id,
                ...dataDoc.data()
            };
            console.log("Budget data loaded:", budgetData);
        } else {
            console.warn("No budget data found in 'data' collection");
            budgetData = {
                quarterlyBudget: 0,
                weeklyBudget: 0,
                yearlyBudget: 0,
                avgPay: 0
            };
        }
    } catch (error) {
        console.error("Error loading budget data:", error);
    }
}

// Update budget data in Firestore
async function updateBudgetData(updates) {
    try {
        if (!budgetData || !budgetData.id) {
            console.error("Budget data not loaded yet");
            return;
        }

        await updateDoc(doc(db, "data", budgetData.id), updates);

        // Update local copy
        budgetData = {
            ...budgetData,
            ...updates
        };

        console.log("Budget data updated:", updates);
    } catch (error) {
        console.error("Error updating budget data:", error);
        throw error;
    }
}

// Load academic quarter dates from DePaul calendar via server
async function loadQuarterDates() {
    try {
        console.log("Loading DePaul academic quarter dates...");
        const response = await fetch(getApiUrl('quarter-dates'));

        if (!response.ok) {
            throw new Error(`Failed to fetch quarter dates: ${response.statusText}`);
        }

        const data = await response.json();
        quarterDates = data;
        console.log("Quarter dates loaded:", quarterDates);
    } catch (error) {
        console.error("Error loading quarter dates:", error);
        quarterDates = null;
    }
}

// Render team list
function renderTeamList() {
    const teamContainer = document.querySelector('#team article');
    if (!teamContainer) return;

    // Filter out managers, only show regular users
    const regularUsers = allUsers.filter(user => user.role !== "manager");

    if (regularUsers.length === 0) {
        teamContainer.innerHTML = '<p>No team members found.</p>';
        fadeIn(teamContainer.querySelector('p'));
        return;
    }

    teamContainer.innerHTML = regularUsers.map(user => {
        // Determine badge color based on active tasks
        const userTasks = allTasks.filter(task =>
            task.assignedTo && task.assignedTo.includes(user.id) && !task.completed
        );
        const taskCount = userTasks.length;
        var colors = ['green', 'yellow', 'red', 'purple', 'blue', 'pink', 'indigo'];
        let badgeColor = colors[Math.random() * colors.length | 0]; // Default random color
        if (taskCount >= 5) badgeColor = 'red';
        else if (taskCount >= 3) badgeColor = 'yellow';

        return `<a class="hoveranim user-link" href="#" data-user-id="${user.id}"><span class="badge badge-${badgeColor}"><i class="fa-solid fa-user"></i> ${user.fullName}</span></a>`;
    }).join('\n');

    // Animate team member badges with stagger effect
    fadeInStagger(teamContainer, '.user-link');

    // Attach click listeners
    document.querySelectorAll('.user-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const userId = link.getAttribute('data-user-id');
            openUserDialog(userId);
        });
    });
}

// Open user edit dialog
function openUserDialog(userId) {
    selectedUser = allUsers.find(u => u.id === userId);
    if (!selectedUser) return;

    const dialog = document.getElementById('editUser');

    // Update dialog content
    const userName = dialog.querySelector('h2');
    userName.innerHTML = `<i class="fa-solid fa-user"></i> ${selectedUser.fullName}`;

    const now = new Date();

    // Get user's active tasks (not completed and not expired)
    const userTasks = allTasks.filter(task => {
        if (!task.assignedTo || !task.assignedTo.includes(selectedUser.id)) return false;
        if (task.completed) return false;

        // Exclude expired nonflexible tasks
        if (task.nonflexible && task.due) {
            const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);
            if (dueDate < now) return false;
        }

        return true;
    });

    // Get user's historical tasks (completed or expired nonflexible)
    const historicalTasks = allTasks.filter(task => {
        if (!task.assignedTo || !task.assignedTo.includes(selectedUser.id)) return false;

        // Include completed tasks
        if (task.completed) return true;

        // Include expired nonflexible tasks
        if (task.nonflexible && task.due) {
            const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);
            if (dueDate < now) return true;
        }

        return false;
    });

    // Render active tasks
    const flexContainer = dialog.querySelector('div[style*="display: flex"]');
    const allDivs = flexContainer.querySelectorAll(':scope > div');
    const tasksDiv = allDivs[0]; // First div is tasks
    const tasksSection = tasksDiv.querySelector('h5');
    tasksSection.textContent = `${userTasks.length} Active Task${userTasks.length !== 1 ? 's' : ''}`;

    const tasksArticle = tasksDiv.querySelector('article');
    if (userTasks.length === 0) {
        tasksArticle.innerHTML = '<p style="color: #888;">No active tasks</p>';
    } else {
        tasksArticle.innerHTML = userTasks.map(task =>
            `<span class="badge badge-gray"><i class="fa-solid fa-${task.icon || 'list'}"></i> ${task.title} | ${task.hours} Hrs <a href="#" class="hoveranim delete-assignment" data-task-id="${task.id}"><i class="fa-solid fa-x"></i></a></span><br>`
        ).join('');

        // Attach delete assignment listeners
        setTimeout(() => {
            dialog.querySelectorAll('.delete-assignment').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const taskId = link.getAttribute('data-task-id');
                    removeUserFromTask(taskId);
                });
            });
        }, 0);
    }

    // Populate allowed hours
    const allowedHoursInput = document.getElementById('userAllowedHours');
    if (allowedHoursInput) {
        allowedHoursInput.value = selectedUser.allowedHours || 25;

        // Add change listener to save allowed hours
        allowedHoursInput.addEventListener('change', async () => {
            const newAllowedHours = parseInt(allowedHoursInput.value) || 25;
            try {
                await updateDoc(doc(db, "users", selectedUser.id), {
                    allowedHours: newAllowedHours
                });

                // Update local data
                selectedUser.allowedHours = newAllowedHours;
                const userIndex = allUsers.findIndex(u => u.id === selectedUser.id);
                if (userIndex !== -1) {
                    allUsers[userIndex].allowedHours = newAllowedHours;
                }

                console.log(`Allowed hours updated to ${newAllowedHours} for ${selectedUser.fullName}`);
            } catch (error) {
                console.error("Error updating allowed hours:", error);
                alert("Error updating allowed hours: " + error.message);
            }
        });
    }

    //Render task history
    renderTaskHistory(historicalTasks);

    // Render skills
    renderSkillsInDialog();

    // Show dialog
    dialog.showModal();
}

function renderTaskHistory(historicalTasks) {
    const dialog = document.getElementById('editUser');
    const flexContainer = dialog.querySelector('div[style*="display: flex"]');
    const allDivs = flexContainer.querySelectorAll(':scope > div');

    // Assuming task history is in the third div (index 2)
    if (allDivs.length < 3) {
        console.warn('Task history section not found in dialog');
        return;
    }

    const historyDiv = allDivs[2]; // Third div is task history
    const historySection = historyDiv.querySelector('h5');
    const historyArticle = historyDiv.querySelector('article');

    // Update section title
    historySection.textContent = `${historicalTasks.length} Historical Task${historicalTasks.length !== 1 ? 's' : ''}`;

    if (historicalTasks.length === 0) {
        historyArticle.innerHTML = '<p style="color: #888;">No task history</p>';
    } else {
        historyArticle.innerHTML = historicalTasks.map(task => {
            const statusBadge = task.completed
                ? '<span class="badge badge-green">Completed</span>'
                : '<span class="badge badge-red">Expired</span>';

            return `<span class="badge badge-gray"><i class="fa-solid fa-${task.icon || 'list'}"></i> ${task.title} | ${task.hours} Hrs ${statusBadge}</span><br>`;
        }).join('');
    }
}

// Render skills in dialog
function renderSkillsInDialog() {
    const dialog = document.getElementById('editUser');
    const flexContainer = dialog.querySelector('div[style*="display: flex"]');
    const allDivs = flexContainer.querySelectorAll(':scope > div');
    const skillsDiv = allDivs[1]; // Second div is skills
    const skillsArticle = skillsDiv.querySelector('article');

    const userSkills = selectedUser.skills || [];

    if (userSkills.length === 0) {
        skillsArticle.innerHTML = '<p style="color: #888;">No skills added yet</p>';
    } else {
        skillsArticle.innerHTML = userSkills.map(skill =>
            `<span class="badge badge-gray">${skill} <a href="#" class="hoveranim delete-skill" data-skill="${skill}"><i class="fa-solid fa-x"></i></a></span>`
        ).join(' ');
    }

    // Attach delete listeners
    dialog.querySelectorAll('.delete-skill').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const skill = link.getAttribute('data-skill');
            removeSkill(skill);
        });
    });
}

// Setup dialog functionality
const dialog = document.getElementById('editUser');

// Close button
const closeButton = dialog.querySelector('button[aria-label="Close"]');
closeButton.addEventListener('click', () => {
    dialog.close();
});

// Add skill button
const addSkillButtons = Array.from(dialog.querySelectorAll('button')).filter(btn =>
    btn.textContent.includes('Add Skill')
);
if (addSkillButtons.length > 0) {
    addSkillButtons[0].addEventListener('click', () => {
        showAddSkillPrompt();
    });
}

// Delete user button
const deleteUserButtons = Array.from(dialog.querySelectorAll('button')).filter(btn =>
    btn.textContent.includes('Delete User')
);
if (deleteUserButtons.length > 0) {
    deleteUserButtons[0].addEventListener('click', () => {
        confirmDeleteUser();
    });
}

// Show add skill prompt
function showAddSkillPrompt() {
    if (!selectedUser) return;

    const userSkills = selectedUser.skills || [];
    const availableSkills = AVAILABLE_SKILLS.filter(skill => !userSkills.includes(skill));

    if (availableSkills.length === 0) {
        alert("This user already has all available skills!");
        return;
    }

    const skillList = availableSkills.map((skill, idx) => `${idx + 1}. ${skill}`).join('\n');
    const skillInput = prompt(`Available skills:\n${skillList}\n\nEnter the number or name of the skill to add:`);

    if (!skillInput) return;

    let skillToAdd;

    // Check if input is a number
    if (!isNaN(skillInput)) {
        const index = parseInt(skillInput) - 1;
        if (index >= 0 && index < availableSkills.length) {
            skillToAdd = availableSkills[index];
        }
    } else {
        // Check if input matches a skill name
        skillToAdd = availableSkills.find(skill =>
            skill.toLowerCase() === skillInput.toLowerCase()
        );
    }

    if (skillToAdd) {
        addSkill(skillToAdd);
    } else {
        alert("Invalid skill selection. Please try again.");
    }
}

// Add skill to user
async function addSkill(skill) {
    if (!selectedUser) return;

    try {
        await updateDoc(doc(db, "users", selectedUser.id), {
            skills: arrayUnion(skill)
        });

        // Update local data
        if (!selectedUser.skills) selectedUser.skills = [];
        selectedUser.skills.push(skill);

        // Update the user in allUsers array
        const userIndex = allUsers.findIndex(u => u.id === selectedUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex] = selectedUser;
        }

        // Re-render skills
        renderSkillsInDialog();

        console.log(`Skill "${skill}" added to ${selectedUser.fullName}`);
    } catch (error) {
        console.error("Error adding skill:", error);
        alert("Error adding skill: " + error.message);
    }
}

// Remove skill from user
async function removeSkill(skill) {
    if (!selectedUser) return;

    if (!confirm(`Remove "${skill}" from ${selectedUser.fullName}?`)) {
        return;
    }

    try {
        await updateDoc(doc(db, "users", selectedUser.id), {
            skills: arrayRemove(skill)
        });

        // Update local data
        if (selectedUser.skills) {
            const index = selectedUser.skills.indexOf(skill);
            if (index > -1) {
                selectedUser.skills.splice(index, 1);
            }
        }

        // Update the user in allUsers array
        const userIndex = allUsers.findIndex(u => u.id === selectedUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex] = selectedUser;
        }

        // Re-render skills
        renderSkillsInDialog();

        console.log(`Skill "${skill}" removed from ${selectedUser.fullName}`);
    } catch (error) {
        console.error("Error removing skill:", error);
        alert("Error removing skill: " + error.message);
    }
}

// Remove user from a task assignment
async function removeUserFromTask(taskId) {
    if (!selectedUser) return;

    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    if (!confirm(`Remove ${selectedUser.fullName} from "${task.title}"?`)) {
        return;
    }

    try {
        // Delete WhenIWork shift for this user if it exists
        const wiwShiftIDs = task.wiwShiftIDs || {};
        const shiftId = wiwShiftIDs[selectedUser.id];
        if (shiftId) {
            try {
                console.log(`Deleting WhenIWork shift ${shiftId} for user ${selectedUser.id}`);
                await deleteWIWShift(shiftId);
                delete wiwShiftIDs[selectedUser.id];
                console.log(`✓ WhenIWork shift ${shiftId} deleted`);
            } catch (wiwError) {
                console.error(`Error deleting WhenIWork shift:`, wiwError);
            }
        }

        // Update Firestore - remove user from assignedTo and assignedToNames arrays, update wiwShiftIDs
        await updateDoc(doc(db, "tasks", taskId), {
            assignedTo: arrayRemove(selectedUser.id),
            assignedToNames: arrayRemove(selectedUser.fullName),
            wiwShiftIDs: wiwShiftIDs
        });

        // Update local data
        const taskIndex = allTasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            if (allTasks[taskIndex].assignedTo) {
                allTasks[taskIndex].assignedTo = allTasks[taskIndex].assignedTo.filter(id => id !== selectedUser.id);
            }
            if (allTasks[taskIndex].assignedToNames) {
                allTasks[taskIndex].assignedToNames = allTasks[taskIndex].assignedToNames.filter(name => name !== selectedUser.fullName);
            }
            allTasks[taskIndex].wiwShiftIDs = wiwShiftIDs;
        }

        // Re-open the dialog to refresh the task list
        openUserDialog(selectedUser.id);

        console.log(`${selectedUser.fullName} removed from task "${task.title}"`);
    } catch (error) {
        console.error("Error removing user from task:", error);
        alert("Error removing assignment: " + error.message);
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

// Helper function to check if a date is in the current academic quarter
function isDateInCurrentQuarter(date) {
    if (!quarterDates || !quarterDates.quarters) {
        console.error('[Quarter Check] Quarter data not loaded!');
        return false;
    }

    const now = new Date();
    console.log(`[Quarter Check] Checking if ${date.toISOString()} is in current academic quarter`);

    // Get all quarters in chronological order
    const quarterOrder = ['autumn', 'winter', 'spring', 'summer'];
    const sortedQuarters = quarterOrder
        .filter(q => quarterDates.quarters[q])
        .map(q => ({
            name: q,
            start: new Date(quarterDates.quarters[q].start),
            displayName: quarterDates.quarters[q].name
        }));

    // Find which quarter we're currently in
    for (let i = 0; i < sortedQuarters.length; i++) {
        const quarter = sortedQuarters[i];
        const nextQuarter = sortedQuarters[i + 1];

        const quarterStart = quarter.start;
        // Quarter ends when next quarter starts, or end of year if last quarter
        const quarterEnd = nextQuarter ? nextQuarter.start : new Date(quarter.start.getFullYear() + 1, 8, 1); // Aug 1 next year

        // Check if 'now' is in this quarter
        if (now >= quarterStart && now < quarterEnd) {
            console.log(`[Quarter Check] Current quarter: ${quarter.displayName} (${quarterStart.toLocaleDateString()} - ${quarterEnd.toLocaleDateString()})`);
            const result = date >= quarterStart && date < quarterEnd;
            console.log(`[Quarter Check] Date ${date.toLocaleDateString()} is ${result ? 'IN' : 'NOT IN'} current quarter`);
            return result;
        }
    }

    console.log('[Quarter Check] Not currently in any academic quarter');
    return false;
}

// Helper function to check if a date is in the current academic year
function isDateInCurrentYear(date) {
    if (!quarterDates || !quarterDates.quarters) {
        console.error('[Year Check] Quarter data not loaded!');
        return false;
    }

    console.log('[Year Check] quarterDates.quarters:', quarterDates.quarters);

    // Academic year runs from Autumn start to next Autumn start
    const autumn = quarterDates.quarters.autumn;

    if (!autumn) {
        console.error('[Year Check] Quarter data incomplete (missing autumn)!');
        return false;
    }

    console.log('[Year Check] autumn object:', autumn);
    console.log('[Year Check] autumn.start:', autumn.start);

    const academicYearStart = new Date(autumn.start);
    // Academic year ends when the next autumn starts (approximately 1 year later)
    const academicYearEnd = new Date(academicYearStart);
    academicYearEnd.setFullYear(academicYearEnd.getFullYear() + 1);

    console.log(`[Year Check] Academic year: ${academicYearStart.toLocaleDateString()} - ${academicYearEnd.toLocaleDateString()}`);
    console.log('[Year Check] academicYearStart ISO:', academicYearStart.toISOString());
    console.log('[Year Check] academicYearEnd ISO:', academicYearEnd.toISOString());
    const result = date >= academicYearStart && date < academicYearEnd;
    console.log(`[Year Check] Date ${date.toLocaleDateString()} is ${result ? 'IN' : 'NOT IN'} current academic year`);

    // Check if date is within the academic year range
    return result;
}

// Setup hours calculation mode switch
function setupHoursCalculationSwitch() {
    const includeActiveSwitch = document.getElementById('includeActiveHours');
    const noteElement = document.getElementById('hoursCalculationNote');

    if (includeActiveSwitch) {
        includeActiveSwitch.addEventListener('change', async () => {
            // Update note text
            if (includeActiveSwitch.checked) {
                noteElement.textContent = 'Hour usage includes both completed and active tasks, as well as shifts scheduled in WhenIWork.';
            } else {
                noteElement.textContent = "Hour usage is based on tasks marked as 'complete' and shifts scheduled in WhenIWork.";
            }

            // Re-render hours with new calculation mode
            await renderHours();
        });
    }
}

async function renderHours() {
    console.log('======================================');
    console.log('[Render Hours] Starting hour calculation...');
    console.log('======================================');

    // Check if budget data is loaded
    if (!budgetData) {
        console.error("[Render Hours] Budget data not loaded yet");
        return;
    }

    console.log('[Render Hours] Budget data:', budgetData);
    console.log('[Render Hours] Quarter dates:', quarterDates);
    console.log(`[Render Hours] Total tasks to process: ${allTasks.length}`);

    // Check if we should include active tasks
    const includeActiveSwitch = document.getElementById('includeActiveHours');
    const includeActive = includeActiveSwitch ? includeActiveSwitch.checked : false;

    console.log(`[Render Hours] Include active tasks: ${includeActive}`);

    var totalHoursYear = 0;
    var totalHoursQuarter = 0;
    var totalHoursWeek = 0;

    // Initialize WhenIWork once (login + get users)
    console.log('[Render Hours] Initializing WhenIWork...');
    await initializeWhenIWork().catch(err => { console.error('[WhenIWork Init]', err); });

    // Fetch WhenIWork hours (now all three calls will use the same authenticated session)
    console.log('[Render Hours] Fetching WhenIWork scheduled hours...');
    const whenIWorkWeek = await getScheduledWeek().catch(err => { console.error('[WhenIWork Week]', err); return 0; });
    const whenIWorkQuarter = await getScheduledQuarter().catch(err => { console.error('[WhenIWork Quarter]', err); return 0; });
    const whenIWorkYear = await getScheduledYear().catch(err => { console.error('[WhenIWork Year]', err); return 0; });

    console.log(`[Render Hours] WhenIWork hours - Week: ${whenIWorkWeek}, Quarter: ${whenIWorkQuarter}, Year: ${whenIWorkYear}`);

    var tasksCountedYear = 0;
    var tasksCountedQuarter = 0;
    var tasksCountedWeek = 0;

    allTasks.forEach(function(element, index) {
        // Determine if we should count this task
        const shouldCount = includeActive
            ? !element.completed  // If including active, count all non-completed tasks
            : element.completed;   // If not including active, only count completed tasks

        if (shouldCount) {
            let dateToCheck = null;

            // For completed tasks, use completedDate (or fall back to due date for old tasks)
            if (element.completed) {
                if (element.completedDate) {
                    dateToCheck = new Date(element.completedDate.toDate());
                    console.log(`[Task ${index}] "${element.title}" - Completed: ${dateToCheck.toLocaleDateString()}, Hours: ${element.hours || 0}`);
                } else if (element.due) {
                    // Fallback for old completed tasks without completedDate
                    dateToCheck = new Date(element.due.toDate());
                    console.log(`[Task ${index}] "${element.title}" - Completed (old, using due date): ${dateToCheck.toLocaleDateString()}, Hours: ${element.hours || 0}`);
                } else {
                    console.log(`[Task ${index}] "${element.title}" - Skipped (Completed but no completedDate or due date)`);
                    return;
                }
            }
            // For active tasks (when includeActive is true), use due date
            else if (!element.completed && element.due) {
                dateToCheck = new Date(element.due.toDate());
                console.log(`[Task ${index}] "${element.title}" - Active, Due: ${dateToCheck.toLocaleDateString()}, Hours: ${element.hours || 0}`);
            }
            // Skip if no date available
            else {
                console.log(`[Task ${index}] "${element.title}" - Skipped (No due date)`);
                return;
            }

            if (isDateInCurrentYear(dateToCheck)) {
                totalHoursYear += Number(element.hours) || 0;
                tasksCountedYear++;
                console.log(`  ✓ Added to year total. Year total now: ${totalHoursYear} (${tasksCountedYear} tasks)`);

                if (isDateInCurrentQuarter(dateToCheck)) {
                    totalHoursQuarter += Number(element.hours) || 0;
                    tasksCountedQuarter++;
                    console.log(`  ✓ Added to quarter total. Quarter total now: ${totalHoursQuarter} (${tasksCountedQuarter} tasks)`);

                    if (isDateInCurrentWeek(dateToCheck)) {
                        totalHoursWeek += Number(element.hours) || 0;
                        tasksCountedWeek++;
                        console.log(`  ✓ Added to week total. Week total now: ${totalHoursWeek} (${tasksCountedWeek} tasks)`);
                    }
                }
            }
        } else {
            console.log(`[Task ${index}] "${element.title}" - Skipped (Completed: ${element.completed}, Include active: ${includeActive})`);
        }
    });

    // Add WhenIWork hours to totals
    totalHoursWeek += whenIWorkWeek;
    totalHoursQuarter += whenIWorkQuarter;
    totalHoursYear += whenIWorkYear;

    console.log('======================================');
    console.log('[Render Hours] Final totals (including WhenIWork):');
    console.log(`  Week: ${totalHoursWeek} hours (${tasksCountedWeek} tasks + ${whenIWorkWeek} WhenIWork hrs) (budget: ${budgetData.weeklyBudget})`);
    console.log(`  Quarter: ${totalHoursQuarter} hours (${tasksCountedQuarter} tasks + ${whenIWorkQuarter} WhenIWork hrs) (budget: ${budgetData.quarterlyBudget})`);
    console.log(`  Year: ${totalHoursYear} hours (${tasksCountedYear} tasks + ${whenIWorkYear} WhenIWork hrs) (budget: ${budgetData.yearlyBudget})`);
    console.log('======================================');

    // Update circular progress bars
    updateCircularProgress('weekly', totalHoursWeek, budgetData.weeklyBudget, 'this week');
    updateCircularProgress('quarterly', totalHoursQuarter, budgetData.quarterlyBudget, 'this quarter');
    updateCircularProgress('yearly', totalHoursYear, budgetData.yearlyBudget, 'this year');

    // Hide loader and show content with animation
    const loader = document.getElementById('overviewLoader');
    const content = document.getElementById('overviewContent');
    if (loader) loader.style.display = 'none';
    if (content) {
        content.style.display = 'block';
        fadeIn(content);
    }

    console.log('[Render Hours] UI updated successfully');
}

// Helper function to update circular progress bars
function updateCircularProgress(period, used, budget, label) {
    const remaining = budget - used;
    const percentage = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
    const isOverBudget = remaining < 0;

    // Update text
    document.getElementById(`${period}Usage`).textContent = `${used} out of ${budget} hours ${label}`;

    const remainingElement = document.getElementById(`${period}Remaining`);
    remainingElement.textContent = `${Math.abs(remaining)} hours ${remaining >= 0 ? 'remaining' : 'over budget'}`;

    // Add/remove negative class
    if (isOverBudget) {
        remainingElement.classList.add('negative');
    } else {
        remainingElement.classList.remove('negative');
    }

    // Update percentage display
    document.getElementById(`${period}Percent`).textContent = `${Math.round(percentage)}%`;

    // Update circular progress
    const circle = document.getElementById(`${period}Circle`);
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

// Confirm and delete user
async function confirmDeleteUser() {
    if (!selectedUser) return;

    const confirmation = prompt(`WARNING: This will permanently delete ${selectedUser.fullName} from both Firebase Auth and Firestore, and remove them from all assigned tasks.\n\nType "${selectedUser.fullName}" to confirm deletion:`);

    if (confirmation !== selectedUser.fullName) {
        alert("Deletion cancelled - name did not match.");
        return;
    }

    const dialog = document.getElementById('editUser');
    const dialogContent = dialog.querySelector('article');

    // Show loading state
    const originalContent = dialogContent.innerHTML;
    dialogContent.innerHTML = `
        <div style="display:flex;justify-content:center;align-items:center;min-height:200px;flex-direction:column;gap:20px;">
            <div class="loader"></div>
            <p><strong>Deleting ${selectedUser.fullName}...</strong></p>
            <p>Please wait while we remove the user from Firebase Auth and Firestore.</p>
        </div>
    `;

    try {
        // Get the current user's ID token for authentication
        const user = auth.currentUser;
        if (!user) {
            alert("You must be logged in to delete users.");
            dialogContent.innerHTML = originalContent;
            return;
        }

        const idToken = await user.getIdToken();

        console.log(`Calling server to delete user: ${selectedUser.fullName} (${selectedUser.id})`);

        // Call your custom server endpoint
        const response = await fetch(getApiUrl('delete-user'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ userId: selectedUser.id })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete user');
        }

        console.log("Server response:", result);

        // Update local data
        allUsers = allUsers.filter(u => u.id !== selectedUser.id);

        // Also update allTasks to reflect the user removal
        allTasks.forEach(task => {
            if (task.assignedTo && task.assignedTo.includes(selectedUser.id)) {
                task.assignedTo = task.assignedTo.filter(id => id !== selectedUser.id);
                task.assignedToNames = task.assignedToNames.filter(name => name !== selectedUser.fullName);
            }
        });

        // Close dialog and re-render team list
        dialog.close();
        renderTeamList();

        alert(`${selectedUser.fullName} has been deleted successfully from both Firebase Auth and Firestore.`);
        console.log(`User ${selectedUser.fullName} deleted successfully`);

        selectedUser = null;
    } catch (error) {
        console.error("Error deleting user:", error);

        // Restore original content on error
        dialogContent.innerHTML = originalContent;

        alert(`Error deleting user: ${error.message}`);
    }
}

// ==================== TASK MANAGEMENT FUNCTIONS ====================

// Render tasks tab
function renderTasksTab() {
    const tasksContainer = document.getElementById('tasksContainer');
    const taskGreeting = document.getElementById('taskGreeting');

    if (!tasksContainer) return;

    // Apply filters to all tasks first
    const filteredTasks = filterTasks(allTasks);

    // Count active (non-completed) tasks in filtered results
    const activeTasks = filteredTasks.filter(task => !task.completed);

    // Update greeting
    taskGreeting.textContent = `Showing ${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''} (${activeTasks.length} active).`;

    // Sort tasks: incomplete first, then by due date
    const sortedTasks = [...filteredTasks].sort((a, b) => {
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        if (a.due && b.due) {
            return a.due.toDate() - b.due.toDate();
        }
        if (a.due) return -1;
        if (b.due) return 1;
        return 0;
    });

    if (sortedTasks.length === 0) {
        tasksContainer.innerHTML = '<article><p>No tasks match the current filters. Try adjusting your filter settings.</p></article>';
        fadeIn(tasksContainer.querySelector('article'));
        return;
    }

    const now = new Date();

    // Group tasks by status
    // Archived: completed OR (nonflexible AND past due date)
    const archivedTasks = sortedTasks.filter(t => {
        if (t.completed) return true;

        if (t.nonflexible && t.due) {
            const dueDate = t.due.toDate ? t.due.toDate() : new Date(t.due);
            return dueDate < now;
        }

        return false;
    });

    const activeTasksList = sortedTasks.filter(t => {
        if (t.completed) return false;

        if (t.nonflexible && t.due) {
            const dueDate = t.due.toDate ? t.due.toDate() : new Date(t.due);
            return dueDate >= now;
        }

        return true;
    });

    let html = '';

    // Render active tasks
    if (activeTasksList.length > 0) {
        html += '<h4>Active Tasks</h4>';
        activeTasksList.forEach(task => {
            html += renderTaskCard(task, false);
        });
    }

    // Render archived tasks
    if (archivedTasks.length > 0) {
        html += `<details style="margin-top: 2rem;"><summary><h4 style="display: inline;">Archived Tasks (${archivedTasks.length})</h4></summary>`;
        archivedTasks.forEach(task => {
            html += renderTaskCard(task, true);
        });
        html += '</details>';
    }

    tasksContainer.innerHTML = html;

    // Animate task cards with stagger effect
    fadeInStagger(tasksContainer, '.task-card');

    // Attach click listeners
    document.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const taskId = card.getAttribute('data-task-id');
            openTaskDialog(taskId);
        });
    });
}

// Render a single task card
function renderTaskCard(task, isArchived = false) {
    // Use icon from database, fallback to 'list' if not set
    const icon = task.icon || 'list';
    const assignedCount = task.assignedTo ? task.assignedTo.length : 0;
    const slots = task.slots || 1;
    const dueDate = task.due ? new Date(task.due.toDate()).toLocaleDateString() : 'No due date';
    const priorityBadge = task.priority ? '<span class="badge badge-red">High Priority</span> ' : '';
    const completedBadge = task.completed ? '<span class="badge badge-green">Completed</span> ' : '';

    return `
        <article class="task-card" data-task-id="${task.id}" style="cursor: pointer; opacity: ${isArchived ? '0.6' : '1'};">
            <h4><i class="fa-solid fa-${icon}"></i> ${task.title}</h4>
            <p style="color: #888; margin-bottom: 0.5rem;">${task.description || 'No description'}</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                ${priorityBadge}
                ${completedBadge}
                <span class="badge badge-gray"><i class="fa-solid fa-clock"></i> ${task.hours || 0} hrs</span>
                <span class="badge badge-gray"><i class="fa-solid fa-calendar"></i> ${dueDate}</span>
                <span class="badge badge-${assignedCount >= slots ? 'green' : 'yellow'}"><i class="fa-solid fa-users"></i> ${assignedCount}/${slots}</span>
            </div>
        </article>
    `;
}

// Setup task dialog functionality
function setupTaskDialog() {
    const dialog = document.getElementById('editTask');
    const closeButton = dialog.querySelector('button[aria-label="Close"]');
    const saveButton = document.getElementById('saveTaskBtn');
    const deleteButton = document.getElementById('deleteTaskBtn');
    const createButton = document.getElementById('createTaskBtn');
    const requireSkillsSwitch = document.getElementById('taskRequireSkills');
    const recurringSwitch = document.getElementById('taskRecurring');
    const recurrenceFrequency = document.getElementById('recurrenceFrequency');
    const locationSelect = document.getElementById('taskLocation');
    const locationCustomInput = document.getElementById('taskLocationCustom');

    // Close button
    closeButton.addEventListener('click', () => {
        dialog.close();
        selectedTask = null;
    });

    // Create task button
    createButton.addEventListener('click', () => {
        openTaskDialog(null); // null means create new
    });

    // Save button
    saveButton.addEventListener('click', async () => {
        await saveTask();
    });

    // Delete button
    deleteButton.addEventListener('click', async () => {
        await deleteTask();
    });

    // Show/hide skills list when switch is toggled
    requireSkillsSwitch.addEventListener('change', () => {
        const skillsList = document.getElementById('taskSkillsList');
        if (requireSkillsSwitch.checked) {
            skillsList.style.display = 'block';
            renderSkillsInTaskDialog();
        } else {
            skillsList.style.display = 'none';
        }
    });

    // Show/hide recurrence options when recurring switch is toggled
    recurringSwitch.addEventListener('change', () => {
        const recurrenceOptions = document.getElementById('recurrenceOptions');
        recurrenceOptions.style.display = recurringSwitch.checked ? 'block' : 'none';
    });

    // Show/hide custom recurrence when frequency is custom
    recurrenceFrequency.addEventListener('change', () => {
        const customRecurrence = document.getElementById('customRecurrence');
        customRecurrence.style.display = recurrenceFrequency.value === 'custom' ? 'block' : 'none';
    });

    // Show/hide custom location input when location is custom
    locationSelect.addEventListener('change', () => {
        if (locationSelect.value === 'custom') {
            locationCustomInput.style.display = 'block';
        } else {
            locationCustomInput.style.display = 'none';
        }
    });
}

// Open task dialog for editing or creating
function openTaskDialog(taskId) {
    const dialog = document.getElementById('editTask');
    const dialogTitle = document.getElementById('taskDialogTitle');
    const deleteButton = document.getElementById('deleteTaskBtn');

    if (taskId) {
        // Edit existing task
        selectedTask = allTasks.find(t => t.id === taskId);
        if (!selectedTask) return;

        dialogTitle.textContent = 'Edit Task';
        deleteButton.style.display = 'block';

        // Populate form
        document.getElementById('taskName').textContent = selectedTask.title || '';
        document.getElementById('taskPriority').checked = selectedTask.priority || false;
        const descEl = document.getElementById('taskDescription');
        const rawDesc = typeof selectedTask.description === 'string' ? selectedTask.description : '';
        const hasContent = rawDesc.trim().length > 0;
        descEl.textContent = hasContent ? rawDesc : 'Task Description goes here :)';
        document.getElementById('taskHours').value = selectedTask.hours || 0;
        document.getElementById('taskApprentice').checked = selectedTask.apprenticeTask || false;
        document.getElementById('taskNonflexible').checked = selectedTask.nonflexible || false;
        document.getElementById('taskRecurring').checked = selectedTask.recurring || false;
        document.getElementById('taskSlots').value = selectedTask.slots || 1;
        document.getElementById('taskRequireSkills').checked = (selectedTask.requiredSkills && selectedTask.requiredSkills.length > 0) || false;

        // Set location
        const taskLocation = selectedTask.location || 'IRL 1';
        const locationSelect = document.getElementById('taskLocation');
        const locationCustomInput = document.getElementById('taskLocationCustom');

        if (['IRL 1', 'IRL 2', 'Remote'].includes(taskLocation)) {
            locationSelect.value = taskLocation;
            locationCustomInput.style.display = 'none';
        } else {
            locationSelect.value = 'custom';
            locationCustomInput.value = taskLocation;
            locationCustomInput.style.display = 'block';
        }

        // Set due date
        if (selectedTask.due) {
            const dueDate = selectedTask.due.toDate();
            const localDatetime = new Date(dueDate.getTime() - (dueDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            document.getElementById('taskDueDate').value = localDatetime;
        } else {
            document.getElementById('taskDueDate').value = '';
        }

        // Handle recurring options
        if (selectedTask.recurring) {
            document.getElementById('recurrenceOptions').style.display = 'block';
            document.getElementById('recurrenceFrequency').value = selectedTask.recurrenceFrequency || 'weekly';

            if (selectedTask.recurrenceFrequency === 'custom' && selectedTask.recurrenceDays) {
                document.getElementById('customRecurrence').style.display = 'block';
                // Clear all checkboxes first
                ['recurSun', 'recurMon', 'recurTue', 'recurWed', 'recurThu', 'recurFri', 'recurSat'].forEach(id => {
                    document.getElementById(id).checked = false;
                });
                // Check the selected days
                selectedTask.recurrenceDays.forEach(day => {
                    const dayIds = ['recurSun', 'recurMon', 'recurTue', 'recurWed', 'recurThu', 'recurFri', 'recurSat'];
                    document.getElementById(dayIds[day]).checked = true;
                });
            }
        } else {
            document.getElementById('recurrenceOptions').style.display = 'none';
        }

        // Handle skills
        if (selectedTask.requiredSkills && selectedTask.requiredSkills.length > 0) {
            document.getElementById('taskSkillsList').style.display = 'block';
            renderSkillsInTaskDialog();
        } else {
            document.getElementById('taskSkillsList').style.display = 'none';
        }

    } else {
        // Create new task
        selectedTask = null;
        dialogTitle.textContent = 'Create New Task';
        deleteButton.style.display = 'none';

        // Reset form
        document.getElementById('taskName').textContent = 'New Task';
        document.getElementById('taskPriority').checked = false;
        document.getElementById('taskCategory').value = 'other';
        document.getElementById('taskDescription').textContent = 'Task Description goes here :)';
        document.getElementById('taskHours').value = 4;
        document.getElementById('taskApprentice').checked = false;
        document.getElementById('taskDueDate').value = '';
        document.getElementById('taskNonflexible').checked = false;
        document.getElementById('taskRecurring').checked = false;
        document.getElementById('recurrenceOptions').style.display = 'none';
        document.getElementById('taskSlots').value = 1;
        document.getElementById('taskRequireSkills').checked = false;
        document.getElementById('taskSkillsList').style.display = 'none';
        document.getElementById('taskLocation').value = 'IRL 1';
        document.getElementById('taskLocationCustom').value = '';
        document.getElementById('taskLocationCustom').style.display = 'none';
    }

    // Render assigned staff
    renderAssignedStaffInTaskDialog();

    // Show dialog
    dialog.showModal();

    // Set category after dialog is shown to ensure select element is rendered
    if (taskId && selectedTask) {
        document.getElementById('taskCategory').value = selectedTask.category || 'other';
    } else {
        document.getElementById('taskCategory').value = 'other';
    }
}

// Render skills in task dialog
function renderSkillsInTaskDialog() {
    const skillsList = document.getElementById('taskSkillsList');
    const taskSkills = (selectedTask && selectedTask.requiredSkills) ? selectedTask.requiredSkills : [];

    skillsList.innerHTML = AVAILABLE_SKILLS.map(skill => {
        const isSelected = taskSkills.includes(skill);
        const badgeClass = isSelected ? 'badge-green' : 'badge-gray';
        const icon = isSelected ? 'minus' : 'plus';

        return `<span class="badge ${badgeClass}"><a href="#" class="hoveranim toggle-skill" data-skill="${skill}" style="color: inherit; text-decoration: none;">${skill} <i class="fa-solid fa-${icon}"></i></a></span>`;
    }).join(' ');

    // Attach click listeners
    setTimeout(() => {
        skillsList.querySelectorAll('.toggle-skill').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const skill = link.getAttribute('data-skill');
                toggleSkillInTask(skill);
            });
        });
    }, 0);
}

// Toggle skill in task
function toggleSkillInTask(skill) {
    if (!selectedTask) {
        selectedTask = { requiredSkills: [] };
    }

    if (!selectedTask.requiredSkills) {
        selectedTask.requiredSkills = [];
    }

    const index = selectedTask.requiredSkills.indexOf(skill);
    if (index > -1) {
        selectedTask.requiredSkills.splice(index, 1);
    } else {
        selectedTask.requiredSkills.push(skill);
    }

    renderSkillsInTaskDialog();
}

// Render assigned staff in task dialog
function renderAssignedStaffInTaskDialog() {
    const staffList = document.getElementById('taskAssignedStaff');
    const assignedIds = (selectedTask && selectedTask.assignedTo) ? selectedTask.assignedTo : [];

    const regularUsers = allUsers.filter(user => user.role !== "manager");

    if (regularUsers.length === 0) {
        staffList.innerHTML = '<p style="color: #888;">No staff available</p>';
        return;
    }

    staffList.innerHTML = regularUsers.map(user => {
        const isAssigned = assignedIds.includes(user.id);
        const badgeClass = isAssigned ? 'badge-green' : 'badge-gray';
        const icon = isAssigned ? 'minus' : 'plus';

        return `<span class="badge ${badgeClass}"><a href="#" class="hoveranim toggle-staff" data-user-id="${user.id}" style="color: inherit; text-decoration: none;">${user.fullName} <i class="fa-solid fa-${icon}"></i></a></span><br>`;
    }).join('');

    // Attach click listeners
    setTimeout(() => {
        staffList.querySelectorAll('.toggle-staff').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const userId = link.getAttribute('data-user-id');
                toggleStaffInTask(userId);
            });
        });
    }, 0);
}

// Toggle staff assignment in task
function toggleStaffInTask(userId) {
    if (!selectedTask) {
        selectedTask = { assignedTo: [], assignedToNames: [] };
    }

    if (!selectedTask.assignedTo) {
        selectedTask.assignedTo = [];
        selectedTask.assignedToNames = [];
    }

    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const index = selectedTask.assignedTo.indexOf(userId);
    if (index > -1) {
        selectedTask.assignedTo.splice(index, 1);
        selectedTask.assignedToNames.splice(index, 1);
    } else {
        selectedTask.assignedTo.push(userId);
        selectedTask.assignedToNames.push(user.fullName);
    }

    renderAssignedStaffInTaskDialog();
}

// Save task to Firestore
async function saveTask() {
    try {
        // Gather form data
        const title = document.getElementById('taskName').textContent.trim();
        const priority = document.getElementById('taskPriority').checked;
        const categoryValue = document.getElementById('taskCategory').value;
        const descriptionRaw = document.getElementById('taskDescription').textContent.trim();
        // If the description is still the placeholder text, save as empty string
        const description = descriptionRaw === 'Task Description goes here :)' ? '' : descriptionRaw;

        // Capitalize category properly
        const categoryMap = {
            workshop: 'Workshop',
            maintenance: 'Maintenance',
            project: 'Project',
            media: 'Media',
            event: 'Event',
            other: 'Other'
        };
        const category = categoryMap[categoryValue] || 'Other';
        const hours = parseInt(document.getElementById('taskHours').value) || 0;
        const apprenticeTask = document.getElementById('taskApprentice').checked;
        const dueDateValue = document.getElementById('taskDueDate').value;
        const nonflexible = document.getElementById('taskNonflexible').checked;
        const recurring = document.getElementById('taskRecurring').checked;
        const slots = parseInt(document.getElementById('taskSlots').value) || 1;
        const requireSkills = document.getElementById('taskRequireSkills').checked;

        // Validate
        if (!title) {
            alert('Please enter a task title');
            return;
        }

        // Map category to icon based on data&color guidelines
        const categoryIconMap = {
            workshop: 'hammer',
            maintenance: 'broom',
            project: 'compass-drafting',
            media: 'camera',
            event: 'user',
            other: 'circle-info'
        };

        const icon = categoryIconMap[categoryValue] || 'circle-info';

        // Handle location and location color
        const locationSelect = document.getElementById('taskLocation').value;
        const locationCustom = document.getElementById('taskLocationCustom').value.trim();

        let location, locationColor;

        if (locationSelect === 'custom') {
            location = locationCustom || 'Custom Location';
            locationColor = 'green';
        } else {
            location = locationSelect;
            // Map location to color based on data&color guidelines
            const locationColorMap = {
                'IRL 1': 'blue',
                'IRL 2': 'red',
                'Remote': 'indigo'
            };
            locationColor = locationColorMap[location] || 'gray';
        }

        // Build task object
        const taskData = {
            title,
            priority,
            category,
            icon,
            location,
            locationColor,
            description,
            hours,
            apprenticeTask,
            nonflexible,
            recurring,
            slots,
            completed: selectedTask ? selectedTask.completed || false : false,
            assignedTo: selectedTask ? selectedTask.assignedTo || [] : [],
            assignedToNames: selectedTask ? selectedTask.assignedToNames || [] : [],
            requiredSkills: requireSkills && selectedTask ? selectedTask.requiredSkills || [] : []
        };

        // Handle due date
        if (dueDateValue) {
            const dueDate = new Date(dueDateValue);
            taskData.due = Timestamp.fromDate(dueDate);
        } else {
            taskData.due = null;
        }

        // Handle recurring options
        if (recurring) {
            taskData.recurrenceFrequency = document.getElementById('recurrenceFrequency').value;

            if (taskData.recurrenceFrequency === 'custom') {
                const days = [];
                ['recurSun', 'recurMon', 'recurTue', 'recurWed', 'recurThu', 'recurFri', 'recurSat'].forEach((id, index) => {
                    if (document.getElementById(id).checked) {
                        days.push(index);
                    }
                });
                taskData.recurrenceDays = days;
            }
        }

        if (selectedTask && selectedTask.id) {
            // Get the ORIGINAL state from allTasks before any toggles were made
            const originalTask = allTasks.find(t => t.id === selectedTask.id);
            const oldAssignedUsers = originalTask ? (originalTask.assignedTo || []) : [];
            const newAssignedUsers = taskData.assignedTo || [];

            console.log('Syncing assignedJobIds...');
            console.log('Old assigned users:', oldAssignedUsers);
            console.log('New assigned users:', newAssignedUsers);

            // Update existing task in Firestore
            await updateDoc(doc(db, "tasks", selectedTask.id), taskData);
            console.log('Task updated:', taskData);

            // Update local data
            const taskIndex = allTasks.findIndex(t => t.id === selectedTask.id);
            if (taskIndex !== -1) {
                allTasks[taskIndex] = { ...allTasks[taskIndex], ...taskData };
            }

            // Initialize wiwShiftIDs object if it doesn't exist
            const wiwShiftIDs = originalTask ? (originalTask.wiwShiftIDs || {}) : {};

            // Add task to users who were newly assigned
            const usersToAdd = newAssignedUsers.filter(userId => !oldAssignedUsers.includes(userId));
            console.log('Users to add:', usersToAdd);
            for (const userId of usersToAdd) {
                try {
                    await updateDoc(doc(db, "users", userId), {
                        assignedJobIds: arrayUnion(selectedTask.id)
                    });
                    console.log(`✓ Added task ${selectedTask.id} to user ${userId}'s assignedJobIds`);

                    // Update local user data
                    const userIndex = allUsers.findIndex(u => u.id === userId);
                    if (userIndex !== -1) {
                        if (!allUsers[userIndex].assignedJobIds) {
                            allUsers[userIndex].assignedJobIds = [];
                        }
                        if (!allUsers[userIndex].assignedJobIds.includes(selectedTask.id)) {
                            allUsers[userIndex].assignedJobIds.push(selectedTask.id);
                        }
                    }

                    // Create WhenIWork shift for newly assigned user
                    try {
                        const user = allUsers.find(u => u.id === userId);
                        if (user && taskData.due && user.wiwUserId) {
                            const dueDate = taskData.due.toDate ? taskData.due.toDate() : new Date(taskData.due);
                            const taskHours = taskData.hours || 0;
                            const startTime = new Date(dueDate.getTime() - (taskHours * 60 * 60 * 1000));

                            console.log(`Creating WhenIWork shift for ${user.fullName} (WIW ID: ${user.wiwUserId})`);
                            const wiwShiftID = await createWIWShift(
                                user.wiwUserId,
                                startTime.toISOString(),
                                dueDate.toISOString(),
                                `Task: ${taskData.title}`,
                                taskData.description || 'No description provided.'
                            );

                            wiwShiftIDs[userId] = wiwShiftID;
                            console.log(`✓ WhenIWork shift ${wiwShiftID} created for user ${userId}`);
                        } else if (user && taskData.due && !user.wiwUserId) {
                            console.warn(`User ${user.fullName} does not have a wiwUserId set - cannot create shift`);
                        }
                    } catch (wiwError) {
                        console.error(`Error creating WhenIWork shift for user ${userId}:`, wiwError);
                    }
                } catch (error) {
                    console.error(`Error updating assignedJobIds for user ${userId}:`, error);
                }
            }

            // Remove task from users who were unassigned
            const usersToRemove = oldAssignedUsers.filter(userId => !newAssignedUsers.includes(userId));
            console.log('Users to remove:', usersToRemove);
            for (const userId of usersToRemove) {
                try {
                    await updateDoc(doc(db, "users", userId), {
                        assignedJobIds: arrayRemove(selectedTask.id)
                    });
                    console.log(`✓ Removed task ${selectedTask.id} from user ${userId}'s assignedJobIds`);

                    // Update local user data
                    const userIndex = allUsers.findIndex(u => u.id === userId);
                    if (userIndex !== -1 && allUsers[userIndex].assignedJobIds) {
                        allUsers[userIndex].assignedJobIds = allUsers[userIndex].assignedJobIds.filter(id => id !== selectedTask.id);
                    }

                    // Delete WhenIWork shift for unassigned user
                    try {
                        const shiftId = wiwShiftIDs[userId];
                        if (shiftId) {
                            console.log(`Deleting WhenIWork shift ${shiftId} for user ${userId}`);
                            await deleteWIWShift(shiftId);
                            delete wiwShiftIDs[userId];
                            console.log(`✓ WhenIWork shift ${shiftId} deleted for user ${userId}`);
                        }
                    } catch (wiwError) {
                        console.error(`Error deleting WhenIWork shift for user ${userId}:`, wiwError);
                    }
                } catch (error) {
                    console.error(`Error updating assignedJobIds for user ${userId}:`, error);
                }
            }

            // Update task with wiwShiftIDs if there were any changes
            if (usersToAdd.length > 0 || usersToRemove.length > 0) {
                try {
                    await updateDoc(doc(db, "tasks", selectedTask.id), {
                        wiwShiftIDs: wiwShiftIDs
                    });
                    console.log(`✓ Updated task ${selectedTask.id} with WIW shift IDs`);
                } catch (error) {
                    console.error(`Error updating task wiwShiftIDs:`, error);
                }
            }
        } else {
            // Create new task
            const docRef = await addDoc(collection(db, "tasks"), taskData);
            console.log('Task created with ID:', docRef.id);

            // Add to local data
            allTasks.push({
                id: docRef.id,
                ...taskData
            });

            // Update assignedJobIds for all assigned users
            const assignedUsers = taskData.assignedTo || [];
            console.log('Updating assignedJobIds for newly created task:', assignedUsers);

            // Initialize wiwShiftIDs object for new task
            const wiwShiftIDs = {};

            for (const userId of assignedUsers) {
                try {
                    // Update user's assignedJobIds
                    await updateDoc(doc(db, "users", userId), {
                        assignedJobIds: arrayUnion(docRef.id)
                    });
                    console.log(`✓ Added task ${docRef.id} to user ${userId}'s assignedJobIds`);

                    // Update local user data
                    const userIndex = allUsers.findIndex(u => u.id === userId);
                    if (userIndex !== -1) {
                        if (!allUsers[userIndex].assignedJobIds) {
                            allUsers[userIndex].assignedJobIds = [];
                        }
                        if (!allUsers[userIndex].assignedJobIds.includes(docRef.id)) {
                            allUsers[userIndex].assignedJobIds.push(docRef.id);
                        }
                    }

                    // Create WhenIWork shift for assigned user
                    try {
                        const user = allUsers.find(u => u.id === userId);
                        if (user && taskData.due && user.wiwUserId) {
                            const dueDate = taskData.due.toDate ? taskData.due.toDate() : new Date(taskData.due);
                            const taskHours = taskData.hours || 0;
                            const startTime = new Date(dueDate.getTime() - (taskHours * 60 * 60 * 1000));

                            console.log(`Creating WhenIWork shift for ${user.fullName} (WIW ID: ${user.wiwUserId})`);
                            const wiwShiftID = await createWIWShift(
                                user.wiwUserId,
                                startTime.toISOString(),
                                dueDate.toISOString(),
                                `Task: ${taskData.title}`,
                                taskData.description || 'No description provided.'
                            );

                            wiwShiftIDs[userId] = wiwShiftID;
                            console.log(`✓ WhenIWork shift ${wiwShiftID} created for user ${userId}`);
                        } else if (user && taskData.due && !user.wiwUserId) {
                            console.warn(`User ${user.fullName} does not have a wiwUserId set - cannot create shift`);
                        }
                    } catch (wiwError) {
                        console.error(`Error creating WhenIWork shift for user ${userId}:`, wiwError);
                    }
                } catch (error) {
                    console.error(`Error updating assignedJobIds for user ${userId}:`, error);
                }
            }

            // Update task with wiwShiftIDs if any were created
            if (Object.keys(wiwShiftIDs).length > 0) {
                try {
                    await updateDoc(doc(db, "tasks", docRef.id), {
                        wiwShiftIDs: wiwShiftIDs
                    });

                    // Update local allTasks with wiwShiftIDs
                    const taskIndex = allTasks.findIndex(t => t.id === docRef.id);
                    if (taskIndex !== -1) {
                        allTasks[taskIndex].wiwShiftIDs = wiwShiftIDs;
                    }

                    console.log(`✓ Updated task ${docRef.id} with WIW shift IDs`);
                } catch (error) {
                    console.error(`Error updating task wiwShiftIDs:`, error);
                }
            }

            // Create apprentice task if requested
            if (apprenticeTask) {
                const apprenticeTaskData = {
                    ...taskData,
                    title: `[Apprentice] ${title}`,
                    hours: Math.floor(hours / 2), // Half the hours
                    apprenticeTask: false, // Don't cascade apprentice task creation
                    assignedTo: [],
                    assignedToNames: []
                };

                const apprenticeDocRef = await addDoc(collection(db, "tasks"), apprenticeTaskData);
                console.log('Apprentice task created with ID:', apprenticeDocRef.id);

                // Add to local data
                allTasks.push({
                    id: apprenticeDocRef.id,
                    ...apprenticeTaskData
                });
            }
        }

        // Close dialog and refresh
        document.getElementById('editTask').close();
        renderTasksTab();

        const message = selectedTask && selectedTask.id
            ? 'Task updated successfully!'
            : apprenticeTask
                ? 'Task and apprentice task created successfully!'
                : 'Task created successfully!';

        alert(message);
        selectedTask = null;

    } catch (error) {
        console.error('Error saving task:', error);
        alert('Error saving task: ' + error.message);
    }
}

// Delete task from Firestore
async function deleteTask() {
    if (!selectedTask || !selectedTask.id) return;

    if (!confirm(`Are you sure you want to delete "${selectedTask.title}"? This cannot be undone.`)) {
        return;
    }

    try {
        // Delete all WhenIWork shifts associated with this task
        const wiwShiftIDs = selectedTask.wiwShiftIDs || {};
        const shiftIds = Object.values(wiwShiftIDs);

        if (shiftIds.length > 0) {
            console.log(`Deleting ${shiftIds.length} WhenIWork shift(s) for task "${selectedTask.title}"`);

            for (const shiftId of shiftIds) {
                try {
                    await deleteWIWShift(shiftId);
                    console.log(`✓ WhenIWork shift ${shiftId} deleted`);
                } catch (wiwError) {
                    console.error(`Error deleting WhenIWork shift ${shiftId}:`, wiwError);
                    // Continue deleting other shifts even if one fails
                }
            }
        }

        // Delete the task from Firestore
        await deleteDoc(doc(db, "tasks", selectedTask.id));
        console.log('Task deleted:', selectedTask.id);

        // Update local data
        allTasks = allTasks.filter(t => t.id !== selectedTask.id);

        // Close dialog and refresh
        document.getElementById('editTask').close();
        renderTasksTab();

        alert('Task deleted successfully!');
        selectedTask = null;

    } catch (error) {
        console.error('Error deleting task:', error);
        alert('Error deleting task: ' + error.message);
    }
}

// ==================== TASK FILTER FUNCTIONS ====================

// Setup task filters
function setupTaskFilters() {
    // Populate skills checkboxes
    const skillsContainer = document.getElementById('filterSkillsContainer');
    if (skillsContainer) {
        skillsContainer.innerHTML = AVAILABLE_SKILLS.map(skill =>
            `<label><input type="checkbox" class="filter-skill" value="${skill}"> ${skill}</label>`
        ).join('');
    }

    // Apply filters button
    const applyBtn = document.getElementById('applyFiltersBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            applyTaskFilters();
            renderTasksTab();
        });
    }

    // Clear filters button
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearTaskFilters();
            renderTasksTab();
        });
    }
}

// Apply current filter settings from UI
function applyTaskFilters() {
    // Due date filters
    const dueFrom = document.getElementById('filterDueFrom').value;
    const dueTo = document.getElementById('filterDueTo').value;
    taskFilters.dueFrom = dueFrom ? new Date(dueFrom) : null;
    taskFilters.dueTo = dueTo ? new Date(dueTo) : null;
    if (taskFilters.dueTo) {
        // Set to end of day
        taskFilters.dueTo.setHours(23, 59, 59, 999);
    }

    // Hours filters
    const hoursMin = document.getElementById('filterHoursMin').value;
    const hoursMax = document.getElementById('filterHoursMax').value;
    taskFilters.hoursMin = hoursMin ? parseInt(hoursMin) : null;
    taskFilters.hoursMax = hoursMax ? parseInt(hoursMax) : null;

    // Location filters
    const locationCheckboxes = document.querySelectorAll('.filter-location');
    taskFilters.locations = Array.from(locationCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    // Category filters
    const categoryCheckboxes = document.querySelectorAll('.filter-category');
    taskFilters.categories = Array.from(categoryCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    // Priority filter
    taskFilters.priorityOnly = document.getElementById('filterPriorityOnly').checked;

    // Skills filters
    const skillCheckboxes = document.querySelectorAll('.filter-skill');
    taskFilters.skills = Array.from(skillCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    console.log('Filters applied:', taskFilters);
}

// Clear all filters
function clearTaskFilters() {
    // Reset filter state
    taskFilters = {
        dueFrom: null,
        dueTo: null,
        hoursMin: null,
        hoursMax: null,
        locations: ['IRL 1', 'IRL 2', 'Remote', 'custom'],
        categories: ['Workshop', 'Maintenance', 'Project', 'Media', 'Event', 'Other'],
        priorityOnly: false,
        skills: []
    };

    // Reset UI
    document.getElementById('filterDueFrom').value = '';
    document.getElementById('filterDueTo').value = '';
    document.getElementById('filterHoursMin').value = '';
    document.getElementById('filterHoursMax').value = '';
    document.getElementById('filterPriorityOnly').checked = false;

    document.querySelectorAll('.filter-location').forEach(cb => cb.checked = true);
    document.querySelectorAll('.filter-category').forEach(cb => cb.checked = true);
    document.querySelectorAll('.filter-skill').forEach(cb => cb.checked = false);

    console.log('Filters cleared');
}

// Filter tasks based on current filter settings
function filterTasks(tasks) {
    return tasks.filter(task => {
        // Due date filter
        if (taskFilters.dueFrom || taskFilters.dueTo) {
            if (!task.due) return false;
            const taskDueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);

            if (taskFilters.dueFrom && taskDueDate < taskFilters.dueFrom) return false;
            if (taskFilters.dueTo && taskDueDate > taskFilters.dueTo) return false;
        }

        // Hours filter
        const taskHours = task.hours || 0;
        if (taskFilters.hoursMin !== null && taskHours < taskFilters.hoursMin) return false;
        if (taskFilters.hoursMax !== null && taskHours > taskFilters.hoursMax) return false;

        // Location filter
        if (taskFilters.locations.length > 0) {
            const taskLocation = task.location || 'IRL 1';
            // Check if it's a custom location
            const isCustomLocation = !['IRL 1', 'IRL 2', 'Remote'].includes(taskLocation);

            if (isCustomLocation) {
                if (!taskFilters.locations.includes('custom')) return false;
            } else {
                if (!taskFilters.locations.includes(taskLocation)) return false;
            }
        }

        // Category filter
        if (taskFilters.categories.length > 0) {
            const taskCategory = task.category || 'Other';
            if (!taskFilters.categories.includes(taskCategory)) return false;
        }

        // Priority filter
        if (taskFilters.priorityOnly && !task.priority) return false;

        // Skills filter (show tasks that have ANY of the selected skills, or tasks with no required skills)
        if (taskFilters.skills.length > 0) {
            const taskSkills = task.requiredSkills || [];
            if (taskSkills.length > 0) {
                const hasMatchingSkill = taskSkills.some(skill => taskFilters.skills.includes(skill));
                if (!hasMatchingSkill) return false;
            }
        }

        return true;
    });
}

// show hour budget dialog when editBudget is pressed
function setupEditBudgetButton() {
    const editBudgetBtn = document.getElementById('editBudget');
    if (editBudgetBtn) {
        editBudgetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const dialog = document.getElementById('editBudgetDialog');
            const quarterlyInput = document.getElementById('quarterlyBudgetInput');
            const weeklyInput = document.getElementById('weeklyBudgetInput');
            const yearlyInput = document.getElementById('yearlyBudgetInput');

            // Set current budget values (prefer stored values, fall back to derived or 0)
            quarterlyInput.value = budgetData && typeof budgetData.quarterlyBudget !== 'undefined' ? budgetData.quarterlyBudget : (budgetData && typeof budgetData.weeklyBudget !== 'undefined' ? Math.round((budgetData.weeklyBudget * 52) / 4) : 0);
            weeklyInput.value = budgetData && typeof budgetData.weeklyBudget !== 'undefined' ? budgetData.weeklyBudget : (budgetData && typeof budgetData.quarterlyBudget !== 'undefined' ? Math.round(budgetData.quarterlyBudget / 13) : 0);
            yearlyInput.value = budgetData && typeof budgetData.yearlyBudget !== 'undefined' ? budgetData.yearlyBudget : (budgetData && typeof budgetData.quarterlyBudget !== 'undefined' ? Math.round(budgetData.quarterlyBudget * 4) : 0);

            dialog.showModal();
        });
    }

    // Autofill button: calculate missing values using Year = Quarterly * 4, Week = Year / 52
    const autofillBtn = document.getElementById('autofillBudgetBtn');
    if (autofillBtn) {
        autofillBtn.addEventListener('click', () => {
            const q = parseFloat(document.getElementById('quarterlyBudgetInput').value) || null;
            const w = parseFloat(document.getElementById('weeklyBudgetInput').value) || null;
            const y = parseFloat(document.getElementById('yearlyBudgetInput').value) || null;

            const computed = computeBudgetValues({ quarterly: q, weekly: w, yearly: y });
            if (!computed) {
                alert('Please enter at least one non-negative number to autofill.');
                return;
            }

            document.getElementById('quarterlyBudgetInput').value = computed.quarterly;
            document.getElementById('weeklyBudgetInput').value = computed.weekly;
            document.getElementById('yearlyBudgetInput').value = computed.yearly;
        });
    }

    // Clear (×) buttons next to each field
    const clearButtons = document.querySelectorAll('.clear-budget-btn');
    if (clearButtons && clearButtons.length > 0) {
        clearButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = btn.getAttribute('data-target');
                if (!targetId) return;
                const input = document.getElementById(targetId);
                if (input) {
                    input.value = '';
                    input.focus();
                }
            });
        });
    }

    // Save budget button (matches id in manager.html)
    const saveBudgetBtn = document.getElementById('saveHourBudgetBtn');
    if (saveBudgetBtn) {
        saveBudgetBtn.addEventListener('click', async () => {
            const qInput = document.getElementById('quarterlyBudgetInput').value;
            const wInput = document.getElementById('weeklyBudgetInput').value;
            const yInput = document.getElementById('yearlyBudgetInput').value;

            const q = qInput === '' ? null : parseFloat(qInput);
            const w = wInput === '' ? null : parseFloat(wInput);
            const y = yInput === '' ? null : parseFloat(yInput);

            const computed = computeBudgetValues({ quarterly: q, weekly: w, yearly: y });
            if (!computed) {
                alert('Please enter at least one non-negative number to save.');
                return;
            }

            try {
                await updateDoc(doc(db, "data", budgetData.id), {
                    quarterlyBudget: computed.quarterly,
                    weeklyBudget: computed.weekly,
                    yearlyBudget: computed.yearly
                });

                // Update local copy and refresh the hours UI
                budgetData.quarterlyBudget = computed.quarterly;
                budgetData.weeklyBudget = computed.weekly;
                budgetData.yearlyBudget = computed.yearly;
                await renderHours();

                alert('Hour budgets updated successfully!');
                document.getElementById('editBudgetDialog').close();
            } catch (error) {
                console.error('Error updating hour budget:', error);
                alert('Error updating hour budget: ' + error.message);
            }
        });
    }

    // Wire the dialog header close button
    const budgetDialog = document.getElementById('editBudgetDialog');
    if (budgetDialog) {
        const dialogClose = budgetDialog.querySelector('button[aria-label="Close"]');
        if (dialogClose) {
            dialogClose.addEventListener('click', () => {
                budgetDialog.close();
            });
        }
    }
}

// Compute missing budget values. Assumptions: 4 quarters/year, 52 weeks/year
function computeBudgetValues({ quarterly, weekly, yearly }) {
    const WEEKS_PER_YEAR = 52;
    const QUARTERS_PER_YEAR = 4;

    // Normalize invalid entries to null
    quarterly = (typeof quarterly === 'number' && !isNaN(quarterly) && quarterly >= 0) ? quarterly : null;
    weekly = (typeof weekly === 'number' && !isNaN(weekly) && weekly >= 0) ? weekly : null;
    yearly = (typeof yearly === 'number' && !isNaN(yearly) && yearly >= 0) ? yearly : null;

    // Need at least one value
    if (quarterly === null && weekly === null && yearly === null) return null;

    // If all three provided, return rounded integers
    if (quarterly !== null && weekly !== null && yearly !== null) {
        return {
            quarterly: Math.round(quarterly),
            weekly: Math.round(weekly),
            yearly: Math.round(yearly)
        };
    }

    // Two provided -> compute the third using consistent relations
    if (quarterly !== null && weekly !== null) {
        const computedYearly = Math.round(quarterly * QUARTERS_PER_YEAR);
        return { quarterly: Math.round(quarterly), weekly: Math.round(weekly), yearly: computedYearly };
    }
    if (quarterly !== null && yearly !== null) {
        const computedWeekly = Math.round(yearly / WEEKS_PER_YEAR);
        return { quarterly: Math.round(quarterly), weekly: computedWeekly, yearly: Math.round(yearly) };
    }
    if (weekly !== null && yearly !== null) {
        const computedQuarterly = Math.round(yearly / QUARTERS_PER_YEAR);
        return { quarterly: computedQuarterly, weekly: Math.round(weekly), yearly: Math.round(yearly) };
    }

    // Only one provided -> compute others using assumptions
    if (quarterly !== null) {
        const computedYearly = Math.round(quarterly * QUARTERS_PER_YEAR);
        const computedWeekly = Math.round(computedYearly / WEEKS_PER_YEAR);
        return { quarterly: Math.round(quarterly), weekly: computedWeekly, yearly: computedYearly };
    }
    if (weekly !== null) {
        const computedYearly = Math.round(weekly * WEEKS_PER_YEAR);
        const computedQuarterly = Math.round(computedYearly / QUARTERS_PER_YEAR);
        return { quarterly: computedQuarterly, weekly: Math.round(weekly), yearly: computedYearly };
    }
    if (yearly !== null) {
        const computedQuarterly = Math.round(yearly / QUARTERS_PER_YEAR);
        const computedWeekly = Math.round(yearly / WEEKS_PER_YEAR);
        return { quarterly: computedQuarterly, weekly: computedWeekly, yearly: Math.round(yearly) };
    }

    return null;
}
