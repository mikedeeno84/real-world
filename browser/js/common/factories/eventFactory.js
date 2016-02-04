app.factory('eventFactory', function($http){
	var eventFactory = {};
	eventFactory.triggerEvent = function (eventId){
		return $http.get('/api/game/event/' + eventId)
		.then(null, next)
	}
	return eventFactory;
})