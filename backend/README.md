# congenial-carnival
Express Application for accessing the Spotify API

## Pre-Run Setup
This applicaiton requires a .env file with the following contents:
```
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

## API Endpoints
### /auth/get-spotify-login-url
Provides the client with the URL required to authenticate the user's Spotify account.

HTTP Type: `GET`

Request:
- `redirectURI`: When the authentication succeeds, redirect the user to this URL.

Response: JSON formatted URL:
```
{
    redirect_url : string
}
```

### /auth/get-spotify-tokens
Callback endpoint for obtaining Spotify API access tokens after logging in

HTTP Type: `GET`

Request: 
- `code`: authorization token required to receive refresh tokens
- `state`: parameter used to verify consistency of connections
- `redirectURI`: When the authentication succeeds, redirect the user to this URL

Response: JSON formatted Tokens:
```
{
    access_token : string
    refresh_token : string
}
```

### /get-most-played
Gets user's Spotify most played songs

HTTP Type: `GET`

Request:

- `length`: `"short_term"`, `"medium_term"` or `"long_term"`
- `access_token`: Access Token from /callback 

Response: JSON formatted track data:
```
{
    trackData : [
      {
         uri : string,
         name : string,
         artists : string[]
      }
    ]
}
```

### /get-other-user-playlists

TODO

### /get-user-playlists

TODO


### /create-playlist
Creates a new playlist on the User's account with the specified track data. Currently set up to format the playlist with data from the /get-most-played endpoint.

HTTP Type: `POST`

Request:
- `name`: The name of the new playlist.
- `description`: (Optional) The description of the new playlist. If not provided, a default one will be used.
- `access_token`: Access Token from /callback 
- `songList` : `string[]` of Spotify Track URI's to add to Playlist

Response: JSON formatted confirmation data:
```
{
    successful : boolean,
    playlistID : string
}
```
