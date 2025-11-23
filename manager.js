import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getPageUrl, getApiUrl } from './utils.js';

let currentUser = null;
let allUsers = [];
let allTasks = [];
let selectedUser = null;
let budgetData = null;
let quarterDates = null; // Store DePaul quarter dates

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

            // Setup logout button
            setupLogoutButton();

            // Setup tab switching
            setupTabs();

            // Render hours
            renderHours();
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

    // Get user's active tasks
    const userTasks = allTasks.filter(task =>
        task.assignedTo && task.assignedTo.includes(selectedUser.id) && !task.completed
    );

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

    // Render skills
    renderSkillsInDialog();

    // Show dialog
    dialog.showModal();
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
const addSkillButton = dialog.querySelector('button[class=""]');
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
        // Update Firestore - remove user from assignedTo and assignedToNames arrays
        await updateDoc(doc(db, "tasks", taskId), {
            assignedTo: arrayRemove(selectedUser.id),
            assignedToNames: arrayRemove(selectedUser.fullName)
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

    // Academic year runs from Autumn start to next Autumn start
    const autumn = quarterDates.quarters.autumn;

    if (!autumn) {
        console.error('[Year Check] Quarter data incomplete (missing autumn)!');
        return false;
    }

    const academicYearStart = new Date(autumn.start);
    // Academic year ends when the next autumn starts (approximately 1 year later)
    const academicYearEnd = new Date(academicYearStart);
    academicYearEnd.setFullYear(academicYearEnd.getFullYear() + 1);

    console.log(`[Year Check] Academic year: ${academicYearStart.toLocaleDateString()} - ${academicYearEnd.toLocaleDateString()}`);
    const result = date >= academicYearStart && date < academicYearEnd;
    console.log(`[Year Check] Date ${date.toLocaleDateString()} is ${result ? 'IN' : 'NOT IN'} current academic year`);

    // Check if date is within the academic year range
    return result;
}

function renderHours() {
    console.log('[Render Hours] Starting hour calculation...');

    // Check if budget data is loaded
    if (!budgetData) {
        console.error("[Render Hours] Budget data not loaded yet");
        return;
    }

    console.log('[Render Hours] Budget data:', budgetData);
    console.log('[Render Hours] Quarter dates:', quarterDates);
    console.log(`[Render Hours] Total tasks to process: ${allTasks.length}`);

    var totalHoursYear = 0;
    var totalHoursQuarter = 0;
    var totalHoursWeek = 0;

    allTasks.forEach(function(element, index) {
        if (element.completed && element.due) {
            const dueDate = new Date(element.due.toDate());
            console.log(`[Task ${index}] "${element.title}" - Completed: ${element.completed}, Due: ${dueDate.toLocaleDateString()}, Hours: ${element.hours || 0}`);

            if (isDateInCurrentYear(dueDate)) {
                totalHoursYear += element.hours || 0;
                console.log(`  ✓ Added to year total. Year total now: ${totalHoursYear}`);

                if (isDateInCurrentQuarter(dueDate)) {
                    totalHoursQuarter += element.hours || 0;
                    console.log(`  ✓ Added to quarter total. Quarter total now: ${totalHoursQuarter}`);

                    if (isDateInCurrentWeek(dueDate)) {
                        totalHoursWeek += element.hours || 0;
                        console.log(`  ✓ Added to week total. Week total now: ${totalHoursWeek}`);
                    }
                }
            }
        } else if (element.completed || element.due) {
            console.log(`[Task ${index}] "${element.title}" - Skipped (Completed: ${element.completed}, Has due date: ${!!element.due})`);
        }
    });

    console.log('[Render Hours] Final totals:');
    console.log(`  Week: ${totalHoursWeek} / ${budgetData.weeklyBudget}`);
    console.log(`  Quarter: ${totalHoursQuarter} / ${budgetData.quarterlyBudget}`);
    console.log(`  Year: ${totalHoursYear} / ${budgetData.yearlyBudget}`);

    // Update UI after loop completes
    document.getElementById("weeklyBar").value = totalHoursWeek;
    document.getElementById("weeklyBar").max = budgetData.weeklyBudget;
    document.getElementById("weeklyText").innerText = "Using "+totalHoursWeek+" of "+budgetData.weeklyBudget+" hours this week.";

    document.getElementById("quarterlyBar").value = totalHoursQuarter;
    document.getElementById("quarterlyBar").max = budgetData.quarterlyBudget;
    document.getElementById("quarterlyText").innerText = "Using "+totalHoursQuarter+" of "+budgetData.quarterlyBudget+" hours this quarter.";

    document.getElementById("yearlyBar").value = totalHoursYear;
    document.getElementById("yearlyBar").max = budgetData.yearlyBudget;
    document.getElementById("yearlyText").innerText = "Using "+totalHoursYear+" of "+budgetData.yearlyBudget+" hours this year.";

    console.log('[Render Hours] UI updated successfully');
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
