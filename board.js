import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getPageUrl } from './utils.js';

let currentUser = null;
let tasksData = [];

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

            // Load tasks and render board
            await loadTasks();
            setupTaskFilters();
            renderBoard();
        }
    } else {
        // No user logged in, redirect to signin
        window.location.href = getPageUrl("signin");
    }
});

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

// Calculate current user's weekly hours from assigned tasks
function calculateUserWeeklyHours() {
    if (!currentUser) return 0;

    let weeklyHours = 0;

    tasksData.forEach(task => {
        // Only count tasks assigned to current user
        if (task.assignedTo && task.assignedTo.includes(currentUser.id)) {
            // For completed tasks, check if completed this week
            if (task.completed) {
                if (task.completedDate) {
                    const completedDate = task.completedDate.toDate ? task.completedDate.toDate() : new Date(task.completedDate);
                    if (isDateInCurrentWeek(completedDate)) {
                        weeklyHours += Number(task.hours) || 0;
                    }
                } else if (task.due) {
                    // Fallback for old completed tasks: use due date
                    const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);
                    if (isDateInCurrentWeek(dueDate)) {
                        weeklyHours += Number(task.hours) || 0;
                    }
                }
            }
            // For active (non-completed) tasks, check if due this week
            else if (!task.completed && task.due) {
                const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);
                if (isDateInCurrentWeek(dueDate)) {
                    weeklyHours += Number(task.hours) || 0;
                }
            }
        }
    });

    return weeklyHours;
}

