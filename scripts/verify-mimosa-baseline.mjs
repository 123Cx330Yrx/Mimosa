import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const referenceCommit = '24b26dc'

const unchangedMimosaDependencies = [
  'src/App.tsx',
  'src/audio/RoleClaimNotification.ts',
  'src/components/MimosaScene.tsx',
  'src/domain/environmentScene.ts',
  'src/domain/mimosaMachine.ts',
  'src/domain/participantRoles.ts',
  'src/domain/silenceCoordinator.ts',
  'src/i18n.ts',
  'src/meeting/JaaSTransport.ts',
  'src/meeting/MeetingTransport.ts',
  'src/meeting/reliableDelivery.ts',
  'src/research/observerLogTransfer.ts',
  'src/research/studyLog.ts',
  'src/sensing/SpeechActivitySensor.ts',
  'src/sensing/WebAudioSpeechActivitySensor.ts',
]

function normalize(source) {
  return source
    .replace('function MimosaApp()', 'function App()')
    .replace('export default MimosaApp', 'export default App')
    .replace(/\r\n/g, '\n')
    .trimEnd()
}

function sha256(source) {
  return createHash('sha256').update(source).digest('hex')
}

const reference = normalize(
  execFileSync('git', ['show', `${referenceCommit}:src/MimosaApp.tsx`], {
    encoding: 'utf8',
  }),
)
const current = normalize(readFileSync('src/MimosaApp.tsx', 'utf8'))

if (current !== reference) {
  console.error(
    `MimosaApp has drifted from ${referenceCommit}. ` +
    `Expected ${sha256(reference)}, received ${sha256(current)}.`,
  )
  process.exit(1)
}

console.log(
  `MimosaApp matches the audited reference ${referenceCommit} ` +
  `(${sha256(current)}).`,
)

for (const file of unchangedMimosaDependencies) {
  const expected = normalize(execFileSync('git', ['show', `${referenceCommit}:${file}`], {
    encoding: 'utf8',
  }))
  const received = normalize(readFileSync(file, 'utf8'))
  if (received !== expected) {
    console.error(
      `${file} has drifted from ${referenceCommit}. ` +
      `Expected ${sha256(expected)}, received ${sha256(received)}.`,
    )
    process.exit(1)
  }
}

console.log(
  `${unchangedMimosaDependencies.length} Mimosa dependencies also match ${referenceCommit}.`,
)
