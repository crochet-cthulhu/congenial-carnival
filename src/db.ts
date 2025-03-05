/**
 * Database module for Congenial-Carnival
 * @module Congenial-Carnival-DB
 */
import { MongoClient } from 'mongodb';
import Event from './models/event';
import * as SpotifyTypes from './spotifyTypes';

const dbConnectionString = process.env.MONGODB_CONNSTRING;
const dbClient = new MongoClient(dbConnectionString);
const dbName = 'main'
const dbEventsCollectionName = 'events';

/**
 * Creates an event log in the database
 * 
 * @async
 * @function addEventToDb
 * @param event String decription of the log to add to db
 * @throws Will log an error to the console if the database operation fails.
 */
export async function addEventToDb(event: string) {
  try {
    const database = dbClient.db(dbName);
    const events = database.collection(dbEventsCollectionName);

    const eventToInsert: Event = new Event(event, new Date().getTime());
    events.insertOne(eventToInsert);
  } catch (error) {
    console.error(error);
  }
}

/**
 * Add a playlist to the database
 * 
 * @async
 * @function addPlaylistToDb
 * @param playlistData Playlist to add to the database
 * @throws Will log an error to the console if the database operation fails.
 */
export async function addPlaylistToDb(playlistData: SpotifyTypes.Playlist) {
  try {
    const database = dbClient.db(dbName);
    const playlists = database.collection('playlists');
    playlists.updateOne({ 'playlist.id': playlistData.id }, { $set: playlistData }, { upsert: true });
  } catch (error) {
    console.error(error);
  }
}

/**
 * Retrieves the list of cached playlists from the database, excluding their tracks.
 *
 * @async
 * @function getPlaylistsFromDb
 * @returns {Promise<SpotifyTypes.Playlist[]>} A promise that resolves to an array of playlists.
 * @throws Will log an error to the console if the database operation fails.
 */
export async function getPlaylistsFromDb() {
  try {
    const database = dbClient.db(dbName);
    const playlists = database.collection<SpotifyTypes.Playlist>('playlists');
    const result = await playlists.find({}, { projection: { tracks: 0 } }).toArray() as SpotifyTypes.Playlist[];
    return result;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Retrieves a single cached playlist from the database, including the tracks field.
 *
 * @async
 * @function getPlaylistTracksFromDb
 * @param playlistId The id of the playlist to retrieve from the database.
 * @returns {Promise<SpotifyTypes.Playlist>} A promise that resolves to a playlist.
 * @throws Will log an error to the console if the database operation fails.
 */
export async function getPlaylistTracksFromDb(playlistId: string) {
  try {
    const database = dbClient.db(dbName);
    const playlists = database.collection<SpotifyTypes.Playlist>('playlists');
    const result = await playlists.findOne({ 'id': playlistId });
    return result;
  } catch (error) {
    console.error(error);
  }
}
