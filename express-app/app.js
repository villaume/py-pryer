
const express = require('express')
const request = require('request')
const querystring = require('querystring')
const cookieParser = require('cookie-parser')
const path = require('path')
const yaml_config = require('yaml-config')
const SpotifyWebApi = require('spotify-web-api-node')
const Q = require('q')
const _ = require('lodash')
const Promise = require('bluebird')
const fs = require('fs')
const Transform = require('stream').Transform
const debug = require('debug')('app')
const rp = require('request-promise')
const JSONStream = require('JSONStream')
const through2 = require('through2')

const promiseWhile = require('../lib/q_while')
const generate_random_string = require('../lib/generate_random_string')

let USR_ID

// load config with credentials
try {
  var super_secret = yaml_config.readConfig(path.join(__dirname, '../config.yml'))
}
catch(err) {
  debug('please enter client_id and secret in /config.yml')
  super_secret = {}
}

const client_id =  super_secret.spotify.client_id // expect to find in ../config.yml see example-config.yml on format
const client_secret = super_secret.spotify.client_secret // dito
const redirect_uri = super_secret.spotify.redirect_uri //


var stream_all_personal_playlists = function(client, user_id) {
  var keep_going = true
  var counter = 0
  var stream = new Transform({ objectMode: true })
  return promiseWhile(() => {
    return keep_going === true
  }, () => {
    counter++
    return client.getUserPlaylists(user_id,{ 'offset' : (counter-1)*20, 'limit' : 20})
      .then(results => {
        if (results.body.next === null) {
          keep_going = false
        } else {
          keep_going = true
        }
        var pwd_lists = _.reject(results.body.items, elem => {
          return elem.owner.id != user_id
        })
        var flattened = _.flattenDeep(pwd_lists)
        flattened.forEach(elem => {
          stream.push(JSON.stringify(elem) + '\n')
        })
        debug('iterating over playlists, at batch: '+counter)
      })
      .then(() => {
        return Promise.resolve()
      })
  }).then(() => {
    debug('pulled all self-owned playlists')
    stream.push(null)
    return stream
  })
}


var get_all_tracks_of_a_playlists = function(client, user_id, playlist_id) {
  var keep_going = true
  var counter = 0
  var sink = []
  return promiseWhile(() => {
    return keep_going === true
  }, () => {
    counter++
    return client.getPlaylistTracks(user_id,playlist_id,{ 'offset' : (counter-1)*100, 'limit' : 100})
      .then(results => {

        if (results.body.next === null) {
          keep_going = false
        } else {
          keep_going = true
        }
        var mapped_track_results = _.map(results.body.items, elem => {
          return {
            track_name: elem.track.name,
            track_artist: elem.track.artists[0].name,
            track_popularity: elem.track.popularity,
            track_added_at: elem.added_at
          }
        })
        sink.push(JSON.stringify(mapped_track_results))

      })
  }).then(() => {
    return _.flattenDeep(sink)
  })
}

var get_all_playlists_and_tracks = function(client, user_id) {
  var keep_going = true
  var counter = 0
  var stream = new Transform({ objectMode: true })

  return promiseWhile(() => {
    return keep_going === true
  }, () => {
    counter++
    return client.getUserPlaylists(user_id,{ 'offset' : (counter-1)*20, 'limit' : 20})
      .then(results => {
        if (results.body.next === null) {
          keep_going = false
        } else {
          keep_going = true
        }
        var self_owned_lists = _.reject(results.body.items, elem => {
          return elem.owner.id != user_id
        })

        return Promise.each(self_owned_lists, elem => {
          return client.getPlaylistTracks(user_id,elem.id,{ 'offset' : 0, 'limit' : 100})
            .then((tracks) => {
              var mapped_track_results = _.map(tracks.body.items, elem => {
                return {
                  track_name: elem.track.name,
                  track_id: elem.track.id,
                  track_artist_name: elem.track.artists[0].name,
                  track_artist_id: elem.track.artists[0].id,
                  track_album_name: elem.track.album.name,
                  track_album_id: elem.track.album.id,
                  track_popularity: elem.track.popularity,
                  track_added_at: elem.added_at
                }
              })
              var formatting = {
                playlist_id: elem.id,
                playlist_name: elem.name,
                tracks: mapped_track_results
              }
              stream.push(JSON.stringify(formatting) + '\n')
            })
        }).then((originalArray) => {
          debug('iterating over playlists, at batch: '+counter)
          return Promise.resolve(originalArray)
        })
      })

  }).then(() => {
    debug('pulled up to 100 tracks for all self-owned playlists')
    stream.push(null)
    return stream
  })
}

var persist_playlists_to_file = function(client, user_id) {
  var deferred = Q.defer()
  const file_key = 'out/playlists.txt'
  var upstream = fs.createWriteStream(file_key, {
    encoding: 'UTF-8'
  })
  upstream
    .on('error', deferred.reject)
    .on('end', function () {
      deferred.resolve(file_key)
    })
  stream_all_personal_playlists(client, user_id)
    .then(result_stream => {
      result_stream
        .pipe(upstream)
        .on('error', deferred.reject)
    })
  return deferred.promise
}


var get_everything = function(client, user_id) {
  var deferred = Q.defer()
  const file_key = 'out/playlistsTracks.txt'
  var upstream = fs.createWriteStream(file_key, {
    encoding: 'UTF-8'
  })
  upstream
    .on('error', deferred.reject)
    .on('end', function () {
      deferred.resolve(file_key)
    })
  get_all_playlists_and_tracks(client, user_id)
    .then(result_stream => {
      result_stream
        .pipe(upstream)
        .on('error', deferred.reject)
    })
  return deferred.promise
}

