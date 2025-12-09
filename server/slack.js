const { WebClient } = require('@slack/web-api');
require('dotenv').config();

let slackClient = null;
let isSlackEnabled = false;

// Initialize Slack client
function initSlack() {
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!botToken) {
    console.warn('[Slack] SLACK_BOT_TOKEN not configured - Slack notifications disabled');
    isSlackEnabled = false;
    return false;
  }

  slackClient = new WebClient(botToken);
  isSlackEnabled = true;
  console.log('[Slack] Slack client initialized successfully');
  return true;
}

// Find Slack user by email or name with fallback strategy
async function findSlackUser(email, fullName) {
  if (!isSlackEnabled || !slackClient) {
    console.warn('[Slack] Slack not enabled, returning plain name');
    return { found: false, mention: fullName };
  }

  try {
    // Strategy 1: Try finding by email
    if (email) {
      try {
        console.log(`[Slack] Searching for user by email: ${email}`);
        const result = await slackClient.users.lookupByEmail({ email: email });
        if (result.ok && result.user) {
          console.log(`[Slack] ✓ Found user by email: ${result.user.name} (${result.user.id})`);
          return { found: true, mention: `<@${result.user.id}>`, userId: result.user.id, userName: result.user.name };
        }
      } catch (emailError) {
        console.log(`[Slack] User not found by email: ${emailError.message}`);
      }
    }

    // Strategy 2: Search by full name (First Last)
    if (fullName) {
      try {
        console.log(`[Slack] Searching for user by name: ${fullName}`);
        const result = await slackClient.users.list();

        if (result.ok && result.members) {
          // Try exact match on real_name or display_name
          let user = result.members.find(member =>
            !member.deleted &&
            !member.is_bot &&
            (member.real_name === fullName || member.profile?.display_name === fullName)
          );

          if (user) {
            console.log(`[Slack] ✓ Found user by exact name match: ${user.name} (${user.id})`);
            return { found: true, mention: `<@${user.id}>`, userId: user.id, userName: user.name };
          }

          // Try case-insensitive match
          const lowerFullName = fullName.toLowerCase();
          user = result.members.find(member =>
            !member.deleted &&
            !member.is_bot &&
            (member.real_name?.toLowerCase() === lowerFullName ||
             member.profile?.display_name?.toLowerCase() === lowerFullName)
          );

          if (user) {
            console.log(`[Slack] ✓ Found user by case-insensitive name match: ${user.name} (${user.id})`);
            return { found: true, mention: `<@${user.id}>`, userId: user.id, userName: user.name };
          }
        }
      } catch (nameError) {
        console.log(`[Slack] Error searching by name: ${nameError.message}`);
      }

      // Strategy 3: Try reversed name (Last First)
      const nameParts = fullName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const reversedName = `${nameParts[nameParts.length - 1]} ${nameParts.slice(0, -1).join(' ')}`;
        try {
          console.log(`[Slack] Searching for user by reversed name: ${reversedName}`);
          const result = await slackClient.users.list();

          if (result.ok && result.members) {
            const lowerReversedName = reversedName.toLowerCase();
            const user = result.members.find(member =>
              !member.deleted &&
              !member.is_bot &&
              (member.real_name?.toLowerCase() === lowerReversedName ||
               member.profile?.display_name?.toLowerCase() === lowerReversedName)
            );

            if (user) {
              console.log(`[Slack] ✓ Found user by reversed name match: ${user.name} (${user.id})`);
              return { found: true, mention: `<@${user.id}>`, userId: user.id, userName: user.name };
            }
          }
        } catch (reversedError) {
          console.log(`[Slack] Error searching by reversed name: ${reversedError.message}`);
        }
      }
    }

    // Strategy 4: Fallback - return plain name without @ mention
    console.log(`[Slack] User not found in Slack workspace, using plain name: ${fullName}`);
    return { found: false, mention: fullName };

  } catch (error) {
    console.error('[Slack] Error in findSlackUser:', error);
    return { found: false, mention: fullName };
  }
}

// Send task notification to Slack channel
async function sendTaskNotification(eventType, taskData, userData, additionalData = {}) {
  if (!isSlackEnabled || !slackClient) {
    console.warn('[Slack] Slack not enabled, skipping notification');
    return { success: false, message: 'Slack not configured' };
  }

  const channel = process.env.SLACK_DEFAULT_CHANNEL || 'general';

  try {
    // Find the user in Slack
    const slackUser = await findSlackUser(userData.email, userData.fullName);
    const userMention = slackUser.mention;

    let message = '';

    switch (eventType) {
      case 'task-assigned':
        // Convert Firestore Timestamp to Date if needed
        let dueDateStr = '';
        if (taskData.due) {
          const dueDate = taskData.due.toDate ? taskData.due.toDate() : (taskData.due._seconds ? new Date(taskData.due._seconds * 1000) : new Date(taskData.due));
          dueDateStr = `, due ${dueDate.toLocaleDateString()}`;
        }
        message = `${userMention} You've been assigned to task: *${taskData.title}* (${taskData.hours || 0} hours${dueDateStr})`;
        break;

      case 'task-unclaimed':
        message = `${userMention} has unclaimed task: *${taskData.title}*`;
        break;

      case 'task-completed':
        // For completion, notify all assigned users
        const assignedUsers = additionalData.assignedUsers || [];
        const mentions = [];

        for (const user of assignedUsers) {
          const slackUserInfo = await findSlackUser(user.email, user.fullName);
          mentions.push(slackUserInfo.mention);
        }

        const mentionString = mentions.length > 0 ? mentions.join(' ') + ' ' : '';
        message = `${mentionString}Task completed: *${taskData.title}* by ${userMention}`;
        break;

      default:
        message = `Task update: *${taskData.title}*`;
    }

    // Send the message
    const result = await slackClient.chat.postMessage({
      channel: channel,
      text: message,
      unfurl_links: false,
      unfurl_media: false
    });

    if (result.ok) {
      console.log(`[Slack] ✓ Notification sent successfully to #${channel}`);
      return { success: true, message: 'Notification sent' };
    } else {
      console.error(`[Slack] Failed to send notification:`, result.error);
      return { success: false, message: result.error };
    }

  } catch (error) {
    console.error('[Slack] Error sending notification:', error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  initSlack,
  findSlackUser,
  sendTaskNotification
};
