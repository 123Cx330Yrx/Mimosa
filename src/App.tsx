import BaselineApp from './BaselineApp'
import { parseStudyCondition } from './domain/studyCondition'
import MimosaApp from './MimosaApp'

export default function App() {
  return parseStudyCondition(window.location.search) === 'baseline'
    ? <BaselineApp />
    : <MimosaApp />
}
