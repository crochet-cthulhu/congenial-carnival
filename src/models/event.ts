import {ObjectId} from 'mongodb';

export default class Event {
    constructor(public event: string, public timestamp: number, public _id?: ObjectId) {}
}