/**
 * Utility methods
 * @module Congenial-Carnival-Util
 */

import axios, { AxiosError } from "axios";
import Management, { ManagementData } from "./models/management";
import { addEventToDb, addManagementToDb, getManagementFromDb } from "./db";
import * as SpotifyTypes from './spotifyTypes';

/**
 * Every type of managed playlist
 */
enum ManagementType {
  MostPlayed = "mostPlayed",
  Joint = "joint",
}

/**
 * Every way that a playlist can be updated
 */
enum PlaylistUpdateMethod {
  Overwrite,
  Modify,
}

/**
 * How each type of managed playlist should be updated
 */
const ManagementUpdateMethod = new Map<string, PlaylistUpdateMethod>([
  [ManagementType.MostPlayed, PlaylistUpdateMethod.Overwrite],
  [ManagementType.Joint, PlaylistUpdateMethod.Modify]
])

// Maximum number of tracks that can be submitted to the Spotify API at once
const maxTracksPerRequest: number = 100;
/**
 * Generate a random string of characters
 * @param length the length of the random string
 * @returns A random string of characters
 */
export function generateRandomString(length: number) {
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
export function handleAxiosError(error: Error | AxiosError) {
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

/**
 * Helper function to fetch data from Spotify API with pagination
 * @param url The base URL for the Spotify API endpoint
 * @param accessToken The access token for Spotify API
 * @param limit The number of items to fetch per request
 * @param processItems A callback function to process the items from each response
 * @returns A promise that resolves when all data has been fetched
 */
export async function fetchDataFromSpotify<T>(
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

export async function getPlaylistTracks(playlistID: string, access_token: string): Promise<SpotifyTypes.Playlist> {
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

    addEventToDb("get-playlist-tracks endpoint passed").catch(() => {
      console.log("Failed DB entry at get-playlist-tracks");
    });

    return Promise.resolve(playlistData);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
    return Promise.reject("Failed to fetch playlist tracks");
  }
}

export type CreatePlaylistResponse = {
  successful: boolean;
  created?: boolean;
  playlistID?: string;
  error?: string;
}

export async function addOrRemovePlaylistTracks(playlistID: string, access_token: string, songList: string[], addTracks: boolean = false): Promise<boolean> {
  let currentStartIndex: number = 0;

  while (currentStartIndex < songList.length) {
    const currentSongList: string[] = songList.slice(currentStartIndex, currentStartIndex + maxTracksPerRequest);
    const data = addTracks ? {
      "uris": currentSongList
    } : {
      "tracks": currentSongList.map((uri) => {
        return { "uri": uri }
      })
    }

    try {
      await axios({
        url: `https://api.spotify.com/v1/playlists/${playlistID}/tracks`,
        method: addTracks ? "post" : "delete",
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + access_token
        },
        data: data
      })
      currentStartIndex += maxTracksPerRequest;
    } catch (error) {
      if (error instanceof Error) {
        handleAxiosError(error);
        return Promise.reject(false);
      }
    }
  }
  return Promise.resolve(true);
}

export async function updateManagedPlaylist(
  access_token: string,
  songList: string[],
  managementData: Management,
): Promise<CreatePlaylistResponse> {
  if (ManagementUpdateMethod.has(managementData.management.type)) {
    try {
      switch (ManagementUpdateMethod.get(managementData.management.type)) {
        case PlaylistUpdateMethod.Overwrite: {
          // Replace tracks in the playlist with the given list of tracks
          await axios({
            url: `https://api.spotify.com/v1/playlists/${managementData.playlistId}/tracks`,
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + access_token
            },
            method: 'put',
            data: {
              uris: songList.length > maxTracksPerRequest ? songList.slice(0, maxTracksPerRequest) : songList
            }
          });
          if (songList.length > maxTracksPerRequest) {
            await addOrRemovePlaylistTracks(managementData.playlistId, access_token, songList.slice(maxTracksPerRequest), true);
          }
          return Promise.resolve({
            successful: true,
            created: false,
            playlistID: managementData.playlistId
          });
        }
        case PlaylistUpdateMethod.Modify: {
          // Only add or remove the delta
          const playlist: SpotifyTypes.Playlist = await getPlaylistTracks(managementData.playlistId, access_token);
          const tracksToRemove = playlist.tracks.filter((track) => !songList.includes(track.track.uri)).map((track) => track.track.uri);
          const tracksToAdd = songList.filter((track) => !playlist.tracks.map((track) => track.track.uri).includes(track));
          console.log("Tracks to Add: ", tracksToAdd);
          console.log("Tracks to Remove: ", tracksToRemove);
          if (tracksToAdd.length !== 0) {
            console.log("Adding Tracks: ", tracksToAdd.reduce((acc, track) => acc + track + ", ", ""));
            await addOrRemovePlaylistTracks(managementData.playlistId, access_token, tracksToAdd, true);
          }
          if (tracksToRemove.length !== 0) {
            console.log("Removing Tracks: ", tracksToRemove.reduce((acc, track) => acc + track + ", ", ""));
            await addOrRemovePlaylistTracks(managementData.playlistId, access_token, tracksToRemove, false);
          }
          return Promise.resolve({
            successful: true,
            created: false,
            playlistID: managementData.playlistId
          });
        }
        default: {
          return Promise.resolve({
            successful: false,
            error: "Management Type does not support Playlist Update"
          });
        }
      }


    } catch (error) {
      console.error(error);
      return Promise.reject({
        successful: false,
        error: "Failed to update managed playlist"
      });
    }
  } else {
    return Promise.resolve({
      successful: false,
      error: "Management Type not recognized"
    });
  }
}

export async function createNewPlaylist(
  userID: string,
  playlistName: string,
  playlistDescription: string,
  access_token: string,
  songList: string[],
  management: ManagementData
): Promise<CreatePlaylistResponse> {
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

  if (!await addOrRemovePlaylistTracks(playlistID, access_token, songList)) {
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

export async function createOrUpdatePlaylist(
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
      return updateManagedPlaylist(access_token, songList, managementData);
    } else {
      console.log("Playlist is not managed");
      return createNewPlaylist(userID, playlistName, playlistDescription, access_token, songList, management);
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
