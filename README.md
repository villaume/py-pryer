
# py-pryer
A small weekend project with questionable architectural choices made with personal goals to

1. Build my first Electron app
2. Grab listening data from Spotify
3. Get inventive in making convoluted loops

## Setup application
Follow the instructions found [here](https://developer.spotify.com/web-api/tutorial/) to register an app, read about how to do authentication properly. Once an app has been registered, enter your client_id, client_secret and redirect_uri in `config.yml` (see `example-config.yml` on format).

## Start the application

```
npm start
```
### Using debugging
```
DEBUG=app npm start
```

## Data Format
Trying to consistently output data as local new-line json files.

### Known Issues
Getting recently played tracks appears to be a bit unstable.
The cursor object referenced in the [doc]('https://developer.spotify.com/web-api/web-api-personalization-endpoints/get-recently-played/') seems to be not returned at times



### First Time Running or Change of scope
• If you're  running this application for the first time or you've changed the scope, open your browser and navigate to localhost:8888 (default port) to authenticate.
