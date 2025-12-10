import { auth, db } from './firebase-config.js';
import { collection, addDoc, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getApiUrl } from './utils.js';

// Show bug report / feature request dialog
export function showReportDialog(currentUser) {
    // Create dialog HTML
    const dialogHTML = `
        <dialog id="reportDialog">
            <article>
                <header>
                    <button aria-label="Close" rel="prev" id="closeReportDialog"></button>
                    <p><strong>Submit Bug Report / Feature Request</strong></p>
                </header>
                <h3>Help us improve!</h3>
                <hr>
                <label for="reportTitle"><strong>Title:</strong></label>
                <input type="text" id="reportTitle" placeholder="Brief title..." required>
                <hr>
                <label for="reportType"><strong>Type:</strong></label>
                <select id="reportType">
                    <option value="bug">Bug Report</option>
                    <option value="feature">Feature Request</option>
                </select>
                <hr>
                <label for="reportBody"><strong>Description:</strong></label>
                <textarea id="reportBody" rows="6" placeholder="Describe the issue or feature request..." required></textarea>
                <hr>
                <label>
                    <input type="checkbox" id="reportIncludeName" checked>
                    Include my name with this report
                </label>
                <hr>
                <footer>
                    <button id="submitReport"><i class="fa-solid fa-paper-plane"></i> Submit Report</button>
                </footer>
            </article>
        </dialog>
    `;

    // Add dialog to page if not already present
    if (!document.getElementById('reportDialog')) {
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
    }

    const dialog = document.getElementById('reportDialog');
    const closeButton = document.getElementById('closeReportDialog');
    const submitButton = document.getElementById('submitReport');

    // Close button
    closeButton.addEventListener('click', () => {
        dialog.close();
    });

    // Submit button
    submitButton.addEventListener('click', async () => {
        const title = document.getElementById('reportTitle').value.trim();
        const type = document.getElementById('reportType').value;
        const body = document.getElementById('reportBody').value.trim();
        const includeName = document.getElementById('reportIncludeName').checked;

        if (!title || !body) {
            alert('Please fill in all fields');
            return;
        }

        try {
            // Build the report data object
            const reportData = {
                title,
                type,
                body,
                includeName,
                createdAt: Timestamp.fromDate(new Date()),
                completed: false
            };

            // Only add name and email if user wants to include it
            if (includeName) {
                reportData.submitterName = currentUser.fullName;
                reportData.submitterEmail = currentUser.email;
            }

            // Submit report to Firestore
            await addDoc(collection(db, "reports"), reportData);

            // Send Slack notification to all devs
            await sendDevNotification(type);

            // Close dialog and reset form
            dialog.close();
            document.getElementById('reportTitle').value = '';
            document.getElementById('reportBody').value = '';
            document.getElementById('reportIncludeName').checked = true;

            alert(`${type === 'bug' ? 'Bug report' : 'Feature request'} submitted successfully!`);

        } catch (error) {
            console.error('Error submitting report:', error);
            alert('Error submitting report: ' + error.message);
        }
    });

    // Show dialog
    dialog.showModal();
}

// Send Slack notification to all developers
async function sendDevNotification(reportType) {
    try {
        // Get all users
        const usersCollection = collection(db, "users");
        const usersSnapshot = await getDocs(usersCollection);
        const allUsers = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Filter developers
        const developers = allUsers.filter(user => user.isDev);

        if (developers.length === 0) {
            console.warn('No developers found to notify');
            return;
        }

        // Get auth token
        const idToken = await auth.currentUser.getIdToken();

        // Send notification
        await fetch(getApiUrl('notify/new-report'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                reportType,
                developers: developers.map(dev => ({
                    email: dev.email,
                    fullName: dev.fullName
                }))
            })
        });

        console.log(`Slack notification sent to ${developers.length} developer(s)`);

    } catch (error) {
        console.warn('Slack notification failed (non-critical):', error);
    }
}
