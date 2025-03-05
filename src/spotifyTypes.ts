/**
 * Spotify API Types
 */

export type Artist = {
  external_urls: {
    spotify: string
  }
  href: string
  id: string
  name: string
  type: string
  uri: string
}

export type Album = {
  album_type: string
  artists: Artist[]
  available_markets: string[]
  external_urls: {
    spotify: string
  }
  href: string
  id: string
  images: {
    height: number
    url: string
    width: number
  }[]
  name: string
  release_date: string
  release_date_precision: string
  total_tracks: number
  type: string
  uri: string
}

export type TrackObject = {
  album: Album
  artists: Artist[]
  available_markets: string[]
  disc_number: number
  duration_ms: number
  explicit: boolean
  external_ids: {
    isrc: string
  }
  external_urls: {
    spotify: string
  }
  href: string
  id: string
  is_local: boolean
  name: string
  popularity: number
  preview_url: string
  track_number: number
  type: string
  uri: string
}

export type Track = {
  added_at?: string
  added_by?: {
    external_urls: {
      spotify: string
    }
    href: string
    id: string
    type: string
    uri: string
  }
  is_local?: boolean
  track: TrackObject
}

export type Playlist = {
  collaborative?: boolean
  description?: string
  external_urls?: {
    spotify: string
  }
  href?: string
  id?: string
  images?: {
    height: number
    url: string
    width: number
  }[]
  name: string
  owner?: {
    display_name: string
    external_urls: {
      spotify: string
    }
    href: string
    id: string
    type: string
    uri: string
  }
  public?: boolean
  snapshot_id?: string
  tracks?: Track[]
  type?: string
  uri?: string
}
