/* eslint no-console:0 */

let rtmClient = require('@slack/client').RtmClient;
let RTM_EVENTS = require('@slack/client').RTM_EVENTS;
let webClient = require('@slack/client').WebClient;
let async = require('async');

let botToken = process.env.SLACK_BOT_TOKEN || '';
//
// Token for user user with privs to delete files
let userToken = process.env.SLACK_USER_TOKEN || '';
let rtm = new rtmClient(botToken);
let web = new webClient(userToken);

let conversations = [];
rtm.start();

rtm.on(RTM_EVENTS.MESSAGE, (message) => {
  //
  // handle existing convos (we're looking for a 'yes' reply
  if (conversations.length > 0) {
    convo = conversations.find((c) => {
      if (c.channel == message.channel && c.user == message.user) {
        return c;
      }
    });
    if (convo && message.text && message.text.match(/yes/i)){
      _deleteFiles(message, convo);
    }
  }

  //
  // respond to new convos directed at me with @botname
  if (message.text && message.text.includes(`<@${rtm.activeUserId}>`)) {
    _startConversation(message);
  }
});

function _startConversation(message) {

  let user = rtm.dataStore.getUserById(message.user);
  let conversation = {
    channel: message.channel,
    user: message.user,
    convoStartTime: new Date(),
  }

  rtm.sendMessage(`Hello ${user.profile.first_name}`, message.channel, () => {
    conversation.greeted = true;
    _parseDelete(message, conversation);
  });
}

function _parseDelete(message, conversation) {
  //
  // Just look for a number
  let age = message.text.match(/\b\d+\b/);

  //
  // if there is no number or no mention of months, reply with help
  if (!message.text.match(/month/i) || !age) {
    _help(message);
  }
  else {
    conversation.deleteBefore = subtractMonths(age[0]);
    conversation.humanDate = new Date(conversation.deleteBefore *
        1000).toLocaleDateString();
    _getFiles(message, conversation);
  }
}

function _help(message) {
  rtm.sendMessage('Your request to delete files must in include the number ' +
      'of months older than which you want me to delete files. Example:' +
      ' \n\n ' +
      '"@filebot, please delete all files older than 10 months"',
      message.channel);
}

function _confirm(message, conversation) {
  rtm.sendMessage('There are ' + conversation.total + ' files older' +
      ' than ' + conversation.humanDate + ', are you sure you want to' +
      ' delete? ' + 'If so, please respond with "yes".',
      message.channel, () => {
      conversations.push(conversation);
  });
}

function _getFiles(message, conversation) {
  rtm.sendMessage('Having a look, this might take a sec...',
      message.channel, () => {});
  web.files.list({count: 200, ts_to: conversation.deleteBefore}, (err, files) => {
    if (files) {
      conversation.total = files.paging.total || 0;
      if (files.files) {
        conversation.fileIds = files.files.map((f) => { return f.id });
      }
    }

    if (conversation.total == 0) {
      rtm.sendMessage('There are no files older than ' + conversation.humanDate,
          message.channel);
    }
    else {
      _confirm(message, conversation);
    }
  });
}

function _deleteFiles(message, conversation) {
  rtm.sendMessage('Here we go, hold on tight, this will take a' +
      ' few...I\'ll let you know when it\'s done.',
      message.channel, () => {});

  async.forEachSeries(conversation.fileIds, (id, callback) => {
    web.files.delete(id, callback);
  }, (err) => {

    conversations.splice(conversations.findIndex((c) => {
      c.channel == message.channel && c.user == message.user
    }), 1);

    if (err) {
      throw err;
    }
    rtm.sendMessage('Done, have a nice day', message.channel, () => {});
  });

}

//
// get a properly formatted timestamp <months> in the past
// @months - the number of months in the past: e.g. -12
function subtractMonths(months) {
  var d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setHours(0,0,0);
  return d/1000|0;
}
