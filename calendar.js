import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getPageUrl } from './utils.js';
import { initialize as initializeWhenIWork, getUserById } from './wheniwork.js';
import { showReportDialog } from './report-utils.js';

let currentUser = null;
let tasksData = [];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentUser = {
                id: user.uid,
                ...userDoc.data()
            };

            await initializeWhenIWork().catch(err => console.error('[WhenIWork Init]', err));
            await loadTasks();
            initCalendar();
            setupButtons();
        }
    } else {
        window.location.href = getPageUrl("signin");
    }
});

async function loadTasks() {
    try {
        const tasksSnapshot = await getDocs(collection(db, "tasks"));
        tasksData = tasksSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error("Error loading tasks:", error);
    }
}

// Read the active theme's primary color for use in FullCalendar events
function getPrimaryColor() {
    return getComputedStyle(document.documentElement)
        .getPropertyValue('--pico-primary').trim() || '#1095c1';
}

function buildEvents() {
    const primaryColor = getPrimaryColor();
    const events = [];

    // 1. WhenIWork shifts — exclude task-manager-created ones
    if (currentUser.wiwUserId) {
        const wiwUser = getUserById(currentUser.wiwUserId);
        if (wiwUser && wiwUser.shifts) {
            wiwUser.shifts.forEach(shift => {
                const isTaskManagerShift = shift.notes &&
                    shift.notes.includes('(Created via IRL Task Manager');
                if (!isTaskManagerShift) {
                    events.push({
                        title: shift.title || 'WhenIWork Shift',
                        start: shift.start_time,
                        end: shift.end_time,
                        backgroundColor: primaryColor,
                        borderColor: primaryColor,
                        textColor: '#ffffff',
                        extendedProps: { type: 'wiw', shiftData: shift }
                    });
                }
            });
        }
    }

    // Assigned, incomplete tasks for this user
    const userTasks = tasksData.filter(task =>
        currentUser.assignedJobIds &&
        currentUser.assignedJobIds.includes(task.id) &&
        !task.completed
    );

    userTasks.forEach(task => {
        if (!task.due) return;
        const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);

        if (task.nonflexible) {
            // 2. Non-flexible tasks — block from (due − hours) to due
            const hours = Number(task.hours) || 1;
            const startDate = new Date(dueDate.getTime() - hours * 60 * 60 * 1000);
            events.push({
                title: task.title,
                start: startDate,
                end: dueDate,
                backgroundColor: '#ef4444',
                borderColor: '#ef4444',
                textColor: '#ffffff',
                extendedProps: { type: 'nonflex', taskData: task }
            });
        } else {
            // 3. Flexible tasks — reminder at due date/time (no end time)
            events.push({
                title: `${task.title} (Due)`,
                start: dueDate,
                backgroundColor: '#8b5cf6',
                borderColor: '#8b5cf6',
                textColor: '#ffffff',
                extendedProps: { type: 'flex', taskData: task }
            });
        }
    });

    return events;
}

function formatDate(date) {
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function showEventDialog(info) {
    const props = info.event.extendedProps;
    const dialog = document.getElementById('eventDialog');
    const titleEl = document.getElementById('eventDialogTitle');
    const bodyEl = document.getElementById('eventDialogBody');

    let html = '';

    if (props.type === 'wiw') {
        const shift = props.shiftData;
        const start = new Date(shift.start_time);
        const end = new Date(shift.end_time);
        const hours = ((end - start) / (1000 * 60 * 60)).toFixed(1);

        titleEl.textContent = shift.title || 'WhenIWork Shift';
        html += `<span class="event-type-badge" style="background-color: rgba(var(--fc-button-bg-color, #1095c1), 0.15); color: ${getPrimaryColor()}; border: 1px solid ${getPrimaryColor()};">WhenIWork Shift</span>`;
        html += `<div class="event-detail-row"><i class="fa-regular fa-clock"></i><span>${formatDate(start)}</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-solid fa-arrow-right"></i><span>${formatDate(end)}</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-solid fa-hourglass-half"></i><span>${hours} hours</span></div>`;
        if (shift.notes) {
            html += `<hr><div class="event-detail-row"><i class="fa-solid fa-note-sticky"></i><span style="white-space: pre-wrap;">${shift.notes}</span></div>`;
        }

    } else if (props.type === 'nonflex') {
        const task = props.taskData;
        const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);
        const hours = Number(task.hours) || 1;
        const startDate = new Date(dueDate.getTime() - hours * 60 * 60 * 1000);

        titleEl.textContent = task.title;
        html += `<span class="event-type-badge" style="background-color: #fee2e2; color: #dc2626; border: 1px solid #ef4444;"><i class="fa-solid fa-lock"></i> Non-Flexible Task</span>`;
        html += `<div class="event-detail-row"><i class="fa-solid fa-play"></i><span>${formatDate(startDate)}</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-regular fa-calendar-xmark"></i><span>Due: ${formatDate(dueDate)}</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-regular fa-clock"></i><span>${task.hours} hours</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-solid fa-tag"></i><span>${task.category}</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-solid fa-location-dot"></i><span>${task.location}</span></div>`;
        if (task.description) {
            html += `<hr><div class="event-detail-row"><i class="fa-solid fa-align-left"></i><span>${task.description}</span></div>`;
        }

    } else if (props.type === 'flex') {
        const task = props.taskData;
        const dueDate = task.due.toDate ? task.due.toDate() : new Date(task.due);

        titleEl.textContent = task.title;
        html += `<span class="event-type-badge" style="background-color: #ede9fe; color: #7c3aed; border: 1px solid #8b5cf6;"><i class="fa-regular fa-bell"></i> Due Date Reminder</span>`;
        html += `<div class="event-detail-row"><i class="fa-regular fa-calendar"></i><span>${formatDate(dueDate)}</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-regular fa-clock"></i><span>${task.hours} hours</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-solid fa-tag"></i><span>${task.category}</span></div>`;
        html += `<div class="event-detail-row"><i class="fa-solid fa-location-dot"></i><span>${task.location}</span></div>`;
        if (task.description) {
            html += `<hr><div class="event-detail-row"><i class="fa-solid fa-align-left"></i><span>${task.description}</span></div>`;
        }
    }

    bodyEl.innerHTML = html;
    dialog.showModal();
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendarEl.innerHTML = '';

    // Update legend WhenIWork dot color to match theme primary
    const legendWiw = document.getElementById('legend-wiw');
    if (legendWiw) {
        legendWiw.style.backgroundColor = getPrimaryColor();
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        },
        buttonText: {
            today: 'Today',
            month: 'Month',
            week: 'Week',
            day: 'Day',
            list: 'List'
        },
        events: buildEvents(),
        eventClick: showEventDialog,
        nowIndicator: true,
        height: 'auto',
        eventTimeFormat: {
            hour: 'numeric',
            minute: '2-digit',
            meridiem: 'short'
        }
    });

    calendar.render();
}

function setupButtons() {
    document.getElementById('logoutButton')?.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });

    document.getElementById('reportButton')?.addEventListener('click', () => {
        showReportDialog(currentUser);
    });

    document.getElementById('settingsButton')?.addEventListener('click', () => {
        document.getElementById('settingsDialog')?.showModal();
    });

    document.getElementById('closeSettingsDialog')?.addEventListener('click', () => {
        document.getElementById('settingsDialog')?.close();
    });

    document.getElementById('closeEventDialog')?.addEventListener('click', () => {
        document.getElementById('eventDialog')?.close();
    });
}