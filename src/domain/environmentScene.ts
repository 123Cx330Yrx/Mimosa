import type { EnvironmentState } from './protocol'
import type { Locale } from '../i18n'

export type EnvironmentScene =
  | 'calm'
  | 'sunlight'
  | 'watering'
  | 'cloudy'
  | 'sunshower'
  | 'filtered-light'
  | 'overcast-rain'
  | 'clearing'

const sceneCopy: Record<EnvironmentScene, { label: string; caption: string }> = {
  calm: { label: '静谧花园', caption: '叶片静静舒展，房间仍留有余地' },
  sunlight: { label: '暖光靠近', caption: '一束暖光落在叶片之间' },
  watering: { label: '轻轻浇水', caption: '细水落向根部，土壤一点点湿润' },
  cloudy: { label: '薄云停驻', caption: '一片薄云缓缓停下，为迟疑留出片刻' },
  sunshower: { label: '向光生长', caption: '暖光照着湿润的土壤，回应仍在生长' },
  'filtered-light': { label: '云隙微光', caption: '微光穿过薄云，等待不再那么空白' },
  'overcast-rain': { label: '云下微润', caption: '薄云停驻，细水正落向根部' },
  clearing: { label: '云隙新生', caption: '云影缓缓移动，暖光落在刚刚湿润的土壤上' },
}

const englishSceneCopy: Record<EnvironmentScene, { label: string; caption: string }> = {
  calm: { label: 'Quiet garden', caption: 'The leaves are open, leaving room for a response' },
  sunlight: { label: 'Warm light', caption: 'A little sunlight has reached the leaves' },
  watering: { label: 'Gentle watering', caption: 'Water settles around the roots, a little at a time' },
  cloudy: { label: 'Passing cloud', caption: 'A soft cloud makes room for hesitation' },
  sunshower: { label: 'Room to grow', caption: 'Warm light reaches damp soil while a response takes shape' },
  'filtered-light': { label: 'Light through cloud', caption: 'Light slips through the cloud, making the wait feel less empty' },
  'overcast-rain': { label: 'Soft cloud and water', caption: 'A cloud lingers while water reaches the roots' },
  clearing: { label: 'A clearing sky', caption: 'The cloud drifts on and warm light reaches the damp soil' },
}

export function getEnvironmentScene(environments: EnvironmentState[]): EnvironmentScene {
  const hasSunlight = environments.includes('sunlight')
  const hasWatering = environments.includes('watering')
  const hasClouds = environments.includes('cloudy')

  if (hasSunlight && hasWatering && hasClouds) return 'clearing'
  if (hasSunlight && hasWatering) return 'sunshower'
  if (hasSunlight && hasClouds) return 'filtered-light'
  if (hasWatering && hasClouds) return 'overcast-rain'
  if (hasSunlight) return 'sunlight'
  if (hasWatering) return 'watering'
  if (hasClouds) return 'cloudy'
  return 'calm'
}

export function getEnvironmentSceneCopy(environments: EnvironmentState[], locale: Locale = 'zh') {
  const scene = getEnvironmentScene(environments)
  return locale === 'en' ? englishSceneCopy[scene] : sceneCopy[scene]
}