var stateKey = 'spotify_auth_state'

var app = express()

app.use(express.static(path.join(__dirname, '../')))
   .use(cookieParser())

app.get('/login', function(req, res) {

  var state = generate_random_string(16)
  res.cookie(stateKey, state)

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative user-library-read user-top-read user-read-recently-played'
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }))
})

app.get('/callback', function(req, res) {

  var code = req.query.code || null
  var state = req.query.state || null
  var storedState = req.cookies ? req.cookies[stateKey] : null

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }))
  } else {
    res.clearCookie(stateKey)
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
    }

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
          refresh_token = body.refresh_token

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        }

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          USR_ID = body.id
          return USR_ID = body.id
        })

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }))
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }))
      }
    })
  }
})

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  }

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token
      res.send({
        'access_token': access_token
      })
    }
  })
})

app.get('/get_playlists', function(req, res) {
  var access_token = req.query.access_token
  var spotifyApi = new SpotifyWebApi({
    client_id,
    client_secret,
    redirect_uri
  })
  spotifyApi.setAccessToken(access_token)
  persist_playlists_to_file(spotifyApi, USR_ID)
  .then(rza => {
    debug(rza)
  })
})

app.get('/get_songs', function(req, res) {
  var access_token = req.query.access_token
  var spotifyApi = new SpotifyWebApi({
    client_id,
    client_secret,
    redirect_uri
  })
  spotifyApi.setAccessToken(access_token)
  get_all_tracks_of_a_playlists(spotifyApi,USR_ID,'4pXJ8l5OAwWHKswqvA4Le5')
  .then(rza => {
    debug('all_tracks:',rza)
  })

})

app.get('/get_everything', function(req, res) {
  var access_token = req.query.access_token
  var spotifyApi = new SpotifyWebApi({
    client_id,
    client_secret,
    redirect_uri
  })
  spotifyApi.setAccessToken(access_token)
  get_everything(spotifyApi, USR_ID)
  .then(rza => {
    debug(rza)
  })
})

var get_recent_played = function(options) {
  var keep_going = true
  var counter = 0
  var stream = new Transform({ objectMode: true })
  debug('trying to get recently played tracks')
  return promiseWhile(() => {
    return keep_going === true
  }, () => {
    counter++
    return rp(options)
      .then(results => {
        debug(results)
        if (counter > 2) {
          keep_going = false
        } else {
          keep_going = true
          // options.qs.before = results.cursors.before
        }
        debug('counter',counter)
        _.forEach(results.items, elem => {
          stream.push(JSON.stringify({
            track_name: elem.track.name,
            track_id: elem.track.id,
            track_artist_name: elem.track.artists[0].name,
            track_artist_id: elem.track.artists[0].id,
            track_album_name: elem.track.album.name,
            track_album_id: elem.track.album.id,
            track_popularity: elem.track.popularity,
            track_played_at: elem.played_at
          }) + '\n')
        })
      })
  }).then(() => {
    debug('done pulling recent.. 50 is the limit')
    stream.push(null)
    return stream
  })
}

var sunker = function(options) {
  var deferred = Q.defer()
  const file_key = 'out/tracks_recently_played.txt'
  var upstream = fs.createWriteStream(file_key, {
    encoding: 'UTF-8'
  })
  upstream
    .on('error', deferred.reject)
    .on('end', function () {
      deferred.resolve(file_key)
    })
  get_recent_played(options)
    .then(result_stream => {
      result_stream
        .pipe(upstream)
        .on('error', deferred.reject)
    })
  return deferred.promise
}


app.get('/get_recently_played_tracks', function(req, res) {
  var access_token = req.query.access_token
  var propertiesObject = { limit:10 }
  var options = {
    url: 'https://api.spotify.com/v1/me/player/recently-played',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true,
    qs:propertiesObject
    //resolveWithFullResponse: true
  }
  sunker(options)
  .then(rza => {
    debug(rza)

  })
})

var getStream = function (file_name, parse_key) {
  var stream = fs.createReadStream(file_name, {encoding: 'utf8'}),
    parser = JSONStream.parse(parse_key)
  return stream.pipe(parser)
}

var iter_over_pulled_tracks = function(options) {
  var all = []
  var deferred = Q.defer()
  const file_key = 'out/tracks_audio_profile.txt'
  var stream = new Transform({ objectMode: true })
  var upstream = fs.createWriteStream(file_key, {
    encoding: 'UTF-8'
  })
  const map_stream = through2({ objectMode: true }, function (data, encoding, callback) {
    options.qs.ids = data
    rp(options)
      .then(aud_response => {
        stream.push(aud_response.audio_features)
        return callback(null, aud_response)
      })

  })
  getStream('pl1.txt','tracks.*.track_id') //playlistsTracks
    .pipe(map_stream)
    .on('data', function (data) {
      all.push(JSON.stringify(data.audio_features[0]) + '\n')
    })
    .on('end', () => {
      upstream.on('error', err => { debug('error writing audio_profiles',err) })
      all.forEach(v => { upstream.write(v)})
      upstream.end()
      deferred.resolve(file_key)
    })
    .on('error', deferred.reject)
  return deferred.promise
}

app.get('/get_audio_profile_all_tracks', function(req, res) {
  var access_token = req.query.access_token
  var propertiesObject = {ids:'5WXdaG8d8N7S4rDpbGqBMY,06iHk4N4gngQ747CaZYMyZ' }

  var options = {
    url: 'https://api.spotify.com/v1/audio-features',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true,
    qs:propertiesObject
  }
  iter_over_pulled_tracks(options)
  .then(rza => {
    debug(rza)

  })
})

app.listen(8888)