// Render a single job card
function renderJobCard(task) {
    const workerSlots = task.workerSlots || 1; // Default to 1 slot if not specified
    const assignedUsers = task.assignedTo || []; // Array of user IDs
    const assignedNames = task.assignedToNames || []; // Array of user names
    const openSlots = workerSlots - assignedUsers.length;

    // Check if current user is already assigned
    const isUserAssigned = currentUser && assignedUsers.includes(currentUser.id);

    // Check if user has required skills
    let hasRequiredSkills = true;
    let skillsTooltip = '';
    if (task.requiredSkills && task.requiredSkills.length > 0) {
        const userSkills = currentUser?.skills || [];
        hasRequiredSkills = task.requiredSkills.some(skill => userSkills.includes(skill));

        if (!hasRequiredSkills) {
            skillsTooltip = `You need one of these skills: ${task.requiredSkills.join(', ')}`;
        }
    }

    // Check if claiming this task would exceed user's allowed weekly hours
    let withinHoursLimit = true;
    let hoursTooltip = '';
    if (currentUser && task.due) {
        const taskDueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);
        // Only check hours limit if task is due this week
        if (isDateInCurrentWeek(taskDueDate)) {
            const currentWeeklyHours = calculateUserWeeklyHours();
            const taskHours = task.hours || 0;
            const allowedHours = currentUser.allowedHours || 0;
            const projectedHours = currentWeeklyHours + taskHours;

            if (projectedHours > allowedHours) {
                withinHoursLimit = false;
                hoursTooltip = `Claiming this task would put you at ${projectedHours} hours this week (limit: ${allowedHours} hours)`;
            }
        }
    }

    // Build assignment section
    let assignmentSection = '';

    if (assignedUsers.length > 0 || workerSlots > 1) {
        assignmentSection += '<h6>Assigned to:</h6><div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">';

        // Show assigned workers
        assignedNames.forEach(name => {
            assignmentSection += `<span class="badge badge-green"><i class="fa-solid fa-user"></i> ${name}</span>`;
        });

        // Show empty slots
        for (let i = 0; i < openSlots; i++) {
            assignmentSection += `<span class="badge badge-gray"><i class="fa-solid fa-user"></i> Open</span>`;
        }

        assignmentSection += '</div>';
    }

    // Show claim button if there are open slots and user not already assigned
    if (openSlots > 0 && !isUserAssigned) {
        // Check both skills and hours limit
        if (!hasRequiredSkills || !withinHoursLimit) {
            // Determine which tooltip to show (skills takes priority if both fail)
            const tooltip = !hasRequiredSkills ? skillsTooltip : hoursTooltip;
            // Gray out button with tooltip if user lacks required skills or exceeds hours limit
            // Wrap disabled button in span with tooltip since disabled buttons don't trigger hover
            assignmentSection += `<div style="text-align: center;"><span data-tooltip="${tooltip}" style="display: inline-block;"><button data-job-id="${task.id}" disabled>Claim Assignment</button></span></div>`;
        } else {
            assignmentSection += `<div style="text-align: center;"><button data-job-id="${task.id}">Claim Assignment</button></div>`;
        }
    } else if (isUserAssigned) {
        assignmentSection += `<div style="text-align: center; color: #888;"><i>You are assigned to this task</i></div>`;
    } else if (openSlots === 0) {
        assignmentSection += `<div style="text-align: center; color: #888;"><i>All slots filled</i></div>`;
    }

    // Conditional rendering: show priority badge if isPriority is true
    const priorityBadge = task.isPriority
        ? ` <span class="badge badge-yellow"><i class="fa-solid fa-triangle-exclamation"></i> High Priority</span>`
        : '';

    // Build skills section if task has required skills
    let skillsSection = '';
    if (task.requiredSkills && task.requiredSkills.length > 0) {
        const skillBadges = task.requiredSkills.map(skill =>
            `<span class="badge badge-blue">${skill}</span>`
        ).join(' ');

        skillsSection = `
            <details>
                <summary>View Required Skills</summary>
                <div class="details-content">
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${skillBadges}
                    </div>
                </div>
            </details>
        `;
    }

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
            ${skillsSection}
            ${assignmentSection}
        </article>
    `;
}

// Render all jobs to the board
function renderBoard() {
    console.log("Rendering board...");
    console.log("Total tasks:", tasksData.length);
    const boardContainer = document.getElementById('board-listings');
    const now = new Date();

    // Filter tasks:
    // 1. Only show non-completed tasks
    // 2. Hide nonflexible tasks that are past due and not claimed/completed
    // 3. Apply user filters
    let activeTasks = tasksData.filter(task => {
        // Skip completed tasks
        if (task.completed) return false;

        // Check if task is nonflexible and past due
        if (task.nonflexible && task.due) {
            const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);
            const assignedUsers = task.assignedTo || [];

            // Hide if past due and no one claimed it
            if (dueDate < now && assignedUsers.length === 0) {
                console.log(`Hiding nonflexible task "${task.title}" - past due with no assignments`);
                return false;
            }
        }

        return true;
    });

    // Apply user-defined filters
    activeTasks = filterTasks(activeTasks);

    console.log("Active (non-completed) tasks after filtering:", activeTasks.length);
    console.log("Active tasks:", activeTasks);
    if (activeTasks.length === 0) {
        boardContainer.innerHTML = '<h4>No tasks match the current filters. Try adjusting your filter settings.</h4>';
        return;
    } else {
        boardContainer.innerHTML = activeTasks.map(task => renderJobCard(task)).join('');
    }
    console.log("Board rendered with", activeTasks.length, "tasks");

    // Attach event listeners to claim buttons
    attachClaimListeners();

    // Setup smooth animations for details elements
    setupDetailsAnimations();
}

// Setup smooth animations for details dropdowns
function setupDetailsAnimations() {
    const detailsElements = document.querySelectorAll('details');

    detailsElements.forEach(details => {
        const summary = details.querySelector('summary');
        const content = details.querySelector('.details-content');

        summary.addEventListener('click', (e) => {
            e.preventDefault();

            if (details.hasAttribute('open')) {
                // Closing
                const startHeight = content.scrollHeight;
                content.style.height = startHeight + 'px';

                // Force browser to acknowledge the height
                content.offsetHeight;

                details.classList.add('is-closing');
                content.style.height = '0px';
                content.style.opacity = '0';

                const onTransitionEnd = (e) => {
                    if (e.propertyName === 'height') {
                        requestAnimationFrame(() => {
                            details.removeAttribute('open');
                            details.classList.remove('is-closing');
                        });
                        content.removeEventListener('transitionend', onTransitionEnd);
                    }
                };
                content.addEventListener('transitionend', onTransitionEnd);
            } else {
                // Opening
                details.setAttribute('open', '');
                details.classList.add('is-opening');
                const endHeight = content.scrollHeight;
                content.style.height = '0px';
                content.style.opacity = '0';

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        content.style.height = endHeight + 'px';
                        content.style.opacity = '1';
                    });
                });

                const onTransitionEnd = (e) => {
                    if (e.propertyName === 'height') {
                        details.classList.remove('is-opening');
                        content.removeEventListener('transitionend', onTransitionEnd);
                    }
                };
                content.addEventListener('transitionend', onTransitionEnd);
            }
        });
    });
}

// Handle claim button clicks
function attachClaimListeners() {
    const claimButtons = document.querySelectorAll('button[data-job-id]');
    claimButtons.forEach(button => {
        button.addEventListener('click', handleClaim);
    });
}

// Claim a job
async function handleClaim(event) {
    const taskId = event.currentTarget.getAttribute('data-job-id');

    try {
        const task = tasksData.find(t => t.id === taskId);
        if (task && currentUser) {
            const assignedUsers = task.assignedTo || [];
            const workerSlots = task.workerSlots || 1;

            // Check if user already assigned
            if (assignedUsers.includes(currentUser.id)) {
                alert("You are already assigned to this task!");
                return;
            }

            // Check if slots available
            if (assignedUsers.length >= workerSlots) {
                alert("All slots for this task are filled!");
                return;
            }

            // Update task in Firestore - add to arrays
            await updateDoc(doc(db, "tasks", taskId), {
                assignedTo: arrayUnion(currentUser.id),
                assignedToNames: arrayUnion(currentUser.fullName)
            });

            // Update user's assignedJobIds in Firestore
            await updateDoc(doc(db, "users", currentUser.id), {
                assignedJobIds: arrayUnion(taskId)
            });

            // Update local data
            if (!task.assignedTo) task.assignedTo = [];
            if (!task.assignedToNames) task.assignedToNames = [];
            task.assignedTo.push(currentUser.id);
            task.assignedToNames.push(currentUser.fullName);

            if (!currentUser.assignedJobIds) currentUser.assignedJobIds = [];
            currentUser.assignedJobIds.push(taskId);

            // Re-render the board to show updated state
            renderBoard();

            console.log(`Task ${taskId} claimed by ${currentUser.fullName}`);
        }
    } catch (error) {
        console.error("Error claiming task:", error);
        alert("Error claiming task: " + error.message);
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
            renderBoard();
        });
    }

    // Clear filters button
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearTaskFilters();
            renderBoard();
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
