/**
 * This is the entry point for Congenial-Carnival, the API for the Spotify Playlist Manager app.
 * @module Congenial-Carnival-API
 */
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import cors from 'cors';
import express from 'express';
// TODO Re-add validator
//import { query, validationResult } from 'express-validator'
import * as SpotifyTypes from './spotifyTypes';
import { addEventToDb, addPlaylistToDb, getPlaylistsFromDb, getPlaylistTracksFromDb, getJointPlaylistTracksFromDb } from './db';
import { JointPlaylistManagementData } from './models/management';
import { generateRandomString, handleAxiosError, fetchDataFromSpotify, createOrUpdatePlaylist } from './util';

// Express App Config
const expressApp = express();
expressApp.use(cors());
expressApp.use(express.json({ "limit": "50mb" }));
expressApp.use(express.urlencoded({ extended: true }));
const stateKey = 'spotify_auth_state';
const port = process.env.EXPRESS_SERVER_PORT || 5050;

console.log("Initialising Express Endpoints");

/**
 * Express API Endpoint /api/placeholder
 * @returns Hello World in JSON
 */
expressApp.get('/api/placeholder', cors(), (_req, res) => {
  const list = ["Hello", "World!"];
  res.json(list);
  console.log('Sent Hello World');
})

/**
 * Express API Endpoint /auth/get-spotify-login-url
 * Used for user authentication with Spotify
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
   user-library-read \
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
 * Used for getting Spotify Access and Refresh Tokens
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

expressApp.get('/get-user', async function (req, res) {
  console.log("Reached get-user endpoint")
  const access_token: string = req.query.access_token as string
  try {


    const response = await axios({
      url: 'https://api.spotify.com/v1/me',
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + access_token
      }
    })
    res.json(response.data)
  } catch (error) {
    if (error instanceof Error) {
      handleAxiosError(error)
    }
    res.status(500).send();
  }
})

/**
 * Express API Endpoint /get-most-played
 * Gets the user's most played songs according to the Spotify API's /top/tracks endpoint
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
 * Express API Endpoint /get-other-user-playlists
 * Gets the playlists of the specified user
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
    const { tracks: _tracks, ...playlistList } = response.data.items;
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
 * Express API Endpoint /get-user-playlists
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
          const { tracks: _tracks, ...restOfItem } = item
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
 * Get the full details of a playlist, including its full track list
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

    const { tracks: _tracks, ...playlistData } = playlistDataResponse.data;
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

expressApp.get('/get-liked-tracks', async (req, res) => {
  const access_token: string = req.query.access_token as string;
  const limit: number = 50;
  const finalTrackList: SpotifyTypes.Track[] = [];

  try {
    await fetchDataFromSpotify<SpotifyTypes.Track>(
      `https://api.spotify.com/v1/me/tracks`,
      access_token,
      limit,
      (items: SpotifyTypes.Track[]) => {
        items.map((item) => {
          finalTrackList.push(item);
        })
      }
    );

    console.log("Track List Size: ", finalTrackList.length)
    if (finalTrackList.length) {
      console.log("Track List Sample: ", finalTrackList[0])
    }

    res.send({
      playlistData: finalTrackList
    });

    addEventToDb("get-liked-tracks endpoint passed").catch(() => {
      console.log("Failed DB entry at get-liked-tracks");
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
    res.status(500).send({ error: "Failed to fetch liked tracks" });
  }
})

/**
 * Express API Endpoint /create-playlist
 * Create a new playlist with the given name, description and track list
 */
expressApp.post('/create-playlist', async (req, res) => {
  const { name: playlistName, description: playlistDescription, access_token, songList, management } = req.body;


  if (!songList) {
    res.status(400).send({ error: "Missing Parameters" });
    return;
  }

  createOrUpdatePlaylist(playlistName, playlistDescription, access_token, songList, management).then((result) => {
    if (result.successful) {
      res.json(result)
    } else {
      res.status(500).send({ error: result.error });
    }
  }).catch((error) => {
    res.status(500).send({ error: error });
  })
});

expressApp.post("/create-joint-playlist", async (req, res) => {
  const { name: playlistName, description: playlistDescription, access_token, playlistIds } = req.body;
  if (!playlistIds) {
    res.status(400).send({ error: "Missing Parameters" });
    return;
  }
  const songList: string[] = await getJointPlaylistTracksFromDb(playlistIds);
  const management: JointPlaylistManagementData = {
    type: "joint",
    playlistIds: playlistIds
  }

  createOrUpdatePlaylist(playlistName, playlistDescription, access_token, songList, management).then((result) => {
    if (result.successful) {
      res.json(result);
    }
    else {
      res.status(500).send({ error: result.error });
    }
  }).catch((error) => {
    res.status(500).send({ error: error });
  })
});


/**
 * Express API Endpoint /cache-playlist
 * Cache a playlist in the database
 */
expressApp.post("/cache-playlist", async (req, res) => {
  const playlistData: SpotifyTypes.Playlist = req.body;

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

/**
 * Express API Endpoint /get-cached-playlists
 * Get list of cached playlists from the database
 */
expressApp.get("/get-cached-playlists", async (_req, res) => {
  const playlists = await getPlaylistsFromDb();
  res.send(playlists);
});

/**
 * Express API Endpoint /get-cached-playlist-tracks
 * Get full details of a cached playlist from the database, including its tracklist
 */
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
