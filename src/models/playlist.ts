import {ObjectId} from 'mongodb';
import * as Types from '../types';

export default class Playlist {
    constructor(public playlist: Types.playlistData, public tracks: Types.trackParent[], public _id?: ObjectId) {}
}