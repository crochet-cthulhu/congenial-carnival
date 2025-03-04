/**
 * This is the entry point for Congenial-Carnival, the API for the Spotify Playlist Manager app.
 * @module Congenial-Carnival-API
 */
import dotenv from 'dotenv';
dotenv.config();

import axios, { AxiosError } from 'axios';
import cors from 'cors';
import express from 'express';
// TODO Re-add validator
//import { query, validationResult } from 'express-validator'
// import * as Types from './types';
import * as SpotifyTypes from './spotifyTypes';
import { addEventToDb, addPlaylistToDb, getPlaylistsFromDb, getPlaylistTracksFromDb } from './db';

// Express App Config
const expressApp = express();
expressApp.use(cors());
expressApp.use(express.json());
const stateKey = 'spotify_auth_state';
const port = process.env.EXPRESS_SERVER_PORT || 5050;
// const redirectURI = 'http://localhost:3000/app/callback';

/**
 * Generate a random string of characters
 * @param length the length of the random string
 * @returns A random string of characters
 */
function generateRandomString(length: number) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Default Error logging methodology for handling Axios errors
 * @param error the error thrown by call to Axios
 */
function handleAxiosError(error: Error | AxiosError) {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(error.response.data);
      console.error(error.response.status);
      console.error(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.error(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error', error.message);
    }
    console.error(error.config);
  } else {
    // Stock Error - log and move on
    console.error(error);
  }
}

console.log("Initialising Express Endpoints");

/**
 * Express API Endpoint /api/placeholder
 * @returns Hello World in JSON
 */
expressApp.get('/api/placeholder', cors(), (req, res) => {
  const list = ["Hello", "World!"];
  res.json(list);
  console.log('Sent Hello World');
})

/**
 * Express API Endpoint /auth/get-spotify-login-url
 */
expressApp.get('/auth/get-spotify-login-url', function (req, res) {
  console.log('/auth/spotify - Auth request received')

  // Send State Key
  const state = generateRandomString(16);
  res.cookie(stateKey, state);
  console.log(stateKey, state);

  // Currently we expect this to be 'http://localhost:3000/app/callback';
  const redirectURI: string = req.query.redirectURI.toString();
  // TODO error handling if redirectURI doesn't exist

  // Construct Redirect URL
  const scope = 'user-read-private \
   user-read-email \
   user-top-read \
   playlist-read-private \
   playlist-modify-private \
   ';
  const responseParams = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    scope: scope,
    redirect_uri: redirectURI,
    state: state
  }).toString();
  const responseURL = 'https://accounts.spotify.com/authorize?' + responseParams;

  // Send Response
  console.log("Response will be ", responseURL);
  res.json({
    redirect_url: responseURL
  })
});

/**
 * Express API Endpoint /auth/get-spotify-tokens
 */
expressApp.get('/auth/get-spotify-tokens', function (req, res) {
  // Request refresh and access tokens after checking the state parameter
  const authorizationCode = req.query.code || null;
  const state = req.query.state || null;
  const redirectURI: string = req.query.redirectURI.toString();

  // TODO Figure out how to use state properly  
  if (state == null) {
    // TODO Later: Figure out the best way to check state
    const errorParams = new URLSearchParams({
      error: 'state_mismatch'
    }).toString();
    res.redirect('/#' + errorParams);
  } else {
    // TODO Clear state?      
    // Request tokens          
    axios({
      url: '/token',
      method: 'post',
      baseURL: 'https://accounts.spotify.com/api',
      params: { // All paremeters here are required for Authorization Code Flow
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: redirectURI
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      auth: {
        username: process.env.CLIENT_ID,
        password: process.env.CLIENT_SECRET
      }
    }).then(function (response) {
      axios({
        url: 'https://api.spotify.com/v1/me',
        method: 'get',
        headers: {
          'Authorization': 'Bearer ' + response.data.access_token
        }
      })

      res.json({
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token
      })

      addEventToDb("Callback endpoint passed").catch(() => {
        console.log("Failed DB entry at Callback")
      });

    }).catch(function (error) {
      console.error("Error requesting tokens")
      handleAxiosError(error);
    });
  }
});

/**
 * Express API Endpoint /get-most-played
 */
expressApp.get('/get-most-played', function (req, res) {
  console.log("Requesting songs");

  const timeRange: string = req.query.length as string || "long_term" // Will be short_term, medium_term or long_term
  const access_token: string = req.query.access_token as string

  const requestParams = new URLSearchParams({
    time_range: timeRange,
    limit: "50"
  }).toString();

  // Request User's Most-Played Tracks for the given length
  axios({
    url: 'https://api.spotify.com/v1/me/top/tracks?' + requestParams,
    method: 'get',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + access_token
    }
  }).then(function (response) {
    console.log("GET Response ", response.status);
    const trackList: SpotifyTypes.Track[] = response.data.items;
    res.send({
      trackData: trackList
    });

    addEventToDb("get-most-played endpoint passed with " + timeRange).catch(() => {
      console.log("Failed DB entry at get-most-played " + timeRange)
    });

  }).catch(function (error) {
    handleAxiosError(error);
  });
});

