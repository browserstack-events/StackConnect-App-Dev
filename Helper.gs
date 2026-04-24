function sendGroupMessage(userIds, message) {
  const props = PropertiesService.getScriptProperties();
  const SLACK_TOKEN = props.getProperty('SLACK_BOT_TOKEN_NOTIFS');
  const conversationOpenUrl = 'https://slack.com/api/conversations.open';
  const chatPostMessageUrl = 'https://slack.com/api/chat.postMessage';

  if (!SLACK_TOKEN || !userIds || userIds.length === 0) {
    Logger.log('Missing Slack token or user IDs');
    return false;
  }

  const uniqueUserIds = [...new Set(userIds)];

  try {
    // Prepare payload to open conversation (DM or group DM)
    const openPayload = {
      users: uniqueUserIds.join(',')  // comma-separated string of user IDs
    };

    const openOptions = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${SLACK_TOKEN}`
      },
      payload: JSON.stringify(openPayload),
      muteHttpExceptions: true
    };

    // Open conversation
    const openResponse = UrlFetchApp.fetch(conversationOpenUrl, openOptions);
    const openData = JSON.parse(openResponse.getContentText());

    if (!openData.ok) {
      Logger.log(`Failed to open conversation: ${openData.error}`);
      return false;
    }

    const channelId = openData.channel.id;

    // Post message
    const success = postMessage(channelId, message, SLACK_TOKEN, chatPostMessageUrl);
    return success;

  } catch (error) {
    Logger.log(`Error in sendGroupMessage: ${error}`);
    return false;
  }
}


function postMessage(channel, text, token, url, thread_ts = null) {
  const payload = { channel, text };
  if (thread_ts) payload.thread_ts = thread_ts;

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseData = JSON.parse(response.getContentText());
    return responseData.ok === true;
  } catch (error) {
    Logger.log('postMessage error: ' + error.toString());
    return false;
  }
}