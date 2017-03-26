
# py-pryer
A small weekend project with questionable architectural choices made with personal goals to:

1. Build my first Electron app
2. Grab my listening data from Spotify
3. Try to something fun with the playlists and songs I am listening to.

## Setup application
Follow the instructions found [here](https://developer.spotify.com/web-api/tutorial/) to register an app, read about how to do authentication properly. Once an app has been registered, enter your client_id, client_secret and redirect_uri in `config.yaml` (see `sample-config.yaml` on format).

## Start the application

```
npm install && npm start
```

(Use `cmd-q` on OS-X to terminate the electron application)


### First Time Running or Change of scope
• If you're  running this application for the first time or you've changed the scope, open your browser and navigate to localhost:8888 (default port) to authenticate.
