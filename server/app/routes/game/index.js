'use strict';
var router = require('express').Router();
var mongoose = require('mongoose');
var Game = mongoose.model('Game');
var Event = mongoose.model('Event');
var _ = require('lodash');
var Firebase = require('firebase');

router.get('/', function(req, res, next) {
  console.log("ahhhhhhhh!");
  Game.find({})
    .then(games => {
      console.log("Getting here!");
      res.status(200).json(games);
    })
    .then(null, next);
});

var myFirebaseRef = new Firebase("https://flickering-inferno-4436.firebaseio.com/");
// var myFirebaseRef = new Firebase("https://character-test.firebaseio.com/");
var game, characters, gameID, gameRef;

router.get('/build/:instructionId', function(req, res, next) {
  Game.findById(req.params.instructionId)
    .lean()
    .populate('events')
    .populate('characters')
    .then(function(foundGame) {
      console.log(game)
      game = foundGame;
      var characterMap = {};
      var eventMap = {};
      game.characters.forEach(function(character) {
        //console.log("character:", character);
        characterMap[character._id] = character;
      })

      game.events.forEach(function(event) {
        eventMap[event._id] = event;
      })

      console.log("character map is", characterMap);
      game.characters = characterMap;
      game.events = eventMap;
      // console.log("GAME IS", game);
      characters = _.shuffle(game.characters);
      gameRef = myFirebaseRef.child('games').push(game);
      gameID = gameRef.key();
      console.log("ID IS", gameID);
      res.status(200).send('game built  <a href="/api/game/start">click to start </a>')
    })
});


var eventHandler = {
	//textEvent example object
	// {
	// 	text: "things to say",
	// 	title: "title of things to say",
	// 	characterIds: [characterIds]
	// }
	// pushes the most recent message to a characters firebase message array which will be displayed on the characters dashboard
	text : function(textEvent){
		console.log(gameRef)
		textEvent.targets.forEach(function(targetId){
			targetId = targetId.toString();
			gameRef.child('characters').child(targetId).child("message").push({message:textEvent.eventThatOccurred});
		});
	},


	/*
	some_choiceEvent = {
	characterIds: [characterIds],
	question: "who? what? Where?"
	choices: [{choice object},{choice object}...]
	rootEvent: eventId,
	eventToTrigger: eventId,
	}
	*/
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

var startTimed = function() {

  var startTime = Date.now();
  	var timed = []
  	Object.keys(game.events).forEach(function(eventKey){
  		if(game.events[eventKey].triggeredBy === "time") {
  			timed.push(game.events[eventKey]);
  		}
  	});

	  timed.sort(function(a,b){
	  	return b.timed.timeout - a.timed.timeout;
	  });
  return setInterval(function(){
	  if (timed.length < 1) return;
	  if(Date.now() - startTime >= timed[timed.length-1].timed.timeout){
	    var currentEvent = timed.pop();
	    eventHandler[currentEvent.type](currentEvent)
	    gameRef.child("pastEvents").child("timed").push({pastEvent:{
	      name:currentEvent.eventThatOccurred || ""}});
	  }

	}, 500)
}

// we should put in a safeguard when we launch to disallow a user from loggin in twice!
router.post('/register', function(req, res, next) {
  var character;
  if (characters.length > 0) {
    character = characters.pop()
    character.name = req.body.name;
    res.status(201).json({
      _id: character._id
    });
  } else {
    var err = new Error("There is no more room in the game! Sorry!")
    next(err);
  }
})

router.get('/start', function(req, res, next) {
  startTimed();
  res.status(200).send('game started')
});

router.post('/event/:eventId', function(req, res, next) {
  Event.findById(req.params.eventId).exec()
    .then(function(foundEvent) {
      eventHandler[foundEvent.type](foundEvent);
    }).then(null, next);
})

require('./vote-listening.js')
module.exports = {
  router: router,
  eventHandler: eventHandler
};
