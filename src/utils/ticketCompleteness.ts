import type {Ticket} from '../types/ticket'

export type JourneyField='takenAt'|'departure'|'arrival'|'carrierOrTrainNo'
export type MissingField={key:JourneyField;label:string}
const hasPlace=(place:Ticket['departure'])=>Boolean(place?.name?.trim()||place?.city?.trim())

/** Current information, not historical OCR warnings or a manual approval flag. */
export function missingJourneyFields(ticket:Ticket):MissingField[]{
  const missing:MissingField[]=[]
  if(!ticket.takenAt?.trim())missing.push({key:'takenAt',label:'日期'})
  if(!hasPlace(ticket.departure))missing.push({key:'departure',label:'出发地'})
  if(!hasPlace(ticket.arrival))missing.push({key:'arrival',label:'到达地'})
  if(['train','flight','boarding-pass'].includes(ticket.type)&&!ticket.carrierOrTrainNo?.trim()){
    missing.push({key:'carrierOrTrainNo',label:ticket.type==='train'?'车次':'航班号'})
  }
  return missing
}
