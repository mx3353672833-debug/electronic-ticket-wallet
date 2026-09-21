export type TicketType =
  | 'train'
  | 'flight'
  | 'boarding-pass'
  | 'metro'
  | 'bus'
  | 'other'

export type Place = {
  name: string
  city?: string
  lat?: number
  lng?: number
}

export type CropRecipe = {
  corners: [number, number][]
  rotation?: number
  filter?: string
}

export type JourneyTrack = {
  /** WGS84 [longitude, latitude]. Separate segments must never be joined across gaps. */
  segments: [number, number][][]
  source: 'gpx' | 'geojson'
  filename: string
  importedAt: string
}

export type Ticket = {
  id: string
  type: TicketType
  takenAt: string | null
  departure: Place | null
  arrival: Place | null
  carrierOrTrainNo?: string
  seat?: string
  originalImageUrl: string
  processedImageUrl: string
  thumbnailUrl: string
  appearance?: {
    version: string
    sourceImageUrl: string
    sourceThumbnailUrl: string
    imageUrl: string
    sourceSha256: string
    method: string
    width: number
    height: number
    originalUntouched: boolean
  }
  cropRecipe?: CropRecipe
  track?: JourneyTrack
  railRoute?: {
    segments: [number, number][][]
    source: 'osm-rail'
    status: 'network-estimate' | 'timetable-constrained'
    from: string
    to: string
    distanceKm: number
    lineNames: string[]
    osmWays: string[]
    datasetDate: string
    attribution: string
    sourceUrl: string
    computedAt: string
    requestKey?: string
    timetable?: {
      provider: string
      sourceUrl: string
      trainNo: string
      travelDate: string
      serviceDate: string | null
      basis: string
      stops: string[]
      queriedAt: string
    }
  }
  processing?: {
    version: number
    processedAt: string
    cropped: boolean
    reviewed: boolean
    issues: string[]
    documentKind: 'ticket' | 'refund' | 'boarding' | 'unknown'
    departureTime: string | null
    amount: number | null
  }
  sourceFile?: { name: string; size: number; sha256: string }
  story: string
  tags: string[]
  companions: string[]
  createdAt: string
  updatedAt: string
}

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  train: '火车',
  flight: '飞机',
  'boarding-pass': '登机牌',
  metro: '地铁',
  bus: '巴士',
  other: '其他',
}
