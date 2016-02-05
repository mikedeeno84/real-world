'use strict';
var router = require('express').Router();
var mongoose = require('mongoose');
var Game = mongoose.model('Game');
var Event = mongoose.model('Event');
var _ = require('lodash');
var Firebase = require('firebase');

router.get('/', function(req, res, next) {
  Game.find({})
    .then(games => {
      res.status(200).json(games);
    })
    .then(null, next);
});

// var myFirebaseRef = new Firebase("https://flickering-inferno-4436.firebaseio.com/");
var myFirebaseRef = new Firebase("https://character-test.firebaseio.com/");
var game, characters, gameID, gameRef, startTime, endTime;
// gameID = "-K9hE8L_Y2NAxvi8x06R";
// gameRef = myFirebaseRef.child('games').child(gameID);

router.get('/build/:instructionId', function(req, res, next) {
  Game.findById(req.params.instructionId)
    .lean()
    .populate('events')
    .populate('characters')
    .then(function(foundGame) {
      game = foundGame;
      var characterMap = {};
      var eventMap = {};
      game.characters.forEach(function(character) {
        //console.log("character:", character);
        characterMap[character._id] = character;
      })
      var choiceEvents = {}
      game.events.forEach(function(event) {
        event.targets = event.targets.map(function(target) {
          return target.toString();
        })
        eventMap[event._id] = event;

        if (event.type === "choice") {
          choiceEvents[event._id] = {
            targets: event.targets
          };
        }
      })
      game.votes = choiceEvents;
      console.log("character map is", characterMap);
      game.characters = characterMap;
      game.events = eventMap;
      // console.log("GAME IS", game);
      characters = _.shuffle(game.characters);
      gameRef = myFirebaseRef.child('games').push(game);
      gameID = gameRef.key();
      console.log("ID IS", gameID);
      res.json(gameID);
    }).then(null, console.log)
});


var eventHandler = {
  // pushes the most recent message to a characters firebase message array which will be displayed on the characters dashboard
  text: function(textEvent) {
    textEvent.targets.forEach(function(targetId) {
      targetId = targetId.toString();
      gameRef.child('characters').child(targetId).child("message").push({
        message: textEvent.eventThatOccurred
      });
    });
  },

  // pushes a choice to the characters decisions firebase array which will be displayed on the characters dashboard
  choice: function(choiceEvent) {
    choiceEvent.targets.forEach(function(targetId) {
      targetId = targetId.toString();
      gameRef.child('characters').child(targetId).child("decisions").push({
        eventId: choiceEvent._id,
        message: choiceEvent.eventThatOccurred || "",
        decision: choiceEvent.decision,
        answered: false
      });
    })
  }

}

// Function for starting timed events
var startTimed = function() {

  startTime = Date.now();

  var timed = [];

  // Loop through the keys of each of the game's events
  Object.keys(game.events).forEach(function(eventKey) {
    // If a game event has a 'triggeredBy' attribute set to "time",
    // push that game event to the 'timed' array.
    if (game.events[eventKey].triggeredBy === "time") {
      timed.push(game.events[eventKey]);
    }
  });

  // Organize the events in the timed array, in order from latest to the soonest
  timed.sort(function(a, b) {
    return b.timed.timeout - a.timed.timeout;
  });

  // Every 500 milliseconds, do this function:
  return setInterval(function() {
    // IF there are no timed events left, do nothing
    if (timed.length < 1) return;
    // IF the time that has elapsed in the game is greater than or equal to the
    // timeout of the last element in the timed array (which should be the timed
    // event that will happen soonest, a.k.a. the event that should happen now), THEN…
    //   1. Remove the event that should happen now and save it to a temporary variable 'currentEvent'
    //   2. Call the eventHandler function with 'currentEvent'
    //   3. Push object to Firebase, under the specific game we're in > "pastEvents" > "timed".
    //      This object will have a key "pastEvent" and a value with another object.
    //      This inner object has a key of name and a value of the eventThatOccurred
    //      (i.e., "The winners have been announced!"), or an empty string (if nothing exists on that
    //      object at the requested location).
    if (Date.now() - startTime >= timed[timed.length - 1].timed.timeout) {
      var currentEvent = timed.pop();
      eventHandler[currentEvent.type](currentEvent)
      gameRef.child("pastEvents").child("timed").push({
        pastEvent: {
          name: currentEvent.eventThatOccurred || "",
          type: currentEvent.type,
          decision: currentEvent.decision || "",
          targets: currentEvent.targets
        }
      });
    }

  }, 500)
};

// we should put in a safeguard when we launch to disallow a user from loggin in twice!
router.post('/:gameId/register-character', function(req, res, next) {
  var character;

  // characters is a shuffled array of all the characters in this game
  // If there are characters to fill (that have not been assigned),
  if (characters.length > 0) {
    character = characters.pop();
    console.log("GAME ID IS", gameID);
    console.log("._ID", character._id);
    myFirebaseRef.child("games").child(gameID).child("characters").child(character._id.toString()).update({
      "playerName": req.body.playerName,
      "playerNumber": req.body.playerNumber
    });
    res.status(201).json({
      _id: character._id
    });
  } else {
    var err = new Error("There is no more room in the game! Sorry!");
    next(err);
  }
});

var gameStarted = false;
router.get('/start', function(req, res, next) {
  if (!gameStarted) startTimed();
  res.status(200).send('game started')
});

router.get('/:gameId', function(req, res, next) {
  Game.findById(req.params.gameId)
    .then(game => {
      res.status(200).json(game);
    })
    .then(null, next);
});

router.post('/event/:eventId', function(req, res, next) {
  Event.findById(req.params.eventId).exec()
    .then(function(foundEvent) {
      eventHandler[foundEvent.type](foundEvent);
    }).then(null, next);
});

require('./vote-listening.js')
module.exports = {
  router: router,
  eventHandler: eventHandler
};
