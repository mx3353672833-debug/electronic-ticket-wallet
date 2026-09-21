import type { Ticket, TicketType } from '../types/ticket'

function ticketSvg(options: {
  title: string
  route: string
  date: string
  code: string
  typeLabel: string
  bg: string
  ink: string
}): string {
  const { title, route, date, code, typeLabel, bg, ink } = options
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="280" viewBox="0 0 480 280">
  <rect width="480" height="280" fill="${bg}"/>
  <rect x="16" y="16" width="448" height="248" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="6 4" opacity="0.35"/>
  <text x="36" y="56" font-family="system-ui,sans-serif" font-size="14" fill="${ink}" opacity="0.7">${typeLabel}</text>
  <text x="36" y="96" font-family="system-ui,sans-serif" font-size="28" font-weight="600" fill="${ink}">${title}</text>
  <text x="36" y="140" font-family="system-ui,sans-serif" font-size="20" fill="${ink}">${route}</text>
  <text x="36" y="180" font-family="system-ui,sans-serif" font-size="16" fill="${ink}" opacity="0.8">${date}</text>
  <text x="36" y="220" font-family="ui-monospace,monospace" font-size="16" fill="${ink}" opacity="0.75">${code}</text>
  <text x="36" y="248" font-family="system-ui,sans-serif" font-size="12" fill="${ink}" opacity="0.45">骨架占位图 · 非真实票面</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

type MockSeed = {
  id: string
  type: TicketType
  takenAt: string | null
  departureName: string
  departureCity: string
  arrivalName: string
  arrivalCity: string
  carrierOrTrainNo?: string
  seat?: string
  story: string
  tags: string[]
  companions: string[]
  bg: string
  ink: string
}

const seeds: MockSeed[] = [
  {
    id: 'mock-01',
    type: 'train',
    takenAt: '2018-04-12',
    departureName: '北京南',
    departureCity: '北京',
    arrivalName: '天津',
    arrivalCity: '天津',
    carrierOrTrainNo: 'C2001',
    seat: '05车12A',
    story: '第一次坐京津城际，窗外平原一闪而过。',
    tags: ['城际', '短途'],
    companions: [],
    bg: '#e8eef5',
    ink: '#1e3a5f',
  },
  {
    id: 'mock-02',
    type: 'flight',
    takenAt: '2018-09-03',
    departureName: '首都机场',
    departureCity: '北京',
    arrivalName: '虹桥',
    arrivalCity: '上海',
    carrierOrTrainNo: 'MU5102',
    seat: '32A',
    story: '出差去上海，飞机上改了一路方案。',
    tags: ['出差'],
    companions: ['老王'],
    bg: '#f3ebe2',
    ink: '#5c3d2e',
  },
  {
    id: 'mock-03',
    type: 'metro',
    takenAt: '2019-01-20',
    departureName: '国贸',
    departureCity: '北京',
    arrivalName: '西二旗',
    arrivalCity: '北京',
    carrierOrTrainNo: '10号线→13号线',
    story: '下班后去同学聚会，地铁里人挤人。',
    tags: ['日常'],
    companions: [],
    bg: '#e9f0ea',
    ink: '#2f4f3a',
  },
  {
    id: 'mock-04',
    type: 'train',
    takenAt: '2019-06-15',
    departureName: '大连北',
    departureCity: '大连',
    arrivalName: '北京',
    arrivalCity: '北京',
    carrierOrTrainNo: 'D1234',
    seat: '07车03F',
    story: '暑假回家，车厢里都是学生。',
    tags: ['返乡', '火车'],
    companions: ['小陈'],
    bg: '#f6f0e4',
    ink: '#4a3b28',
  },
  {
    id: 'mock-05',
    type: 'bus',
    takenAt: '2019-10-01',
    departureName: '客运站',
    departureCity: '青岛',
    arrivalName: '烟台',
    arrivalCity: '烟台',
    carrierOrTrainNo: 'QY-218',
    story: '国庆去海边，大巴沿着海岸线开。',
    tags: ['假期', '海边'],
    companions: ['小林'],
    bg: '#e7eef4',
    ink: '#2a4560',
  },
  {
    id: 'mock-06',
    type: 'boarding-pass',
    takenAt: '2020-01-08',
    departureName: '浦东',
    departureCity: '上海',
    arrivalName: '白云',
    arrivalCity: '广州',
    carrierOrTrainNo: 'CZ3548',
    seat: '18C',
    story: '春节前出差，机场人比想象中少。',
    tags: ['出差', '飞行'],
    companions: [],
    bg: '#f0e8f2',
    ink: '#4a2f55',
  },
  {
    id: 'mock-07',
    type: 'train',
    takenAt: '2020-08-22',
    departureName: '杭州东',
    departureCity: '杭州',
    arrivalName: '南京南',
    arrivalCity: '南京',
    carrierOrTrainNo: 'G7602',
    seat: '02车08D',
    story: '去看展，站台上热得发烫。',
    tags: ['看展'],
    companions: [],
    bg: '#eef2e6',
    ink: '#3d4a2a',
  },
  {
    id: 'mock-08',
    type: 'flight',
    takenAt: '2021-03-14',
    departureName: '双流',
    departureCity: '成都',
    arrivalName: '首都机场',
    arrivalCity: '北京',
    carrierOrTrainNo: 'CA4113',
    seat: '25F',
    story: '从成都回来，包里还有一袋火锅底料。',
    tags: ['旅行', '美食'],
    companions: ['阿雅'],
    bg: '#f7e9e4',
    ink: '#6b3a2d',
  },
  {
    id: 'mock-09',
    type: 'metro',
    takenAt: '2021-07-02',
    departureName: '天河公园',
    departureCity: '广州',
    arrivalName: '广州南站',
    arrivalCity: '广州',
    carrierOrTrainNo: '21号线',
    story: '赶高铁，地铁上一直在看时间。',
    tags: ['赶路'],
    companions: [],
    bg: '#e8f0f2',
    ink: '#274b56',
  },
  {
    id: 'mock-10',
    type: 'train',
    takenAt: '2021-12-31',
    departureName: '上海虹桥',
    departureCity: '上海',
    arrivalName: '杭州东',
    arrivalCity: '杭州',
    carrierOrTrainNo: 'G7331',
    seat: '11车01A',
    story: '跨年去杭州，车厢广播播着新年祝福。',
    tags: ['跨年', '短途'],
    companions: ['小周'],
    bg: '#f2eaf0',
    ink: '#55304a',
  },
  {
    id: 'mock-11',
    type: 'bus',
    takenAt: '2022-05-04',
    departureName: '客运中心',
    departureCity: '苏州',
    arrivalName: '周庄',
    arrivalCity: '昆山',
    carrierOrTrainNo: 'SZ-091',
    story: '雨天去古镇，车窗上全是水汽。',
    tags: ['古镇', '雨天'],
    companions: [],
    bg: '#e9efe8',
    ink: '#334836',
  },
  {
    id: 'mock-12',
    type: 'flight',
    takenAt: '2022-09-18',
    departureName: '咸阳',
    departureCity: '西安',
    arrivalName: '萧山',
    arrivalCity: '杭州',
    carrierOrTrainNo: 'HU7850',
    seat: '12A',
    story: '离开西安前吃了一碗面。',
    tags: ['旅行'],
    companions: ['父母'],
    bg: '#f4ebe3',
    ink: '#5a4030',
  },
  {
    id: 'mock-13',
    type: 'train',
    takenAt: '2023-02-11',
    departureName: '广州南',
    departureCity: '广州',
    arrivalName: '深圳北',
    arrivalCity: '深圳',
    carrierOrTrainNo: 'G6503',
    seat: '04车16F',
    story: '广深之间的高铁像公交一样方便。',
    tags: ['通勤'],
    companions: [],
    bg: '#e7eef6',
    ink: '#243f5c',
  },
  {
    id: 'mock-14',
    type: 'boarding-pass',
    takenAt: '2023-08-12',
    departureName: '周水子',
    departureCity: '大连',
    arrivalName: '大兴',
    arrivalCity: '北京',
    carrierOrTrainNo: 'CZ6123',
    seat: '8A',
    story: '从海边飞回内陆，云层很厚。',
    tags: ['飞行', '夏天'],
    companions: ['表姐'],
    bg: '#eef0f5',
    ink: '#2f3d55',
  },
  {
    id: 'mock-15',
    type: 'train',
    takenAt: '2023-11-05',
    departureName: '大连北',
    departureCity: '大连',
    arrivalName: '北京',
    arrivalCity: '北京',
    carrierOrTrainNo: 'D1234',
    seat: '07车03F',
    story: '这一段旅程窗外的海雾还没散尽。',
    tags: ['火车', '故事'],
    companions: [],
    bg: '#f6f0e4',
    ink: '#4a3b28',
  },
  {
    id: 'mock-16',
    type: 'metro',
    takenAt: '2024-03-21',
    departureName: '静安寺',
    departureCity: '上海',
    arrivalName: '陆家嘴',
    arrivalCity: '上海',
    carrierOrTrainNo: '2号线',
    story: '见客户前在地铁里默念要点。',
    tags: ['日常', '工作'],
    companions: [],
    bg: '#e9f0ea',
    ink: '#2f4f3a',
  },
  {
    id: 'mock-17',
    type: 'flight',
    takenAt: '2024-07-19',
    departureName: '长水',
    departureCity: '昆明',
    arrivalName: '虹桥',
    arrivalCity: '上海',
    carrierOrTrainNo: 'FM9452',
    seat: '21B',
    story: '暑期回程，机舱里全是孩子的笑声。',
    tags: ['假期', '飞行'],
    companions: ['阿雅', '小陈'],
    bg: '#f3ebe2',
    ink: '#5c3d2e',
  },
  {
    id: 'mock-18',
    type: 'train',
    takenAt: '2025-01-06',
    departureName: '武汉站',
    departureCity: '武汉',
    arrivalName: '长沙南',
    arrivalCity: '长沙',
    carrierOrTrainNo: 'G503',
    seat: '03车09C',
    story: '新年第一次出差，车窗结了一层霜。',
    tags: ['出差', '冬日'],
    companions: [],
    bg: '#e8eef5',
    ink: '#1e3a5f',
  },
  {
    id: 'mock-19',
    type: 'bus',
    takenAt: null,
    departureName: '',
    departureCity: '厦门',
    arrivalName: '',
    arrivalCity: '泉州',
    carrierOrTrainNo: '',
    story: '只记得是个傍晚，巴士沿海岸线走。',
    tags: ['待补全'],
    companions: [],
    bg: '#f0efe6',
    ink: '#45422f',
  },
  {
    id: 'mock-20',
    type: 'other',
    takenAt: '2026-02-14',
    departureName: '家门口',
    departureCity: '北京',
    arrivalName: '胡同口',
    arrivalCity: '北京',
    story: '一次步行小票，也值得记下来。',
    tags: ['步行', '日常'],
    companions: [],
    bg: '#efe8e2',
    ink: '#4a3830',
  },
]

function buildMock(seed: MockSeed): Ticket {
  const dateLabel = seed.takenAt ?? '日期待补'
  const route = `${seed.departureName || seed.departureCity || '?'} → ${seed.arrivalName || seed.arrivalCity || '?'}`
  const code = seed.carrierOrTrainNo || '—'
  const image = ticketSvg({
    title: seed.departureCity || '旅程',
    route,
    date: dateLabel,
    code,
    typeLabel: seed.type,
    bg: seed.bg,
    ink: seed.ink,
  })
  const stamp = `${seed.takenAt ?? '2020-01-01'}T10:00:00.000Z`
  return {
    id: seed.id,
    type: seed.type,
    takenAt: seed.takenAt,
    departure: seed.departureName
      ? { name: seed.departureName, city: seed.departureCity }
      : seed.departureCity
        ? { name: seed.departureCity, city: seed.departureCity }
        : null,
    arrival: seed.arrivalName
      ? { name: seed.arrivalName, city: seed.arrivalCity }
      : seed.arrivalCity
        ? { name: seed.arrivalCity, city: seed.arrivalCity }
        : null,
    carrierOrTrainNo: seed.carrierOrTrainNo || undefined,
    seat: seed.seat || undefined,
    originalImageUrl: image,
    processedImageUrl: image,
    thumbnailUrl: image,
    story: seed.story,
    tags: seed.tags,
    companions: seed.companions,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export const mockTickets: Ticket[] = seeds.map(buildMock)
