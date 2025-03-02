/**
 * Types used throughout application
 */

/**
 * Data struct representing a single track
 */
export type trackData = {
  uri: string;
  name: string;
  artists: string[];
};

export type trackParent = {
  added_at: string;
  added_by: string;
  is_local: boolean;
  track: trackData;
}

/**
 * Data struct representing the information of a playlist
 */
export type playlistData = {
  uri: string;
  id: string;
  name: string;
  ownerName: string;
};
