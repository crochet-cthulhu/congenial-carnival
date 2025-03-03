/**
 * Database module for Congenial-Carnival
 * @module Congenial-Carnival-DB
 */
import { MongoClient } from 'mongodb';

const dbConnectionString = process.env.MONGODB_CONNSTRING;
const dbClient = new MongoClient(dbConnectionString);

/**
 * Creates a sample log in the database
 * @param event Log to add to db
 */
export async function sampleDatabaseEvent(event: string) {
  try {
    const database = dbClient.db('sample_db');
    const events = database.collection('events');

    const timestamp = new Date();

    events.insertOne(
      {
        sampleEvent: event,
        timestamp: timestamp.getTime()
      });
  } finally {
    // TODO Close database connection?
  }
}