/**
 * Database module for Congenial-Carnival
 * @module Congenial-Carnival-DB
 */
import { MongoClient } from 'mongodb';
import Event from './models/event';
import Playlist from './models/playlist';
// import * as Types from './types';
import * as SpotifyTypes from './spotifyTypes';

const dbConnectionString = process.env.MONGODB_CONNSTRING;
const dbClient = new MongoClient(dbConnectionString);
const dbName = 'main'
const dbEventsCollectionName = 'events';

/**
 * Creates a sample log in the database
 * @param event Log to add to db
 */
export async function addEventToDb(event: string) {
  try {
    const database = dbClient.db(dbName);
    const events = database.collection(dbEventsCollectionName);

    const eventToInsert : Event = new Event(event, new Date().getTime());
    events.insertOne(eventToInsert);
  } catch (error) {
    console.error(error);
  }
}

export async function addPlaylistToDb(playlistData: SpotifyTypes.Playlist) {
  try {
    const database = dbClient.db(dbName);
    const playlists = database.collection('playlists');
    playlists.updateOne({ 'playlist.id': playlistData.id }, { $set: playlistData }, { upsert: true });
  } catch (error) {
    console.error(error);
  }
}

export async function getPlaylistsFromDb() {
  try {
    const database = dbClient.db(dbName);
    const playlists = database.collection<Playlist>('playlists');
    const result = await playlists.find({}, {projection : {tracks : 0}}).toArray() as Playlist[];
    return result;
  } catch (error) {
    console.error(error);
  }
}

export async function getPlaylistTracksFromDb(playlistId: string) {
  try {
    const database = dbClient.db(dbName);
    const playlists = database.collection<Playlist>('playlists');
    const result = await playlists.findOne({ 'id': playlistId });
    return result;
  } catch (error) {
    console.error(error);
  }
}