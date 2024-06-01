# congenial-carnival
Express Application for accessing the Spotify API

## Pre-Run Setup
This applicaiton requires a .env file with the following contents:
```
MONGODB_CONNSTRING=<Connection string for the application's MongoDB instance>
EXPRESS_SERVER_PORT=<Port to run the Express Application on>
CLIENT_ID=<Your Spotify Application Client ID>
CLIENT_SECRET=<Your Spotify Application Client Secret>
```
## Scripts
The Yarn/NPM scripts available to run for this package are:
- `prebuild`: Run Pre-Build Checks
- `build`: Runs the Typescript Compiler,
- `prestart`: Runs Pre-Start steps (at this stage, just the Typescript Compiler)
- `start`: Run the Node.js Application
- `docker-start`: Run the Docker Compose start script to start the Node.js application and the MongoDB containers. *(Currently the recommended method of startup)*
- `docker-delete`: Run the Docker Compose shutdown scripts and deletes the containers. *(Currently the reccomended method of shutting down and restarting)* 

## API Endpoints
### /auth/spotify
Provides the client with the URL required to authenticate the user's Spotify account.

Request: No Request parameters required

Response: JSON formatted URL:
```
{
    redirect_url : string
}
```

### /callback
Callback endpoint for obtaining access tokens after logging in

Request: 
- `code`: authorization token required to receive refresh tokens
- `state`: parameter used to verify consistency of connections

Response: JSON formatted Tokens:
```
{
    access_token : string
    refresh_token : string
}
```

### /get-most-played
Gets user's Spotify most played songs

Request:

- `length`: `"short_term"`, `"medium_term"` or `"long_term"`
- `access_token`: Access Token from /callback 

Response: JSON formatted track data:
```
{
    trackData : trackData {
        uri : string,
        name : string,
        artists : string[]
    }
}
```

### /create-playlist
Creates a new playlist on the User's account with the specified track data. Currently set up to format the playlist with data from the /get-most-played endpoint.

Request:
- `length`: `"short_term"`, `"medium_term"` or `"long_term"`
- `access_token`: Access Token from /callback 
- `songList` : `string[]` of Spotify Track URI's to add to Playlist

Response: JSON formatted confirmation data:
```
{
    successful : boolean,
    playlistID : string
}
```