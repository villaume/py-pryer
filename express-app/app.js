
const express = require('express');
const request = require('request');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const path = require('path');
const yaml_config = require('yaml-config');
const SpotifyWebApi = require('spotify-web-api-node');
const Q = require('q');
const _ = require('lodash');
const Promise = require('bluebird');
const fs = require('fs');
const Transform = require('stream').Transform;

try {
    var super_secret = yaml_config.readConfig(path.join(__dirname, '../config.yaml'));
}
catch(err) {
    console.log('please enter client_id and secret in /config.yaml');
    super_secret = {};
}

const client_id =  super_secret.spotify.client_id; // Your client id
const client_secret = super_secret.spotify.client_secret; // Your client secret
const redirect_uri = super_secret.spotify.redirect_uri; // Your redirect uri
/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var promiseWhile = function (condition, payload) {
	var done = Q.defer();
	function loop () {
		if (!condition()) {
			return done.resolve();
		}
		else {
			Q.when(payload(), loop, done.reject);
		}
	}

	Q.nextTick(loop);
	return done.promise;
};

function squash(arr) {
  const flat = [].concat(...arr)
  return flat.some(Array.isArray) ? squash(flat) : flat;
};


var get_all_personal_playlists = function(client, user_id) {
  var keep_going = true;
  var counter = 0;
  var sink = [];

  return promiseWhile(() => {
  			return keep_going === true;
  }, () => {
		counter++;
		return client.getUserPlaylists(user_id,{ 'offset' : (counter-1)*20, 'limit' : 20})
			.then(results => {
        //console.log('cnter',counter)
        if (results.body.next === null) {
          keep_going = false;
        } else {
					keep_going = true;
				}
        //console.log(results.body.items);

        var pwd_lists = _.reject(results.body.items, elem => {
          return elem.owner.id != user_id;
        });
        //console.log(pwd_lists);
        sink.push(pwd_lists);

			});

		}).then(() => {
			return squash(sink);
    });
};


var get_all_tracks_of_a_playlists = function(client, user_id, playlist_id,payload) {
  var keep_going = true;
  var counter = 0;
  var sink = [];
  var payload = payload || {};

  return promiseWhile(() => {
  			return keep_going === true;
  }, () => {
		counter++;
		return client.getPlaylistTracks(user_id,playlist_id,{ 'offset' : (counter-1)*100, 'limit' : 100})
			.then(results => {
        console.log('cnter_songs',counter)
        if (results.body.next === null) {
          keep_going = false;
        } else {
					keep_going = true;
				}
        var mapped_track_results = _.map(results.body.items, elem => {
          return {
            track_name: elem.track.name,
            track_artist: elem.track.artists[0].name,
            track_popularity: elem.track.popularity,
            track_added_at: elem.added_at
          };
        });
        //console.log(results.body.items);
        sink.push(JSON.stringify(mapped_track_results));

			});
		}).then(() => {
			return squash(sink);
    });
};

var get_all_playlists_and_tracks = function(client, user_id) {
  var keep_going = true;
  var counter = 0;
  var sink = [];
  var payload = payload || {};
  var stream = new Transform({ objectMode: true });

  return promiseWhile(() => {
  			return keep_going === true;
  }, () => {
		counter++;
    return client.getUserPlaylists(user_id,{ 'offset' : (counter-1)*20, 'limit' : 20})
      .then(results => {
        var deferred = Q.defer();
        if (results.body.next === null) {
          keep_going = false;
        } else {
          keep_going = true;
        }
        var self_owned_lists = _.reject(results.body.items, elem => {
          return elem.owner.id != user_id;
        });

        return Promise.each(self_owned_lists, elem => {
          return client.getPlaylistTracks(user_id,elem.id,{ 'offset' : 0, 'limit' : 100})
            .then((tracks) => {
              var mapped_track_results = _.map(tracks.body.items, elem => {
                return {
                  track_name: elem.track.name,
                  track_artist: elem.track.artists[0].name,
                  track_popularity: elem.track.popularity,
                  track_added_at: elem.added_at
                };
              });
              var formatting = {
                playlist_id: elem.id,
                playlist_name: elem.name,
                tracks: mapped_track_results
              };
            stream.push(JSON.stringify(formatting) + '\n');
            })
        }).then((originalArray) => {
          console.log('iterating over playlists, at batch: '+counter)
          return Promise.resolve(originalArray)
        })

      });

		}).then(() => {
      console.log('pulled up to 100 tracks for all self-owned playlists');
      stream.push(null);
			return stream;
    });
};


var get_everything = function(client, user_id) {
  var deferred = Q.defer();
  var upstream = fs.createWriteStream('playlistsTracks.txt', {
     encoding: "UTF-8"
   });
   upstream
				.on('error', deferred.reject)
				.on('end', function () {
					deferred.resolve(file_key);
				});
    get_all_playlists_and_tracks(client, user_id)
      .then(result_stream => {
        result_stream
          .pipe(upstream)
          .on('error', deferred.reject)
      });
  return deferred.promise;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(path.join(__dirname, '../')))
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative user-library-read user-top-read';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
          return USR_ID = body.id;
          //console.log({{id}});
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

app.get('/get_playlists', function(req, res) {
  var refresh_token = req.query.refresh_token;
  var access_token = req.query.access_token;
  var spotifyApi = new SpotifyWebApi({
    client_id,
    client_secret,
    redirect_uri
  });
  spotifyApi.setAccessToken(access_token);
  get_all_personal_playlists(spotifyApi,USR_ID)
    .then(rza => {
      console.log(rza);
    });

});

app.get('/get_songs', function(req, res) {
  var refresh_token = req.query.refresh_token;
  var access_token = req.query.access_token;
  var spotifyApi = new SpotifyWebApi({
    client_id,
    client_secret,
    redirect_uri
  });
  spotifyApi.setAccessToken(access_token);

  get_all_tracks_of_a_playlists(spotifyApi,USR_ID,'4pXJ8l5OAwWHKswqvA4Le5')
  .then(rza => {
    console.log('all_tracks:',rza);
  });

});

app.get('/get_everything', function(req, res) {
  var refresh_token = req.query.refresh_token;
  var access_token = req.query.access_token;
  var spotifyApi = new SpotifyWebApi({
    client_id,
    client_secret,
    redirect_uri
  });
  spotifyApi.setAccessToken(access_token);
  get_everything(spotifyApi,USR_ID)
  .then(rza => {
    console.log('everything:',rza);

  });


});


console.log('Listening on 8888');
app.listen(8888);
