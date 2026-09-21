export type OCRLine = { text: string; confidence: number; x: number; y: number; width: number; height: number }
export type ScanResult = { version: number; cropped: boolean; confidence: number; corners: [number, number][]; rotation?: number; width: number; height: number; lines: OCRLine[]; alternatives?: OCRLine[][] }
export type RecognizedTicket = {
  departure: string | null; arrival: string | null; takenAt: string | null; departureTime: string | null
  trainNo: string | null; seat: string | null; amount: number | null; documentKind: 'ticket' | 'refund' | 'boarding' | 'unknown'
  issues: string[]
}

/** Layout-aware extraction, never model-generated text or a guessed travel date. */
export function recognizeTicket(scan: ScanResult, stationNames?: Set<string>): RecognizedTicket {
  if (scan.alternatives?.length) {
    const results = scan.alternatives.map(lines => recognizeTicket({ ...scan, lines, alternatives: undefined }, stationNames))
    const boarding = results.find(r=>r.documentKind==='boarding')
    if (boarding) return boarding
    const score = (r: RecognizedTicket) => (r.departure ? 3 : 0) + (r.arrival ? 3 : 0) + (r.takenAt ? 2 : 0) + (r.trainNo ? /^[GDCZTK]/.test(r.trainNo) ? 3 : 1 : 0)
    results.sort((a,b)=>score(b)-score(a))
    const best = { ...results[0] }
    for (const other of results.slice(1)) {
      for (const field of ['departure','arrival','takenAt','departureTime','trainNo','seat','amount'] as const) {
        if (best[field] == null && other[field] != null) Object.assign(best, { [field]: other[field] })
      }
    }
    best.issues = recognitionIssues(scan, best)
    if (results.some(r=>r.documentKind==='refund')) best.documentKind='refund'
    else if (best.trainNo && (best.departure || best.arrival)) best.documentKind='ticket'
    return best
  }
  const clean = (text: string) => text.replace(/\s+/g, '').replace(/[：]/g, ':').replace(/島/g, '岛')
  const text = scan.lines.map(l => clean(l.text)).join('\n')
  if (/登机|BOARDING/i.test(text) || (/\bGATE\b/i.test(text) && /FLIGHT|航班/i.test(text))) {
    const flight = text.match(/\b(CA|SC|MU|CZ|FM|ZH|HU|MF|3U|9C|HO)\s*(\d{3,4})\b/)
    return { departure: null, arrival: null, takenAt: null, departureTime: null, trainNo: flight ? flight[1]+flight[2] : null, seat: null, amount: null, documentKind: 'boarding', issues: ['登机牌的机场和完整日期需要核对；未使用广告年份或拍照日期'] }
  }
  const date = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}:\d{2})?/)
  const takenAt = date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}` : null
  const validDate = takenAt && !Number.isNaN(Date.parse(takenAt)) && new Date(takenAt).toISOString().startsWith(takenAt) ? takenAt : null
  const top = scan.lines.filter(l => l.y > .04 && l.y < .34 && l.height > .018)
  const numberLine = top.find(l => l.x > .30 && l.x < .65 && /^[GDCZTKLSY]?\d{1,4}(?:\/[GDCZTK]?\d{1,4})?(?:次)?$/.test(clean(l.text)))
  const lineY = numberLine ? numberLine.y + numberLine.height / 2 : null
  const stationSide = (side: 'left' | 'right') => {
    const eligible = top.filter(l => (side === 'left' ? l.x < .44 : l.x >= .53) && /[\u4e00-\u9fff]/.test(l.text) && !/检票|售|仅供|日期|元|号|年|车|座/.test(l.text) && (lineY === null || Math.abs(l.y + l.height / 2 - lineY) < .085))
    if (!eligible.length) return null
    const anchor = eligible.find(l => /站/.test(l.text)) || eligible.sort((a,b) => b.height-a.height)[0]
    const row = eligible.filter(l => Math.abs((l.y+l.height/2)-(anchor.y+anchor.height/2)) < .055).sort((a,b)=>a.x-b.x)
    const name = row.map(l=>clean(l.text)).join('').replace(/站$/, '')
    if (stationNames) {
      if (stationNames.has(name)) return name
      const individual = row.map(l=>clean(l.text).replace(/站$/, '')).filter(n=>stationNames.has(n))
      return individual.length === 1 ? individual[0] : null
    }
    return /^[\u4e00-\u9fff]{2,8}$/.test(name) ? name : null
  }
  const departure = stationSide('left'), arrival = stationSide('right')
  const trainNo = numberLine ? clean(numberLine.text).replace(/次$/, '') : null
  const seatMatch = text.match(/(\d{1,2})[车年](\d{1,3}[A-F]?)号/)
  const amountMatch = text.match(/[¥￥Y](\d+(?:\.\d{1,2})?)元/)
  const refund = /退票费/.test(text)
  const result: RecognizedTicket = { departure, arrival, takenAt: validDate, departureTime: date?.[4] || null, trainNo, seat: seatMatch ? `${seatMatch[1]}车${seatMatch[2]}` : null, amount: amountMatch ? Number(amountMatch[1]) : null, documentKind: refund ? 'refund' : trainNo ? 'ticket' : 'unknown', issues: [] }
  result.issues = recognitionIssues(scan, result)
  return result
}

function recognitionIssues(scan: ScanResult, r: RecognizedTicket): string[] {
  if (r.documentKind === 'boarding') return ['登机牌的机场和完整日期需要核对；未使用广告年份或拍照日期']
  return [!scan.cropped && '自动裁边未找到完整票面', !r.takenAt && '日期未识别', !r.departure && '出发站未识别', !r.arrival && '到达站未识别', !r.trainNo && '车次未识别', r.trainNo && /^(2\d{3}|L\d+)$/.test(r.trainNo) && '车次首字符可能误读，请对照票面'].filter(Boolean) as string[]
}
