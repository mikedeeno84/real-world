app.factory('GameFactory', function($http, $firebaseObject) {
  var extractData = function(response) {
    return response.data;
  };

  var fac = {
    triggerGameStart: function(gameId) {
      return $http.get('/api/game/start/' + gameId)
        .then(extractData);
    },
    getOneGame: function(gameId) {
      return $firebaseObject(new Firebase('https://character-test.firebaseio.com/games/' + gameId));
    }
  };

  return fac;
});
