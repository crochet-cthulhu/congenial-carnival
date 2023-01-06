/**
 * This is the entry point for Congenial-Carnival, the API for the Spotify Playlist Manager app.
 * @module Congenial-Carnival-API
 */
import axios, { AxiosError } from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { MongoClient } from 'mongodb';

// Initialise Config
dotenv.config();

// Express App Config
const expressApp = express();
expressApp.use(cors());
const stateKey = 'spotify_auth_state';
const port = process.env.EXPRESS_SERVER_PORT || 5050;
// const redirectURI = 'http://localhost:3000/app/callback';
const dbConnectionString = process.env.MONGODB_CONNSTRING;
const dbClient = new MongoClient(dbConnectionString);


/**
 * Data Type for storing Tack information
 */
type trackData = {
    uri : string;
    name : string;
    artists : string[];
};

type playlistData = {
    uri : string;
    name : string;
    ownerName : string;
};

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
function handleAxiosError(error : Error | AxiosError) {
    if (axios.isAxiosError(error)){
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

/**
 * Creates a sample log in the database
 * @param event Log to add to db
 */
async function sampleDatabaseEvent(event : string) {
    try {
        const database = dbClient.db('sample_db');
        const events = database.collection('events');

        const timestamp = new Date();        

        events.insertOne( 
            { 
                sampleEvent : event,
                timestamp : timestamp.getTime()   
         });
    } finally {
        // TODO Close database connection?
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
expressApp.get('/auth/get-spotify-login-url', function(req, res) {
  console.log('/auth/spotify - Auth request received')

  // Send State Key
  const state = generateRandomString(16);
  res.cookie(stateKey, state);
  console.log(stateKey, state);

  // Currently we expect this to be 'http://localhost:3000/app/callback';
  const redirectURI : string = req.query.redirectURI.toString();
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
expressApp.get('/auth/get-spotify-tokens', function(req, res) {
  console.log("Requesting Tokens")
  // Request refresh and access tokens after checking the state parameter
  const authorizationCode = req.query.code || null;  
  const state = req.query.state || null;
  const redirectURI : string = req.query.redirectURI.toString();
  
  // TODO Figure out how to use state properly  
  if (state == null) {
      // TODO Later: Figure out the best way to check state
      console.log('ERR: No State')
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
            console.log("Received response to token request")
            console.log({
                'data': response.data,
                'status' : response.status,
                'statusText' : response.statusText,
                'headers' : response.headers,
                'config' : response.config
            })
            axios({
                url: 'https://api.spotify.com/v1/me',
                method: 'get', 
                headers: {
                    'Authorization': 'Bearer ' + response.data.access_token
                }
            }).then(function (response) {
                console.log("Recieved response to user data request")
                console.log(response)
            })

            console.log("Sending tokens as response to /callback/")
            res.json({
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token
            })
            
            sampleDatabaseEvent("Callback endpoint passed").catch(() => {
                console.log("Failed DB entry at Callback")});

        }).catch(function (error) {
            console.error("Error requesting tokens")
            handleAxiosError(error);
        });
    }
});

/**
 * Express API Endpoint /get-most-played
 */
expressApp.get('/get-most-played', function(req, res) {
    console.log("Requesting songs");

    const timeRange : string = req.query.length as string || "long_term" // Will be short_term, medium_term or long_term
    const access_token : string = req.query.access_token as string
    
    const requestParams = new URLSearchParams({
        time_range: timeRange,
        limit: "50"
    }).toString();

    // Request User's Most-Played Tracks for the given length
    axios({
        url: 'https://api.spotify.com/v1/me/top/tracks?' + requestParams,
        method: 'get', 
        headers: {
            'Accept'       : 'application/json',
            'Content-Type' : 'application/json',
            'Authorization': 'Bearer ' + access_token
        }
    }).then(function (response) {
        console.log("GET Response ", response.status);                
        console.log("Successfully retrieved tracks")
        const numTracks : number = response.data.items.length;        
        const trackList : trackData[] = [];
        for (let trackNum = 0; trackNum < numTracks; trackNum++) {
            console.log("Up to Track Num ", trackNum);
            const track : trackData = {
                uri     : response.data.items[trackNum].uri,                    
                name    : response.data.items[trackNum].name,
                artists : response.data.items[trackNum].artists
            };            
            trackList.push(track);
        }        
        console.log(trackList);
        res.send({
            trackData: trackList
        });        
        
        sampleDatabaseEvent("get-most-played endpoint passed with " + timeRange).catch(() => {
            console.log("Failed DB entry at get-most-played " + timeRange)});

    }).catch(function(error) {
        handleAxiosError(error);
    });
});

/**
 * Get the playlists of another user
 */
expressApp.get('/get-other-user-playlists', function(req, res) {    
    console.log("Getting playlists of user")

    const userID : string = req.query.userID as string || "UNPOPULATED"
    const access_token : string = req.query.access_token as string
    
    axios({
        url: 'https://api.spotify.com/v1/users/' + userID + '/playlists', 
        method: 'get', 
        headers: {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': 'application/json'
        }
    }).then(function (response) {
        console.log("GET Response ", response.status);
        console.log("Successfully retrieved playlists")
        const numPlaylists : number = response.data.items.length;
        const playlistList : playlistData[] = [];
        for (let playlistNum = 0; playlistNum < numPlaylists; playlistNum++) {
            console.log("Up to Playlist Num ", playlistNum);
            const playlist : playlistData = {
                uri : response.data.items[playlistNum].uri,
                name : response.data.items[playlistNum].name,
                ownerName : /*response.data.items[playlistNum].owner.??.display_name*/"UNCLEAR"
            };
            playlistList.push(playlist);            
        }
        console.log(playlistList);
        res.send({
            playlistData: playlistList
        });

        sampleDatabaseEvent("get-other-user-playlists endpoint passed with " + userID).catch(() => {
            console.log("Failed DB entry at get-other-user-playlists " + userID)});

    }).catch(function(error) {
        handleAxiosError(error);
    });
});

/**
 * Get current user's playlists
 */
expressApp.get('/get-user-playlists', function(req, res) {    
    console.log("Getting playlists of user")

    const access_token : string = req.query.access_token as string
    const limit = 50;
    
    const finalPlaylistList : playlistData[] = [];

    const playlistPromise = new Promise<boolean>((resolve) => {
        console.log("Executing Playlist Promise");
        let offset = 0;
        const getDataFromAPI = () => {
            console.log("Entered getDataFromAPI with offset ", offset);
            
            const getData = new Promise<boolean>((resolve, reject) => {
                const requestParams = new URLSearchParams({
                    limit : String(limit),
                    offset : String(offset)
                });
                
                axios({
                    url: 'https://api.spotify.com/v1/me/playlists?' + requestParams, 
                    method: 'get', 
                    headers: {
                        'Authorization': 'Bearer ' + access_token,
                        'Content-Type': 'application/json'
                    }
                }).then(function (response) {
                    console.log("GET Response ", response.status);
                    console.log("Successfully retrieved playlists");
                    const numPlaylists : number = response.data.items.length;
                    
                    for (let playlistNum = 0; playlistNum < numPlaylists; playlistNum++) {
                        const playlist : playlistData = {
                            uri : response.data.items[playlistNum].uri,
                            name : response.data.items[playlistNum].name,
                            ownerName : /*response.data.items[playlistNum].owner.??.display_name*/"UNCLEAR"
                        };
                        finalPlaylistList.push(playlist);
                    }
                    if (response.data.next === null) {
                        console.log("No Next Link");
                        resolve(false); // resolve getData
                    } else {
                        console.log("More data to get...");
                        resolve(true); // resolve getData
                    }
                    
                }).catch(function(error) {
                    handleAxiosError(error)
                    reject(error);
                });
            });
            getData.then((moreData) => {
                if (moreData) {
                    offset += limit;
                    console.log("Recalling ", offset)
                    getDataFromAPI()
                } else {
                    console.log("Finished")
                    resolve(true); // resolve playlistPromise
                }
            });
        }
        getDataFromAPI();
    });
    
    playlistPromise.then(() => {
        console.log("Promised Resolved")
        res.send({
            playlistData: finalPlaylistList
        });
    
        sampleDatabaseEvent("get-most-played endpoint passed").catch(() => {
            console.log("Failed DB entry at get-user-playlists")});
    });
});

/**
 * Express API Endpoint /create-playlist
 */
expressApp.get('/create-playlist', function(req, res) {    
    let playlistID = "UNPOPULATED"    
    console.log("Making a playlist")

    // Lets make the bold assumption that making a new playlist
    // will overwrite an old one by the same name. Or at least
    // not break things

    const timeRange : string = req.query.length as string || "long_term"
    const access_token : string = req.query.access_token as string
    const songList : string[] = req.query.songList as string[]

    // Get User's ID
    axios({
        url : 'https://api.spotify.com/v1/me',
        method : 'get',
        headers : {
            'Accept'        : 'application/json',
            'Content-Type'  : 'application/json',
            'Authorization' : 'Bearer ' + access_token
        }        
    }).then (function(response) {
        console.log("GET Response ", response.status);
        const userID : string = response.data.id;
        console.log("Obtained User ID: " + userID);
        
        axios({
            url: 'https://api.spotify.com/v1/users/' + userID + '/playlists',
            headers: {
                'Accept'        : 'application/json',
                'Content-Type'  : 'application/json',
                'Authorization' : 'Bearer ' + access_token
            },
            method : 'post',
            data : {
                name: "Most Played - " + timeRange,
                public: false,
                collaborative: false,
                description: "Courtesy of Shane :D"
            }
        }).then (function (response) {
            console.log("POST Response ", response.status);
            playlistID = response.data.id

            // Add songs to this new playlist
            console.log("User ID: " + userID);
            console.log("Playlist ID: " + playlistID)
            console.log("Song List: " + songList)
            
            axios({
                url: 'https://api.spotify.com/v1/playlists/' + playlistID + '/tracks?uris=' + songList,
                method : "post",
                headers: {
                    'Accept'        : 'application/json',
                    'Content-Type'  : 'application/json',
                    'Authorization' : 'Bearer ' + access_token
                }                
            }).then (function(response) {
                console.log("POST Response: ", response.status);
                console.log("Successfully added songs to Playlist " + playlistID)
                res.send({
                    successful: true,
                    playlistID: playlistID
                })

                sampleDatabaseEvent("create-playlist endpoint passed with " + timeRange).catch(() => {
                    console.log("Failed DB entry at create-playlist " + timeRange)});

            }).catch (function(error){
                // Playlist Update Failed
                handleAxiosError(error);                
                res.json({
                    successful: false,
                    playlistID: playlistID
                });
            });            
        }).catch (function(error){
            // Playlist Creation Failed
            handleAxiosError(error);
        });
    }).catch (function(error){
        // User ID Get Failed
        handleAxiosError(error);
    });    
});

/**
 * Express API Endpoint 'Any Other Request'
 */
expressApp.get('*', (req) =>{
    console.log("User reached Any Other Requests endpoint with URL ", req.originalUrl)
});

expressApp.listen(port);
console.log("Express Server Listening on Port " + port);