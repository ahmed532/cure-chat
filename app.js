/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*eslint-env node */
'use strict';

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var Conversation = require('watson-developer-cloud/conversation/v1'); // watson sdk

var request = require('request');
var deasync = require('deasync');

var app = express();
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper
var conversation = new Conversation({
  // If unspecified here, the CONVERSATION_USERNAME and CONVERSATION_PASSWORD env properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property

// Bootstrap application settings
   username: 'd09caa32-5807-429a-9357-0c48c4f0d9ca',
   password: 'SsFTuRM3K4Ki',
  url: 'https://gateway.watsonplatform.net/conversation/api',
  version_date: '2016-10-21',
  version: 'v1'
});

// Endpoint to be call from the client side
app.post('/api/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || '61913971-39c2-4997-bc9d-21b379de2721';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }
  var payload = {
    workspace_id: workspace,
    context: req.body.context || {},
    input: req.body.input || {}
  };

  // Send the input to the conversation service
  conversation.message(payload, function(err, data) {
    if (err) {
      return res.status(err.code || 500).json(err);
    }
    //console.log(data);
    return res.json(updateMessage(payload, data));
  });
});
/**
 * Updates the response text using the intent confidence
 * @param  {Object} input The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
var intent_db_data = {'call': 'phone',
                   'send_message': 'phone',
                   'get_location': 'location',
                   'email': 'email',
                   'get_rate': 'rate',
                   'user_rate': 'rate'}

function updateMessage(input, response) {
  var responseText = null;
  if (!response.output) {
    response.output = {};
  } else {
  	if (response.intents && response.intents[0]) {
  	responseText = '';
    var intent = response.intents[0];
    // Depending on the confidence of the response the app can return different messages.
    // The confidence will vary depending on how well the system is trained. The service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests the service is unsure of the
    // user's intent . In these cases it is usually best to return a disambiguation message
    // ('I did not understand your intent, please rephrase your question', etc..)
    if(intent.intent in intent_db_data){
      console.log(intent.intent);
      if(response.entities.length > 0){
        console.log(response.entities);
        request('http://cure.mybluemix.net/api/'+response.entities[0].entity+'/findOne?filter[where][name]='+response.entities[0].value, function(err, r, body){
          response.output.db = {};
          //console.log(body);
          response.output.db.body = JSON.parse(body);
        });
        console.log("request is in call back.")
        while(response.output.db === undefined) {
          deasync.runLoopOnce();
        }
        console.log("**Request finished\n\n\n");
        if(intent.intent == 'get_location'){
          response.output.map = response.output.db.body[intent_db_data[intent.intent]];
        }
        else if(intent.intent == 'get_rate'){
          response.output.text += ' ' + response.output.db.body['rate']['score'] + '/10 from ' + response.output.db.body['rate']['n'] + ' users.';
        }
        else if(intent.intent == 'user_rate'){
        request.post({url:'https://mariam2.mybluemix.net/analyze', form: {"text":input.input.text}},
        //request.post({url:'https://mariam2.mybluemix.net/analyze', form: {"text":'anglo american is a bad hospital'}},
         function(err,httpResponse,body){
          console.log("analysis");
          console.log(err);
          //console.log(httpResponse);
          console.log(body);
          body = JSON.parse(body);
          var user_rate = body.docSentiment.score;
          var old_rate = response.output.db.body.rate.score;
          var old_n_users = response.output.db.body.rate.n;
          var hospital_id = response.output.db.body.id;
          console.log('user rate: ' + user_rate);
          var new_n_users = old_n_users + 1;
          var new_rate = (old_rate*old_n_users+user_rate*10)/new_n_users;
          request.patch({url:'http://cure.mybluemix.net/api/hospitals/'+hospital_id, form: {"rate":{"n":new_n_users, "score":new_rate}}}, 
            function(err,httpResponse,body){
              console.log("Patched hospital");
              //console.log(httpResponse);
              console.log(body);
            });
         });
        }
        else{
          response.output.text += ' ' + response.output.db.body[intent_db_data[intent.intent]];     
        }
      } 
    }
  }
  response.output.proctext = responseText;
  return response;
  }
  if (response.intents && response.intents[0]) {
    var intent = response.intents[0];
    // Depending on the confidence of the response the app can return different messages.
    // The confidence will vary depending on how well the system is trained. The service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests the service is unsure of the
    // user's intent . In these cases it is usually best to return a disambiguation message
    // ('I did not understand your intent, please rephrase your question', etc..)
    if (intent.confidence >= 0.75) {
      responseText = 'I understood your intent was ' + intent.intent;
    } else if (intent.confidence >= 0.5) {
      responseText = 'I think your intent was ' + intent.intent;
    } else {
      responseText = 'I did not understand your intent';
    }
  }
  response.output.text = responseText;
  return response;
}

module.exports = app;