/**
 * Get the playlists of another user
 */
expressApp.get('/get-other-user-playlists', function (req, res) {
  console.log("Getting playlists of user")

  const userID: string = req.query.userID as string || "UNPOPULATED"
  const access_token: string = req.query.access_token as string

  axios({
    url: 'https://api.spotify.com/v1/users/' + userID + '/playlists',
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + access_token,
      'Content-Type': 'application/json'
    }
  }).then(function (response) {
    console.log("GET Response ", response.status);
    // const playlistList: SpotifyTypes.Playlist[] = (({ tracks, ...o }) => o)(response.data.items);
    const { tracks : _tracks, ...playlistList } = response.data.items;
    res.send({
      playlistData: playlistList
    });

    addEventToDb("get-other-user-playlists endpoint passed with " + userID).catch(() => {
      console.log("Failed DB entry at get-other-user-playlists " + userID)
    });

  }).catch(function (error) {
    handleAxiosError(error);
  });
});

/**
 * Helper function to fetch data from Spotify API with pagination
 * @param url The base URL for the Spotify API endpoint
 * @param accessToken The access token for Spotify API
 * @param limit The number of items to fetch per request
 * @param processItems A callback function to process the items from each response
 * @returns A promise that resolves when all data has been fetched
 */
async function fetchDataFromSpotify<T>(
  url: string,
  accessToken: string,
  limit: number,
  processItems: (items: T[]) => void
): Promise<void> {
  let offset = 0;
  let hasMoreData = true;

  while (hasMoreData) {
    const requestParams = new URLSearchParams({
      limit: String(limit),
      offset: String(offset)
    });

    const requestUrl = `${url}?${requestParams}`;

    try {
      const response = await axios({
        url: requestUrl,
        method: 'get',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const items: T[] = response.data.items;
      processItems(items);

      if (response.data.next === null) {
        hasMoreData = false;
      } else {
        offset += limit;
      }
    } catch (error) {
      if (error instanceof Error) {
        handleAxiosError(error);
      }
      throw error;
    }
  }
}

/**
 * Get current user's playlists
 */
expressApp.get('/get-user-playlists', async (req, res) => {
  console.log("Getting playlists of user");

  const access_token: string = req.query.access_token as string;
  const limit = 50;
  const finalPlaylistList: SpotifyTypes.Playlist[] = [];

  try {
    await fetchDataFromSpotify<SpotifyTypes.Playlist>(
      'https://api.spotify.com/v1/me/playlists',
      access_token,
      limit,
      (items) => {
        items.map((item) => {
          // finalPlaylistList.push( (({tracks, ...o}) => o)(item) );
          const {tracks: _tracks, ...restOfItem} = item
          finalPlaylistList.push(restOfItem)
        });
      }
    );

    res.send({
      playlistData: finalPlaylistList
    });

    addEventToDb("get-user-playlists endpoint passed").catch(() => {
      console.log("Failed DB entry at get-user-playlists");
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
    res.status(500).send({ error: "Failed to fetch user playlists" });
  }
});

/**
 * Express API Endpoint /get-playlist-tracks
 */
expressApp.get('/get-playlist-tracks', async (req, res) => {
  console.log("Getting playlist tracks");

  const access_token: string = req.query.access_token as string;
  const playlistID: string = req.query.playlistID as string;
  const limit = 50;
  const finalTrackList: SpotifyTypes.Track[] = [];

  try {
    // Get playlist track list
    await fetchDataFromSpotify<SpotifyTypes.Track>(
      `https://api.spotify.com/v1/playlists/${playlistID}/tracks`,
      access_token,
      limit,
      (items) => {
        items.map((item) => {
          finalTrackList.push(item);
        });
      }
    );

    // Get playlist additional data
    const playlistDataResponse = await axios({
      url: `https://api.spotify.com/v1/playlists/${playlistID}`,
      method: 'get',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    // const playlistData: SpotifyTypes.Playlist = (({ tracks, ...o }) => o)(playlistDataResponse.data.items);
    const { tracks: _tracks, ...playlistData } = playlistDataResponse.data.items;
    playlistData.tracks = finalTrackList;

    res.send(playlistData);

    addEventToDb("get-playlist-tracks endpoint passed").catch(() => {
      console.log("Failed DB entry at get-playlist-tracks");
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
    res.status(500).send({ error: "Failed to fetch playlist tracks" });
  }
});

/**
 * Express API Endpoint /create-playlist
 */
expressApp.post('/create-playlist', (req, res) => {
  // TODO complete
  console.log("Reached create-playlist via POST");
  const { name: playlistName, description: playlistDescription, access_token, songList } = req.body;

  if (!playlistName || !access_token || !songList) {
    res.status(400).send({ error: "Missing Parameters" });
    return;
  }

  console.log("Name: ", playlistName);
  console.log("Description: ", playlistDescription);
  console.log("Access Token: ", access_token);
  console.log("Song List: ", songList);

  let playlistID = "UNPOPULATED"

  // Get User's ID
  axios({
    url: 'https://api.spotify.com/v1/me',
    method: 'get',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + access_token
    }
  }).then(function (response) {
    console.log("GET Response ", response.status);
    const userID: string = response.data.id;
    console.log("Obtained User ID: " + userID);

    axios({
      url: 'https://api.spotify.com/v1/users/' + userID + '/playlists',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + access_token
      },
      method: 'post',
      data: {
        name: playlistName,
        public: false,
        collaborative: false,
        description: playlistDescription
      }
    }).then(function (response) {
      console.log("POST Response ", response.status);
      playlistID = response.data.id

      // Add songs to this new playlist
      console.log("Playlist ID: " + playlistID)

      axios({
        url: 'https://api.spotify.com/v1/playlists/' + playlistID + '/tracks?uris=' + songList,
        method: "post",
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token
        }
      }).then(function (response) {
        console.log("POST Response: ", response.status);
        console.log("Successfully added songs to Playlist " + playlistID)
        res.json({
          successful: true,
          playlistID: playlistID
        })

        addEventToDb("create-playlist endpoint passed for playlist " + playlistName).catch(() => {
          console.log("Failed DB entry at create-playlist " + playlistName)
        });

      }).catch(function (error) {
        // Playlist Update Failed
        handleAxiosError(error);
        res.json({
          successful: false,
          playlistID: playlistID
        });
      });
    }).catch(function (error) {
      // Playlist Creation Failed
      handleAxiosError(error);
    });
  }).catch(function (error) {
    // User ID Get Failed
    handleAxiosError(error);
  });
});

expressApp.post("/cache-playlist", async (req, res) => {
  const { playlistData } = req.body;

  if (!playlistData) {
    res.status(400).send({ error: "Missing Parameters" });
    return;
  }

  addPlaylistToDb(playlistData).catch(() => {
    console.log("Failed DB entry at cache-playlist")
    addEventToDb("cache-playlist endpoint failed").catch(() => {
      console.log("Failed DB event entry at cache-playlist failure")
    }
    );
    res.status(500).send({ error: "Failed to cache playlist" });
    return;
  }
  );

  addEventToDb("cache-playlist endpoint passed").catch(() => {
    console.log("Failed DB event entry at cache-playlist success")
  }
  );
  res.send({ success: true });

});

expressApp.get("/get-cached-playlists", async (req, res) => {
  const playlists = await getPlaylistsFromDb();
  res.send(playlists);
});

expressApp.get("/get-cached-playlist-tracks", async (req, res) => {
  const playlistId = req.query.playlistID as string;
  console.log("Getting cached playlist tracks for playlist ID ", playlistId);
  const playlistResult = await getPlaylistTracksFromDb(playlistId);
  console.log("Playlist result: ", playlistResult)
  res.send(playlistResult);
});

/**
 * Express API Endpoint 'Any Other Request'
 */
expressApp.get('*', (req) => {
  console.log("User reached Any Other Requests endpoint with URL ", req.originalUrl)
});

expressApp.listen(port);
console.log("Express Server Listening on Port " + port);
