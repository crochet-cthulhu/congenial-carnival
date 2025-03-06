export interface ManagementData {
  type: string
}

export interface MostPlayedManagementData extends ManagementData {
  subtype: string
}

export default class Management {
  playlistId: string
  owner: string
  management: ManagementData
}
