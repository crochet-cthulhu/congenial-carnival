/**
 * Utility methods
 * @module Congenial-Carnival-Util
 */

import axios, { AxiosError } from "axios";
import Management, { ManagementData } from "./models/management";
import { addEventToDb, addManagementToDb, getManagementFromDb } from "./db";

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

export type CreatePlaylistResponse = {
  successful: boolean;
  created?: boolean;
  playlistID?: string;
  error?: string;
}

export async function addTracksToPlaylist(playlistID: string, access_token: string, songList: string[]): Promise<boolean> {
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
