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
import * as SpotifyTypes from './spotifyTypes';
import { addEventToDb, addPlaylistToDb, getPlaylistsFromDb, getPlaylistTracksFromDb, getManagementFromDb, addManagementToDb, getJointPlaylistTracksFromDb } from './db';
import Management, { JointPlaylistManagementData, ManagementData } from './models/management';

// Express App Config
const expressApp = express();
expressApp.use(cors());
expressApp.use(express.json({ "limit": "50mb" }));
expressApp.use(express.urlencoded({ extended: true }));
const stateKey = 'spotify_auth_state';
const port = process.env.EXPRESS_SERVER_PORT || 5050;

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
      console.error("Axios Error Data: ", error.response.data);
      console.error("Axios Error Status: ", error.response.status);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.error("Axios Error Request: ", error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error("Axios Error Message: ", error.message);
    }
  } else {
    // Stock Error - log and move on
    console.error("Axios Error: ", error);
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

type CreatePlaylistResponse = {
  successful: boolean;
  created?: boolean;
  playlistID?: string;
  error?: string;
}

async function addTracksToPlaylist(playlistID: string, access_token: string, songList: string[]): Promise<boolean> {
  let currentStartIndex: number = 0;
  const maxSongsPerRequest: number = 100;

  while (currentStartIndex < songList.length) {
    const currentSongList: string[] = songList.slice(currentStartIndex, currentStartIndex + maxSongsPerRequest);
    try {
      await axios({
        url: `https://api.spotify.com/v1/playlists/${playlistID}/tracks`,
        method: "post",
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token
        },
        data: {
          "uris": currentSongList
        }
      })
      currentStartIndex += maxSongsPerRequest;
    } catch (error) {
      if (error instanceof Error) {
        handleAxiosError(error);
        return Promise.resolve(false);
      }
    }
  }
  return Promise.resolve(true);
}

async function createOrUpdatePlaylist(
  playlistName: string,
  playlistDescription: string,
  access_token: string,
  songList: string[],
  management: ManagementData
): Promise<CreatePlaylistResponse> {
  console.log("Name: ", playlistName);
  console.log("Description: ", playlistDescription);
  console.log("Access Token: ", access_token);
  console.log("Song List Size: ", songList.length);
  console.log("Management: ", management);

  if (!playlistName || !playlistDescription || !access_token || songList.length === 0) {
    return {
      successful: false,
      error: "Insufficient Input: " +
        (playlistName ? "" : "playlistName ") +
        (playlistDescription ? "" : "playlistDescription ") +
        (access_token ? "" : "access_token ") +
        (songList ? "" : "songList")
    };
  }

  try {
    const userResponse = await axios({
      url: 'https://api.spotify.com/v1/me',
      method: 'get',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + access_token
      }
    });

    const userID: string = userResponse.data.id;
    console.log("Obtained User ID: " + userID);

    const managementData = await getManagementFromDb(userID, management) as Management;
    if (managementData && 'playlistId' in managementData) {
      console.log("Playlist is managed, found ID", managementData.playlistId);

      await axios({
        url: `https://api.spotify.com/v1/playlists/${managementData.playlistId}/tracks`,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token
        },
        method: 'put',
        data: {
          uris: songList.length > 100 ? songList.slice(0, 100) : songList
        }
      });

      if (!await addTracksToPlaylist(managementData.playlistId, access_token, songList.slice(100))) {
        return { successful: false, error: "Failed to add remaining songs to managed playlist" };
      }

      console.log("Successfully updated managed playlist " + managementData.playlistId);
      return {
        successful: true,
        created: false,
        playlistID: managementData.playlistId
      };
    } else {
      console.log("Playlist is not managed");

      const createResponse = await axios({
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
      });

      const playlistID = createResponse.data.id;
      console.log("Created Playlist with ID: " + playlistID);

      if (!await addTracksToPlaylist(playlistID, access_token, songList)) {
        return { successful: false, error: "Failed to add remaining songs to managed playlist" };
      }

      console.log("Successfully added songs to Playlist " + playlistID);

      await addManagementToDb(playlistID, userID, management);
      await addEventToDb("create-playlist endpoint passed for playlist " + playlistName);

      return {
        successful: true,
        created: true,
        playlistID: playlistID
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      handleAxiosError(error);
    }
    return {
      successful: false,
      error: "Failed to create or update playlist"
    };
  }
}

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
expressApp.get("/get-cached-playlists", async (req, res) => {
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
